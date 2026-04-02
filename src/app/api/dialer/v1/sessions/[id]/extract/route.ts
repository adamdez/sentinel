/**
 * POST /api/dialer/v1/sessions/[id]/extract
 *
 * Extracts qualification signals from operator call notes using Claude.
 * Best-effort: always returns HTTP 200 with null fields on AI failure.
 *
 * Input:  { notes: string }
 * Output: { ok: true, motivation_level: 1-5|null, seller_timeline: enum|null,
 *           rationale: string|null, run_id: string }
 *
 * Every invocation is assigned a run_id and stores trace_metadata so
 * bad outputs can be correlated and rolled back. The run_id is returned
 * to the caller for optional downstream linking.
 *
 * On success, stores the result as an ai_suggestion note (is_confirmed: false)
 * for audit trail. Operator confirmation in PostCallPanel Step 3 → publishSession
 * is the write that actually updates leads qualification fields.
 *
 * Does NOT touch session_extracted_facts — that table is reserved for a richer
 * extraction pipeline (transcript-backed, PR4+).
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { getSession } from "@/lib/dialer/session-manager";
import { createNote } from "@/lib/dialer/note-manager";
import { analyzeWithClaude, extractJsonObject } from "@/lib/claude-client";
import { SELLER_TIMELINES } from "@/lib/dialer/types";
import { randomUUID } from "crypto";
import { writeAiTrace } from "@/lib/dialer/ai-trace-writer";

type RouteContext = { params: Promise<{ id: string }> };

const NULL_RESULT = {
  ok: true,
  motivation_level: null as number | null,
  seller_timeline:  null as string | null,
  rationale:        null as string | null,
  run_id:           null as string | null,
};

// ── Prompt registry ───────────────────────────────────────────
//
// Version this string. When you change the prompt, bump EXTRACT_PROMPT_VERSION.
// run_id + prompt_version in trace_metadata lets you correlate any bad output
// to the exact prompt that produced it and compare eval sets across versions.

const EXTRACT_PROMPT_VERSION = "1.0.0";

const SYSTEM_PROMPT =
  "You extract seller qualification signals from brief real-estate call notes. " +
  "Return ONLY valid JSON. No prose, no markdown fences.";

function buildPrompt(notes: string): string {
  return (
    `Extract qualification signals from these call notes:\n"${notes.slice(0, 1000)}"\n\n` +
    `Return exactly this JSON:\n` +
    `{\n` +
    `  "motivation_level": <integer 1–5 or null>,\n` +
    `  "seller_timeline": <"immediate"|"30_days"|"60_days"|"flexible"|"unknown"|null>,\n` +
    `  "rationale": <one phrase max 10 words or null>\n` +
    `}\n\n` +
    `Rules:\n` +
    `- motivation_level: 1=very low urgency, 5=very high urgency. null if unclear.\n` +
    `- seller_timeline: closest match to any timeframe mentioned. null if none.\n` +
    `- rationale: strongest single signal in plain English. null if both fields are null.\n` +
    `- When in doubt return null — do not guess.`
  );
}

// ── Route ─────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;

  // ── Validate body ────────────────────────────────────────────
  let notes: string;
  try {
    const body = await req.json() as Record<string, unknown>;
    notes = typeof body.notes === "string" ? body.notes.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Empty notes — no extraction to do
  if (!notes) {
    return NextResponse.json(NULL_RESULT);
  }

  // ── Session ownership gate ───────────────────────────────────
  const sb = createDialerClient();
  const sessionResult = await getSession(sb, sessionId, user.id);
  if (sessionResult.error || !sessionResult.data) {
    const status =
      sessionResult.code === "NOT_FOUND"  ? 404 :
      sessionResult.code === "FORBIDDEN"  ? 403 : 500;
    return NextResponse.json({ error: sessionResult.error }, { status });
  }

  // ── No API key — non-fatal, return nulls ─────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[dialer/extract] ANTHROPIC_API_KEY not set — skipping extraction");
    return NextResponse.json(NULL_RESULT);
  }

  // ── Assign run_id ─────────────────────────────────────────────
  //
  // A run_id uniquely identifies this invocation. It is stored in
  // trace_metadata on the ai_suggestion note and returned to the caller
  // so PostCallPanel can include it in any downstream review or eval links.
  const runId = randomUUID();
  const startMs = Date.now();

  // ── Call Claude ───────────────────────────────────────────────
  let motivation_level: number | null = null;
  let seller_timeline: string | null = null;
  let rationale: string | null = null;

  try {
    const rawText = await analyzeWithClaude({
      prompt:       buildPrompt(notes),
      systemPrompt: SYSTEM_PROMPT,
      apiKey,
      temperature:  0,
      maxTokens:    128,
    });

    const json = extractJsonObject(rawText);
    if (json) {
      const parsed = JSON.parse(json) as Record<string, unknown>;

      const ml = parsed.motivation_level;
      if (Number.isInteger(ml) && (ml as number) >= 1 && (ml as number) <= 5) {
        motivation_level = ml as number;
      }

      const tl = parsed.seller_timeline;
      if (typeof tl === "string" && (SELLER_TIMELINES as readonly string[]).includes(tl)) {
        seller_timeline = tl;
      }

      if (typeof parsed.rationale === "string" && parsed.rationale.trim()) {
        rationale = parsed.rationale.trim().slice(0, 120);
      }
    }
  } catch (err) {
    console.error("[dialer/extract] Claude extraction failed (non-fatal):", err);
    // Fall through — return nulls
  }

  // ── Write AI trace row (fire-and-forget) ─────────────────────
  writeAiTrace(sb, {
    run_id:         runId,
    workflow:       "extract",
    prompt_version: EXTRACT_PROMPT_VERSION,
    session_id:     sessionId,
    lead_id:        sessionResult.data.lead_id ?? null,
    model:          "claude-sonnet-4-6",
    provider:       "anthropic",
    input_text:     notes,
    output_text:    JSON.stringify({ motivation_level, seller_timeline, rationale }),
    latency_ms:     Date.now() - startMs,
  }).catch(() => {});

  // ── Store ai_suggestion note for audit trail ─────────────────
  // Fire-and-forget. A failed write does not fail the request.
  // run_id links this note to the exact invocation for eval/review.
  createNote(sb, sessionId, user.id, {
    note_type:       "ai_suggestion",
    speaker:         "ai",
    content:         JSON.stringify({ motivation_level, seller_timeline, rationale, source: "operator_notes", run_id: runId }),
    sequence_num:    0,
    is_ai_generated: true,
    trace_metadata: {
      model:          "claude-sonnet-4-6",
      provider:       "anthropic",
      prompt_version: EXTRACT_PROMPT_VERSION,
      run_id:         runId,
      latency_ms:     Date.now() - startMs,
      generated_at:   new Date().toISOString(),
    },
  }).catch((err: unknown) => {
    console.error("[dialer/extract] ai_suggestion note write failed (non-fatal):", err);
  });

  return NextResponse.json({ ok: true, motivation_level, seller_timeline, rationale, run_id: runId });
}
