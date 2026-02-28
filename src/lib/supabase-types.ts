/**
 * Supabase Database Types
 *
 * TODO: Auto-generate with `npx supabase gen types typescript --project-id <ref>`
 * This manual type file mirrors the Drizzle schema for type safety.
 */

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

interface PropertyRow {
  id: string;
  apn: string;
  county: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  owner_name: string;
  owner_phone: string | null;
  owner_email: string | null;
  estimated_value: number | null;
  equity_percent: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  year_built: number | null;
  lot_size: number | null;
  property_type: string | null;
  owner_flags: Json;
  created_at: string;
  updated_at: string;
}

interface DistressEventRow {
  id: string;
  property_id: string;
  event_type: string;
  source: string;
  severity: number;
  fingerprint: string;
  raw_data: Json;
  confidence: number | null;
  created_at: string;
}

interface ScoringRecordRow {
  id: string;
  property_id: string;
  model_version: string;
  composite_score: number;
  motivation_score: number;
  deal_score: number;
  severity_multiplier: number;
  recency_decay: number;
  stacking_bonus: number;
  owner_factor_score: number;
  equity_factor_score: number;
  ai_boost: number;
  factors: Json;
  created_at: string;
}

interface LeadRow {
  id: string;
  property_id: string;
  contact_id: string | null;
  status: string;
  assigned_to: string | null;
  priority: number;
  source: string | null;
  promoted_at: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  disposition_code: string | null;
  notes: string | null;
  tags: string[];
  lock_version: number;
  created_at: string;
  updated_at: string;
}

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  contact_type: string;
  source: string | null;
  dnc_status: boolean;
  opt_out: boolean;
  litigant_flag: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface DealRow {
  id: string;
  lead_id: string;
  property_id: string;
  status: string;
  ask_price: number | null;
  offer_price: number | null;
  contract_price: number | null;
  assignment_fee: number | null;
  arv: number | null;
  repair_estimate: number | null;
  buyer_id: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  lead_id: string | null;
  deal_id: string | null;
  due_at: string | null;
  completed_at: string | null;
  priority: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface CampaignRow {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  audience_filter: Json;
  template_id: string | null;
  sent_count: number;
  open_count: number;
  click_count: number;
  response_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface OfferRow {
  id: string;
  deal_id: string;
  offer_type: string;
  amount: number;
  terms: string | null;
  status: string;
  offered_by: string;
  offered_at: string;
  expires_at: string | null;
  response: string | null;
  responded_at: string | null;
  created_at: string;
}

interface ScoringPredictionRow {
  id: string;
  property_id: string;
  model_version: string;
  predictive_score: number;
  days_until_distress: number;
  confidence: number;
  owner_age_inference: number | null;
  equity_burn_rate: number | null;
  absentee_duration_days: number | null;
  tax_delinquency_trend: number | null;
  life_event_probability: number | null;
  features: Json;
  factors: Json;
  created_at: string;
}

interface EventLogRow {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Json;
  ip_address: string | null;
  created_at: string;
}

interface UserProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  phone: string | null;
  personal_cell: string | null;
  is_active: boolean;
  saved_dashboard_layout: Json | null;
  preferences: Json;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      properties: {
        Row: PropertyRow;
        Insert: Omit<PropertyRow, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Omit<PropertyRow, "id" | "created_at" | "updated_at">>;
      };
      distress_events: {
        Row: DistressEventRow;
        Insert: Omit<DistressEventRow, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: never;
      };
      scoring_records: {
        Row: ScoringRecordRow;
        Insert: Omit<ScoringRecordRow, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: never;
      };
      leads: {
        Row: LeadRow;
        Insert: Omit<LeadRow, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Omit<LeadRow, "id" | "created_at" | "updated_at">>;
      };
      contacts: {
        Row: ContactRow;
        Insert: Omit<ContactRow, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Omit<ContactRow, "id" | "created_at" | "updated_at">>;
      };
      deals: {
        Row: DealRow;
        Insert: Omit<DealRow, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Omit<DealRow, "id" | "created_at" | "updated_at">>;
      };
      tasks: {
        Row: TaskRow;
        Insert: Omit<TaskRow, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Omit<TaskRow, "id" | "created_at" | "updated_at">>;
      };
      campaigns: {
        Row: CampaignRow;
        Insert: Omit<CampaignRow, "id" | "created_at" | "updated_at"> & { id?: string; created_at?: string; updated_at?: string };
        Update: Partial<Omit<CampaignRow, "id" | "created_at" | "updated_at">>;
      };
      offers: {
        Row: OfferRow;
        Insert: Omit<OfferRow, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: Partial<Omit<OfferRow, "id" | "created_at">>;
      };
      scoring_predictions: {
        Row: ScoringPredictionRow;
        Insert: Omit<ScoringPredictionRow, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: never;
      };
      event_log: {
        Row: EventLogRow;
        Insert: Omit<EventLogRow, "id" | "created_at"> & { id?: string; created_at?: string };
        Update: never;
      };
      user_profiles: {
        Row: UserProfileRow;
        Insert: Omit<UserProfileRow, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string };
        Update: Partial<Omit<UserProfileRow, "id" | "created_at" | "updated_at">>;
      };
    };
    Functions: Record<string, never>;
    Enums: {
      lead_status: "prospect" | "lead" | "negotiation" | "disposition" | "nurture" | "dead" | "closed";
      deal_status: "draft" | "negotiating" | "under_contract" | "assigned" | "closed" | "dead";
      user_role: "admin" | "agent" | "viewer";
      distress_type: "probate" | "pre_foreclosure" | "tax_lien" | "code_violation" | "vacant" | "divorce" | "bankruptcy" | "fsbo" | "absentee" | "inherited";
    };
  };
}
