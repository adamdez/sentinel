export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { getSession } from "@/lib/dialer/session-manager";
import {
  assemblePrompt,
  liveAssistStableBase,
  preCallBriefDynamic,
  preCallBriefSemiStable,
  type LeadContextSnapshot,
  type LiveSessionSignals,
} from "@/lib/dialer/prompt-cache";
import { completeDialerAiLayered } from "@/lib/dialer/openai-lane-client";
import { getStyleBlock } from "@/lib/conversation-style";
import type { CRMLeadContext } from "@/lib/dialer/types";

type RouteContext = { params: Promise<{ id: string }> };
type CoachMode = "inbound" | "outbound";
type NepqStage =
  | "connection"
  | "situation"
  | "problem_awareness"
  | "solution_awareness"
  | "consequence"
  | "commitment";
type EmpathyMoveType = "mirror" | "label" | "calibrated_question";

interface EmpathyMove {
  type: EmpathyMoveType;
  text: string;
  cue: string;
}

interface ObjectionCoachMove {
  objection: string;
  label: string;
  calibratedQuestion: string;
}

interface LiveCoachResponse {
  currentStage: NepqStage;
  stageReason: string;
  primaryGoal: string;
  nextBestQuestion: string;
  nextQuestions: string[];
  empathyMoves: EmpathyMove[];
  objectionHandling: ObjectionCoachMove[];
  coachNotes: string[];
  guardrails: string[];
  buyingSignals: string[];
  riskFlags: string[];
  transcriptExcerpt: string;
  updatedAt: string;
  mode: CoachMode;
  source: "gpt5" | "fallback";
}

function compact(text: string | null | undefined, max = 220): string | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

function inferMode(bodyMode: unknown): CoachMode {
  return bodyMode === "inbound" ? "inbound" : "outbound";
}

function mapSnapshot(snapshot: CRMLeadContext | null): LeadContextSnapshot {
  return {
    ownerName: snapshot?.ownerName ?? null,
    address: snapshot?.address ?? null,
    score: null,
    distressSignals: [],
    equityPercent: null,
    ownershipYears: null,
    estimatedValue: null,
    propertyType: null,
    county: null,
    tags: [],
    callHistory: snapshot?.lastCallDate
      ? [{
          date: new Date(snapshot.lastCallDate).toLocaleDateString("en-US"),
          disposition: snapshot.lastCallDisposition ?? "unknown",
          notes: snapshot.lastCallNotes ?? snapshot.lastCallAiSummary ?? "",
        }]
      : [],
    aiNotes: snapshot?.lastCallAiSummary ? [snapshot.lastCallAiSummary] : [],
    sellerMemory: {
      summary_line: compact(snapshot?.sellerSituationSummary, 180),
      promises_made: compact(snapshot?.openTaskTitle, 120),
      objection: snapshot?.openObjections?.[0]?.note ?? snapshot?.openObjections?.[0]?.tag ?? null,
      next_task_suggestion: compact(snapshot?.nextAction ?? snapshot?.openTaskTitle, 120),
      callback_timing_hint: compact(snapshot?.nextActionDueAt ?? snapshot?.openTaskDueAt, 80),
      deal_temperature: null,
    },
    sellerSituationSummary: snapshot?.sellerSituationSummary ?? null,
    recommendedCallAngle: snapshot?.recommendedCallAngle ?? null,
    likelyDecisionMaker: snapshot?.likelyDecisionMaker ?? null,
    decisionMakerConfidence: snapshot?.decisionMakerConfidence ?? null,
    topFacts: [snapshot?.topFact1, snapshot?.topFact2, snapshot?.topFact3].filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0,
    ),
    opportunityScore: snapshot?.opportunityScore ?? null,
    confidenceScore: snapshot?.confidenceScore ?? null,
    inboundSignals: [],
    structuredFacts: [],
  };
}

function detectLiveSignals(transcriptExcerpt: string, snapshot: CRMLeadContext | null): {
  liveSignals: LiveSessionSignals["liveSignals"];
  riskSeeds: string[];
  guardrails: string[];
  buyingSignals: string[];
} {
  const text = transcriptExcerpt.toLowerCase();
  const liveSignals: LiveSessionSignals["liveSignals"] = [];
  const riskSeeds: string[] = [];
  const guardrails: string[] = [];
  const buyingSignals: string[] = [];

  if (/\b(price|offer|number|cash offer|what can you pay)\b/.test(text)) {
    liveSignals?.push({ type: "price_mention", value: "Price or offer mentioned in the recent transcript." });
    guardrails.push("Do not anchor on price until motivation, timeline, and decision-maker are clear.");
  }

  if (/\b(spouse|wife|husband|partner|brother|sister|mom|dad)\b/.test(text)) {
    liveSignals?.push({ type: "decision_maker", value: "Another decision-maker may be involved." });
    riskSeeds.push("Decision-maker may not be fully confirmed yet.");
  }

  if (/\b(soon|asap|immediately|this week|by friday|before .*month|deadline)\b/.test(text)) {
    liveSignals?.push({ type: "urgency", value: "Seller language suggests urgency or a deadline." });
    buyingSignals.push("Seller used time-bound language that may indicate urgency.");
  }

  if (/\b(tired|overwhelmed|done with it|stress|headache|burden|frustrated)\b/.test(text)) {
    liveSignals?.push({ type: "emotion", value: "Seller language suggests emotional strain." });
    buyingSignals.push("Seller is describing emotional pain, not just property facts.");
  }

  if (/\b(just looking|curious|thinking about it|not ready|maybe later)\b/.test(text)) {
    guardrails.push("Do not force commitment yet; stay in discovery and clarify timing.");
  }

  if (!snapshot?.nextAction && snapshot?.qualificationRoute === "follow_up") {
    riskSeeds.push("No committed next action is visible in CRM context yet.");
  }

  return {
    liveSignals,
    riskSeeds: Array.from(new Set(riskSeeds)).slice(0, 3),
    guardrails: Array.from(new Set(guardrails)).slice(0, 3),
    buyingSignals: Array.from(new Set(buyingSignals)).slice(0, 3),
  };
}

function parseCoachPayload(
  raw: string,
  fallback: Omit<LiveCoachResponse, "source">,
): LiveCoachResponse {
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const empathyMoves = Array.isArray(parsed.empathyMoves)
      ? parsed.empathyMoves
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const move = item as Record<string, unknown>;
            const type = move.type;
            const text = compact(typeof move.text === "string" ? move.text : null, 160);
            const cue = compact(typeof move.cue === "string" ? move.cue : null, 120);
            if (!text || !cue) return null;
            if (type !== "mirror" && type !== "label" && type !== "calibrated_question") return null;
            return { type, text, cue } as EmpathyMove;
          })
          .filter((item): item is EmpathyMove => item !== null)
      : [];
    const objectionHandling = Array.isArray(parsed.objectionHandling)
      ? parsed.objectionHandling
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const move = item as Record<string, unknown>;
            const objection = compact(typeof move.objection === "string" ? move.objection : null, 100);
            const label = compact(typeof move.label === "string" ? move.label : null, 140);
            const calibratedQuestion = compact(typeof move.calibratedQuestion === "string" ? move.calibratedQuestion : null, 160);
            if (!objection || !label || !calibratedQuestion) return null;
            return { objection, label, calibratedQuestion } as ObjectionCoachMove;
          })
          .filter((item): item is ObjectionCoachMove => item !== null)
      : [];

    const nextQuestions = Array.isArray(parsed.nextQuestions)
      ? parsed.nextQuestions.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 3)
      : [];

    const readList = (key: string, max: number) =>
      Array.isArray(parsed[key])
        ? parsed[key]
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, max)
        : [];

    const currentStage = parsed.currentStage;
    return {
      ...fallback,
      currentStage: currentStage === "connection" ||
        currentStage === "situation" ||
        currentStage === "problem_awareness" ||
        currentStage === "solution_awareness" ||
        currentStage === "consequence" ||
        currentStage === "commitment"
        ? currentStage
        : fallback.currentStage,
      stageReason: compact(typeof parsed.stageReason === "string" ? parsed.stageReason : null, 180) ?? fallback.stageReason,
      primaryGoal: compact(typeof parsed.primaryGoal === "string" ? parsed.primaryGoal : null, 180) ?? fallback.primaryGoal,
      nextBestQuestion: compact(typeof parsed.nextBestQuestion === "string" ? parsed.nextBestQuestion : null, 180) ?? fallback.nextBestQuestion,
      nextQuestions: nextQuestions.length > 0 ? nextQuestions : fallback.nextQuestions,
      empathyMoves: empathyMoves.length > 0 ? empathyMoves : fallback.empathyMoves,
      objectionHandling: objectionHandling.length > 0 ? objectionHandling : fallback.objectionHandling,
      coachNotes: readList("coachNotes", 3).length > 0 ? readList("coachNotes", 3) : fallback.coachNotes,
      guardrails: readList("guardrails", 3).length > 0 ? readList("guardrails", 3) : fallback.guardrails,
      buyingSignals: readList("buyingSignals", 3).length > 0 ? readList("buyingSignals", 3) : fallback.buyingSignals,
      riskFlags: readList("riskFlags", 3).length > 0 ? readList("riskFlags", 3) : fallback.riskFlags,
      source: "gpt5",
    };
  } catch {
    return {
      ...fallback,
      source: "fallback",
    };
  }
}

function buildFallback(
  mode: CoachMode,
  transcriptExcerpt: string,
  snapshot: CRMLeadContext | null,
  guardrails: string[],
  buyingSignals: string[],
  riskSeeds: string[],
): Omit<LiveCoachResponse, "source"> {
  const stage: NepqStage = /\b(why now|what's going on|tell me|walk me through)\b/i.test(transcriptExcerpt)
    ? "situation"
    : /\b(stress|burden|behind|problem|issue|headache)\b/i.test(transcriptExcerpt)
      ? "problem_awareness"
      : /\b(when|timeline|how soon|deadline)\b/i.test(transcriptExcerpt)
        ? "consequence"
        : "connection";

  return {
    currentStage: stage,
    stageReason: "Fallback coaching based on the most recent transcript excerpt and CRM context.",
    primaryGoal: stage === "connection"
      ? "Build trust and get the seller talking."
      : stage === "situation"
        ? "Clarify what is happening and why now."
        : stage === "problem_awareness"
          ? "Help the seller expand on the pain or friction they are dealing with."
          : "Clarify timeline and what happens if nothing changes.",
    nextBestQuestion: mode === "inbound"
      ? "What was going on today that made you decide to call?"
      : "What has you thinking about the property now?",
    nextQuestions: [
      "How long has this been weighing on you?",
      "What feels most important to get solved first?",
      "What timeline feels realistic from your side?",
    ],
    empathyMoves: [
      { type: "label", text: "It sounds like this has been weighing on you.", cue: "Use after they describe stress, delay, or frustration." },
      { type: "calibrated_question", text: "What feels like the hardest part of this right now?", cue: "Use when the seller gives facts but not pain." },
    ],
    objectionHandling: snapshot?.openObjections?.length
      ? [{
          objection: snapshot.openObjections[0].tag.replace(/_/g, " "),
          label: "It sounds like you do not want to make the wrong move here.",
          calibratedQuestion: "What would you want to feel clearer on before deciding the next step?",
        }]
      : [],
    coachNotes: [
      "Slow down and ask one question at a time.",
      "Let the seller do most of the talking for the next beat.",
    ],
    guardrails,
    buyingSignals,
    riskFlags: riskSeeds,
    transcriptExcerpt,
    updatedAt: new Date().toISOString(),
    mode,
  };
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

  const mode = inferMode(body.mode);
  const sessionInstructions = typeof body.sessionInstructions === "string"
    ? body.sessionInstructions.trim().slice(0, 240)
    : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: notes } = await (sb.from("session_notes") as any)
    .select("content, speaker, note_type, sequence_num")
    .eq("session_id", sessionId)
    .in("note_type", ["transcript_chunk", "operator_note"])
    .order("sequence_num", { ascending: false })
    .limit(18);

  const recentNotes = ((notes ?? []) as Array<{
    content: string | null;
    speaker: "operator" | "seller" | "ai" | null;
    note_type: string;
    sequence_num: number;
  }>)
    .reverse()
    .filter((note) => typeof note.content === "string" && note.content.trim().length > 0);

  const transcriptExcerpt = recentNotes
    .map((note) => `[${note.speaker ?? "unknown"}] ${note.content?.trim() ?? ""}`.trim())
    .join("\n")
    .slice(-2200);

  const snapshot = sessionResult.data.context_snapshot ?? null;
  const signalSummary = detectLiveSignals(transcriptExcerpt, snapshot);
  const fallback = buildFallback(
    mode,
    transcriptExcerpt,
    snapshot,
    signalSummary.guardrails,
    signalSummary.buyingSignals,
    signalSummary.riskSeeds,
  );

  if (!process.env.OPENAI_API_KEY || transcriptExcerpt.trim().length < 20) {
    return NextResponse.json({
      ...fallback,
      source: "fallback",
    } satisfies LiveCoachResponse);
  }

  const leadContext = mapSnapshot(snapshot);
  const sessionSignals: LiveSessionSignals = {
    today: new Date().toISOString().split("T")[0],
    riskSeeds: signalSummary.riskSeeds,
    transcriptExcerpt,
    liveSignals: signalSummary.liveSignals,
    sessionInstructions,
  };

  const assembled = assemblePrompt({
    layers: [
      liveAssistStableBase(getStyleBlock(mode === "inbound" ? "inbound_guidance" : "objection_support")),
      preCallBriefSemiStable(leadContext),
      preCallBriefDynamic(sessionSignals),
    ],
    version: "live_coach@1.0.0",
    workflow: "live_coach",
  }, `Coach the operator for this ${mode} seller call right now.`);

  try {
    const ai = await completeDialerAiLayered({
      lane: "live_coach",
      assembled,
      temperature: 0.2,
    });

    return NextResponse.json(
      parseCoachPayload(ai.text, fallback),
    );
  } catch {
    return NextResponse.json({
      ...fallback,
      source: "fallback",
    } satisfies LiveCoachResponse);
  }
}
