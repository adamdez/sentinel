import {
  assemblePrompt,
  preCallBriefSemiStable,
  type AssembledPrompt,
  type LeadContextSnapshot,
  type PromptLayer,
} from "./prompt-cache";
import type { CRMLeadContext } from "./types";
import type {
  DeterministicSignal,
  DeterministicSignalFamily,
  DiscoveryMap,
  DiscoveryMapConfidence,
  DiscoveryMapSlot,
  DiscoveryMapSlotKey,
  DiscoveryMapSlotStatus,
  DiscoveryMapSource,
  EmpathyMove,
  LiveBestMove,
  LiveCoachCachedState,
  LiveCoachMode,
  LiveCoachRecentTurn,
  LiveCoachResponseV2,
  LiveCoachSpeakerReliability,
  NepqStage,
  StructuredLiveNote,
} from "./live-coach-types";

export interface LiveCoachNoteInput {
  id: string;
  content: string | null;
  speaker: "operator" | "seller" | "ai" | null;
  noteType: string;
  sequenceNum: number;
  createdAt: string | null;
  confidence: number | null;
}

interface SignalDetection {
  signal: DeterministicSignal;
  slotValue: string;
  proposedStatus: DiscoveryMapSlotStatus;
  proposedConfidence: DiscoveryMapConfidence;
  noteText: string;
  noteSlot: DiscoveryMapSlotKey;
}

export interface ReduceLiveCoachStateResult {
  state: LiveCoachCachedState;
  gapChanged: boolean;
  hasNewSellerEvidence: boolean;
  processedCount: number;
}

export interface ParsedStrategistMove {
  currentStage: NepqStage | null;
  whyThisGapNow: string | null;
  nextBestQuestion: string | null;
  backupQuestion: string | null;
  suggestedMirror: string | null;
  suggestedLabel: string | null;
  guardrail: string | null;
}

export const LIVE_COACH_STATE_VERSION = "live_coach_state@2.0.0";
export const LIVE_COACH_PROMPT_VERSION = "2.0.0";
const MAX_LIVE_NOTES = 8;
const MAX_RECENT_TURNS = 6;
const MAX_DETERMINISTIC_SIGNALS = 24;
const STRATEGIST_STALE_MS = 25_000;

const SLOT_KEYS: DiscoveryMapSlotKey[] = [
  "surface_problem",
  "human_pain",
  "desired_relief",
  "property_condition",
  "motivation",
  "timeline",
  "decision_maker",
  "price_posture",
  "next_step",
];

const SLOT_STATUS_RANK: Record<DiscoveryMapSlotStatus, number> = {
  missing: 0,
  partial: 1,
  confirmed: 2,
};

const SLOT_CONFIDENCE_RANK: Record<DiscoveryMapConfidence, number> = {
  weak: 0,
  probable: 1,
  strong: 2,
};

const PERSON_SENSITIVE_SLOTS = new Set<DiscoveryMapSlotKey>([
  "human_pain",
  "desired_relief",
  "motivation",
]);

const CANT_MOVE_PATTERN = /\b(?:can't move|can not move|cannot move)\b/i;
const SOLE_DECISION_PATTERN =
  /\b(?:it's just me|it is just me|i'm the only one|i am the only one)\b/i;
const FIRST_PERSON_PATTERN =
  /\b(?:i|i'm|i am|my|me|we|we're|we are|our|us)\b/i;
const MOVE_CLOSER_TO_FAMILY_PATTERN =
  /\b(?:need|have|want)\s+to move closer to (?:my|our) (?:daughter|son|family|kids|grandkids)\b/i;

function compact(text: string | null | undefined, max = 220): string | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, max);
}

function normalizeTextKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeSpeaker(
  speaker: "operator" | "seller" | "ai" | null,
): "operator" | "seller" | "ai" | "unknown" {
  if (speaker === "operator" || speaker === "seller" || speaker === "ai") return speaker;
  return "unknown";
}

function emptySlot(): DiscoveryMapSlot {
  return {
    status: "missing",
    value: null,
    confidence: "weak",
    source: "rule",
    updatedAt: null,
  };
}

export function buildEmptyDiscoveryMap(): DiscoveryMap {
  return {
    surface_problem: emptySlot(),
    human_pain: emptySlot(),
    desired_relief: emptySlot(),
    property_condition: emptySlot(),
    motivation: emptySlot(),
    timeline: emptySlot(),
    decision_maker: emptySlot(),
    price_posture: emptySlot(),
    next_step: emptySlot(),
  };
}

export function createEmptyLiveCoachState(now = new Date().toISOString()): LiveCoachCachedState {
  return {
    version: LIVE_COACH_STATE_VERSION,
    lastProcessedSequence: 0,
    discoveryMap: buildEmptyDiscoveryMap(),
    structuredLiveNotes: [],
    recentTurns: [],
    deterministicSignals: [],
    speakerReliability: {
      sellerTurns: 0,
      operatorTurns: 0,
      unknownTurns: 0,
      overall: "low",
    },
    bestMove: null,
    source: "rules",
    lastUpdatedAt: now,
    lastStrategizedAt: null,
    lastStrategizedGap: null,
    lastSellerEvidenceSequence: 0,
  };
}

function isDiscoveryMap(raw: unknown): raw is DiscoveryMap {
  return !!raw && typeof raw === "object" && SLOT_KEYS.every((key) => key in (raw as Record<string, unknown>));
}

function readSlot(raw: unknown): DiscoveryMapSlot {
  if (!raw || typeof raw !== "object") return emptySlot();
  const data = raw as Record<string, unknown>;
  const status = data.status;
  const confidence = data.confidence;
  const source = data.source;
  return {
    status:
      status === "missing" || status === "partial" || status === "confirmed"
        ? status
        : "missing",
    value: typeof data.value === "string" && data.value.trim() ? data.value : null,
    confidence:
      confidence === "weak" || confidence === "probable" || confidence === "strong"
        ? confidence
        : "weak",
    source: source === "rule" || source === "transcript" || source === "ai" ? source : "rule",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
  };
}

function readStructuredNotes(raw: unknown): StructuredLiveNote[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const note = item as Record<string, unknown>;
      const slot = note.slot;
      const source = note.source;
      if (
        typeof note.id !== "string" ||
        typeof note.text !== "string" ||
        typeof note.updatedAt !== "string" ||
        !SLOT_KEYS.includes(slot as DiscoveryMapSlotKey) ||
        (source !== "rule" && source !== "transcript" && source !== "ai")
      ) {
        return null;
      }
      return {
        id: note.id,
        slot: slot as DiscoveryMapSlotKey,
        text: note.text,
        source: source as DiscoveryMapSource,
        updatedAt: note.updatedAt,
      } satisfies StructuredLiveNote;
    })
    .filter((note): note is StructuredLiveNote => note !== null)
    .slice(0, MAX_LIVE_NOTES);
}

function readRecentTurns(raw: unknown): LiveCoachRecentTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const turn = item as Record<string, unknown>;
      const speaker = normalizeSpeaker(
        (turn.speaker as "operator" | "seller" | "ai" | null | undefined) ?? null,
      );
      if (typeof turn.sequenceNum !== "number" || typeof turn.text !== "string") return null;
      return {
        sequenceNum: turn.sequenceNum,
        speaker,
        text: turn.text,
        createdAt: typeof turn.createdAt === "string" ? turn.createdAt : null,
      } satisfies LiveCoachRecentTurn;
    })
    .filter((turn): turn is LiveCoachRecentTurn => turn !== null)
    .slice(-MAX_RECENT_TURNS);
}

function readSignals(raw: unknown): DeterministicSignal[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const signal = item as Record<string, unknown>;
      const speaker = signal.speaker;
      const family = signal.family;
      const slot = signal.slot;
      const source = signal.source;
      const confidence = signal.confidence;
      if (
        typeof signal.id !== "string" ||
        typeof signal.value !== "string" ||
        typeof signal.observedAt !== "string" ||
        typeof signal.ruleId !== "string" ||
        typeof signal.sequenceNum !== "number" ||
        (speaker !== "operator" && speaker !== "seller" && speaker !== "unknown") ||
        !SLOT_KEYS.includes(slot as DiscoveryMapSlotKey) ||
        (source !== "rule" && source !== "transcript") ||
        (family !== "condition_problem" &&
          family !== "human_pain" &&
          family !== "desired_relief" &&
          family !== "timeline" &&
          family !== "decision_maker" &&
          family !== "price_posture" &&
          family !== "motivation" &&
          family !== "next_step") ||
        (confidence !== "weak" && confidence !== "probable" && confidence !== "strong")
      ) {
        return null;
      }
      return {
        id: signal.id,
        family: family as DeterministicSignalFamily,
        slot: slot as DiscoveryMapSlotKey,
        value: signal.value,
        source: source as "rule" | "transcript",
        speaker: speaker as "operator" | "seller" | "unknown",
        confidence: confidence as DiscoveryMapConfidence,
        observedAt: signal.observedAt,
        ruleId: signal.ruleId,
        noteId: typeof signal.noteId === "string" ? signal.noteId : null,
        sequenceNum: signal.sequenceNum,
      } satisfies DeterministicSignal;
    })
    .filter((signal): signal is DeterministicSignal => signal !== null)
    .slice(-MAX_DETERMINISTIC_SIGNALS);
}

function readSpeakerReliability(raw: unknown): LiveCoachSpeakerReliability {
  if (!raw || typeof raw !== "object") {
    return {
      sellerTurns: 0,
      operatorTurns: 0,
      unknownTurns: 0,
      overall: "low",
    };
  }
  const data = raw as Record<string, unknown>;
  const overall = data.overall;
  return {
    sellerTurns: typeof data.sellerTurns === "number" ? data.sellerTurns : 0,
    operatorTurns: typeof data.operatorTurns === "number" ? data.operatorTurns : 0,
    unknownTurns: typeof data.unknownTurns === "number" ? data.unknownTurns : 0,
    overall: overall === "low" || overall === "medium" || overall === "high" ? overall : "low",
  };
}

function readBestMove(raw: unknown): LiveBestMove | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const stage = data.currentStage;
  const gap = data.highestPriorityGap;
  if (
    !(
      stage === "connection" ||
      stage === "situation" ||
      stage === "problem_awareness" ||
      stage === "solution_awareness" ||
      stage === "consequence" ||
      stage === "commitment"
    ) ||
    !SLOT_KEYS.includes(gap as DiscoveryMapSlotKey) ||
    typeof data.whyThisGapNow !== "string" ||
    typeof data.nextBestQuestion !== "string" ||
    typeof data.guardrail !== "string"
  ) {
    return null;
  }
  return {
    currentStage: stage,
    highestPriorityGap: gap as DiscoveryMapSlotKey,
    whyThisGapNow: data.whyThisGapNow,
    nextBestQuestion: data.nextBestQuestion,
    backupQuestion: typeof data.backupQuestion === "string" ? data.backupQuestion : null,
    suggestedMirror: typeof data.suggestedMirror === "string" ? data.suggestedMirror : null,
    suggestedLabel: typeof data.suggestedLabel === "string" ? data.suggestedLabel : null,
    guardrail: data.guardrail,
  };
}

export function parseLiveCoachState(raw: Record<string, unknown> | null | undefined): LiveCoachCachedState {
  if (!raw || typeof raw !== "object") {
    return createEmptyLiveCoachState();
  }

  const now = new Date().toISOString();
  const discoveryMapRaw = raw.discoveryMap;
  const discoveryMap = buildEmptyDiscoveryMap();
  if (isDiscoveryMap(discoveryMapRaw)) {
    for (const key of SLOT_KEYS) {
      discoveryMap[key] = readSlot(discoveryMapRaw[key]);
    }
  }

  const source = raw.source;

  return {
    version: typeof raw.version === "string" ? raw.version : LIVE_COACH_STATE_VERSION,
    lastProcessedSequence:
      typeof raw.lastProcessedSequence === "number" ? raw.lastProcessedSequence : 0,
    discoveryMap,
    structuredLiveNotes: readStructuredNotes(raw.structuredLiveNotes),
    recentTurns: readRecentTurns(raw.recentTurns),
    deterministicSignals: readSignals(raw.deterministicSignals),
    speakerReliability: readSpeakerReliability(raw.speakerReliability),
    bestMove: readBestMove(raw.bestMove),
    source: source === "gpt5" || source === "rules" ? source : "rules",
    lastUpdatedAt: typeof raw.lastUpdatedAt === "string" ? raw.lastUpdatedAt : now,
    lastStrategizedAt: typeof raw.lastStrategizedAt === "string" ? raw.lastStrategizedAt : null,
    lastStrategizedGap: SLOT_KEYS.includes(raw.lastStrategizedGap as DiscoveryMapSlotKey)
      ? (raw.lastStrategizedGap as DiscoveryMapSlotKey)
      : null,
    lastSellerEvidenceSequence:
      typeof raw.lastSellerEvidenceSequence === "number" ? raw.lastSellerEvidenceSequence : 0,
  };
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
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    ),
    opportunityScore: snapshot?.opportunityScore ?? null,
    confidenceScore: snapshot?.confidenceScore ?? null,
    inboundSignals: [],
    structuredFacts: [],
  };
}

function speakerConfidence(
  speaker: "operator" | "seller" | "unknown",
  sellerConfidence: DiscoveryMapConfidence,
  otherConfidence: DiscoveryMapConfidence = "probable",
): DiscoveryMapConfidence {
  return speaker === "seller" ? sellerConfidence : otherConfidence;
}

function makeSignal(
  note: LiveCoachNoteInput,
  family: DeterministicSignalFamily,
  slot: DiscoveryMapSlotKey,
  value: string,
  ruleId: string,
  confidence: DiscoveryMapConfidence,
  speakerOverride?: "operator" | "seller" | "unknown",
): DeterministicSignal {
  return {
    id: `${ruleId}:${slot}:${note.sequenceNum}:${normalizeTextKey(value)}`,
    family,
    slot,
    value,
    source: note.noteType === "transcript_chunk" ? "transcript" : "rule",
    speaker:
      speakerOverride ??
      (note.speaker === "operator" || note.speaker === "seller"
        ? note.speaker
        : "unknown"),
    confidence,
    observedAt: note.createdAt ?? new Date().toISOString(),
    ruleId,
    noteId: note.id,
    sequenceNum: note.sequenceNum,
  };
}

const CONDITION_RULES = [
  { ruleId: "roof_leak", pattern: /\broof leak|leaky roof\b/i, value: "roof leak", noteText: "Condition: roof leak mentioned" },
  { ruleId: "foundation", pattern: /\bfoundation\b/i, value: "foundation issue", noteText: "Condition: foundation issue mentioned" },
  { ruleId: "mold", pattern: /\bmold\b/i, value: "mold", noteText: "Condition: mold mentioned" },
  { ruleId: "repairs", pattern: /\brepairs?|fixer|needs work\b/i, value: "repairs needed", noteText: "Condition: repairs needed" },
  { ruleId: "tax_lien", pattern: /\btax lien|lien\b/i, value: "tax lien", noteText: "Condition: tax lien mentioned" },
  { ruleId: "probate", pattern: /\bprobate\b/i, value: "probate", noteText: "Condition: probate mentioned" },
  { ruleId: "tenant", pattern: /\btenant|renter\b/i, value: "tenant issue", noteText: "Condition: tenant issue mentioned" },
  { ruleId: "vacant", pattern: /\bvacant|empty house\b/i, value: "vacant property", noteText: "Condition: vacant property mentioned" },
];

const HUMAN_PAIN_RULES = [
  { ruleId: "stuck", pattern: /\bstuck\b/i, value: "feels stuck", noteText: "Pain: feels stuck" },
  { ruleId: "overwhelmed", pattern: /\boverwhelmed\b/i, value: "feels overwhelmed", noteText: "Pain: feeling overwhelmed" },
  { ruleId: "tired", pattern: /\btired of dealing with (it|this|the house|the property)\b/i, value: "tired of dealing with the property", noteText: "Pain: tired of dealing with the property" },
  { ruleId: "cant_move", pattern: CANT_MOVE_PATTERN, value: "cannot move forward", noteText: "Pain: situation is blocking a move" },
  { ruleId: "losing_sleep", pattern: /\blosing sleep\b/i, value: "losing sleep over it", noteText: "Pain: situation is causing lost sleep" },
  { ruleId: "family_waiting", pattern: /\bfamily waiting\b/i, value: "family is waiting on a resolution", noteText: "Pain: family is waiting on a resolution" },
  { ruleId: "burden", pattern: /\bstress|stressed|headache|burden\b/i, value: "the situation feels heavy", noteText: "Pain: situation feels heavy" },
];

const RELIEF_RULES = [
  { ruleId: "move_family", pattern: /\bmove closer to (my|our) (daughter|son|family|kids|grandkids)\b/i, value: "move closer to family", noteText: "Relief: wants to move closer to family" },
  { ruleId: "get_behind", pattern: /\bget this behind me|put this behind me\b/i, value: "get this behind them", noteText: "Relief: wants to get this behind them" },
  { ruleId: "relocate", pattern: /\bsell and relocate|relocate\b/i, value: "sell and relocate", noteText: "Relief: wants to relocate" },
  { ruleId: "stop_paying", pattern: /\bstop paying\b/i, value: "stop paying on the property", noteText: "Relief: wants to stop paying on the property" },
  { ruleId: "close_estate", pattern: /\bclose the estate\b/i, value: "close the estate", noteText: "Relief: wants to close the estate" },
];

const TIMELINE_RULES = [
  { ruleId: "asap", pattern: /\basap|right away|immediately\b/i, value: "as soon as possible", noteText: "Timeline: wants to move quickly" },
  { ruleId: "this_month", pattern: /\bthis month\b/i, value: "this month", noteText: "Timeline: this month" },
  { ruleId: "before_school", pattern: /\bbefore school starts\b/i, value: "before school starts", noteText: "Timeline: before school starts" },
  { ruleId: "after_probate", pattern: /\bafter probate\b/i, value: "after probate", noteText: "Timeline: after probate" },
  { ruleId: "by_friday", pattern: /\bby friday\b/i, value: "by Friday", noteText: "Timeline: by Friday" },
  { ruleId: "next_week", pattern: /\bnext week\b/i, value: "next week", noteText: "Timeline: next week" },
  { ruleId: "soon", pattern: /\bsoon\b/i, value: "soon", noteText: "Timeline: wants movement soon" },
];

const DECISION_RULES = [
  { ruleId: "brother_sign", pattern: /\bmy brother (has to|needs to|must) sign\b/i, value: "brother needs to sign", noteText: "Decision maker: brother may need to sign" },
  { ruleId: "wife", pattern: /\bmy wife|wife and i\b/i, value: "wife is involved", noteText: "Decision maker: wife may be involved" },
  { ruleId: "husband", pattern: /\bmy husband|husband and i\b/i, value: "husband is involved", noteText: "Decision maker: husband may be involved" },
  { ruleId: "attorney", pattern: /\battorney|lawyer\b/i, value: "attorney is involved", noteText: "Decision maker: attorney may be involved" },
  { ruleId: "executor", pattern: /\bexecutor\b/i, value: "executor is involved", noteText: "Decision maker: executor may be involved" },
  { ruleId: "brother", pattern: /\bbrother\b/i, value: "brother is involved", noteText: "Decision maker: brother may be involved" },
  { ruleId: "sister", pattern: /\bsister\b/i, value: "sister is involved", noteText: "Decision maker: sister may be involved" },
];

const PRICE_RULES = [
  { ruleId: "what_can_pay", pattern: /\bwhat can you pay\b/i, value: "asking what we can pay", noteText: "Price posture: asking what we can pay" },
  { ruleId: "offer", pattern: /\boffer|cash price\b/i, value: "asking about an offer", noteText: "Price posture: asked about an offer" },
  { ruleId: "owe", pattern: /\bowe\b/i, value: "amount owed matters", noteText: "Price posture: mentioned amount owed" },
  { ruleId: "need_at_least", pattern: /\bneed at least\b/i, value: "has a minimum number in mind", noteText: "Price posture: has a minimum number in mind" },
];

const NEXT_STEP_RULES = [
  { ruleId: "call_tomorrow", pattern: /\bcall me tomorrow|talk tomorrow\b/i, value: "call tomorrow", noteText: "Next step: call tomorrow" },
  { ruleId: "send_offer", pattern: /\bsend (me )?an offer\b/i, value: "send an offer", noteText: "Next step: asked for an offer" },
  { ruleId: "come_look", pattern: /\bcome (by|look)|take a look\b/i, value: "schedule a property look", noteText: "Next step: property visit may be next" },
  { ruleId: "meet", pattern: /\bmeet next week|appointment\b/i, value: "set a meeting", noteText: "Next step: meeting may be next" },
];

function updateSpeakerReliability(
  reliability: LiveCoachSpeakerReliability,
  note: LiveCoachNoteInput,
): LiveCoachSpeakerReliability {
  const next = { ...reliability };
  if (note.noteType !== "transcript_chunk") return next;
  if (note.speaker === "seller") next.sellerTurns += 1;
  else if (note.speaker === "operator") next.operatorTurns += 1;
  else next.unknownTurns += 1;

  next.overall =
    next.sellerTurns >= 2 && next.operatorTurns >= 2
      ? "high"
      : next.sellerTurns >= 1
        ? "medium"
        : "low";
  return next;
}

function upsertRecentTurn(
  turns: LiveCoachRecentTurn[],
  note: LiveCoachNoteInput,
): LiveCoachRecentTurn[] {
  const text = compact(note.content, 240);
  if (!text) return turns;

  const speaker = normalizeSpeaker(note.speaker);
  const filtered = turns.filter((turn) => turn.sequenceNum !== note.sequenceNum);
  filtered.push({
    sequenceNum: note.sequenceNum,
    speaker,
    text,
    createdAt: note.createdAt,
  });
  return filtered.sort((a, b) => a.sequenceNum - b.sequenceNum).slice(-MAX_RECENT_TURNS);
}

function hasPriorNonOperatorEvidence(
  signals: DeterministicSignal[],
  slot: DiscoveryMapSlotKey,
): boolean {
  return signals.some((signal) => signal.slot === slot && signal.speaker !== "operator");
}

function mergeSlot(
  current: DiscoveryMapSlot,
  nextValue: string,
  nextStatus: DiscoveryMapSlotStatus,
  nextConfidence: DiscoveryMapConfidence,
  source: DiscoveryMapSource,
  updatedAt: string,
): DiscoveryMapSlot {
  const statusRank = SLOT_STATUS_RANK[nextStatus];
  const currentStatusRank = SLOT_STATUS_RANK[current.status];
  const confidenceRank = SLOT_CONFIDENCE_RANK[nextConfidence];
  const currentConfidenceRank = SLOT_CONFIDENCE_RANK[current.confidence];
  const shouldReplace =
    statusRank > currentStatusRank ||
    (statusRank === currentStatusRank && confidenceRank > currentConfidenceRank) ||
    (statusRank === currentStatusRank &&
      confidenceRank === currentConfidenceRank &&
      !current.value &&
      !!nextValue);

  if (!shouldReplace) return current;
  return {
    status: nextStatus,
    value: nextValue,
    confidence: nextConfidence,
    source,
    updatedAt,
  };
}

function upsertStructuredNote(
  notes: StructuredLiveNote[],
  slot: DiscoveryMapSlotKey,
  text: string,
  source: DiscoveryMapSource,
  updatedAt: string,
): StructuredLiveNote[] {
  const id = `${slot}:${normalizeTextKey(text)}`;
  const filtered = notes.filter((note) => note.id !== id);
  filtered.push({ id, slot, text, source, updatedAt });
  return filtered
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, MAX_LIVE_NOTES);
}

function inferPersonalSpeaker(
  note: LiveCoachNoteInput,
  text: string,
): "operator" | "seller" | "unknown" {
  if (note.speaker === "seller" || note.speaker === "operator") {
    return note.speaker;
  }

  if (
    note.noteType === "transcript_chunk" &&
    FIRST_PERSON_PATTERN.test(text)
  ) {
    return "seller";
  }

  return "unknown";
}

function detectSignals(note: LiveCoachNoteInput): SignalDetection[] {
  const text = compact(note.content, 400) ?? "";
  if (!text) return [];

  const detections: SignalDetection[] = [];
  const speaker =
    note.speaker === "seller" || note.speaker === "operator" ? note.speaker : "unknown";
  const personalSpeaker = inferPersonalSpeaker(note, text);

  const pushRule = (
    family: DeterministicSignalFamily,
    slot: DiscoveryMapSlotKey,
    rule: { ruleId: string; pattern: RegExp; value: string; noteText: string },
    status: DiscoveryMapSlotStatus,
    confidence: DiscoveryMapConfidence,
    signalSpeaker: "operator" | "seller" | "unknown" = speaker,
  ) => {
    if (!rule.pattern.test(text)) return;
    detections.push({
      signal: makeSignal(note, family, slot, rule.value, rule.ruleId, confidence, signalSpeaker),
      slotValue: rule.value,
      proposedStatus: status,
      proposedConfidence: confidence,
      noteText: rule.noteText,
      noteSlot: slot,
    });
  };

  for (const rule of CONDITION_RULES) {
    pushRule(
      "condition_problem",
      "property_condition",
      rule,
      speaker === "seller" ? "confirmed" : "partial",
      speakerConfidence(speaker, "strong"),
    );
    if (rule.pattern.test(text)) {
      detections.push({
        signal: makeSignal(
          note,
          "condition_problem",
          "surface_problem",
          rule.value,
          `${rule.ruleId}_surface`,
          speakerConfidence(speaker, "probable"),
        ),
        slotValue: rule.value,
        proposedStatus: "partial",
        proposedConfidence: speakerConfidence(speaker, "probable"),
        noteText: `Problem: ${rule.value} is part of the presenting issue`,
        noteSlot: "surface_problem",
      });
    }
  }

  for (const rule of HUMAN_PAIN_RULES) {
    pushRule(
      "human_pain",
      "human_pain",
      rule,
      personalSpeaker === "seller" ? "confirmed" : "partial",
      speakerConfidence(personalSpeaker, "strong"),
      personalSpeaker,
    );
  }

  for (const rule of RELIEF_RULES) {
    pushRule(
      "desired_relief",
      "desired_relief",
      rule,
      personalSpeaker === "seller" ? "confirmed" : "partial",
      speakerConfidence(personalSpeaker, "strong"),
      personalSpeaker,
    );
  }

  if (CANT_MOVE_PATTERN.test(text) && /\bfamily|daughter|son|kids|grandkids\b/i.test(text)) {
    detections.push({
      signal: makeSignal(
        note,
        "human_pain",
        "human_pain",
        "current situation is blocking a move closer to family",
        "family_blocking_pain",
        speakerConfidence(personalSpeaker, "strong"),
        personalSpeaker,
      ),
      slotValue: "current situation is blocking a move closer to family",
      proposedStatus: personalSpeaker === "seller" ? "confirmed" : "partial",
      proposedConfidence: speakerConfidence(personalSpeaker, "strong"),
      noteText: "Pain: house is blocking a move closer to family",
      noteSlot: "human_pain",
    });
    detections.push({
      signal: makeSignal(
        note,
        "desired_relief",
        "desired_relief",
        "move closer to family",
        "family_blocking_relief",
        speakerConfidence(personalSpeaker, "strong"),
        personalSpeaker,
      ),
      slotValue: "move closer to family",
      proposedStatus: personalSpeaker === "seller" ? "confirmed" : "partial",
      proposedConfidence: speakerConfidence(personalSpeaker, "strong"),
      noteText: "Relief: wants to move closer to family",
      noteSlot: "desired_relief",
    });
  }

  if (MOVE_CLOSER_TO_FAMILY_PATTERN.test(text)) {
    detections.push({
      signal: makeSignal(
        note,
        "human_pain",
        "human_pain",
        "distance from family is creating pressure",
        "family_distance_pain",
        speakerConfidence(personalSpeaker, "strong"),
        personalSpeaker,
      ),
      slotValue: "distance from family is creating pressure",
      proposedStatus: personalSpeaker === "seller" ? "confirmed" : "partial",
      proposedConfidence: speakerConfidence(personalSpeaker, "strong"),
      noteText: "Pain: being away from family is creating pressure",
      noteSlot: "human_pain",
    });
  }

  for (const rule of TIMELINE_RULES) {
    pushRule(
      "timeline",
      "timeline",
      rule,
      speaker === "seller" ? "confirmed" : "partial",
      speakerConfidence(speaker, "strong"),
    );
  }

  for (const rule of DECISION_RULES) {
    pushRule(
      "decision_maker",
      "decision_maker",
      rule,
      "partial",
      speakerConfidence(speaker, "probable"),
    );
  }

  if (SOLE_DECISION_PATTERN.test(text)) {
    detections.push({
      signal: makeSignal(
        note,
        "decision_maker",
        "decision_maker",
        "seller is the only decision-maker",
        "sole_decision_maker",
        speakerConfidence(personalSpeaker, "strong"),
        personalSpeaker,
      ),
      slotValue: "seller is the only decision-maker",
      proposedStatus: personalSpeaker === "seller" ? "confirmed" : "partial",
      proposedConfidence: speakerConfidence(personalSpeaker, "strong"),
      noteText: "Decision maker: seller says they are the only signer",
      noteSlot: "decision_maker",
    });
  }

  for (const rule of PRICE_RULES) {
    pushRule(
      "price_posture",
      "price_posture",
      rule,
      speaker === "seller" ? "confirmed" : "partial",
      speakerConfidence(speaker, "strong"),
    );
  }

  for (const rule of NEXT_STEP_RULES) {
    pushRule(
      "next_step",
      "next_step",
      rule,
      speaker === "seller" ? "confirmed" : "partial",
      speakerConfidence(speaker, "strong"),
    );
  }

  if (/\bneed to sell|have to sell|must sell|need this gone\b/i.test(text)) {
    detections.push({
      signal: makeSignal(
        note,
        "motivation",
        "motivation",
        "seller says they need to make a change",
        "explicit_motivation",
        speakerConfidence(personalSpeaker, "strong"),
        personalSpeaker,
      ),
      slotValue: "seller says they need to make a change",
      proposedStatus: personalSpeaker === "seller" ? "confirmed" : "partial",
      proposedConfidence: speakerConfidence(personalSpeaker, "strong"),
      noteText: "Motivation: seller says they need to make a change",
      noteSlot: "motivation",
    });
  }

  return detections;
}

function applySignal(
  state: LiveCoachCachedState,
  detection: SignalDetection,
): LiveCoachCachedState {
  if (state.deterministicSignals.some((signal) => signal.id === detection.signal.id)) {
    return state;
  }

  const nextState: LiveCoachCachedState = {
    ...state,
    discoveryMap: { ...state.discoveryMap },
    deterministicSignals: [...state.deterministicSignals, detection.signal].slice(-MAX_DETERMINISTIC_SIGNALS),
  };

  let nextStatus = detection.proposedStatus;
  if (detection.noteSlot === "surface_problem") {
    nextStatus = "partial";
  } else if (
    PERSON_SENSITIVE_SLOTS.has(detection.noteSlot) &&
    nextStatus === "confirmed" &&
    detection.signal.speaker !== "seller" &&
    !hasPriorNonOperatorEvidence(state.deterministicSignals, detection.noteSlot)
  ) {
    nextStatus = "partial";
  }

  nextState.discoveryMap[detection.noteSlot] = mergeSlot(
    nextState.discoveryMap[detection.noteSlot],
    detection.slotValue,
    nextStatus,
    detection.proposedConfidence,
    detection.signal.source,
    detection.signal.observedAt,
  );
  nextState.structuredLiveNotes = upsertStructuredNote(
    nextState.structuredLiveNotes,
    detection.noteSlot,
    detection.noteText,
    detection.signal.source,
    detection.signal.observedAt,
  );

  return nextState;
}

function deriveMotivation(state: LiveCoachCachedState, now: string): LiveCoachCachedState {
  const nextState: LiveCoachCachedState = {
    ...state,
    discoveryMap: { ...state.discoveryMap },
  };

  const humanPain = state.discoveryMap.human_pain;
  const relief = state.discoveryMap.desired_relief;
  const timeline = state.discoveryMap.timeline;
  const current = state.discoveryMap.motivation;

  if (
    humanPain.status === "confirmed" &&
    relief.status === "confirmed" &&
    current.status !== "confirmed"
  ) {
    nextState.discoveryMap.motivation = mergeSlot(
      current,
      "personal motivation is clear",
      "confirmed",
      "strong",
      "rule",
      now,
    );
    nextState.structuredLiveNotes = upsertStructuredNote(
      nextState.structuredLiveNotes,
      "motivation",
      "Motivation: personal reason to solve this is becoming clear",
      "rule",
      now,
    );
  } else if (
    current.status === "missing" &&
    (humanPain.status !== "missing" || relief.status !== "missing" || timeline.status === "confirmed")
  ) {
    nextState.discoveryMap.motivation = mergeSlot(
      current,
      "motivation is emerging",
      "partial",
      "probable",
      "rule",
      now,
    );
  }

  return nextState;
}

export function computeHighestPriorityGap(discoveryMap: DiscoveryMap): DiscoveryMapSlotKey {
  const hasMeaningfulDiscovery =
    discoveryMap.human_pain.status !== "missing" ||
    discoveryMap.desired_relief.status !== "missing" ||
    discoveryMap.motivation.status !== "missing" ||
    discoveryMap.timeline.status !== "missing" ||
    discoveryMap.decision_maker.status !== "missing" ||
    discoveryMap.price_posture.status !== "missing" ||
    discoveryMap.next_step.status !== "missing";

  if (
    discoveryMap.price_posture.status !== "missing" &&
    discoveryMap.motivation.status !== "confirmed"
  ) {
    return "motivation";
  }

  if (
    discoveryMap.price_posture.status !== "missing" &&
    discoveryMap.timeline.status !== "confirmed"
  ) {
    return "timeline";
  }

  if (discoveryMap.decision_maker.status === "partial") {
    return "decision_maker";
  }

  if (
    discoveryMap.surface_problem.status === "missing" &&
    discoveryMap.property_condition.status === "missing" &&
    !hasMeaningfulDiscovery
  ) {
    return "surface_problem";
  }

  if (
    (discoveryMap.surface_problem.status !== "missing" ||
      discoveryMap.property_condition.status !== "missing") &&
    discoveryMap.human_pain.status !== "confirmed"
  ) {
    return "human_pain";
  }

  if (
    discoveryMap.human_pain.status !== "missing" &&
    discoveryMap.desired_relief.status !== "confirmed"
  ) {
    return "desired_relief";
  }

  if (discoveryMap.motivation.status !== "confirmed") {
    return "motivation";
  }

  if (discoveryMap.timeline.status !== "confirmed") {
    return "timeline";
  }

  if (discoveryMap.decision_maker.status !== "confirmed") {
    return "decision_maker";
  }

  if (discoveryMap.next_step.status !== "confirmed") {
    return "next_step";
  }

  return "next_step";
}

function stageForGap(gap: DiscoveryMapSlotKey): NepqStage {
  switch (gap) {
    case "surface_problem":
    case "property_condition":
    case "decision_maker":
      return "situation";
    case "human_pain":
    case "motivation":
      return "problem_awareness";
    case "desired_relief":
      return "solution_awareness";
    case "timeline":
    case "price_posture":
      return "consequence";
    case "next_step":
      return "commitment";
    default:
      return "situation";
  }
}

function primaryGoalForGap(gap: DiscoveryMapSlotKey): string {
  switch (gap) {
    case "surface_problem":
    case "property_condition":
      return "Clarify the practical property situation first.";
    case "human_pain":
      return "Help the seller expand the personal impact.";
    case "desired_relief":
      return "Clarify what relief would look like for them.";
    case "motivation":
      return "Tie the issue to why change matters now.";
    case "timeline":
      return "Pin down timing and what is driving it.";
    case "decision_maker":
      return "Clarify who else needs to be part of the decision.";
    case "price_posture":
      return "Acknowledge price without skipping discovery.";
    case "next_step":
      return "Land one concrete, low-pressure next step.";
    default:
      return "Keep the seller talking and stay in discovery.";
  }
}

function labelFromValue(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const cleaned = value.replace(/\b(feels|wants to|seller says)\b/gi, "").trim();
  return cleaned ? cleaned : fallback;
}

export function buildRulesBestMove(
  discoveryMap: DiscoveryMap,
  mode: LiveCoachMode,
): LiveBestMove {
  const gap = computeHighestPriorityGap(discoveryMap);
  const stage = stageForGap(gap);

  switch (gap) {
    case "surface_problem":
    case "property_condition": {
      const condition = discoveryMap.property_condition.value ?? discoveryMap.surface_problem.value;
      return {
        currentStage: stage,
        highestPriorityGap: gap,
        whyThisGapNow: "You still need the cleanest version of the property situation before going deeper.",
        nextBestQuestion: condition
          ? `Can you walk me through what is going on with the ${labelFromValue(condition, "property")} right now?`
          : "Can you walk me through what is going on with the property right now?",
        backupQuestion: "What feels like the main issue with the property as it sits today?",
        suggestedMirror: condition ? `${labelFromValue(condition, "property issue")}?` : "Right now?",
        suggestedLabel: "It sounds like there is still a piece of the property story to sort out.",
        guardrail: "Do not jump to price or commitment before the presenting issue is clear.",
      };
    }
    case "human_pain": {
      const problem = discoveryMap.property_condition.value ?? discoveryMap.surface_problem.value;
      return {
        currentStage: stage,
        highestPriorityGap: gap,
        whyThisGapNow: "You have surface facts, but you do not yet know how this is affecting the seller's life.",
        nextBestQuestion: problem
          ? `How is the ${labelFromValue(problem, "property issue")} affecting things for you personally right now?`
          : "How is this situation affecting you personally right now?",
        backupQuestion: "What has been the hardest part of dealing with this?",
        suggestedMirror: discoveryMap.human_pain.value ? `${labelFromValue(discoveryMap.human_pain.value, "Hard part")}?` : "Hardest part?",
        suggestedLabel: "It sounds like this is heavier than just a property problem.",
        guardrail: "Do not answer price questions until the personal impact is clearer.",
      };
    }
    case "desired_relief":
      return {
        currentStage: stage,
        highestPriorityGap: gap,
        whyThisGapNow: "The pain is starting to show, but you still need to know what outcome the seller is trying to move toward.",
        nextBestQuestion: "If this got handled cleanly, what would that make possible for you?",
        backupQuestion: "What would you want life to look like once this is behind you?",
        suggestedMirror: discoveryMap.desired_relief.value ? `${labelFromValue(discoveryMap.desired_relief.value, "Move forward")}?` : "Move forward?",
        suggestedLabel: "It sounds like there is a specific relief you are hoping this could create.",
        guardrail: "Stay outcome-focused instead of debating terms.",
      };
    case "motivation":
      return {
        currentStage: stage,
        highestPriorityGap: gap,
        whyThisGapNow:
          discoveryMap.price_posture.status !== "missing"
            ? "Price came up before the reason to act was clear, so you need the why-now before talking numbers."
            : "A reason to act is forming, but it is not yet clear enough to guide the next step.",
        nextBestQuestion: "What has you wanting to solve this now instead of letting it sit?",
        backupQuestion: "Why does getting movement on this matter right now?",
        suggestedMirror: "Now instead of later?",
        suggestedLabel: "It sounds like there is a reason this has moved up in importance.",
        guardrail:
          discoveryMap.price_posture.status !== "missing"
            ? "Acknowledge the price question, but do not anchor a number before the why-now is clear."
            : "Do not let the call collapse into price before the why-now is clear.",
      };
    case "timeline":
      return {
        currentStage: stage,
        highestPriorityGap: gap,
        whyThisGapNow:
          discoveryMap.price_posture.status !== "missing"
            ? "Price came up before the timing was clear, so you need the timeline to guide the rest of the call."
            : "You have a reason to act, but the timing is still too fuzzy to guide a real next step.",
        nextBestQuestion: "What timing feels realistic from your side right now?",
        backupQuestion: "What would you like to have happen between now and getting this resolved?",
        suggestedMirror: discoveryMap.timeline.value ? `${labelFromValue(discoveryMap.timeline.value, "Timing")}?` : "Timing?",
        suggestedLabel: "It sounds like timing matters here, even if it is not pinned down yet.",
        guardrail:
          discoveryMap.price_posture.status !== "missing"
            ? "Acknowledge the price question, but do not anchor a number before the timing is clear enough to work with."
            : "Do not push for commitment until the timeline is clear enough to work with.",
      };
    case "decision_maker":
      return {
        currentStage: stage,
        highestPriorityGap: gap,
        whyThisGapNow: "Someone else may need to weigh in, so commitment questions will backfire until that is clear.",
        nextBestQuestion: "Who besides you would need to feel good about the next step?",
        backupQuestion: "How does the other signer usually like to be involved in a decision like this?",
        suggestedMirror: discoveryMap.decision_maker.value ? `${labelFromValue(discoveryMap.decision_maker.value, "Other signer")}?` : "Besides you?",
        suggestedLabel: "It sounds like this may not be a one-person decision.",
        guardrail: "Delay commitment-style questions until the signer path is clear.",
      };
    case "price_posture": {
      const redirectMove = buildRulesBestMove(
        { ...discoveryMap, price_posture: { ...discoveryMap.price_posture, status: "missing" } },
        mode,
      );
      return {
        currentStage: stage,
        highestPriorityGap: redirectMove.highestPriorityGap,
        whyThisGapNow: "Price came up before the core discovery was complete, so you need to redirect without sounding evasive.",
        nextBestQuestion: redirectMove.nextBestQuestion,
        backupQuestion: redirectMove.backupQuestion,
        suggestedMirror: discoveryMap.price_posture.value ? `${labelFromValue(discoveryMap.price_posture.value, "Number")}?` : "Number?",
        suggestedLabel: "It sounds like you want to understand what this could realistically look like.",
        guardrail: "Acknowledge the price question, but do not anchor a number before motivation, timeline, and decision-maker are clearer.",
      };
    }
    case "next_step":
    default:
      return {
        currentStage: stage,
        highestPriorityGap: gap,
        whyThisGapNow: "You have enough discovery to land a concrete next move without pushing too hard.",
        nextBestQuestion: mode === "inbound"
          ? "What would make the next step feel easy from your side?"
          : "What would make the next step feel easy from your side?",
        backupQuestion: "Would it help to pick a time for the next conversation while this is fresh?",
        suggestedMirror: "Easy from your side?",
        suggestedLabel: "It sounds like the next step needs to stay simple and low-pressure.",
        guardrail: "Do not force a bigger commitment than the discovery supports.",
      };
  }
}

function transcriptExcerptFromTurns(turns: LiveCoachRecentTurn[]): string {
  return turns
    .slice(-4)
    .map((turn) => `[${turn.speaker}] ${turn.text}`)
    .join("\n")
    .slice(-1600);
}

function buildBuyingSignals(discoveryMap: DiscoveryMap): string[] {
  const signals: string[] = [];
  if (discoveryMap.human_pain.status === "confirmed") {
    signals.push("Seller shared a concrete personal impact.");
  }
  if (discoveryMap.desired_relief.status === "confirmed") {
    signals.push("Seller named a specific outcome they want.");
  }
  if (discoveryMap.timeline.status === "confirmed") {
    signals.push("Seller used time-bound language.");
  }
  if (discoveryMap.next_step.status === "confirmed") {
    signals.push("Seller suggested a concrete next step.");
  }
  return signals.slice(0, 3);
}

function buildRiskFlags(
  discoveryMap: DiscoveryMap,
  speakerReliability: LiveCoachSpeakerReliability,
): string[] {
  const flags: string[] = [];
  if (speakerReliability.overall === "low") {
    flags.push("Speaker attribution is still weak; keep the map conservative.");
  }
  if (discoveryMap.decision_maker.status === "partial") {
    flags.push("Decision-maker path is still not fully clear.");
  }
  if (discoveryMap.price_posture.status !== "missing" && discoveryMap.timeline.status !== "confirmed") {
    flags.push("Price came up before the timing was clear.");
  }
  return flags.slice(0, 3);
}

function buildCoachNotes(move: LiveBestMove, discoveryMap: DiscoveryMap): string[] {
  const notes = [
    `Stay on ${move.highestPriorityGap.replace(/_/g, " ")} for one more beat.`,
    "Ask one clean question, then let the seller answer fully.",
  ];
  if (discoveryMap.price_posture.status !== "missing") {
    notes.push("Acknowledge price interest without anchoring a number.");
  }
  return notes.slice(0, 3);
}

function buildEmpathyMoves(move: LiveBestMove): EmpathyMove[] {
  const moves: EmpathyMove[] = [];
  if (move.suggestedMirror) {
    moves.push({
      type: "mirror",
      text: move.suggestedMirror,
      cue: "Use only if the seller just used similar wording.",
    });
  }
  if (move.suggestedLabel) {
    moves.push({
      type: "label",
      text: move.suggestedLabel,
      cue: "Use after the seller shares emotion, friction, or hesitation.",
    });
  }
  if (move.backupQuestion) {
    moves.push({
      type: "calibrated_question",
      text: move.backupQuestion,
      cue: "Use if the first question gets a short answer.",
    });
  }
  return moves.slice(0, 3);
}

export function buildLiveCoachResponse(
  state: LiveCoachCachedState,
  mode: LiveCoachMode,
): LiveCoachResponseV2 {
  const bestMove = state.bestMove ?? buildRulesBestMove(state.discoveryMap, mode);
  const transcriptExcerpt = transcriptExcerptFromTurns(state.recentTurns);

  return {
    currentStage: bestMove.currentStage,
    stageReason: bestMove.whyThisGapNow,
    primaryGoal: primaryGoalForGap(bestMove.highestPriorityGap),
    nextBestQuestion: bestMove.nextBestQuestion,
    nextQuestions: bestMove.backupQuestion ? [bestMove.backupQuestion] : [],
    empathyMoves: buildEmpathyMoves(bestMove),
    objectionHandling: [],
    coachNotes: buildCoachNotes(bestMove, state.discoveryMap),
    guardrails: [bestMove.guardrail],
    buyingSignals: buildBuyingSignals(state.discoveryMap),
    riskFlags: buildRiskFlags(state.discoveryMap, state.speakerReliability),
    transcriptExcerpt,
    updatedAt: state.lastUpdatedAt,
    mode,
    source: state.source,
    discoveryMap: state.discoveryMap,
    structuredLiveNotes: state.structuredLiveNotes,
    highestPriorityGap: bestMove.highestPriorityGap,
    whyThisGapNow: bestMove.whyThisGapNow,
    backupQuestion: bestMove.backupQuestion,
    suggestedMirror: bestMove.suggestedMirror,
    suggestedLabel: bestMove.suggestedLabel,
  };
}

function buildStableLayer(mode: LiveCoachMode, styleBlock: string): PromptLayer {
  return {
    label: "stable_base",
    content: [
      "You are the Dominion Sentinel Live Call Coach.",
      "You guide Logan during an active seller call using NEPQ-style discovery and Chris Voss tactical empathy.",
      `This is a ${mode} seller call. Deterministic extraction already built the Discovery Map.`,
      "You are the strategist, not the parser. Do not invent facts or upgrade map confidence.",
      "",
      styleBlock,
      "",
      "## OUTPUT FORMAT",
      "Return ONLY a JSON object (no markdown, no explanation):",
      "{",
      '  "current_stage":"connection|situation|problem_awareness|solution_awareness|consequence|commitment",',
      '  "highest_priority_gap":"surface_problem|human_pain|desired_relief|property_condition|motivation|timeline|decision_maker|price_posture|next_step",',
      '  "why_this_gap_now":"Why this gap matters right now",',
      '  "next_best_question":"Single best next question",',
      '  "backup_question":"One short backup question or null",',
      '  "suggested_mirror":"One compact mirror or null",',
      '  "suggested_label":"One compact label or null",',
      '  "guardrail":"One mistake to avoid right now"',
      "}",
      "",
      "## STRATEGY RULES",
      "- Treat the Discovery Map as authoritative. Do not change slot status or certainty.",
      "- NEPQ: choose the question type that best closes the highest-priority gap.",
      "- Voss: keep the mirror and label compact, conversational, and easy to say out loud.",
      "- If price came up too early, redirect toward motivation, timeline, or decision-maker clarity.",
      "- Avoid canned rebuttals, long prompt lists, and multi-question stacks.",
    ].join("\n"),
  };
}

function buildDynamicLayer(
  state: LiveCoachCachedState,
  mode: LiveCoachMode,
): PromptLayer {
  const bestMove = state.bestMove ?? buildRulesBestMove(state.discoveryMap, mode);
  const mapLines = SLOT_KEYS.map((slot) => {
    const item = state.discoveryMap[slot];
    return `- ${slot}: ${item.status}${item.value ? ` | ${item.value}` : ""} | ${item.confidence}`;
  });
  const signalLines =
    state.deterministicSignals.length > 0
      ? state.deterministicSignals
          .slice(-8)
          .map((signal) => `- [${signal.family}/${signal.slot}] ${signal.value} (${signal.speaker})`)
      : ["- No deterministic signals yet."];
  const turnLines =
    state.recentTurns.length > 0
      ? state.recentTurns
          .slice(-4)
          .map((turn) => `- [${turn.speaker}] ${turn.text}`)
      : ["- No recent turns available."];
  const noteLines =
    state.structuredLiveNotes.length > 0
      ? state.structuredLiveNotes.map((note) => `- ${note.text}`)
      : ["- No structured notes yet."];

  return {
    label: "per_call_dynamic",
    content: [
      "## DISCOVERY MAP",
      ...mapLines,
      "",
      "## HIGHEST PRIORITY GAP",
      `- ${bestMove.highestPriorityGap}`,
      `- Why now: ${bestMove.whyThisGapNow}`,
      "",
      "## RULES-ONLY BEST MOVE",
      `- Question: ${bestMove.nextBestQuestion}`,
      `- Backup: ${bestMove.backupQuestion ?? "none"}`,
      `- Mirror: ${bestMove.suggestedMirror ?? "none"}`,
      `- Label: ${bestMove.suggestedLabel ?? "none"}`,
      `- Guardrail: ${bestMove.guardrail}`,
      "",
      "## STRUCTURED LIVE NOTES",
      ...noteLines,
      "",
      "## DETERMINISTIC SIGNALS",
      ...signalLines,
      "",
      "## RECENT TURNS",
      ...turnLines,
      "",
      "## SPEAKER RELIABILITY",
      `- overall: ${state.speakerReliability.overall}`,
      `- seller_turns: ${state.speakerReliability.sellerTurns}`,
      `- operator_turns: ${state.speakerReliability.operatorTurns}`,
      `- unknown_turns: ${state.speakerReliability.unknownTurns}`,
    ].join("\n"),
  };
}

export function buildLiveCoachPrompt(
  state: LiveCoachCachedState,
  snapshot: CRMLeadContext | null,
  mode: LiveCoachMode,
  styleBlock: string,
): AssembledPrompt {
  return assemblePrompt({
    layers: [
      buildStableLayer(mode, styleBlock),
      preCallBriefSemiStable(mapSnapshot(snapshot)),
      buildDynamicLayer(state, mode),
    ],
    version: LIVE_COACH_PROMPT_VERSION,
    workflow: "live_coach",
  }, `Refine the next move for this ${mode} seller call right now.`);
}

export function parseStrategistMove(raw: string): ParsedStrategistMove {
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const stage = parsed.current_stage;
    return {
      currentStage:
        stage === "connection" ||
        stage === "situation" ||
        stage === "problem_awareness" ||
        stage === "solution_awareness" ||
        stage === "consequence" ||
        stage === "commitment"
          ? stage
          : null,
      whyThisGapNow: compact(typeof parsed.why_this_gap_now === "string" ? parsed.why_this_gap_now : null, 220),
      nextBestQuestion: compact(typeof parsed.next_best_question === "string" ? parsed.next_best_question : null, 180),
      backupQuestion: compact(typeof parsed.backup_question === "string" ? parsed.backup_question : null, 160),
      suggestedMirror: compact(typeof parsed.suggested_mirror === "string" ? parsed.suggested_mirror : null, 120),
      suggestedLabel: compact(typeof parsed.suggested_label === "string" ? parsed.suggested_label : null, 160),
      guardrail: compact(typeof parsed.guardrail === "string" ? parsed.guardrail : null, 180),
    };
  } catch {
    return {
      currentStage: null,
      whyThisGapNow: null,
      nextBestQuestion: null,
      backupQuestion: null,
      suggestedMirror: null,
      suggestedLabel: null,
      guardrail: null,
    };
  }
}

export function applyStrategistMove(
  state: LiveCoachCachedState,
  parsed: ParsedStrategistMove,
  mode: LiveCoachMode,
  now: string,
): LiveCoachCachedState {
  const rulesMove = state.bestMove ?? buildRulesBestMove(state.discoveryMap, mode);
  const bestMove: LiveBestMove = {
    currentStage: parsed.currentStage ?? rulesMove.currentStage,
    highestPriorityGap: rulesMove.highestPriorityGap,
    whyThisGapNow: parsed.whyThisGapNow ?? rulesMove.whyThisGapNow,
    nextBestQuestion: parsed.nextBestQuestion ?? rulesMove.nextBestQuestion,
    backupQuestion: parsed.backupQuestion ?? rulesMove.backupQuestion,
    suggestedMirror: parsed.suggestedMirror ?? rulesMove.suggestedMirror,
    suggestedLabel: parsed.suggestedLabel ?? rulesMove.suggestedLabel,
    guardrail: parsed.guardrail ?? rulesMove.guardrail,
  };

  return {
    ...state,
    bestMove,
    source: "gpt5",
    lastUpdatedAt: now,
    lastStrategizedAt: now,
    lastStrategizedGap: bestMove.highestPriorityGap,
  };
}

export function shouldInvokeStrategist(
  state: LiveCoachCachedState,
  reduction: ReduceLiveCoachStateResult,
  now = Date.now(),
): boolean {
  if (!state.bestMove) return reduction.state.recentTurns.length > 0;
  if (reduction.gapChanged || reduction.hasNewSellerEvidence) return true;
  if (!state.lastStrategizedAt) return true;
  return now - Date.parse(state.lastStrategizedAt) >= STRATEGIST_STALE_MS;
}

export function reduceLiveCoachState(
  initialState: LiveCoachCachedState,
  notes: LiveCoachNoteInput[],
  mode: LiveCoachMode,
  now = new Date().toISOString(),
): ReduceLiveCoachStateResult {
  let state: LiveCoachCachedState = {
    ...initialState,
    discoveryMap: { ...initialState.discoveryMap },
    structuredLiveNotes: [...initialState.structuredLiveNotes],
    recentTurns: [...initialState.recentTurns],
    deterministicSignals: [...initialState.deterministicSignals],
    speakerReliability: { ...initialState.speakerReliability },
  };
  let processedCount = 0;
  let hasNewSellerEvidence = false;
  const previousGap = computeHighestPriorityGap(state.discoveryMap);

  const ordered = [...notes].sort((a, b) => a.sequenceNum - b.sequenceNum);
  for (const note of ordered) {
    if (note.sequenceNum <= state.lastProcessedSequence) continue;
    processedCount += 1;
    state.lastProcessedSequence = note.sequenceNum;
    state.lastUpdatedAt = note.createdAt ?? now;
    state.recentTurns = upsertRecentTurn(state.recentTurns, note);
    state.speakerReliability = updateSpeakerReliability(state.speakerReliability, note);

    const detections = detectSignals(note);
    for (const detection of detections) {
      state = applySignal(state, detection);
      if (detection.signal.speaker === "seller") {
        hasNewSellerEvidence = true;
        state.lastSellerEvidenceSequence = Math.max(
          state.lastSellerEvidenceSequence,
          detection.signal.sequenceNum,
        );
      }
    }
  }

  state = deriveMotivation(state, now);
  const rulesBestMove = buildRulesBestMove(state.discoveryMap, mode);
  state.bestMove =
    processedCount > 0 || !initialState.bestMove
      ? rulesBestMove
      : initialState.bestMove;
  state.source =
    processedCount > 0 || !initialState.bestMove
      ? "rules"
      : initialState.source;
  state.lastUpdatedAt = now;

  return {
    state,
    gapChanged: computeHighestPriorityGap(state.discoveryMap) !== previousGap,
    hasNewSellerEvidence,
    processedCount,
  };
}
