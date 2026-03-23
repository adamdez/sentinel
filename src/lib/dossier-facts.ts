/**
 * Shared types and constants for the fact assertions layer.
 * Imported by both the API route and client-side hooks/components.
 */

// Stored fact types are now open-ended slug keys. The original dossier categories
// still exist as the curated manual-entry set, but adapter-driven facts may also
// use provider- or field-specific keys such as "provider_bricked_arv_estimate".
export type FactType = string;

export type SuggestedFactType =
  | "ownership" | "deceased" | "heir" | "probate_status"
  | "financial" | "property_condition" | "timeline" | "contact_info" | "other";

export type FactConfidence = "unverified" | "low" | "medium" | "high";
export type FactReviewStatus = "pending" | "accepted" | "rejected";

export const FACT_TYPES: SuggestedFactType[] = [
  "ownership", "deceased", "heir", "probate_status",
  "financial", "property_condition", "timeline", "contact_info", "other",
];

export const FACT_TYPE_LABELS: Record<SuggestedFactType, string> = {
  ownership:          "Ownership",
  deceased:           "Deceased",
  heir:               "Heir / estate",
  probate_status:     "Probate status",
  financial:          "Financial",
  property_condition: "Property condition",
  timeline:           "Timeline",
  contact_info:       "Contact info",
  other:              "Other",
};

export const CONFIDENCE_LABELS: Record<FactConfidence, string> = {
  unverified: "Unverified",
  low:        "Low",
  medium:     "Medium",
  high:       "High",
};

export function labelForFactType(factType: string): string {
  const known = FACT_TYPE_LABELS[factType as SuggestedFactType];
  if (known) return known;

  return factType
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const PROMOTED_FIELD_OPTIONS = [
  { value: "situation_summary",       label: "Situation summary" },
  { value: "likely_decision_maker",   label: "Likely decision maker" },
  { value: "recommended_call_angle",  label: "Recommended call angle" },
  { value: "top_facts",               label: "Top facts list" },
  { value: "verification_checklist",  label: "Verification checklist" },
];
