/**
 * Lead view model types and team configuration.
 * All lead data is fetched live from Supabase.
 */

import type { DistressType, AIScore, LeadStatus } from "./types";

export interface LeadRow {
  id: string;
  propertyId: string;
  apn: string;
  county: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  ownerName: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  ownerBadge: "absentee" | "corporate" | "inherited" | "elderly" | "out-of-state" | null;
  distressSignals: DistressType[];
  status: LeadStatus;
  assignedTo: string | null;
  assignedName: string | null;
  score: AIScore;
  predictivePriority: number;
  estimatedValue: number | null;
  equityPercent: number | null;
  followUpDate: string | null;
  lastContactAt: string | null;
  promotedAt: string;
  source: string;
  tags: string[];
  complianceClean: boolean;
  notes: string | null;
  totalCalls: number;
  liveAnswers: number;
  voicemailsLeft: number;
  callSequenceStep: number;
  nextCallScheduledAt: string | null;
  dispositionCode: string | null;
}

/**
 * Dynamic team member loaded from user_profiles (real Supabase UUIDs).
 * Replaces the old hardcoded TEAM_MEMBERS whose IDs never matched
 * the actual Supabase auth UUIDs stored in leads.assigned_to.
 */
export interface DynamicTeamMember {
  id: string;       // Supabase auth UUID
  name: string;     // full_name from user_profiles
  role: "admin" | "agent";
}

/**
 * @deprecated Use DynamicTeamMember[] fetched from user_profiles instead.
 * Kept only as a fallback if the DB fetch fails.
 */
export const TEAM_MEMBERS = [
  { id: "user-adam", name: "Adam D.", role: "admin" as const },
  { id: "user-nathan", name: "Nathan B.", role: "agent" as const },
  { id: "user-logan", name: "Logan T.", role: "agent" as const },
] as const;

export type TeamMemberId = (typeof TEAM_MEMBERS)[number]["id"];

/** Segment can be "all", "mine", or any team member UUID */
export type LeadSegment = "all" | "mine" | string;
