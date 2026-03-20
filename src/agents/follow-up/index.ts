/**
 * Follow-Up Agent — Runner
 *
 * Generates personalized follow-up drafts using seller memory, call history,
 * and lead context. All drafts go to review_queue — operator approves before send.
 *
 * Triggered by:
 *   - Stale lead detection (exception agent finds leads going cold)
 *   - Scheduled follow-up (operator requested a follow-up at specific time)
 *   - Manual operator request
 *
 * Write path: Drafts → review_queue (operator approval required)
 */

import { createServerClient } from "@/lib/supabase";
import { analyzeWithClaude } from "@/lib/claude-client";
import {
  createAgentRun,
  completeAgentRun,
  isAgentEnabled,
  submitProposal,
} from "@/lib/control-plane";
import {
  FOLLOW_UP_AGENT_VERSION,
  FOLLOW_UP_AGENT_MODEL,
  FOLLOW_UP_SYSTEM_PROMPT,
} from "./prompt";
import type {
  FollowUpAgentInput,
  FollowUpAgentResult,
  FollowUpDraft,
} from "./types";

export async function runFollowUpAgent(
  input: FollowUpAgentInput,
): Promise<FollowUpAgentResult> {
  // Check feature flag
  const enabled = await isAgentEnabled("follow-up");
  if (!enabled) {
    return {
      runId: "none",
      leadId: input.leadId,
      drafts: [],
      status: "disabled",
      summary: "Follow-Up Agent disabled via feature flag",
    };
  }

  const triggerTypeMap: Record<string, string> = {
    stale_lead: "event",
    scheduled: "cron",
    operator_request: "operator_request",
  };

  const runId = await createAgentRun({
    agentName: "follow-up",
    triggerType: triggerTypeMap[input.triggerType] as "event" | "cron" | "operator_request",
    triggerRef: input.triggerRef ?? input.leadId,
    leadId: input.leadId,
    model: FOLLOW_UP_AGENT_MODEL,
    promptVersion: FOLLOW_UP_AGENT_VERSION,
    inputs: {
      leadId: input.leadId,
      triggerType: input.triggerType,
      channel: input.channel,
    },
  });

  if (!runId) {
    return {
      runId: "dedup",
      leadId: input.leadId,
      drafts: [],
      status: "disabled",
      summary: "Follow-Up Agent already running for this lead — skipped duplicate.",
    };
  }

  try {
    const sb = createServerClient();

    // ── Load lead context ──────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (sb.from("leads") as any)
      .select(`
        id, first_name, last_name, phone, email, status, source,
        next_action, next_action_due_at, notes, motivation_level,
        last_contact_at, total_calls, live_answers,
        properties(address, city, state, zip, owner_name)
      `)
      .eq("id", input.leadId)
      .single();

    if (!lead) {
      await completeAgentRun({ runId, status: "failed", error: "Lead not found" });
      return {
        runId,
        leadId: input.leadId,
        drafts: [],
        status: "failed",
        summary: `Lead ${input.leadId} not found`,
      };
    }

    // ── Load call history ──────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: calls } = await (sb.from("calls_log") as any)
      .select("disposition, duration, notes, direction, created_at")
      .eq("lead_id", input.leadId)
      .order("created_at", { ascending: false })
      .limit(5);

    // ── Load seller memory (from dialer sessions) ──────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sessions } = await (sb.from("dialer_sessions") as any)
      .select("ai_notes, seller_situation, created_at")
      .eq("lead_id", input.leadId)
      .order("created_at", { ascending: false })
      .limit(3);

    // ── Load dossier facts ─────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: facts } = await (sb.from("fact_assertions") as any)
      .select("field_name, value, confidence, source_type")
      .eq("lead_id", input.leadId)
      .eq("review_status", "approved")
      .limit(10);

    // ── Build prompt ───────────────────────────────────────────────
    const prop = lead.properties as Record<string, unknown> | null;
    const leadName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";
    const address = prop
      ? [prop.address, prop.city, prop.state].filter(Boolean).join(", ")
      : "No address on file";

    const callSummary = (calls ?? [])
      .map(
        (c: Record<string, unknown>) =>
          `${(c.created_at as string)?.slice(0, 10)} — ${c.disposition} (${c.duration ?? 0}s) ${c.notes ? `: ${(c.notes as string).slice(0, 100)}` : ""}`,
      )
      .join("\n");

    const sellerMemory = (sessions ?? [])
      .map((s: Record<string, unknown>) => {
        const parts = [];
        if (s.seller_situation) parts.push(`Situation: ${s.seller_situation}`);
        if (s.ai_notes) parts.push(`Notes: ${(s.ai_notes as string).slice(0, 200)}`);
        return parts.join(" | ");
      })
      .filter(Boolean)
      .join("\n");

    const factsSummary = (facts ?? [])
      .map(
        (f: Record<string, unknown>) =>
          `${f.field_name}: ${f.value} (${f.confidence}, source: ${f.source_type})`,
      )
      .join("\n");

    const userPrompt = `## Lead Profile
Name: ${leadName}
Phone: ${lead.phone ?? "none"}
Email: ${lead.email ?? "none"}
Status: ${lead.status}
Source: ${lead.source ?? "unknown"}
Property: ${address}
Motivation level: ${lead.motivation_level ?? "unknown"}/5
Total calls: ${lead.total_calls ?? 0} (${lead.live_answers ?? 0} live answers)
Last contact: ${lead.last_contact_at ?? "never"}
Current next action: ${lead.next_action ?? "NONE SET"}
Notes: ${lead.notes ?? "none"}

## Call History (most recent first)
${callSummary || "No call history"}

## Seller Memory
${sellerMemory || "No seller memory recorded"}

## Intelligence Facts
${factsSummary || "No approved facts"}

## Operator Instructions
Channel preference: ${input.channel ?? "auto (default to call for WA)"}
${input.operatorNotes ? `Notes: ${input.operatorNotes}` : "No additional notes"}

## Task
Generate 1-2 follow-up draft options. Return JSON:
{
  "drafts": [
    {
      "channel": "call" | "sms" | "email",
      "subject": "email subject if email",
      "body": "message body or call talking points",
      "callScript": "optional call opener and talking points",
      "reasoning": "why this approach",
      "sellerMemoryUsed": ["list of seller memory facts referenced"]
    }
  ]
}`;

    // ── Call Claude ─────────────────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      await completeAgentRun({ runId, status: "failed", error: "ANTHROPIC_API_KEY not set" });
      return {
        runId,
        leadId: input.leadId,
        drafts: [],
        status: "failed",
        summary: "ANTHROPIC_API_KEY not configured",
      };
    }

    const response = await analyzeWithClaude({
      prompt: userPrompt,
      systemPrompt: FOLLOW_UP_SYSTEM_PROMPT,
      apiKey,
      temperature: 0.4,
      maxTokens: 2000,
    });

    // ── Parse response ──────────────────────────────────────────────
    let drafts: FollowUpDraft[] = [];
    try {
      // Extract JSON from response (may be wrapped in markdown code block)
      const jsonMatch = response.match(/\{[\s\S]*"drafts"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        drafts = (parsed.drafts ?? []).map((d: Record<string, unknown>) => ({
          channel: d.channel ?? "call",
          subject: d.subject ?? undefined,
          body: d.body ?? "",
          callScript: d.callScript ?? undefined,
          reasoning: d.reasoning ?? "",
          sellerMemoryUsed: Array.isArray(d.sellerMemoryUsed) ? d.sellerMemoryUsed : [],
        }));
      }
    } catch {
      // If JSON parsing fails, treat entire response as a single draft
      drafts = [
        {
          channel: input.channel ?? "call",
          body: response,
          reasoning: "Raw response — JSON parsing failed",
          sellerMemoryUsed: [],
        },
      ];
    }

    // ── Submit to review queue ──────────────────────────────────────
    // Include lead contact info so execution handler can send directly
    for (const draft of drafts) {
      await submitProposal({
        runId,
        agentName: "follow-up",
        entityType: "lead",
        entityId: input.leadId,
        action: `follow_up_${draft.channel}`,
        proposal: {
          ...draft as unknown as Record<string, unknown>,
          phone: lead.phone ?? null,
          email: lead.email ?? null,
          leadName: leadName,
          address,
        },
        rationale: draft.reasoning,
        priority: lead.motivation_level >= 4 ? 2 : 5,
      });
    }

    const summary = `Generated ${drafts.length} follow-up draft(s) for ${leadName}. Channels: ${drafts.map((d) => d.channel).join(", ")}. Queued for operator review.`;

    await completeAgentRun({
      runId,
      status: "completed",
      outputs: { draftCount: drafts.length, channels: drafts.map((d) => d.channel), summary },
    });

    return {
      runId,
      leadId: input.leadId,
      drafts,
      status: "queued_for_review",
      summary,
    };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await completeAgentRun({ runId, status: "failed", error: msg });
    return {
      runId,
      leadId: input.leadId,
      drafts: [],
      status: "failed",
      summary: `Follow-up generation failed: ${msg}`,
    };
  }
}
