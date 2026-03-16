/**
 * POST /api/dialer/v1/sessions/[id]/draft-note
 *
 * Generates a structured post-call note draft from operator-entered notes
 * and call context (disposition, callback date, call history snapshot).
 *
 * The draft is a PROPOSAL — never written to CRM tables directly.
 * The operator reviews, edits, and confirms the draft in PostCallDraftPanel.
 * Only after confirmation does the assembled text flow through the existing
 * publish-manager → calls_log.notes path, same as today.
 *
 * Input:
 *   {
 *     notes:         string  (required — operator call notes, 5–1000 chars)
 *     disposition?:  string  — selected outcome label (e.g. "follow_up")
 *     callback_at?:  string  — ISO8601 callback date if set
 *     owner_name?:   string  — seller name for context
 *     address?:      string  — property address for context
 *   }
 *
 * Output on success:
 *   { ok: true, draft: PostCallDraft, run_id: string }
 *
 * Output on AI failure (always HTTP 200 — best-effort):
 *   { ok: false, error: string, run_id: string }
 *
 * BOUNDARY RULES:
 *   - Auth via getDialerUser — dialer auth path only
 *   - DB via createDialerClient — never imports createServerClient
 *   - Does NOT write to CRM tables (leads, calls_log)
 *   - Writes ai_trace (fire-and-forget) and session_notes (ai_suggestion, unconfirmed)
 */

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { getSession } from "@/lib/dialer/session-manager";
import { createNote } from "@/lib/dialer/note-manager";
import { completeGrokChat, type GrokMessage } from "@/lib/grok-client";
import { randomUUID } from "crypto";
import { writeAiTrace } from "@/lib/dialer/ai-trace-writer";

type RouteContext = { params: Promise<{ id: string }> };

// ── Prompt registry ─────────────────────────────────────────────────────────
//
// Bump DRAFT_NOTE_PROMPT_VERSION when the system prompt or output schema changes.

const DRAFT_NOTE_PROMPT_VERSION = "1.0.0";
const DRAFT_NOTE_MODEL           = "grok-2-latest";
const DRAFT_NOTE_PROVIDER        = "xai";

// ── Output schema ────────────────────────────────────────────────────────────

export interface PostCallDraft {
  /** 1–2 sentence summary of what happened on this call. Max 120 chars. */
  summary_line:         string | null;
  /** What the operator (or seller) explicitly committed to. Max 80 chars. */
  promises_made:        string | null;
  /** Primary objection or concern still unresolved. Max 80 chars. */
  objection:            string | null;
  /** Suggested next task title (concise action phrase). Max 60 chars. */
  next_task_suggestion: string | null;
  /** Deal temperature: hot | warm | cool | cold | dead */
  deal_temperature:     "hot" | "warm" | "cool" | "cold" | "dead" | null;
}

const NULL_DRAFT: PostCallDraft = {
  summary_line:         null,
  promises_made:        null,
  objection:            null,
  next_task_suggestion: null,
  deal_temperature:     null,
};

// ── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are a real estate acquisitions assistant for Dominion Home Deals in Spokane, WA. " +
  "Extract structured call notes from brief operator notes after a seller call. " +
  "Return ONLY valid JSON matching the schema. No prose, no markdown fences, no extra keys. " +
  "Be conservative: return null for any field you cannot confidently extract. Never guess or embellish.";

function buildPrompt(
  notes:       string,
  disposition: string | null,
  callbackAt:  string | null,
  ownerName:   string | null,
  address:     string | null,
): string {
  const context = [
    ownerName    && `Seller: ${ownerName}`,
    address      && `Property: ${address}`,
    disposition  && `Call outcome: ${disposition.replace(/_/g, " ")}`,
    callbackAt   && `Callback scheduled: ${new Date(callbackAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
  ].filter(Boolean).join(" | ");

  return (
    (context ? `[Context: ${context}]\n\n` : "") +
    `Operator call notes:\n"${notes.slice(0, 800)}"\n\n` +
    `Extract structured call notes. Return exactly this JSON:\n` +
    `{\n` +
    `  "summary_line": <string max 120 chars or null>,\n` +
    `  "promises_made": <string max 80 chars or null>,\n` +
    `  "objection": <string max 80 chars or null>,\n` +
    `  "next_task_suggestion": <string max 60 chars or null>,\n` +
    `  "deal_temperature": <"hot"|"warm"|"cool"|"cold"|"dead"|null>\n` +
    `}\n\n` +
    `Rules:\n` +
    `- summary_line: what happened on this call in 1-2 sentences. null if notes are too sparse.\n` +
    `- promises_made: only explicit commitments (callback by X, sending Y, etc.). null if none.\n` +
    `- objection: primary unresolved seller concern. null if none mentioned or call was no-answer/voicemail.\n` +
    `- next_task_suggestion: concise action phrase like "Call back Thu 3pm" or "Send offer details". null if no next step mentioned.\n` +
    `- deal_temperature: seller engagement level. null if call was no-answer/voicemail or too unclear.\n` +
    `- Return null for any field you cannot confidently extract — never guess.`
  );
}

// ── Validate and truncate draft fields ───────────────────────────────────────

const VALID_TEMPS = new Set(["hot", "warm", "cool", "cold", "dead"]);

function parseDraft(raw: Record<string, unknown>): PostCallDraft {
  const str = (v: unknown, max: number): string | null => {
    if (typeof v !== "string" || !v.trim()) return null;
    return v.trim().slice(0, max);
  };
  const temp = raw.deal_temperature;
  return {
    summary_line:         str(raw.summary_line, 120),
    promises_made:        str(raw.promises_made, 80),
    objection:            str(raw.objection, 80),
    next_task_suggestion: str(raw.next_task_suggestion, 60),
    deal_temperature:     (typeof temp === "string" && VALID_TEMPS.has(temp))
      ? (temp as PostCallDraft["deal_temperature"])
      : null,
  };
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;
  const runId = randomUUID();

  // ── Parse body ───────────────────────────────────────────────────────────
  let notes:       string;
  let disposition: string | null = null;
  let callbackAt:  string | null = null;
  let ownerName:   string | null = null;
  let address:     string | null = null;

  try {
    const body = await req.json() as Record<string, unknown>;
    notes       = typeof body.notes       === "string" ? body.notes.trim()       : "";
    disposition = typeof body.disposition === "string" ? body.disposition        : null;
    callbackAt  = typeof body.callback_at  === "string" ? body.callback_at       : null;
    ownerName   = typeof body.owner_name   === "string" ? body.owner_name.trim() : null;
    address     = typeof body.address      === "string" ? body.address.trim()    : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!notes || notes.length < 5) {
    return NextResponse.json({ ok: false, error: "Notes too short to generate a draft", run_id: runId });
  }

  // ── Session ownership gate ───────────────────────────────────────────────
  const sb = createDialerClient();
  const sessionResult = await getSession(sb, sessionId, user.id);
  if (sessionResult.error || !sessionResult.data) {
    const status =
      sessionResult.code === "NOT_FOUND"  ? 404 :
      sessionResult.code === "FORBIDDEN"  ? 403 : 500;
    return NextResponse.json({ error: sessionResult.error }, { status });
  }

  // ── API key guard ────────────────────────────────────────────────────────
  const apiKey = process.env.GROK_API_KEY ?? process.env.XAI_API_KEY;
  if (!apiKey) {
    console.error("[draft-note] GROK_API_KEY / XAI_API_KEY not set");
    return NextResponse.json({ ok: false, error: "AI service not configured", run_id: runId });
  }

  // ── Build prompt and call Grok ───────────────────────────────────────────
  const userContent = buildPrompt(notes, disposition, callbackAt, ownerName, address);
  const messages: GrokMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user",   content: userContent },
  ];

  const startMs = Date.now();
  let rawOutput = "";
  let callOk    = false;

  try {
    rawOutput = await completeGrokChat({ messages, temperature: 0, apiKey });
    callOk = true;
  } catch (err) {
    console.error("[draft-note] Grok call failed:", err);
  }

  const latencyMs = Date.now() - startMs;

  // ── Parse output ─────────────────────────────────────────────────────────
  let draft:   PostCallDraft = { ...NULL_DRAFT };
  let parseOk = false;

  if (callOk && rawOutput) {
    try {
      const jsonStart = rawOutput.indexOf("{");
      const jsonEnd   = rawOutput.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const parsed = JSON.parse(rawOutput.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
        draft   = parseDraft(parsed);
        parseOk = true;
      }
    } catch {
      console.warn("[draft-note] JSON parse failed from Grok output");
    }
  }

  // ── Write AI trace (fire-and-forget) ─────────────────────────────────────
  writeAiTrace(sb, {
    run_id:         runId,
    workflow:       "draft_note",
    prompt_version: DRAFT_NOTE_PROMPT_VERSION,
    session_id:     sessionId,
    lead_id:        sessionResult.data.lead_id ?? null,
    model:          DRAFT_NOTE_MODEL,
    provider:       DRAFT_NOTE_PROVIDER,
    input_text:     userContent,
    output_text:    rawOutput || null,
    latency_ms:     latencyMs,
  }).catch(() => {});

  // ── Store unconfirmed ai_suggestion note (audit trail) ───────────────────
  // Mirrors the extract route pattern. is_confirmed defaults to false in note-manager.
  // The draft is traceable here even if the operator never confirms it.
  if (parseOk) {
    createNote(sb, sessionId, user.id, {
      note_type:       "ai_suggestion",
      speaker:         "ai",
      content:         JSON.stringify({ draft, run_id: runId, prompt_version: DRAFT_NOTE_PROMPT_VERSION }),
      sequence_num:    0,
      is_ai_generated: true,
      trace_metadata: {
        model:          DRAFT_NOTE_MODEL,
        provider:       DRAFT_NOTE_PROVIDER,
        prompt_version: DRAFT_NOTE_PROMPT_VERSION,
        run_id:         runId,
        latency_ms:     latencyMs,
        generated_at:   new Date().toISOString(),
      },
    }).catch((err: unknown) => {
      console.error("[draft-note] ai_suggestion note write failed (non-fatal):", err);
    });
  }

  if (!callOk) {
    return NextResponse.json({ ok: false, error: "AI call failed — use manual notes", run_id: runId });
  }

  if (!parseOk) {
    return NextResponse.json({ ok: false, error: "Could not parse draft — use manual notes", run_id: runId });
  }

  return NextResponse.json({ ok: true, draft, run_id: runId });
}
