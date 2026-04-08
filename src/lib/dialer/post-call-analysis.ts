/**
 * Post-Call AI Analysis — P1-11
 *
 * After a call ends, this module extracts structured data from the
 * transcript/notes via Claude and writes the result to post_call_structures.
 *
 * Extracts: promises made, objections, deal temperature, callback timing,
 * summary line, and next-task suggestion.
 *
 * BOUNDARY:
 *   - Reads session_notes (via note-manager) for transcript text
 *   - Writes post_call_structures (dialer-domain table)
 *   - Writes dialer_ai_traces for observability
 *   - Never touches leads, calls_log, or CRM-owned tables
 *   - Uses analyzeWithClaude from @/lib/claude-client
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeWithClaude, extractJsonObject } from "@/lib/claude-client";
import {
  assemblePostCallStructure,
  DEAL_TEMPERATURES,
  mergePostCallStructureFields,
  type DealTemperature,
} from "./post-call-structure";
import { writeAiTrace } from "./ai-trace-writer";
import { randomUUID } from "crypto";

// ── Prompt versioning ────────────────────────────────────────────────

const POST_CALL_ANALYSIS_PROMPT_VERSION = "1.0.0";

const SYSTEM_PROMPT =
  "You are a real estate acquisitions analyst. You extract structured post-call data from call notes and transcripts. " +
  "Return ONLY valid JSON. No prose, no markdown fences.";

function buildPrompt(transcript: string): string {
  return (
    `Analyze these call notes/transcript from a seller conversation and extract structured post-call data:\n\n` +
    `"${transcript.slice(0, 4000)}"\n\n` +
    `Return exactly this JSON:\n` +
    `{\n` +
    `  "summary_line": <string, 1-2 sentence summary of the call outcome, max 200 chars, or null>,\n` +
    `  "promises_made": <string, any commitments made by either party e.g. "will send offer by Friday", max 200 chars, or null>,\n` +
    `  "objection": <string, the primary objection or concern raised by the seller, max 200 chars, or null>,\n` +
    `  "deal_temperature": <"hot"|"warm"|"cool"|"cold"|"dead" — overall deal temperature based on seller engagement and motivation, or null>,\n` +
    `  "callback_timing_hint": <string, when to call back e.g. "next Tuesday afternoon", "after they talk to spouse", max 120 chars, or null>,\n` +
    `  "next_task_suggestion": <string, recommended next action for the operator, max 200 chars, or null>\n` +
    `}\n\n` +
    `Rules:\n` +
    `- Extract only what is clearly stated or strongly implied in the notes.\n` +
    `- If a field has no evidence, return null for that field.\n` +
    `- deal_temperature: hot=ready to accept offer, warm=engaged and interested, cool=hesitant but not refusing, cold=not interested right now, dead=hard no or disconnected.\n` +
    `- Be concise and direct. No filler language.\n` +
    `- When in doubt, return null — do not guess.`
  );
}

// ── Types ────────────────────────────────────────────────────────────

export interface PostCallAnalysisResult {
  ok: boolean;
  run_id: string | null;
  summary_line: string | null;
  promises_made: string | null;
  objection: string | null;
  deal_temperature: DealTemperature | null;
  callback_timing_hint: string | null;
  next_task_suggestion: string | null;
  error?: string;
}

export interface PostCallAnalysisInput {
  sessionId: string;
  /** If provided, used directly. Otherwise fetched from session_notes. */
  transcript?: string;
  /** Optional — links the structure to a calls_log row. */
  callsLogId?: string | null;
  /** Optional — links the structure to a lead row. */
  leadId?: string | null;
  /** The user who triggered the analysis (system UUID if automated). */
  publishedBy: string;
}

const VALID_TEMPS = new Set<string>(DEAL_TEMPERATURES);

// ── Main analysis function ───────────────────────────────────────────

/**
 * Runs AI post-call analysis on a session's transcript/notes, extracts
 * structured data, and writes the result to post_call_structures.
 *
 * Safe to call fire-and-forget — all errors are caught and returned
 * in the result object rather than thrown.
 */
export async function runPostCallAnalysis(
  sb: SupabaseClient,
  input: PostCallAnalysisInput,
): Promise<PostCallAnalysisResult> {
  const { sessionId, callsLogId, leadId, publishedBy } = input;
  const runId = randomUUID();
  const startMs = Date.now();

  const nullResult: PostCallAnalysisResult = {
    ok: false,
    run_id: runId,
    summary_line: null,
    promises_made: null,
    objection: null,
    deal_temperature: null,
    callback_timing_hint: null,
    next_task_suggestion: null,
  };

  // ── 1. Gather transcript text ──────────────────────────────────────
  let transcript = input.transcript ?? "";

  if (!transcript) {
    try {
      // Query session_notes directly (bypasses ownership gate since we're server-side)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: notes, error: notesErr } = await (sb.from("session_notes") as any)
        .select("content, speaker")
        .eq("session_id", sessionId)
        .order("sequence_num", { ascending: true });

      if (notesErr || !notes?.length) {
        return { ...nullResult, error: "No notes found for session" };
      }
      const allNotes = (notes as Array<{ content: string | null; speaker: string | null }>)
        .filter((n) => n.content);
      // Prefer seller-only transcript for memory extraction; fall back to all speakers
      const sellerNotes = allNotes.filter((n) => n.speaker === "seller");
      const source = sellerNotes.length >= 3 ? sellerNotes : allNotes;
      transcript = source
        .map((n) =>
          n.speaker ? `[${n.speaker}] ${n.content}` : n.content
        )
        .join("\n");
    } catch (err) {
      return { ...nullResult, error: `Failed to fetch notes: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  if (!transcript.trim()) {
    return { ...nullResult, error: "Empty transcript — nothing to analyze" };
  }

  // ── 2. Check for API key ───────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[post-call-analysis] ANTHROPIC_API_KEY not set — skipping analysis");
    return { ...nullResult, error: "ANTHROPIC_API_KEY not configured" };
  }

  // ── 3. Call Claude ─────────────────────────────────────────────────
  let summary_line: string | null = null;
  let promises_made: string | null = null;
  let objection: string | null = null;
  let deal_temperature: DealTemperature | null = null;
  let callback_timing_hint: string | null = null;
  let next_task_suggestion: string | null = null;

  try {
    const rawText = await analyzeWithClaude({
      prompt: buildPrompt(transcript),
      systemPrompt: SYSTEM_PROMPT,
      apiKey,
      temperature: 0.1,
      maxTokens: 512,
    });

    const json = extractJsonObject(rawText);
    if (json) {
      const parsed = JSON.parse(json) as Record<string, unknown>;

      if (typeof parsed.summary_line === "string" && parsed.summary_line.trim()) {
        summary_line = parsed.summary_line.trim().slice(0, 200);
      }
      if (typeof parsed.promises_made === "string" && parsed.promises_made.trim()) {
        promises_made = parsed.promises_made.trim().slice(0, 200);
      }
      if (typeof parsed.objection === "string" && parsed.objection.trim()) {
        objection = parsed.objection.trim().slice(0, 200);
      }
      if (typeof parsed.deal_temperature === "string" && VALID_TEMPS.has(parsed.deal_temperature)) {
        deal_temperature = parsed.deal_temperature as DealTemperature;
      }
      if (typeof parsed.callback_timing_hint === "string" && parsed.callback_timing_hint.trim()) {
        callback_timing_hint = parsed.callback_timing_hint.trim().slice(0, 120);
      }
      if (typeof parsed.next_task_suggestion === "string" && parsed.next_task_suggestion.trim()) {
        next_task_suggestion = parsed.next_task_suggestion.trim().slice(0, 200);
      }
    }
  } catch (err) {
    console.error("[post-call-analysis] Claude analysis failed:", err);
    return { ...nullResult, error: `Claude analysis failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  // ── 4. Write AI trace (fire-and-forget) ────────────────────────────
  writeAiTrace(sb, {
    run_id: runId,
    workflow: "draft_note", // Reuse existing workflow type for trace compatibility
    prompt_version: POST_CALL_ANALYSIS_PROMPT_VERSION,
    session_id: sessionId,
    lead_id: leadId ?? null,
    model: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    input_text: transcript,
    output_text: JSON.stringify({ summary_line, promises_made, objection, deal_temperature, callback_timing_hint, next_task_suggestion }),
    latency_ms: Date.now() - startMs,
  }).catch(() => {});

  // ── 5. Write to post_call_structures (upsert) ─────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (sb.from("post_call_structures") as any)
      .select("summary_line, promises_made, objection, next_task_suggestion, callback_timing_hint, deal_temperature")
      .eq("session_id", sessionId)
      .maybeSingle();

    const mergedInput = mergePostCallStructureFields(
      {
        summary_line,
        promises_made,
        objection,
        next_task_suggestion,
        callback_timing_hint,
        deal_temperature,
      },
      existing ?? null,
    );

    const row = assemblePostCallStructure({
      sessionId,
      callsLogId: callsLogId ?? null,
      leadId: leadId ?? null,
      publishedBy,
      draftNoteRunId: runId,
      draftWasFlagged: false,
      input: mergedInput,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from("post_call_structures") as any)
      .upsert(row, { onConflict: "session_id" });

    if (error) {
      console.error("[post-call-analysis] post_call_structures upsert failed:", error.message);
      return {
        ...nullResult,
        ok: false,
        summary_line,
        promises_made,
        objection,
        deal_temperature,
        callback_timing_hint,
        next_task_suggestion,
        error: `DB write failed: ${error.message}`,
      };
    }
  } catch (err) {
    console.error("[post-call-analysis] post_call_structures write threw:", err);
    return {
      ...nullResult,
      ok: false,
      summary_line,
      promises_made,
      objection,
      deal_temperature,
      callback_timing_hint,
      next_task_suggestion,
      error: `DB write threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    ok: true,
    run_id: runId,
    summary_line,
    promises_made,
    objection,
    deal_temperature,
    callback_timing_hint,
    next_task_suggestion,
  };
}
