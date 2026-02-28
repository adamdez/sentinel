export type Role = "admin" | "agent" | "viewer";

export type LeadStatus =
  | "prospect"
  | "lead"
  | "negotiation"
  | "disposition"
  | "nurture"
  | "dead"
  | "closed";

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
  | "inherited";

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

export interface DistressEvent {
  id: string;
  property_id: string;
  event_type: DistressType;
  source: string;
  severity: number;
  fingerprint: string;
  raw_data: Record<string, unknown>;
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
  is_active: boolean;
}

export interface AIScore {
  composite: number;
  motivation: number;
  equityVelocity: number;
  urgency: number;
  historicalConversion: number;
  aiBoost: number;
  label: "cold" | "warm" | "hot" | "fire";
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

export interface IngestPayload {
  source: string;
  records: Array<{
    apn: string;
    county: string;
    address: string;
    owner_name: string;
    distress_type: DistressType;
    raw_data: Record<string, unknown>;
  }>;
}
