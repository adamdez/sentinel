/**
 * QA Agent — Runner
 *
 * Post-call quality analysis. Deterministic metrics + flag detection.
 * Informational only — no CRM writes. Results stored in agent_runs.outputs.
 *
 * Triggered by:
 *   - Post-call publish flow (after operator publishes call notes)
 *   - Manual operator request
 *   - Nightly batch scan of recent calls
 *
 * Phase 1: Deterministic analysis (talk ratio, call duration, disposition checks)
 * Phase 7: Add LLM transcript analysis for mirrors, labels, premature pricing
 */

import { createServerClient } from "@/lib/supabase";
import OpenAI from "openai";
import {
  createAgentRun,
  completeAgentRun,
  isAgentEnabled,
} from "@/lib/control-plane";
import { QA_AGENT_VERSION, QA_ANALYSIS_PROMPT, QA_THRESHOLDS } from "./prompt";
import type {
  QAAgentInput,
  QAResult,
  QAFlag,
  QACallMetrics,
} from "./types";

async function runTranscriptQa(transcript: string): Promise<QAFlag[]> {
  if (!process.env.OPENAI_API_KEY || transcript.trim().length < 40) return [];

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const response = await client.responses.create({
      model: process.env.DIALER_AI_MODEL_QA_NOTES ?? "gpt-5-mini",
      temperature: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      input: [
        {
          role: "developer" as const,
          content: [{
            type: "input_text" as const,
            text: `${QA_ANALYSIS_PROMPT}

Return ONLY valid JSON:
{
  "premature_price": {"triggered": boolean, "description": string, "suggestion": string},
  "missed_mirror": {"triggered": boolean, "description": string, "suggestion": string},
  "no_qualifying": {"triggered": boolean, "description": string, "suggestion": string}
}`,
          }],
        },
        {
          role: "user" as const,
          content: [{
            type: "input_text" as const,
            text: transcript.slice(-7000),
          }],
        },
      ] as any,
    });

    const raw = response.output_text ?? "";
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, {
      triggered?: boolean;
      description?: string;
      suggestion?: string;
    }>;

    const out: QAFlag[] = [];
    const maybePush = (
      key: "premature_price" | "missed_mirror" | "no_qualifying",
      severity: QAFlag["severity"],
    ) => {
      const item = parsed[key];
      if (!item?.triggered) return;
      out.push({
        category: key,
        severity,
        description: item.description ?? key,
        suggestion: item.suggestion ?? undefined,
      });
    };

    maybePush("premature_price", "warning");
    maybePush("missed_mirror", "warning");
    maybePush("no_qualifying", "warning");
    return out;
  } catch {
    return [];
  }
}

export async function runQAAgent(input: QAAgentInput): Promise<QAResult> {
  // Check feature flag
  const enabled = await isAgentEnabled("qa");
  if (!enabled) {
    return emptyResult(input, "Agent disabled via feature flag");
  }

  const sb = createServerClient();

  // Preflight the call before creating a traced run so obviously invalid
  // payloads do not create noisy run history.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: preflightCall } = await (sb.from("calls_log") as any)
    .select("id, lead_id")
    .eq("id", input.callLogId)
    .maybeSingle();

  if (!preflightCall) {
    return emptyResult(input, `Call ${input.callLogId} no longer exists. QA skipped before run creation.`);
  }

  const effectiveInput: QAAgentInput = {
    ...input,
    leadId: (preflightCall.lead_id as string | null) ?? input.leadId,
  };

  // Create traced run
  const runId = await createAgentRun({
    agentName: "qa",
    triggerType: effectiveInput.triggerType === "post_call" ? "event" : effectiveInput.triggerType === "manual" ? "operator_request" : "cron",
    triggerRef: effectiveInput.callLogId,
    leadId: effectiveInput.leadId,
    model: "deterministic",
    promptVersion: QA_AGENT_VERSION,
    inputs: { callLogId: effectiveInput.callLogId, leadId: effectiveInput.leadId },
  });

  if (!runId) {
    return emptyResult(input, "QA Agent already running for this lead — skipped duplicate.");
  }

  try {
    const sb = createServerClient();

    // ── Load call data ──────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: call } = await (sb.from("calls_log") as any)
      .select("id, lead_id, disposition, duration, notes, direction, recording_url, created_at")
      .eq("id", effectiveInput.callLogId)
      .single();

    if (!call) {
      await completeAgentRun({
        runId,
        status: "cancelled",
        error: "Call not found",
        outputs: { skipped: true, reason: "call_not_found" },
      });
      return emptyResult(effectiveInput, `Call ${effectiveInput.callLogId} no longer exists. QA skipped.`, runId);
    }

    // ── Load dialer session data (if exists) ────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sessions } = await (sb.from("dialer_sessions") as any)
      .select("id, transcript_chunks, ai_notes, duration_seconds, ended_at")
      .eq("call_log_id", effectiveInput.callLogId)
      .order("created_at", { ascending: false })
      .limit(1);

    const session = sessions?.[0] ?? null;

    // ── Load lead context ───────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (sb.from("leads") as any)
      .select("id, status, next_action, next_action_due_at")
      .eq("id", effectiveInput.leadId)
      .single();

    if (!lead) {
      await completeAgentRun({
        runId,
        status: "cancelled",
        error: "Lead not found",
        outputs: { skipped: true, reason: "lead_not_found" },
      });
      return emptyResult(effectiveInput, `Lead ${effectiveInput.leadId} no longer exists. QA skipped.`, runId);
    }

    // ── Compute metrics ─────────────────────────────────────────────
    const durationSeconds = call.duration ?? session?.duration_seconds ?? 0;

    // Try to compute talk ratio from transcript chunks
    let operatorTalkPercent: number | null = null;
    let sellerTalkPercent: number | null = null;
    let silencePercent: number | null = null;
    let wordCount: number | null = null;

    const chunks = session?.transcript_chunks;
    const transcriptText = Array.isArray(chunks) && chunks.length > 0
      ? chunks
          .map((chunk) => `[${chunk.speaker ?? "unknown"}] ${chunk.text ?? ""}`.trim())
          .join("\n")
      : "";
    if (Array.isArray(chunks) && chunks.length > 0) {
      let operatorMs = 0;
      let sellerMs = 0;
      let totalWords = 0;

      for (const chunk of chunks) {
        const dur = ((chunk.end_ms ?? 0) - (chunk.start_ms ?? 0));
        if (chunk.speaker === "operator") operatorMs += dur;
        else sellerMs += dur;
        totalWords += (chunk.text ?? "").split(/\s+/).filter(Boolean).length;
      }

      const totalMs = operatorMs + sellerMs;
      if (totalMs > 0) {
        operatorTalkPercent = Math.round((operatorMs / totalMs) * 100);
        sellerTalkPercent = Math.round((sellerMs / totalMs) * 100);
        silencePercent = durationSeconds > 0
          ? Math.round(((durationSeconds * 1000 - totalMs) / (durationSeconds * 1000)) * 100)
          : null;
      }
      wordCount = totalWords;
    }

    const metrics: QACallMetrics = {
      durationSeconds,
      operatorTalkPercent,
      sellerTalkPercent,
      silencePercent,
      wordCount,
    };

    // ── Detect flags ────────────────────────────────────────────────
    const flags: QAFlag[] = [];

    // Talk ratio check
    if (operatorTalkPercent !== null && operatorTalkPercent > QA_THRESHOLDS.maxOperatorTalkPercent) {
      flags.push({
        category: "talk_ratio",
        severity: operatorTalkPercent > 75 ? "critical" : "warning",
        description: `Operator talked ${operatorTalkPercent}% of the call (target: <${QA_THRESHOLDS.maxOperatorTalkPercent}%). Sellers should do most of the talking.`,
        suggestion: "Use more open-ended questions and mirrors to let the seller share their situation.",
      });
    }

    // Short call with live answer
    if (
      durationSeconds < QA_THRESHOLDS.minMeaningfulCallSeconds &&
      durationSeconds > 0 &&
      call.disposition !== "no_answer" &&
      call.disposition !== "voicemail" &&
      call.disposition !== "busy"
    ) {
      flags.push({
        category: "short_call",
        severity: "warning",
        description: `Call was only ${durationSeconds}s with a live answer. Possible premature hang-up or missed opportunity.`,
        suggestion: "If the seller answered, try to keep them talking by asking about their situation.",
      });
    }

    // No next action after call
    if (lead && !lead.next_action && call.disposition !== "dead" && call.disposition !== "skip_trace") {
      flags.push({
        category: "no_next_action",
        severity: "critical",
        description: "Call completed but no next_action was set on the lead. Every call should result in a committed next step.",
        suggestion: "Before ending any call, set a clear next action: callback date, send offer, schedule appointment, etc.",
      });
    }

    // Positive flag: good rapport indicators from notes
    const notes = (call.notes ?? "").toLowerCase();
    if (
      notes.includes("motivated") ||
      notes.includes("good conversation") ||
      notes.includes("appointment") ||
      notes.includes("interested")
    ) {
      flags.push({
        category: "positive_rapport",
        severity: "info",
        description: "Notes indicate positive engagement. Good rapport building.",
      });
    }

    // Optional transcript-based QA pass for empathy / pricing / qualification signals
    const transcriptFlags = await runTranscriptQa(transcriptText);
    for (const flag of transcriptFlags) {
      const exists = flags.some((existing) => existing.category === flag.category);
      if (!exists) flags.push(flag);
    }

    // ── Compute score ───────────────────────────────────────────────
    let score = 70; // Base score

    for (const flag of flags) {
      if (flag.category === "positive_rapport") score += 10;
      else if (flag.severity === "critical") score -= 20;
      else if (flag.severity === "warning") score -= 10;
    }

    // Bonus for having transcript data
    if (operatorTalkPercent !== null && operatorTalkPercent <= QA_THRESHOLDS.maxOperatorTalkPercent) {
      score += 10;
    }

    score = Math.max(0, Math.min(100, score));

    const overallRating =
      metrics.durationSeconds === 0 ? "insufficient_data" as const :
      score >= 90 ? "excellent" as const :
      score >= 70 ? "good" as const :
      score >= 50 ? "needs_improvement" as const :
      "poor" as const;

    // ── Build summary ───────────────────────────────────────────────
    const flagSummary = flags.length === 0
      ? "No issues detected."
      : flags.map(f => `[${f.severity}] ${f.category}: ${f.description}`).join(" | ");

    const summary = `QA: ${overallRating} (${score}/100). Duration: ${durationSeconds}s. ${flagSummary}`;

    const result: QAResult = {
      runId,
      callLogId: effectiveInput.callLogId,
      leadId: effectiveInput.leadId,
      overallRating,
      score,
      metrics,
      flags,
      summary,
      generatedAt: new Date().toISOString(),
    };

    await completeAgentRun({
      runId,
      status: "completed",
      outputs: { overallRating, score, flagCount: flags.length, summary },
    });

    return result;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await completeAgentRun({ runId, status: "failed", error: msg });
    return emptyResult(effectiveInput, `QA analysis failed: ${msg}`, runId);
  }
}

function emptyResult(input: QAAgentInput, summary: string, runId = "none"): QAResult {
  return {
    runId,
    callLogId: input.callLogId,
    leadId: input.leadId,
    overallRating: "insufficient_data",
    score: 0,
    metrics: {
      durationSeconds: 0,
      operatorTalkPercent: null,
      sellerTalkPercent: null,
      silencePercent: null,
      wordCount: null,
    },
    flags: [],
    summary,
    generatedAt: new Date().toISOString(),
  };
}
