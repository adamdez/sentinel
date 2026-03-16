import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { completeDialerAi, type DialerAiMessage } from "@/lib/dialer/openai-lane-client";
import { writeAiTrace } from "@/lib/dialer/ai-trace-writer";
import { getStyleBlock, styleVersionTag } from "@/lib/conversation-style";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Prompt registry ───────────────────────────────────────────
//
// Bump SUMMARIZE_PROMPT_VERSION whenever the system prompt or prior-context
// format changes. The version is stored in summary_trace and dialer_ai_traces
// so bad summaries can be correlated to the exact prompt that produced them.

// v2.3.0 — OpenAI migration for dialer summarize lane (gpt-5-mini default)
// v2.2.0 — seller conversation style overlay injected (conversation-style.ts)
// v2.1.0 — source hierarchy enforced: operator notes > AI summary (labeled)
// v2.0.0 — added prior call context block to user message
const SUMMARIZE_PROMPT_VERSION = `2.3.0${styleVersionTag()}`;

const CALL_SUMMARY_SYSTEM_PROMPT = `You are a real estate acquisitions assistant for Dominion Homes in Spokane, WA.

Summarize this call in 3-5 concise bullet points covering:
- Key objections raised by the seller
- Motivation level (high/medium/low/none) and reasons
- Property details or conditions mentioned
- Next steps agreed upon (callback, appointment, offer, etc.)
- Overall deal temperature (hot/warm/cold/dead)

If prior call context is provided, note any change in seller position, new information, or unresolved objections from prior calls.

Be direct and action-oriented. Use short phrases, not full sentences. If the call was a voicemail or no answer, state that briefly.

${getStyleBlock("post_call_summary")}`;

// ── Prior context source hierarchy ───────────────────────────
//
// Trust order (highest to lowest):
//   1. calls_log.notes  — operator-written or operator-published summary.
//      publish-manager writes the curated call summary here. This is the
//      operator-reviewed version of what happened on the call.
//   2. calls_log.ai_summary — raw AI output, unreviewed by operator.
//      Only used if calls_log.notes is absent. Labeled explicitly as
//      AI-generated so the summarizer can weight it appropriately.
//
// This ordering prevents recursive AI drift: an AI summary is never fed
// silently as authoritative prior context. It is always labeled.
//
// Returns { contextBlock, sourcesUsed } where sourcesUsed records which
// fields contributed context — stored in trace metadata.

interface PriorContextResult {
  contextBlock: string;
  sourcesUsed: Array<"operator_notes" | "ai_summary">;
}

async function fetchPriorCallContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  leadId: string,
  excludeCallLogId: string,
): Promise<PriorContextResult> {
  const empty: PriorContextResult = { contextBlock: "", sourcesUsed: [] };

  try {
    const { data } = await sb
      .from("calls_log")
      .select("notes, ai_summary, created_at, disposition")
      .eq("lead_id", leadId)
      .neq("id", excludeCallLogId)
      .order("created_at", { ascending: false })
      .limit(2);

    if (!data || data.length === 0) return empty;

    type CallRow = { notes: string | null; ai_summary: string | null; created_at: string; disposition: string | null };
    const rows = data as CallRow[];

    // Filter to rows that have at least one usable context field
    const usable = rows.filter((r) => r.notes?.trim() || r.ai_summary?.trim());
    if (usable.length === 0) return empty;

    const lines: string[] = ["--- Prior call context ---"];
    const sourcesUsed = new Set<"operator_notes" | "ai_summary">();

    for (const row of usable) {
      const dateLabel = new Date(row.created_at).toLocaleDateString("en-US", {
        month: "short", day: "numeric",
      });
      const dispo = row.disposition ? ` (${row.disposition.replace(/_/g, " ")})` : "";

      if (row.notes?.trim()) {
        // Operator-written/published — highest trust, no qualification label needed
        lines.push(`[${dateLabel}${dispo} — operator notes]`);
        lines.push(row.notes.trim());
        sourcesUsed.add("operator_notes");
      } else if (row.ai_summary?.trim()) {
        // AI-generated only — label explicitly so the summarizer knows to weight lower
        lines.push(`[${dateLabel}${dispo} — AI-generated prior context, not operator-reviewed]`);
        lines.push(row.ai_summary.trim());
        sourcesUsed.add("ai_summary");
      }
    }

    lines.push("--- Current call ---");
    return {
      contextBlock: lines.join("\n") + "\n\n",
      sourcesUsed: Array.from(sourcesUsed),
    };
  } catch {
    return empty;
  }
}

/**
 * POST /api/dialer/summarize
 *
 * Takes call notes (agent-written or transcription) and generates
 * a concise AI summary via OpenAI. Saves to calls_log and lead notes.
 *
 * v2: If leadId is provided, fetches up to 2 prior AI summaries from
 * calls_log and prepends them as context. This means repeat-call summaries
 * can reference prior seller position, objections, and promised next steps —
 * materially improving memory usefulness without any new tables or STT stack.
 *
 * Body: { callLogId, notes?, transcription?, leadId?, sessionId?,
 *         disposition?, duration?, ownerName?, address? }
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("[Summarize] OPENAI_API_KEY is not set in environment");
    return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 503 });
  }

  let body: {
    callLogId: string;
    sessionId?: string;
    notes?: string;
    transcription?: string;
    leadId?: string;
    disposition?: string;
    duration?: number;
    ownerName?: string;
    address?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.callLogId) {
    return NextResponse.json({ error: "callLogId required" }, { status: 400 });
  }

  const textToSummarize = body.transcription || body.notes;
  if (!textToSummarize || textToSummarize.trim().length < 5) {
    return NextResponse.json({ error: "No content to summarize" }, { status: 400 });
  }

  // ── Build call metadata context line ─────────────────────────
  const callMeta = [
    body.ownerName    && `Owner: ${body.ownerName}`,
    body.address      && `Property: ${body.address}`,
    body.disposition  && `Disposition: ${body.disposition}`,
    body.duration != null && `Call duration: ${body.duration}s`,
  ].filter(Boolean).join(" | ");

  // ── Fetch prior call context (best-effort) ────────────────────
  //
  // If leadId is present, fetch context from last 2 calls for this lead.
  // Operator-written notes are used first (highest trust).
  // AI summaries are used only if no operator notes exist, and are
  // labeled as AI-generated so the summarizer weights them appropriately.
  const { contextBlock: priorContext, sourcesUsed: priorContextSources } = body.leadId
    ? await fetchPriorCallContext(sb, body.leadId, body.callLogId)
    : { contextBlock: "", sourcesUsed: [] as Array<"operator_notes" | "ai_summary"> };

  const userMessage =
    (callMeta ? `[${callMeta}]\n\n` : "") +
    priorContext +
    textToSummarize;

  const messages: DialerAiMessage[] = [
    { role: "system", content: CALL_SUMMARY_SYSTEM_PROMPT },
    { role: "user",   content: userMessage },
  ];

  // ── Run ID and timing ─────────────────────────────────────────
  const runId = randomUUID();
  const startMs = Date.now();

  let summary: string;
  let aiModel = "gpt-5-mini";
  let aiProvider = "openai" as const;
  try {
    const ai = await completeDialerAi({
      lane: "summarize",
      messages,
      temperature: 0,
    });
    summary = ai.text;
    aiModel = ai.model;
    aiProvider = ai.provider;
  } catch (err) {
    console.error("[Summarize] OpenAI error:", err);
    return NextResponse.json({ error: "AI summarization failed" }, { status: 502 });
  }

  const latencyMs = Date.now() - startMs;
  const now = new Date().toISOString();

  // ── Write to calls_log ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("calls_log") as any)
    .update({
      ai_summary:        summary,
      summary_timestamp: now,
      summary_trace: {
        run_id:               runId,
        prompt_version:       SUMMARIZE_PROMPT_VERSION,
        model:                aiModel,
        provider:             aiProvider,
        latency_ms:           latencyMs,
        generated_at:         now,
        had_prior_context:    priorContext.length > 0,
        prior_context_sources: priorContextSources,
      },
      ...(body.transcription ? { transcription: body.transcription } : {}),
    })
    .eq("id", body.callLogId);

  // ── Write AI trace row (fire-and-forget) ─────────────────────
  //
  // NOTE: The AI summary is stored in calls_log.ai_summary (above) and used
  // by the pre-call brief hook. It is NOT written to leads.notes here.
  // leads.notes is a CRM-owned field; the approved write path is
  // publish-manager.ts via the operator-curated summary in PublishInput.summary.
  // Writing unreviewed AI output directly to leads.notes was removed to prevent
  // unguarded accumulation of AI-generated content on the lead record.
  writeAiTrace(sb, {
    run_id:         runId,
    workflow:       "summarize",
    prompt_version: SUMMARIZE_PROMPT_VERSION,
    session_id:     body.sessionId ?? null,
    lead_id:        body.leadId    ?? null,
    call_log_id:    body.callLogId,
    model:          aiModel,
    provider:       aiProvider,
    input_text:     userMessage,
    output_text:    summary,
    latency_ms:     latencyMs,
  }).catch(() => {});

  // ── Event log (fire-and-forget) ───────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (sb.from("event_log") as any).insert({
    user_id:     user.id,
    action:      "dialer.ai_summary_generated",
    entity_type: "call",
    entity_id:   body.callLogId,
    details: {
      lead_id:               body.leadId,
      summary_length:        summary.length,
      run_id:                runId,
      had_prior_context:     priorContext.length > 0,
      prior_context_sources: priorContextSources,
    },
  });

  return NextResponse.json({ success: true, summary, run_id: runId });
}
