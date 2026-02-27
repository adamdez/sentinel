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
}

export const TEAM_MEMBERS = [
  { id: "user-adam", name: "Adam D.", role: "admin" as const },
  { id: "user-nathan", name: "Nathan B.", role: "agent" as const },
  { id: "user-logan", name: "Logan T.", role: "agent" as const },
] as const;

export type TeamMemberId = (typeof TEAM_MEMBERS)[number]["id"];

export type LeadSegment = "all" | "mine" | TeamMemberId;
