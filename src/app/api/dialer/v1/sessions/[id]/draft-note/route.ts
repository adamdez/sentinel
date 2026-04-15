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
import { completeDialerAiLayered } from "@/lib/dialer/openai-lane-client";
import { getStyleBlock, styleVersionTag } from "@/lib/conversation-style";
import { randomUUID } from "crypto";
import { writeAiTrace } from "@/lib/dialer/ai-trace-writer";
import type { LiveCoachResponseV2 } from "@/lib/dialer/live-coach-types";
import {
  assemblePrompt,
  draftNoteStableBase,
  draftNoteSemiStable,
  draftNoteDynamic,
  type LayeredPrompt,
} from "@/lib/dialer/prompt-cache";
import type { DiscoveryMapSlotKey } from "@/lib/dialer/live-coach-types";

type RouteContext = { params: Promise<{ id: string }> };
type LiveCoachRecap = LiveCoachResponseV2["postCallRecap"];

// ── Prompt registry ─────────────────────────────────────────────────────────
//
// Bump DRAFT_NOTE_PROMPT_VERSION when the system prompt or output schema changes.

// v1.3.0 — adds callback_timing_hint for post-call structure capture
// v1.1.0 — OpenAI migration for draft_note lane
const DRAFT_NOTE_PROMPT_VERSION = `1.3.0${styleVersionTag()}`;
const DRAFT_NOTE_MODEL_FALLBACK = "gpt-5-mini";
const DRAFT_NOTE_PROVIDER       = "openai";

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
  /** Best callback timing mentioned by seller/operator notes. Max 60 chars. */
  callback_timing_hint: string | null;
  /** Deal temperature: hot | warm | cool | cold | dead */
  deal_temperature:     "hot" | "warm" | "cool" | "cold" | "dead" | null;
}

const NULL_DRAFT: PostCallDraft = {
  summary_line:         null,
  promises_made:        null,
  objection:            null,
  next_task_suggestion: null,
  callback_timing_hint: null,
  deal_temperature:     null,
};

// ── System prompt (3-layer cache architecture, Blueprint §15.1) ──────────────
// Stable base + semi-stable context + dynamic notes are assembled via prompt-cache.ts
// so OpenAI's automatic prefix cache can hit on the stable layers.

// ── Validate and truncate draft fields ───────────────────────────────────────

const VALID_TEMPS = new Set(["hot", "warm", "cool", "cold", "dead"]);

function parseLiveCoachRecap(raw: unknown): LiveCoachRecap | null {
  if (!raw || typeof raw !== "object") return null;
  const recap = raw as Record<string, unknown>;
  const bullets = Array.isArray(recap.bullets)
    ? recap.bullets.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 6)
    : [];
  const discoveryAnswersRaw = recap.discoveryAnswers;
  const discoveryAnswers =
    discoveryAnswersRaw && typeof discoveryAnswersRaw === "object"
      ? Object.fromEntries(
          Object.entries(discoveryAnswersRaw).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0),
        )
      : {};
  const unresolvedGaps = Array.isArray(recap.unresolvedGaps)
    ? recap.unresolvedGaps.filter((item): item is DiscoveryMapSlotKey => typeof item === "string" && item.trim().length > 0).slice(0, 4)
    : [];
  const vossSignals = Array.isArray(recap.vossSignals)
    ? recap.vossSignals.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 4)
    : [];
  const nepqSignals = Array.isArray(recap.nepqSignals)
    ? recap.nepqSignals.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 4)
    : [];
  const recommendedSummary = typeof recap.recommendedSummary === "string" ? recap.recommendedSummary.trim() : "";
  const primaryObjection = typeof recap.primaryObjection === "string" && recap.primaryObjection.trim()
    ? recap.primaryObjection.trim()
    : null;

  if (
    bullets.length === 0 &&
    Object.keys(discoveryAnswers).length === 0 &&
    unresolvedGaps.length === 0 &&
    vossSignals.length === 0 &&
    nepqSignals.length === 0 &&
    !recommendedSummary &&
    !primaryObjection
  ) {
    return null;
  }

  return {
    bullets,
    discoveryAnswers,
    unresolvedGaps,
    primaryObjection,
    vossSignals,
    nepqSignals,
    recommendedSummary,
  };
}

function formatDynamicDraftInput(notes: string, liveCoachRecap: LiveCoachRecap | null): string {
  const sections: string[] = [];
  if (notes.trim()) {
    sections.push(`Operator call notes:\n${notes.trim()}`);
  }
  if (liveCoachRecap) {
    sections.push([
      "Live coach recap:",
      liveCoachRecap.bullets.length > 0
        ? `- Recap bullets: ${liveCoachRecap.bullets.join(" | ")}`
        : null,
      Object.keys(liveCoachRecap.discoveryAnswers).length > 0
        ? `- Discovery answers: ${Object.entries(liveCoachRecap.discoveryAnswers).map(([key, value]) => `${key}=${value}`).join(" | ")}`
        : null,
      liveCoachRecap.primaryObjection
        ? `- Primary objection: ${liveCoachRecap.primaryObjection}`
        : null,
      liveCoachRecap.vossSignals.length > 0
        ? `- Voss cues: ${liveCoachRecap.vossSignals.join(" | ")}`
        : null,
      liveCoachRecap.nepqSignals.length > 0
        ? `- NEPQ cues: ${liveCoachRecap.nepqSignals.join(" | ")}`
        : null,
      liveCoachRecap.unresolvedGaps.length > 0
        ? `- Missing still unresolved: ${liveCoachRecap.unresolvedGaps.join(" | ")}`
        : null,
      liveCoachRecap.recommendedSummary
        ? `- Recommended recap summary: ${liveCoachRecap.recommendedSummary}`
        : null,
    ].filter(Boolean).join("\n"));
  }
  return sections.join("\n\n");
}

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
    callback_timing_hint: str(raw.callback_timing_hint, 60),
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
  let liveCoachRecap: LiveCoachRecap | null = null;

  try {
    const body = await req.json() as Record<string, unknown>;
    notes       = typeof body.notes       === "string" ? body.notes.trim()       : "";
    disposition = typeof body.disposition === "string" ? body.disposition        : null;
    callbackAt  = typeof body.callback_at  === "string" ? body.callback_at       : null;
    ownerName   = typeof body.owner_name   === "string" ? body.owner_name.trim() : null;
    address     = typeof body.address      === "string" ? body.address.trim()    : null;
    liveCoachRecap = parseLiveCoachRecap(body.live_coach_recap);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if ((!notes || notes.length < 5) && !liveCoachRecap) {
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
  if (!process.env.OPENAI_API_KEY) {
    console.error("[draft-note] OPENAI_API_KEY not set");
    return NextResponse.json({ ok: false, error: "AI service not configured", run_id: runId });
  }

  // ── Build 3-layer prompt and call OpenAI ─────────────────────────────────
  const layered: LayeredPrompt = {
    layers: [
      draftNoteStableBase(getStyleBlock("objection_support")),
      draftNoteSemiStable({ ownerName, address, disposition, callbackAt }),
      draftNoteDynamic(formatDynamicDraftInput(notes, liveCoachRecap)),
    ],
    version: DRAFT_NOTE_PROMPT_VERSION,
    workflow: "draft_note",
  };
  const assembled = assemblePrompt(layered, "Extract structured call notes from the operator notes above.");

  const startMs = Date.now();
  let rawOutput = "";
  let callOk    = false;
  let aiModel   = DRAFT_NOTE_MODEL_FALLBACK;

  try {
    const ai = await completeDialerAiLayered({
      lane: "draft_note",
      assembled,
      temperature: 0,
    });
    rawOutput = ai.text;
    aiModel = ai.model;
    callOk = true;
  } catch (err) {
    console.error("[draft-note] OpenAI call failed:", err);
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
      console.warn("[draft-note] JSON parse failed from OpenAI output");
    }
  }

  // ── Write AI trace (fire-and-forget) ─────────────────────────────────────
  writeAiTrace(sb, {
    run_id:         runId,
    workflow:       "draft_note",
    prompt_version: DRAFT_NOTE_PROMPT_VERSION,
    session_id:     sessionId,
    lead_id:        sessionResult.data.lead_id ?? null,
    model:          aiModel,
    provider:       DRAFT_NOTE_PROVIDER,
    input_text:     assembled.userMessage,
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
        model:          aiModel,
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
