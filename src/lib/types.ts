export type Role = "admin" | "agent" | "viewer";

export type LeadStatus =
  | "staging"
  | "prospect"
  | "lead"
  | "active"
  | "negotiation"
  | "disposition"
  | "nurture"
  | "dead"
  | "closed";

export type SellerTimeline =
  | "immediate"
  | "30_days"
  | "60_days"
  | "flexible"
  | "unknown";

export type QualificationRoute =
  | "offer_ready"
  | "follow_up"
  | "nurture"
  | "dead"
  | "escalate";

export type DistressType =
  | "probate"
  | "pre_foreclosure"
  | "tax_lien"
  | "code_violation"
  | "vacant"
  | "divorce"
  | "bankruptcy"
  | "fsbo"
  | "absentee"
  | "inherited"
  | "water_shutoff"
  | "condemned"
  | "tired_landlord"
  | "underwater";

export interface Property {
  id: string;
  apn: string;
  county: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  owner_name: string;
  owner_phone?: string;
  owner_email?: string;
  estimated_value?: number;
  equity_percent?: number;
  created_at: string;
  updated_at: string;
}

export type SignalStatus = "active" | "resolved" | "expired" | "unknown";

export interface DistressEvent {
  id: string;
  property_id: string;
  event_type: DistressType;
  source: string;
  severity: number;
  fingerprint: string;
  raw_data: Record<string, unknown>;
  status: SignalStatus;
  event_date: string | null;
  last_verified_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface ScoringRecord {
  id: string;
  property_id: string;
  model_version: string;
  composite_score: number;
  motivation_score: number;
  deal_score: number;
  equity_multiplier: number;
  severity_multiplier: number;
  factors: ScoreFactor[];
  created_at: string;
}

export interface ScoreFactor {
  name: string;
  weight: number;
  value: number;
  contribution: number;
}

export interface LeadInstance {
  id: string;
  property_id: string;
  dominion_lead_id: string;
  status: LeadStatus;
  assigned_to?: string;
  priority: number;
  promoted_at: string;
  last_contact_at?: string;
  next_action_at?: string;
  motivation_level?: number | null;
  seller_timeline?: SellerTimeline | null;
  condition_level?: number | null;
  decision_maker_confirmed?: boolean;
  price_expectation?: number | null;
  qualification_route?: QualificationRoute | null;
  disposition_code?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar_url?: string;
  personal_cell?: string;
  is_active: boolean;
}

export interface AIScore {
  composite: number;
  motivation: number;
  equityVelocity: number;
  urgency: number;
  historicalConversion: number;
  aiBoost: number;
  label: "unscored" | "bronze" | "silver" | "gold" | "platinum";
}

export interface PredictiveScore {
  predictiveScore: number;
  daysUntilDistress: number;
  confidence: number;
  ownerAgeInference: number | null;
  equityBurnRate: number | null;
  absenteeDurationDays: number | null;
  taxDelinquencyTrend: number | null;
  lifeEventProbability: number | null;
  label: "imminent" | "likely" | "possible" | "unlikely";
  modelVersion: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  user_name: string;
  content: string;
  timestamp: string;
}

export interface FeatureFlags {
  aiScoring: boolean;
  dialer: boolean;
  ghostMode: boolean;
  teamChat: boolean;
  campaigns: boolean;
}

// ── Context Snapshot (PR-2) ─────────────────────────────────────────
// Read-only bridge from CRM to the dialer workspace.
// Assembled by the lead-context MCP tool and the /api/dialer/context endpoint.
// One-directional: CRM → Dialer. Nothing writes back through this type.

export interface ContextSnapshot {
  lead_id: string;
  // Workflow state
  status: LeadStatus;
  next_action: string | null;
  next_action_due_at: string | null;
  lock_version: number;
  // Seller identity
  owner_name: string;
  owner_phone: string | null;
  owner_email: string | null;
  // Property
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  estimated_value: number | null;
  equity_percent: number | null;
  property_type: string | null;
  bedrooms: number | null;
  year_built: number | null;
  // Compliance
  dnc_status: boolean;
  opt_out: boolean;
  call_consent: boolean;
  litigant_flag: boolean;
  // Qualification context
  motivation_level: number | null;
  seller_timeline: string | null;
  qualification_route: string | null;
  price_expectation: number | null;
  decision_maker_confirmed: boolean;
  // Communication history
  total_calls: number;
  live_answers: number;
  voicemails_left: number;
  last_contact_at: string | null;
  // Latest AI score
  composite_score: number | null;
  score_factors: Array<{ name: string; contribution: number }> | null;
  // Open tasks (max 5, ordered by due_at)
  open_tasks: Array<{
    id: string;
    title: string;
    due_at: string | null;
    priority: number;
  }>;
  // Recent calls (max 3, most recent first)
  recent_calls: Array<{
    id: string;
    outcome: string | null;
    duration_seconds: number | null;
    called_at: string;
    notes: string | null;
  }>;
  // Active dossier summary (if reviewed)
  dossier: {
    id: string;
    situation_summary: string | null;
    recommended_call_angle: string | null;
    top_facts: unknown[] | null;
  } | null;
  // Allowed stage transitions from current status
  allowed_transitions: Array<{
    status: LeadStatus;
    requires_next_action: boolean;
  }>;
  // Meta
  source: string | null;
  assigned_to: string | null;
  tags: string[];
  notes: string | null;
}

// ── Stage Machine (PR-1) ────────────────────────────────────────────
// Contract consumed by Cursor for the stage transition UI.
// Cursor should call PATCH /api/leads/[id]/stage with this payload.

export interface StageTransitionRequest {
  /** Target status to transition to */
  to: LeadStatus;
  /** Required for any forward-moving transition (enforced server-side) */
  next_action: string;
  /** Optional deadline for the next action */
  next_action_due_at?: string | null;
  /** Current lock_version for optimistic concurrency control */
  lock_version: number;
}

export interface StageTransitionResult {
  success: true;
  lead_id: string;
  previous_status: LeadStatus;
  new_status: LeadStatus;
  next_action: string;
  next_action_due_at: string | null;
  lock_version: number;
}

export interface StageTransitionError {
  success: false;
  error: string;
  /** "invalid_transition" | "missing_next_action" | "lock_conflict" | "not_found" | "unauthorized" */
  code: string;
}

export interface IngestPayload {
  source: string;
  records: Array<{
    apn: string;
    county: string;
    address: string;
    owner_name: string;
    distress_type: DistressType;
    raw_data: Record<string, unknown>;
    /** Optional owner phone for contact dedup/creation */
    owner_phone?: string;
    /** Optional owner email for contact creation */
    owner_email?: string;
  }>;
}
