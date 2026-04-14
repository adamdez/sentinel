/**
 * Live Coach v2 contract types.
 *
 * Pure TypeScript only so Cursor and backend routes can safely share the
 * response shape without pulling in dialer services or DB code.
 */

export type LiveCoachMode = "inbound" | "outbound";

export type NepqStage =
  | "connection"
  | "situation"
  | "problem_awareness"
  | "solution_awareness"
  | "consequence"
  | "commitment";

export type DiscoveryMapSlotKey =
  | "surface_problem"
  | "human_pain"
  | "desired_relief"
  | "property_condition"
  | "motivation"
  | "timeline"
  | "decision_maker"
  | "price_posture"
  | "next_step";

export type DiscoveryMapSlotStatus = "missing" | "partial" | "confirmed";
export type DiscoveryMapConfidence = "weak" | "probable" | "strong";
export type DiscoveryMapSource = "rule" | "transcript" | "ai";
export type LiveCoachSource = "rules" | "gpt5";

export interface DiscoveryMapSlot {
  status: DiscoveryMapSlotStatus;
  value: string | null;
  confidence: DiscoveryMapConfidence;
  source: DiscoveryMapSource;
  updatedAt: string | null;
}

export type DiscoveryMap = Record<DiscoveryMapSlotKey, DiscoveryMapSlot>;

export type EmpathyMoveType = "mirror" | "label" | "calibrated_question";

export interface EmpathyMove {
  type: EmpathyMoveType;
  text: string;
  cue: string;
}

export interface ObjectionCoachMove {
  objection: string;
  label: string;
  calibratedQuestion: string;
}

export interface StructuredLiveNote {
  id: string;
  slot: DiscoveryMapSlotKey;
  text: string;
  source: DiscoveryMapSource;
  updatedAt: string;
}

export type DeterministicSignalFamily =
  | "condition_problem"
  | "human_pain"
  | "desired_relief"
  | "timeline"
  | "decision_maker"
  | "price_posture"
  | "motivation"
  | "next_step";

export interface DeterministicSignal {
  id: string;
  family: DeterministicSignalFamily;
  slot: DiscoveryMapSlotKey;
  value: string;
  source: "rule" | "transcript";
  speaker: "operator" | "seller" | "unknown";
  confidence: DiscoveryMapConfidence;
  observedAt: string;
  ruleId: string;
  noteId: string | null;
  sequenceNum: number;
}

export interface LiveCoachRecentTurn {
  sequenceNum: number;
  speaker: "operator" | "seller" | "ai" | "unknown";
  text: string;
  createdAt: string | null;
}

export interface LiveCoachSpeakerReliability {
  sellerTurns: number;
  operatorTurns: number;
  unknownTurns: number;
  overall: "low" | "medium" | "high";
}

export interface LiveBestMove {
  currentStage: NepqStage;
  highestPriorityGap: DiscoveryMapSlotKey;
  whyThisGapNow: string;
  nextBestQuestion: string;
  backupQuestion: string | null;
  suggestedMirror: string | null;
  suggestedLabel: string | null;
  guardrail: string;
  nepqQuestions: [string, string, string];
  vossLabels: [string, string, string];
}

export interface LiveCoachCachedState {
  version: string;
  lastProcessedSequence: number;
  discoveryMap: DiscoveryMap;
  structuredLiveNotes: StructuredLiveNote[];
  recentTurns: LiveCoachRecentTurn[];
  deterministicSignals: DeterministicSignal[];
  speakerReliability: LiveCoachSpeakerReliability;
  bestMove: LiveBestMove | null;
  source: LiveCoachSource;
  lastUpdatedAt: string;
  lastStrategizedAt: string | null;
  lastStrategizedGap: DiscoveryMapSlotKey | null;
  lastStrategizedSequence: number;
  lastSellerEvidenceSequence: number;
  lastSellerTurnAt: string | null;
}

export interface LiveCoachResponseV2 {
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
  mode: LiveCoachMode;
  source: LiveCoachSource;
  discoveryMap: DiscoveryMap;
  structuredLiveNotes: StructuredLiveNote[];
  highestPriorityGap: DiscoveryMapSlotKey;
  whyThisGapNow: string;
  backupQuestion: string | null;
  suggestedMirror: string | null;
  suggestedLabel: string | null;
  nepqQuestions: [string, string, string];
  vossLabels: [string, string, string];
  lastProcessedSequence: number;
  lastStrategizedAt: string | null;
  lastSellerTurnAt: string | null;
}
