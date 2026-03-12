// ── Buyer record types ──

export type BuyerStatus = "active" | "inactive";
export type ContactMethod = "phone" | "email" | "text";
export type FundingType = "cash" | "hard_money" | "conventional" | "private";
export type POFStatus = "verified" | "submitted" | "not_submitted";
export type RehabTolerance = "none" | "light" | "moderate" | "heavy" | "gut";
export type BuyerStrategy = "flip" | "landlord" | "developer" | "wholesale";
export type OccupancyPref = "vacant" | "occupied" | "either";
export type DealBuyerStatus =
  | "not_contacted"
  | "queued"
  | "sent"
  | "interested"
  | "offered"
  | "passed"
  | "follow_up"
  | "selected";

export type BuyerRow = {
  id: string;
  company_name: string | null;
  contact_name: string;
  phone: string | null;
  email: string | null;
  preferred_contact_method: ContactMethod;
  markets: string[];
  asset_types: string[];
  price_range_low: number | null;
  price_range_high: number | null;
  funding_type: FundingType | null;
  proof_of_funds: POFStatus;
  pof_verified_at: string | null;
  rehab_tolerance: RehabTolerance | null;
  buyer_strategy: BuyerStrategy | null;
  occupancy_pref: OccupancyPref;
  tags: string[];
  notes: string | null;
  status: BuyerStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DealBuyerRow = {
  id: string;
  deal_id: string;
  buyer_id: string;
  status: DealBuyerStatus;
  date_contacted: string | null;
  contact_method: ContactMethod | null;
  response: string | null;
  offer_amount: number | null;
  follow_up_needed: boolean;
  follow_up_at: string | null;
  responded_at: string | null;
  selection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (populated by API)
  buyer?: BuyerRow;
};

// ── Dispo prep type (JSONB on deals table) ──

export type OccupancyStatus = "vacant" | "occupied" | "unknown";

export type DispoPrep = {
  asking_assignment_price: number | null;
  estimated_rehab: number | null;
  occupancy_status: OccupancyStatus | null;
  property_highlights: string | null;
  known_issues: string | null;
  access_notes: string | null;
  dispo_summary: string | null;
  updated_at: string | null;
};

export const OCCUPANCY_STATUS_OPTIONS = [
  { value: "vacant", label: "Vacant" },
  { value: "occupied", label: "Occupied" },
  { value: "unknown", label: "Unknown" },
] as const;

// ── Option arrays for UI selects/filters ──

export const MARKET_OPTIONS = [
  { value: "spokane_county", label: "Spokane County, WA" },
  { value: "kootenai_county", label: "Kootenai County, ID" },
] as const;

export const ASSET_TYPE_OPTIONS = [
  { value: "sfr", label: "SFR" },
  { value: "multi", label: "Multi-Family" },
  { value: "land", label: "Land" },
  { value: "mobile", label: "Mobile Home" },
  { value: "commercial", label: "Commercial" },
] as const;

export const FUNDING_TYPE_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "hard_money", label: "Hard Money" },
  { value: "conventional", label: "Conventional" },
  { value: "private", label: "Private" },
] as const;

export const POF_STATUS_OPTIONS = [
  { value: "verified", label: "Verified" },
  { value: "submitted", label: "Submitted" },
  { value: "not_submitted", label: "Not Submitted" },
] as const;

export const REHAB_OPTIONS = [
  { value: "none", label: "None" },
  { value: "light", label: "Light" },
  { value: "moderate", label: "Moderate" },
  { value: "heavy", label: "Heavy" },
  { value: "gut", label: "Gut Rehab" },
] as const;

export const STRATEGY_OPTIONS = [
  { value: "flip", label: "Flip" },
  { value: "landlord", label: "Landlord" },
  { value: "developer", label: "Developer" },
  { value: "wholesale", label: "Wholesale" },
] as const;

export const OCCUPANCY_OPTIONS = [
  { value: "vacant", label: "Vacant" },
  { value: "occupied", label: "Occupied" },
  { value: "either", label: "Either" },
] as const;

export const BUYER_TAG_OPTIONS = [
  { value: "closes_fast", label: "Closes Fast" },
  { value: "reliable", label: "Reliable" },
  { value: "ghosts", label: "Ghosts" },
  { value: "retrades", label: "Retrades" },
  { value: "low_priority", label: "Low Priority" },
  { value: "high_volume", label: "High Volume" },
  { value: "local", label: "Local" },
  { value: "out_of_state", label: "Out of State" },
  { value: "wants_discount", label: "Wants Discount" },
  { value: "responds_fast", label: "Responds Fast" },
  { value: "strongest_sfr", label: "Strongest SFR" },
  { value: "strongest_multi", label: "Strongest Multi" },
] as const;

export const DEAL_BUYER_STATUS_OPTIONS = [
  { value: "not_contacted", label: "Not Contacted" },
  { value: "queued", label: "Queued" },
  { value: "sent", label: "Sent" },
  { value: "interested", label: "Interested" },
  { value: "offered", label: "Offered" },
  { value: "passed", label: "Passed" },
  { value: "follow_up", label: "Follow Up" },
  { value: "selected", label: "Selected" },
] as const;

// ── Label helpers ──

export function marketLabel(v: string): string {
  return MARKET_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function assetTypeLabel(v: string): string {
  return ASSET_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function strategyLabel(v: string): string {
  return STRATEGY_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function fundingLabel(v: string): string {
  return FUNDING_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function pofLabel(v: string): string {
  return POF_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function rehabLabel(v: string): string {
  return REHAB_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function tagLabel(v: string): string {
  return BUYER_TAG_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function dealBuyerStatusLabel(v: string): string {
  return DEAL_BUYER_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function formatPriceRange(low: number | null, high: number | null): string {
  if (low && high) return `$${(low / 1000).toFixed(0)}k – $${(high / 1000).toFixed(0)}k`;
  if (low) return `$${(low / 1000).toFixed(0)}k+`;
  if (high) return `Up to $${(high / 1000).toFixed(0)}k`;
  return "—";
}
