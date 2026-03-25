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
  nepqQuestions: [string, string, string] | null;
  vossLabels: [string, string, string] | null;
}

function parseTriple(val: unknown): [string, string, string] | null {
  if (!Array.isArray(val)) return null;
  const strings = val.filter((v): v is string => typeof v === "string" && v.length > 0);
  if (strings.length < 3) return null;
  return [strings[0], strings[1], strings[2]];
}

export const LIVE_COACH_STATE_VERSION = "live_coach_state@2.0.0";
export const LIVE_COACH_PROMPT_VERSION = "2.0.0";
const MAX_LIVE_NOTES = 8;
const MAX_RECENT_TURNS = 6;
const MAX_DETERMINISTIC_SIGNALS = 24;
const STRATEGIST_STALE_MS = 12_000;

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
    nepqQuestions: parseTriple(data.nepqQuestions) ?? [
      data.nextBestQuestion as string,
      typeof data.backupQuestion === "string" ? data.backupQuestion : data.nextBestQuestion as string,
      data.nextBestQuestion as string,
    ],
    vossLabels: parseTriple(data.vossLabels) ?? [
      "It sounds like the property is in pretty good shape overall.",
      "It sounds like this hasn't been too much of a hassle so far.",
      "It sounds like there's no real rush on your end.",
    ],
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
  { ruleId: "roof_leak", pattern: /\broof.{0,10}(?:leak|damage|replace|repair|old|bad)|leaky roof|new roof\b/i, value: "roof issue", noteText: "Condition: roof issue mentioned" },
  { ruleId: "foundation", pattern: /\bfoundation.{0,10}(?:crack|issue|problem|damage|settling)|crack.{0,10}foundation\b/i, value: "foundation issue", noteText: "Condition: foundation issue mentioned" },
  { ruleId: "mold", pattern: /\bmold|mildew|water damage|moisture\b/i, value: "mold or water damage", noteText: "Condition: mold or water damage mentioned" },
  { ruleId: "repairs", pattern: /\brepairs?|fixer|needs work|needs.{0,10}(?:update|fix|renovate)|dated|outdated|original.{0,10}(?:kitchen|bath|carpet|floor)\b/i, value: "repairs needed", noteText: "Condition: repairs or updates needed" },
  { ruleId: "hvac", pattern: /\bhvac|furnace|ac unit|air condition|heating|boiler\b/i, value: "HVAC issue", noteText: "Condition: HVAC issue mentioned" },
  { ruleId: "plumbing", pattern: /\bplumbing|pipe|sewer|septic|drain|water heater\b/i, value: "plumbing issue", noteText: "Condition: plumbing issue mentioned" },
  { ruleId: "electrical", pattern: /\belectrical|wiring|breaker|panel\b/i, value: "electrical issue", noteText: "Condition: electrical issue mentioned" },
  { ruleId: "fire_damage", pattern: /\bfire|fire damage|burned|smoke damage\b/i, value: "fire damage", noteText: "Condition: fire damage mentioned" },
  { ruleId: "good_shape", pattern: /\bgood (?:shape|condition)|well maintained|updated|remodeled|renovated|move.?in ready\b/i, value: "good condition", noteText: "Condition: property in good condition" },
  { ruleId: "tax_lien", pattern: /\btax lien|lien\b/i, value: "tax lien", noteText: "Condition: tax lien mentioned" },
  { ruleId: "probate", pattern: /\bprobate\b/i, value: "probate", noteText: "Condition: probate mentioned" },
  { ruleId: "tenant", pattern: /\btenant|renter|rental|lease|evict|eviction\b/i, value: "tenant issue", noteText: "Condition: tenant/rental issue mentioned" },
  { ruleId: "vacant", pattern: /\bvacant|empty|nobody.{0,10}living|unoccupied|sitting empty|nobody there\b/i, value: "vacant property", noteText: "Condition: vacant property" },
  { ruleId: "hoarder", pattern: /\bhoarder|hoarding|full of stuff|cluttered|junk\b/i, value: "hoarding or excess contents", noteText: "Condition: hoarding or excess contents" },
];

const HUMAN_PAIN_RULES = [
  { ruleId: "stuck", pattern: /\bstuck\b/i, value: "feels stuck", noteText: "Pain: feels stuck" },
  { ruleId: "overwhelmed", pattern: /\boverwhelmed\b/i, value: "feels overwhelmed", noteText: "Pain: feeling overwhelmed" },
  { ruleId: "tired", pattern: /\btired of dealing with (it|this|the house|the property)\b/i, value: "tired of dealing with the property", noteText: "Pain: tired of dealing with the property" },
  { ruleId: "cant_move", pattern: CANT_MOVE_PATTERN, value: "cannot move forward", noteText: "Pain: situation is blocking a move" },
  { ruleId: "losing_sleep", pattern: /\blosing sleep\b/i, value: "losing sleep over it", noteText: "Pain: situation is causing lost sleep" },
  { ruleId: "family_waiting", pattern: /\bfamily waiting\b/i, value: "family is waiting on a resolution", noteText: "Pain: family is waiting on a resolution" },
  { ruleId: "burden", pattern: /\bstress|stressed|headache|burden\b/i, value: "the situation feels heavy", noteText: "Pain: situation feels heavy" },
  { ruleId: "cant_handle", pattern: /\bcan'?t handle|cannot handle|can'?t deal with|cannot deal\b/i, value: "can't handle the situation", noteText: "Pain: can't handle the situation" },
  { ruleId: "hard_time", pattern: /\bhard time|difficult time|tough time|rough time\b/i, value: "going through a hard time", noteText: "Pain: going through a hard time" },
  { ruleId: "death", pattern: /\bpassed away|died|passing|death|funeral|lost (?:my|our|her|his)\b/i, value: "dealing with a death", noteText: "Pain: dealing with a death in the family" },
  { ruleId: "health", pattern: /\bsick|cancer|hospital|surgery|health (?:issue|problem)|medical|disabled|disability|illness\b/i, value: "health issues", noteText: "Pain: health issues mentioned" },
  { ruleId: "divorce", pattern: /\bdivorce|separated|ex-wife|ex-husband|split up|splitting up\b/i, value: "divorce or separation", noteText: "Pain: divorce or separation" },
  { ruleId: "behind_payments", pattern: /\bbehind on (?:payments|mortgage|the mortgage)|falling behind|can'?t afford|cannot afford\b/i, value: "behind on payments", noteText: "Pain: behind on payments" },
  { ruleId: "dont_know_what_to_do", pattern: /\bdon'?t know what to do|no idea what to do|at a loss|don'?t know where to start\b/i, value: "doesn't know what to do", noteText: "Pain: doesn't know what to do" },
  { ruleId: "frustration", pattern: /\bfrustrat|fed up|sick of|had enough|done with\b/i, value: "frustrated with the situation", noteText: "Pain: frustrated with the situation" },
  { ruleId: "emotional", pattern: /\bcrying|emotional|hard to talk about|difficult to talk about|tough subject\b/i, value: "emotionally difficult", noteText: "Pain: emotionally difficult topic" },
  { ruleId: "aging", pattern: /\bgetting older|aging|elderly|retirement|senior|nursing home|assisted living\b/i, value: "aging or life transition", noteText: "Pain: aging or life transition" },
  { ruleId: "family_conflict", pattern: /\bfamily (?:fight|argue|disagree|conflict|drama)|siblings? (?:fighting|arguing|disagree)\b/i, value: "family conflict", noteText: "Pain: family conflict over property" },
];

const RELIEF_RULES = [
  { ruleId: "move_family", pattern: /\bmove closer to (my|our) (daughter|son|family|kids|grandkids|mom|dad|parent)\b/i, value: "move closer to family", noteText: "Relief: wants to move closer to family" },
  { ruleId: "get_behind", pattern: /\bget this behind me|put this behind me|move on|move past this\b/i, value: "get this behind them", noteText: "Relief: wants to get this behind them" },
  { ruleId: "relocate", pattern: /\brelocate|move out of state|move away|leaving town|moving to\b/i, value: "wants to relocate", noteText: "Relief: wants to relocate" },
  { ruleId: "stop_paying", pattern: /\bstop paying|get out from under|get rid of|don'?t want.{0,15}anymore\b/i, value: "stop paying on the property", noteText: "Relief: wants to stop paying on the property" },
  { ruleId: "close_estate", pattern: /\bclose the estate|settle the estate|wrap.{0,10}up\b/i, value: "close the estate", noteText: "Relief: wants to close the estate" },
  { ruleId: "fresh_start", pattern: /\bfresh start|start over|new beginning|clean slate\b/i, value: "wants a fresh start", noteText: "Relief: wants a fresh start" },
  { ruleId: "downsize", pattern: /\bdownsize|smaller place|smaller house|too big|too much house|too much space\b/i, value: "wants to downsize", noteText: "Relief: wants to downsize" },
  { ruleId: "cash_out", pattern: /\bcash out|get (?:some |my )?money|need the (?:money|cash|equity)|access.{0,10}equity\b/i, value: "wants cash from equity", noteText: "Relief: wants to access equity/cash" },
  { ruleId: "peace_of_mind", pattern: /\bpeace of mind|weight off|relief|one less thing\b/i, value: "wants peace of mind", noteText: "Relief: wants peace of mind" },
  { ruleId: "just_sell", pattern: /\bjust (?:want to |wanna )?sell|just get it sold|need it sold|need to sell\b/i, value: "just wants to sell", noteText: "Relief: just wants to sell" },
];

const TIMELINE_RULES = [
  { ruleId: "asap", pattern: /\basap|right away|immediately|as fast as|as quick as\b/i, value: "as soon as possible", noteText: "Timeline: wants to move quickly" },
  { ruleId: "this_month", pattern: /\bthis month|end of the month|by month end\b/i, value: "this month", noteText: "Timeline: this month" },
  { ruleId: "this_week", pattern: /\bthis week|end of the week|by friday|by the weekend\b/i, value: "this week", noteText: "Timeline: this week" },
  { ruleId: "next_week", pattern: /\bnext week\b/i, value: "next week", noteText: "Timeline: next week" },
  { ruleId: "thirty_days", pattern: /\b30 days|thirty days|a month|one month|within a month\b/i, value: "within 30 days", noteText: "Timeline: within 30 days" },
  { ruleId: "sixty_days", pattern: /\b60 days|sixty days|two months|couple months|couple of months\b/i, value: "within 60 days", noteText: "Timeline: within 60 days" },
  { ruleId: "ninety_days", pattern: /\b90 days|ninety days|three months|few months\b/i, value: "within 90 days", noteText: "Timeline: within 90 days" },
  { ruleId: "by_summer", pattern: /\bby summer|before summer|this summer|end of summer\b/i, value: "by summer", noteText: "Timeline: by summer" },
  { ruleId: "before_school", pattern: /\bbefore school starts\b/i, value: "before school starts", noteText: "Timeline: before school starts" },
  { ruleId: "after_probate", pattern: /\bafter probate|once probate|probate closes|probate is done\b/i, value: "after probate", noteText: "Timeline: after probate" },
  { ruleId: "no_rush", pattern: /\bno rush|no hurry|take (?:my|our) time|not in a rush|whenever|flexible\b/i, value: "no rush / flexible", noteText: "Timeline: flexible, no rush" },
  { ruleId: "soon", pattern: /\bsoon|sooner.{0,10}later|ready to\b/i, value: "soon", noteText: "Timeline: wants movement soon" },
  { ruleId: "yesterday", pattern: /\byesterday|should have sold|wish.{0,15}sold|already too long\b/i, value: "should have sold already", noteText: "Timeline: wishes they'd sold already" },
];

const DECISION_RULES = [
  { ruleId: "sole_owner", pattern: /\bjust me|only me|i'm the only|it's mine|in my name|sole owner\b/i, value: "sole decision maker", noteText: "Decision maker: sole owner confirmed" },
  { ruleId: "wife", pattern: /\bmy wife|wife and i|talk to.{0,10}wife|check with.{0,10}wife|spouse\b/i, value: "wife is involved", noteText: "Decision maker: wife may be involved" },
  { ruleId: "husband", pattern: /\bmy husband|husband and i|talk to.{0,10}husband|check with.{0,10}husband\b/i, value: "husband is involved", noteText: "Decision maker: husband may be involved" },
  { ruleId: "attorney", pattern: /\battorney|lawyer|legal counsel|legal team\b/i, value: "attorney is involved", noteText: "Decision maker: attorney may be involved" },
  { ruleId: "executor", pattern: /\bexecutor|personal representative|PR of the estate\b/i, value: "executor is involved", noteText: "Decision maker: executor may be involved" },
  { ruleId: "brother", pattern: /\bbrother\b/i, value: "brother is involved", noteText: "Decision maker: brother may be involved" },
  { ruleId: "sister", pattern: /\bsister\b/i, value: "sister is involved", noteText: "Decision maker: sister may be involved" },
  { ruleId: "family_member", pattern: /\bmy (?:mom|dad|mother|father|parent|son|daughter|uncle|aunt|cousin)\b/i, value: "family member involved", noteText: "Decision maker: family member may be involved" },
  { ruleId: "partner", pattern: /\bpartner|co-owner|business partner|the other owner\b/i, value: "partner or co-owner involved", noteText: "Decision maker: partner or co-owner involved" },
  { ruleId: "talk_to_someone", pattern: /\btalk to|check with|run it by|ask my|need to discuss|talk it over\b/i, value: "needs to consult someone", noteText: "Decision maker: needs to consult someone else" },
  { ruleId: "all_agree", pattern: /\bwe all agree|everyone agrees|everyone.{0,10}on board|all on the same page\b/i, value: "all parties agree", noteText: "Decision maker: all parties in agreement" },
];

const PRICE_RULES = [
  { ruleId: "what_can_pay", pattern: /\bwhat can you (?:pay|offer|give)|what would you (?:pay|offer|give)|what are you thinking\b/i, value: "asking what we can pay", noteText: "Price posture: asking what we can pay" },
  { ruleId: "offer", pattern: /\boffer|cash price|cash offer\b/i, value: "asking about an offer", noteText: "Price posture: asked about an offer" },
  { ruleId: "owe", pattern: /\bowe|owed|mortgage.{0,15}(?:left|balance|remaining)|payoff\b/i, value: "amount owed matters", noteText: "Price posture: mentioned amount owed" },
  { ruleId: "need_at_least", pattern: /\bneed at least|need to get|won'?t take less|bottom line|minimum|at minimum\b/i, value: "has a minimum number in mind", noteText: "Price posture: has a minimum number in mind" },
  { ruleId: "worth", pattern: /\bworth|value|zillow says|zestimate|appraised|appraisal\b/i, value: "has a value expectation", noteText: "Price posture: referenced a value estimate" },
  { ruleId: "listed_before", pattern: /\blisted.{0,15}(?:before|last year|ago)|had it on the market|realtor wanted|agent said\b/i, value: "previously listed or agent-priced", noteText: "Price posture: previously listed or agent-priced" },
  { ruleId: "open_to_offer", pattern: /\bopen to|willing to listen|hear what you.{0,10}say|make me an offer|shoot me a number\b/i, value: "open to hearing an offer", noteText: "Price posture: open to hearing an offer" },
  { ruleId: "not_giving_away", pattern: /\bnot giving.{0,10}away|not desperate|not in a hurry to.{0,10}cheap|fair price|fair deal\b/i, value: "wants a fair price, not desperate", noteText: "Price posture: wants fair value, not giving it away" },
  { ruleId: "number_mentioned", pattern: /\b\d{2,3}(?:,\d{3}|\s?(?:thousand|k|grand))\b/i, value: "specific number mentioned", noteText: "Price posture: specific dollar amount mentioned" },
];

const NEXT_STEP_RULES = [
  { ruleId: "call_back", pattern: /\bcall (?:me )?(?:back|tomorrow|later|next week|monday|tuesday|wednesday|thursday|friday)|talk (?:tomorrow|later|next week|again)\b/i, value: "call back", noteText: "Next step: wants a callback" },
  { ruleId: "send_offer", pattern: /\bsend (?:me )?(?:an )?offer|put something together|send (?:me )?(?:some )?numbers|email (?:me )?(?:an )?offer\b/i, value: "send an offer", noteText: "Next step: asked for an offer" },
  { ruleId: "come_look", pattern: /\bcome (?:by|look|out|see)|take a look|walk through|drive by|see the (?:house|property|place)\b/i, value: "schedule a property look", noteText: "Next step: property visit may be next" },
  { ruleId: "meet", pattern: /\bmeet|sit down|get together|appointment|in person\b/i, value: "set a meeting", noteText: "Next step: meeting may be next" },
  { ruleId: "think_about_it", pattern: /\bthink about it|think it over|sleep on it|consider it|mull it over\b/i, value: "needs time to think", noteText: "Next step: needs time to think" },
  { ruleId: "send_info", pattern: /\bsend (?:me )?(?:some )?info|more information|send (?:me )?details|email me\b/i, value: "wants more information sent", noteText: "Next step: wants info sent over" },
  { ruleId: "talk_to_family", pattern: /\btalk to (?:my|the) (?:wife|husband|family|brother|sister|kids|attorney|lawyer)|discuss with\b/i, value: "needs to talk to family first", noteText: "Next step: needs to consult family" },
  { ruleId: "ready_now", pattern: /\blet'?s do it|ready to go|ready to sell|where do i sign|let'?s get started|move forward\b/i, value: "ready to move forward now", noteText: "Next step: ready to move forward!" },
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

  const MOTIVATION_PATTERNS = [
    { pattern: /\bneed to sell|have to sell|must sell|need this gone|gotta sell|got to sell\b/i, value: "needs to sell", ruleId: "explicit_motivation" },
    { pattern: /\bwant to sell|looking to sell|thinking about selling|considering selling|ready to sell\b/i, value: "wants to sell", ruleId: "want_to_sell" },
    { pattern: /\binherited|inheritance|left (?:me|us) the|passed down\b/i, value: "inherited property", ruleId: "inherited" },
    { pattern: /\bforeclosure|foreclos|behind on (?:the )?mortgage|bank is|pre-?foreclosure\b/i, value: "facing foreclosure", ruleId: "foreclosure" },
    { pattern: /\btax.{0,10}(?:owed|due|behind|delinquent|sale)|owe.{0,15}taxes|back taxes\b/i, value: "tax issues", ruleId: "tax_issues" },
    { pattern: /\bcan'?t (?:keep up|maintain|afford)|too (?:expensive|much)|costing.{0,10}money\b/i, value: "can't afford to keep it", ruleId: "cant_afford" },
    { pattern: /\btired of (?:being a )?landlord|bad tenant|problem tenant|don'?t want to be a landlord\b/i, value: "tired of being a landlord", ruleId: "tired_landlord" },
    { pattern: /\bjob (?:transfer|relocation|opportunity)|new job|moving for work|transferred\b/i, value: "job relocation", ruleId: "job_relocation" },
    { pattern: /\bdivorce|separated|splitting|going through a split\b/i, value: "divorce or separation", ruleId: "divorce_motivation" },
    { pattern: /\bupsize|upgrade|bigger (?:house|place|home)|growing family|need more (?:room|space)\b/i, value: "needs more space", ruleId: "upsize" },
    { pattern: /\bretire|retirement|retiring\b/i, value: "retirement", ruleId: "retirement" },
    { pattern: /\bdoesn'?t make sense|not worth.{0,10}keeping|sitting on it|just sitting there\b/i, value: "property doesn't make sense to keep", ruleId: "doesnt_make_sense" },
  ];

  for (const mp of MOTIVATION_PATTERNS) {
    if (mp.pattern.test(text)) {
      detections.push({
        signal: makeSignal(
          note,
          "motivation",
          "motivation",
          mp.value,
          mp.ruleId,
          speakerConfidence(personalSpeaker, "strong"),
          personalSpeaker,
        ),
        slotValue: mp.value,
        proposedStatus: personalSpeaker === "seller" ? "confirmed" : "partial",
        proposedConfidence: speakerConfidence(personalSpeaker, "strong"),
        noteText: `Motivation: ${mp.value}`,
        noteSlot: "motivation",
      });
      break;
    }
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

// ── NEPQ + Voss coaching moves (split across gaps) ──────────────────────────

const GAP_PRIORITY_ORDER: DiscoveryMapSlotKey[] = [
  "surface_problem",
  "property_condition",
  "human_pain",
  "desired_relief",
  "motivation",
  "timeline",
  "decision_maker",
  "price_posture",
  "next_step",
];

function getThreeGaps(
  discoveryMap: DiscoveryMap,
  primaryGap: DiscoveryMapSlotKey,
): [DiscoveryMapSlotKey, DiscoveryMapSlotKey, DiscoveryMapSlotKey] {
  const unresolved = GAP_PRIORITY_ORDER.filter(
    (g) => g !== primaryGap && discoveryMap[g].status !== "confirmed",
  );
  const second = unresolved[0] ?? primaryGap;
  const third = unresolved[1] ?? (unresolved[0] && unresolved[0] !== primaryGap ? primaryGap : "next_step");
  return [primaryGap, second, third];
}

function questionForGap(gap: DiscoveryMapSlotKey, discoveryMap: DiscoveryMap): string {
  const condition = discoveryMap.property_condition.value ?? discoveryMap.surface_problem.value;
  const problem = discoveryMap.property_condition.value ?? discoveryMap.surface_problem.value;

  switch (gap) {
    case "surface_problem":
      return condition
        ? `Can you walk me through what is going on with the ${labelFromValue(condition, "property")} right now?`
        : "Can you walk me through what is going on with the property right now?";
    case "property_condition":
      return "What feels like the main issue with the property as it sits today?";
    case "human_pain":
      return problem
        ? `How is the ${labelFromValue(problem, "property issue")} affecting things for you personally right now?`
        : "How is this situation affecting you personally right now?";
    case "desired_relief":
      return "If this got handled cleanly, what would that make possible for you?";
    case "motivation":
      return "What has you wanting to solve this now instead of letting it sit?";
    case "timeline":
      return "What timing feels realistic from your side right now?";
    case "decision_maker":
      return "Who besides you would need to feel good about the next step?";
    case "price_posture":
      return "What would make you feel like this was handled fairly?";
    case "next_step":
    default:
      return "What would make the next step feel easy from your side?";
  }
}

function vossLabelForGap(gap: DiscoveryMapSlotKey): string {
  switch (gap) {
    case "surface_problem":
      return "It sounds like the property is in pretty good shape overall.";
    case "property_condition":
      return "It sounds like most of the property stuff is fairly manageable.";
    case "human_pain":
      return "It sounds like this hasn't been too much of a hassle so far.";
    case "desired_relief":
      return "It seems like you're not really sure what you'd want out of this.";
    case "motivation":
      return "It sounds like there's no real rush on your end.";
    case "timeline":
      return "It seems like the timing is pretty flexible for you.";
    case "decision_maker":
      return "It sounds like this is pretty much your call to make.";
    case "price_posture":
      return "It sounds like price isn't really the main thing on your mind.";
    case "next_step":
    default:
      return "It seems like you're not quite ready to take a next step yet.";
  }
}

function buildCoachingMoves(
  discoveryMap: DiscoveryMap,
  primaryGap: DiscoveryMapSlotKey,
): { nepqQuestions: [string, string, string]; vossLabels: [string, string, string] } {
  const gaps = getThreeGaps(discoveryMap, primaryGap);
  return {
    nepqQuestions: [
      questionForGap(gaps[0], discoveryMap),
      questionForGap(gaps[1], discoveryMap),
      questionForGap(gaps[2], discoveryMap),
    ],
    vossLabels: [
      vossLabelForGap(gaps[0]),
      vossLabelForGap(gaps[1]),
      vossLabelForGap(gaps[2]),
    ],
  };
}

export function buildRulesBestMove(
  discoveryMap: DiscoveryMap,
  mode: LiveCoachMode,
): LiveBestMove {
  const gap = computeHighestPriorityGap(discoveryMap);
  const stage = stageForGap(gap);

  type BaseMove = Omit<LiveBestMove, "nepqQuestions" | "vossLabels">;
  let base: BaseMove;

  switch (gap) {
    case "surface_problem":
    case "property_condition": {
      const condition = discoveryMap.property_condition.value ?? discoveryMap.surface_problem.value;
      base = {
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
      break;
    }
    case "human_pain": {
      const problem = discoveryMap.property_condition.value ?? discoveryMap.surface_problem.value;
      base = {
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
      break;
    }
    case "desired_relief":
      base = {
        currentStage: stage,
        highestPriorityGap: gap,
        whyThisGapNow: "The pain is starting to show, but you still need to know what outcome the seller is trying to move toward.",
        nextBestQuestion: "If this got handled cleanly, what would that make possible for you?",
        backupQuestion: "What would you want life to look like once this is behind you?",
        suggestedMirror: discoveryMap.desired_relief.value ? `${labelFromValue(discoveryMap.desired_relief.value, "Move forward")}?` : "Move forward?",
        suggestedLabel: "It sounds like there is a specific relief you are hoping this could create.",
        guardrail: "Stay outcome-focused instead of debating terms.",
      };
      break;
    case "motivation":
      base = {
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
      break;
    case "timeline":
      base = {
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
      break;
    case "decision_maker":
      base = {
        currentStage: stage,
        highestPriorityGap: gap,
        whyThisGapNow: "Someone else may need to weigh in, so commitment questions will backfire until that is clear.",
        nextBestQuestion: "Who besides you would need to feel good about the next step?",
        backupQuestion: "How does the other signer usually like to be involved in a decision like this?",
        suggestedMirror: discoveryMap.decision_maker.value ? `${labelFromValue(discoveryMap.decision_maker.value, "Other signer")}?` : "Besides you?",
        suggestedLabel: "It sounds like this may not be a one-person decision.",
        guardrail: "Delay commitment-style questions until the signer path is clear.",
      };
      break;
    case "price_posture": {
      const redirectMove = buildRulesBestMove(
        { ...discoveryMap, price_posture: { ...discoveryMap.price_posture, status: "missing" } },
        mode,
      );
      base = {
        currentStage: stage,
        highestPriorityGap: redirectMove.highestPriorityGap,
        whyThisGapNow: "Price came up before the core discovery was complete, so you need to redirect without sounding evasive.",
        nextBestQuestion: redirectMove.nextBestQuestion,
        backupQuestion: redirectMove.backupQuestion,
        suggestedMirror: discoveryMap.price_posture.value ? `${labelFromValue(discoveryMap.price_posture.value, "Number")}?` : "Number?",
        suggestedLabel: "It sounds like you want to understand what this could realistically look like.",
        guardrail: "Acknowledge the price question, but do not anchor a number before motivation, timeline, and decision-maker are clearer.",
      };
      break;
    }
    case "next_step":
    default:
      base = {
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
      break;
  }

  const coaching = buildCoachingMoves(discoveryMap, base.highestPriorityGap);
  return { ...base, ...coaching };
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
    nepqQuestions: bestMove.nepqQuestions,
    vossLabels: bestMove.vossLabels,
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
      '  "guardrail":"One mistake to avoid right now",',
      '  "nepq_questions":["Q1 for primary gap","Q2 for next gap","Q3 for secondary gap"],',
      '  "voss_labels":["Label1 for primary gap","Label2 for next gap","Label3 for secondary gap"]',
      "}",
      "",
      "## STRATEGY RULES",
      "- Treat the Discovery Map as authoritative. Do not change slot status or certainty.",
      "- NEPQ: choose the question type that best closes the highest-priority gap.",
      "- Voss: keep the mirror and label compact, conversational, and easy to say out loud.",
      "- If price came up too early, redirect toward motivation, timeline, or decision-maker clarity.",
      "- Avoid canned rebuttals, long prompt lists, and multi-question stacks.",
      "- NEPQ questions: exactly 3 discovery questions (what/how/why). Q1 targets the primary gap, Q2 the next likely gap, Q3 a secondary gap. Each should be natural and easy to say out loud.",
      "- Voss labels: exactly 3 tactical empathy labels that are JUST BARELY OFF — one per gap matching the questions. Subtly understate or minimize the seller's situation for that gap so they correct you with deeper truth. Start with 'It sounds like...', 'It seems like...', or 'It looks like...'. The mislabel must be plausible and subtle, not dramatic or tone-deaf.",
    ].join("\n"),
  };
}

function buildDynamicLayer(
  state: LiveCoachCachedState,
  mode: LiveCoachMode,
  sessionInstructions?: string | null,
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
      `- NEPQ Questions: ${bestMove.nepqQuestions.join(" | ")}`,
      `- Voss Labels: ${bestMove.vossLabels.join(" | ")}`,
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
      ...(sessionInstructions
        ? [
            "",
            "## SESSION INSTRUCTIONS (operator-set)",
            sessionInstructions.slice(0, 500),
          ]
        : []),
    ].join("\n"),
  };
}

export function buildLiveCoachPrompt(
  state: LiveCoachCachedState,
  snapshot: CRMLeadContext | null,
  mode: LiveCoachMode,
  styleBlock: string,
  sessionInstructions?: string | null,
): AssembledPrompt {
  return assemblePrompt({
    layers: [
      buildStableLayer(mode, styleBlock),
      preCallBriefSemiStable(mapSnapshot(snapshot)),
      buildDynamicLayer(state, mode, sessionInstructions),
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
      nepqQuestions: parseTriple(parsed.nepq_questions),
      vossLabels: parseTriple(parsed.voss_labels),
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
      nepqQuestions: null,
      vossLabels: null,
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
    nepqQuestions: parsed.nepqQuestions ?? rulesMove.nepqQuestions,
    vossLabels: parsed.vossLabels ?? rulesMove.vossLabels,
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

/** Minimum cooldown between strategist calls even when new evidence arrives */
const STRATEGIST_MIN_COOLDOWN_MS = 4_000;

export function shouldInvokeStrategist(
  state: LiveCoachCachedState,
  reduction: ReduceLiveCoachStateResult,
  now = Date.now(),
): boolean {
  if (!state.bestMove) return reduction.state.recentTurns.length > 0;
  if (!state.lastStrategizedAt) return true;

  const elapsed = now - Date.parse(state.lastStrategizedAt);

  // Gap changed or new seller evidence — allow but enforce minimum cooldown
  if (reduction.gapChanged || reduction.hasNewSellerEvidence) {
    return elapsed >= STRATEGIST_MIN_COOLDOWN_MS;
  }

  // Otherwise use the stale threshold (25s)
  return elapsed >= STRATEGIST_STALE_MS;
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
