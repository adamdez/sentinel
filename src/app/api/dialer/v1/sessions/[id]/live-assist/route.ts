export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getStyleBlock } from "@/lib/conversation-style";
import { writeAiTrace } from "@/lib/dialer/ai-trace-writer";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import {
  applyStrategistMove,
  buildLiveCoachPrompt,
  buildLiveCoachResponse,
  createEmptyLiveCoachState,
  parseLiveCoachState,
  parseStrategistMove,
  reduceLiveCoachState,
  shouldInvokeStrategist,
  LIVE_COACH_PROMPT_VERSION,
  type LiveCoachNoteInput,
} from "@/lib/dialer/live-coach-service";
import { completeDialerAiLayered } from "@/lib/dialer/openai-lane-client";
import {
  getSession,
  getSessionLiveCoachState,
  updateSessionLiveCoachState,
} from "@/lib/dialer/session-manager";
import type { LiveCoachMode } from "@/lib/dialer/live-coach-types";

type RouteContext = { params: Promise<{ id: string }> };

const liveCoachMemoryCache = new Map<string, Record<string, unknown>>();

function inferMode(bodyMode: unknown): LiveCoachMode {
  return bodyMode === "inbound" ? "inbound" : "outbound";
}

async function fetchNotes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  sessionId: string,
  lastProcessedSequence: number,
): Promise<LiveCoachNoteInput[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("session_notes") as any)
    .select("id, content, speaker, note_type, sequence_num, created_at, confidence")
    .eq("session_id", sessionId)
    .in("note_type", ["transcript_chunk", "operator_note"]);

  if (lastProcessedSequence > 0) {
    const { data } = await query
      .gt("sequence_num", lastProcessedSequence)
      .order("sequence_num", { ascending: true })
      .limit(60);
    return ((data ?? []) as Array<Record<string, unknown>>).map((note) => ({
      id: String(note.id ?? ""),
      content: typeof note.content === "string" ? note.content : null,
      speaker:
        note.speaker === "operator" || note.speaker === "seller" || note.speaker === "ai"
          ? note.speaker
          : null,
      noteType: String(note.note_type ?? ""),
      sequenceNum: typeof note.sequence_num === "number" ? note.sequence_num : 0,
      createdAt: typeof note.created_at === "string" ? note.created_at : null,
      confidence: typeof note.confidence === "number" ? note.confidence : null,
    }));
  }

  const { data } = await query
    .order("sequence_num", { ascending: false })
    .limit(80);

  return ((data ?? []) as Array<Record<string, unknown>>)
    .reverse()
    .map((note) => ({
      id: String(note.id ?? ""),
      content: typeof note.content === "string" ? note.content : null,
      speaker:
        note.speaker === "operator" || note.speaker === "seller" || note.speaker === "ai"
          ? note.speaker
          : null,
      noteType: String(note.note_type ?? ""),
      sequenceNum: typeof note.sequence_num === "number" ? note.sequence_num : 0,
      createdAt: typeof note.created_at === "string" ? note.created_at : null,
      confidence: typeof note.confidence === "number" ? note.confidence : null,
    }));
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;
  const sb = createDialerClient();
  const sessionResult = await getSession(sb, sessionId, user.id);

  if (sessionResult.error || !sessionResult.data) {
    const status =
      sessionResult.code === "NOT_FOUND" ? 404 :
      sessionResult.code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: sessionResult.error }, { status });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const now = new Date().toISOString();
  const mode = inferMode(body.mode);
  const sessionInstructions =
    typeof body.sessionInstructions === "string" && body.sessionInstructions.trim().length > 0
      ? body.sessionInstructions.trim()
      : null;
  const session = sessionResult.data;

  const stateResult = await getSessionLiveCoachState(sb, sessionId, user.id, true);
  const fallbackCachedState = liveCoachMemoryCache.get(sessionId) ?? null;
  const cachedState = stateResult.error
    ? parseLiveCoachState(fallbackCachedState)
    : parseLiveCoachState(stateResult.data ?? fallbackCachedState);

  const notes = await fetchNotes(sb, sessionId, cachedState.lastProcessedSequence);
  const reduction = reduceLiveCoachState(cachedState, notes, mode, now);
  let liveCoachState = reduction.state;

  if (
    process.env.OPENAI_API_KEY &&
    reduction.state.recentTurns.length > 0 &&
    shouldInvokeStrategist(cachedState, reduction)
  ) {
    const runId = randomUUID();
    const startMs = Date.now();
    const assembled = buildLiveCoachPrompt(
      liveCoachState,
      session.context_snapshot ?? null,
      mode,
      getStyleBlock(mode === "inbound" ? "inbound_guidance" : "objection_support"),
      sessionInstructions,
    );

    try {
      const ai = await completeDialerAiLayered({
        lane: "live_coach",
        assembled,
        temperature: 0.2,
      });

      liveCoachState = applyStrategistMove(
        liveCoachState,
        parseStrategistMove(ai.text),
        mode,
        now,
      );

      writeAiTrace(sb, {
        run_id: runId,
        workflow: "live_coach",
        prompt_version: LIVE_COACH_PROMPT_VERSION,
        session_id: sessionId,
        lead_id: session.lead_id ?? null,
        model: ai.model,
        provider: ai.provider,
        input_text: `${assembled.systemMessage}\n\n${assembled.userMessage}`,
        output_text: ai.text,
        latency_ms: Date.now() - startMs,
      }).catch(() => {});
    } catch (error) {
      console.warn("[live-coach] strategist call failed, falling back to rules:", error);
    }
  }

  const previousStateJson = stateResult.error ? null : JSON.stringify(cachedState);
  const nextStateJson = JSON.stringify(liveCoachState);
  let cacheWriteError: string | null = null;
  let memoryFallbackUsed = false;

  if (previousStateJson !== nextStateJson) {
    const cacheWrite = await updateSessionLiveCoachState(
      sb,
      sessionId,
      user.id,
      liveCoachState as unknown as Record<string, unknown>,
      true,
    );
    if (cacheWrite.error) {
      cacheWriteError = cacheWrite.error;
      liveCoachMemoryCache.set(sessionId, liveCoachState as unknown as Record<string, unknown>);
      memoryFallbackUsed = true;
      console.warn("[live-coach] failed to persist live coach state:", cacheWrite.error);
    } else {
      liveCoachMemoryCache.set(sessionId, liveCoachState as unknown as Record<string, unknown>);
    }
  }

  const response = buildLiveCoachResponse(liveCoachState, mode);
  return NextResponse.json({
    ...response,
    state_persisted: !cacheWriteError || memoryFallbackUsed,
  });
}
