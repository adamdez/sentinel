import { inngest } from "../client";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import {
  createAgentRun,
  completeAgentRun,
  submitProposal,
  getAgentMode,
} from "@/lib/control-plane";

const PROMPT = `You are analyzing a real estate seller call transcript. Extract the following in JSON:
{
  "promises_made": ["string array of what the buyer (Dominion) committed to"],
  "objections_raised": ["string array of seller concerns, verbatim where possible"],
  "deal_temperature": "hot|warm|cold|dead",
  "decision_maker_confidence": "weak|probable|strong",
  "next_action_suggestion": "string — specific next step Logan should take",
  "key_facts": ["string array of important facts mentioned"]
}
Only return valid JSON. If the transcript is too short or unclear, return empty arrays and deal_temperature: "cold".`;

export const postCallAnalysisJob = inngest.createFunction(
  {
    id: "post-call-analysis",
    retries: 3,
    concurrency: { limit: 3 },
    triggers: [{ event: "voice/post-call-analysis.requested" }],
  },
  async ({ event, step }) => {
    const { voiceSessionId, leadId, transcript, summary } = event.data;

    if (!transcript || transcript.length < 50) {
      return { skipped: true, reason: "transcript too short" };
    }

    const analysis = await step.run("analyze-transcript", async () => {
      const client = new Anthropic();
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `${PROMPT}\n\nTRANSCRIPT:\n${transcript}\n\nSUMMARY:\n${summary ?? ""}`,
          },
        ],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "{}";
      try {
        return JSON.parse(text);
      } catch {
        return {
          promises_made: [],
          objections_raised: [],
          deal_temperature: "cold",
          decision_maker_confidence: "weak",
          next_action_suggestion: "",
          key_facts: [],
        };
      }
    });

    // Step 2: Write to voice_sessions (dialer domain — keep existing behavior)
    await step.run("write-post-call-structures", async () => {
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      // post_call_structures table does not exist in schema — store in voice_sessions.extracted_facts
      const { error: updateErr } = await sb.from("voice_sessions").update({
        extracted_facts: [
          ...(analysis.promises_made ?? []).map((p: string) => ({ type: "promise", value: p })),
          ...(analysis.objections_raised ?? []).map((o: string) => ({ type: "objection", value: o })),
          { type: "deal_temperature", value: analysis.deal_temperature },
          { type: "next_action_suggestion", value: analysis.next_action_suggestion },
        ],
      }).eq("id", voiceSessionId);
      if (updateErr) throw new Error(`voice_sessions update failed: ${updateErr.message}`);
    });

    // Step 3: Submit review_queue proposal for CRM write (control plane gated)
    const reviewResult = await step.run("submit-review-proposal", async () => {
      if (!leadId) {
        return { skipped: true, reason: "no_lead_id" };
      }

      // Create agent run for traceability
      let runId: string | null = null;
      try {
        runId = await createAgentRun({
          agentName: "post-call-analysis",
          triggerType: "event",
          triggerRef: voiceSessionId,
          leadId,
          model: "claude-haiku-4-5-20251001",
          promptVersion: "post-call-v1",
        });

        if (!runId) {
          return { skipped: true, reason: "dedup_guard" };
        }

        // Derive priority from deal_temperature
        const priorityMap: Record<string, number> = {
          hot: 1,
          warm: 2,
          cold: 3,
          dead: 5,
        };
        const priority = priorityMap[analysis.deal_temperature] ?? 3;

        // Compute next_action_due_at: next business morning (9am Pacific) if not specified
        const nextActionDueAt = computeNextBusinessMorning();

        const proposal = {
          next_action: analysis.next_action_suggestion || "Follow up after Vapi call",
          next_action_due_at: nextActionDueAt,
          deal_temperature: analysis.deal_temperature,
          promises_made: analysis.promises_made ?? [],
          objections_raised: analysis.objections_raised ?? [],
          decision_maker_confidence: analysis.decision_maker_confidence ?? "weak",
          voice_session_id: voiceSessionId,
        };

        const reviewItemId = await submitProposal({
          runId,
          agentName: "post-call-analysis",
          entityType: "lead",
          entityId: leadId,
          action: "vapi_post_call_promote",
          proposal,
          rationale: `Post-call analysis: ${analysis.deal_temperature} lead, next action: ${proposal.next_action}`,
          priority,
        });

        // Auto-approve policy: if agent mode is "auto" AND high confidence extraction
        const mode = await getAgentMode("post-call-analysis");
        const isHighConfidence =
          analysis.decision_maker_confidence === "strong" &&
          analysis.deal_temperature !== "dead" &&
          !!analysis.next_action_suggestion;

        if (mode === "auto" && isHighConfidence) {
          // Import resolveReviewItem to auto-approve
          const { resolveReviewItem } = await import("@/lib/control-plane");
          await resolveReviewItem(reviewItemId, "approved", "system:auto-approve");
          await completeAgentRun({ runId, status: "completed", agentName: "post-call-analysis", outputs: { reviewItemId, autoApproved: true } });
          return { reviewItemId, autoApproved: true };
        }

        await completeAgentRun({ runId, status: "completed", agentName: "post-call-analysis", outputs: { reviewItemId, autoApproved: false } });
        return { reviewItemId, autoApproved: false };
      } catch (err) {
        if (runId) {
          await completeAgentRun({
            runId,
            status: "failed",
            agentName: "post-call-analysis",
            error: err instanceof Error ? err.message : String(err),
          }).catch(() => {});
        }
        throw err; // Let Inngest retry
      }
    });

    return { voiceSessionId, leadId, analysis, reviewResult };
  }
);

/**
 * Compute the next business morning at 9:00 AM Pacific.
 * If today is Fri after 9am, returns Monday 9am. Sat/Sun also return Monday.
 */
function computeNextBusinessMorning(): string {
  const now = new Date();
  // Work in UTC — Pacific is UTC-8 (PST) or UTC-7 (PDT)
  // Use a rough offset; production should use proper timezone lib
  const pacificOffset = -7; // PDT
  const pacificHour = (now.getUTCHours() + pacificOffset + 24) % 24;
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 6=Sat

  let daysToAdd = 1; // default: next day

  // If it's Friday after 9am, Saturday, or Sunday → jump to Monday
  if (dayOfWeek === 5 && pacificHour >= 9) {
    daysToAdd = 3; // Fri → Mon
  } else if (dayOfWeek === 6) {
    daysToAdd = 2; // Sat → Mon
  } else if (dayOfWeek === 0) {
    daysToAdd = 1; // Sun → Mon
  }

  const target = new Date(now);
  target.setUTCDate(target.getUTCDate() + daysToAdd);
  // Set to 9:00 AM Pacific → 16:00 UTC (PDT) or 17:00 UTC (PST)
  target.setUTCHours(9 - pacificOffset, 0, 0, 0);
  return target.toISOString();
}
