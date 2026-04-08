/**
 * Source Policy Registry — server-side module
 *
 * Reads source_policies from the database and provides helpers used by:
 *   - POST /api/dossiers/[lead_id]/artifacts  (capture-time warning)
 *   - POST /api/dossiers/[lead_id]/compile    (compile-time exclusion + policy_flags)
 *   - GET  /api/settings/source-policies      (admin read)
 *   - PATCH /api/settings/source-policies     (admin update)
 *
 * BOUNDARY: reads source_policies table only.
 * Never touches leads, dossiers, or CRM-owned tables.
 */

import { createServerClient } from "@/lib/supabase";

// ── Types (exported for API routes + UI) ─────────────────────────────────────

export type SourcePolicy = "approved" | "review_required" | "blocked";

export const POLICY_LABELS: Record<SourcePolicy, string> = {
  approved:        "Approved",
  review_required: "Review required",
  blocked:         "Blocked",
};

export const POLICY_DESCRIPTIONS: Record<SourcePolicy, string> = {
  approved:        "Compiles cleanly — no warning required.",
  review_required: "Included in compile but flagged for extra review attention.",
  blocked:         "Excluded from compile by default. Warning shown at capture.",
};

export interface SourcePolicyRow {
  id:           string;
  source_type:  string;
  policy:       SourcePolicy;
  rationale:    string | null;
  updated_by:   string | null;
  updated_at:   string;
  created_at:   string;
}

export interface PolicyFlag {
  artifact_id:  string;
  source_type:  string;
  policy:       SourcePolicy;
  rationale:    string | null;
}

// ── Fallback defaults (used if DB unavailable) ────────────────────────────────
// Ensures compile never silently fails if policy table is inaccessible.

const POLICY_DEFAULTS: Record<string, SourcePolicy> = {
  // Probate / inherited
  probate_filing:             "approved",
  assessor:                   "approved",
  court_record:               "approved",
  obituary:                   "review_required",
  news:                       "review_required",
  // Absentee-landlord
  mailing_address_mismatch:   "approved",
  tax_delinquency:            "approved",
  rental_listing:             "review_required",
  property_management_record: "review_required",
  social_media:               "review_required",
  contact:                    "review_required",
  employment:                 "review_required",
  heir:                       "review_required",
  other:                      "review_required",
};

// ── getSourcePolicies ─────────────────────────────────────────────────────────
// Fetches all policy rows. Falls back to defaults on DB error.

export async function getSourcePolicies(): Promise<SourcePolicyRow[]> {
  try {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("source_policies") as any)
      .select("*")
      .order("source_type", { ascending: true });

    if (error || !data || data.length === 0) {
      // Return synthetic rows from defaults so callers always get a full list
      return Object.entries(POLICY_DEFAULTS).map(([source_type, policy]) => ({
        id:          source_type,
        source_type,
        policy,
        rationale:   null,
        updated_by:  null,
        updated_at:  new Date().toISOString(),
        created_at:  new Date().toISOString(),
      }));
    }

    return data as SourcePolicyRow[];
  } catch {
    return Object.entries(POLICY_DEFAULTS).map(([source_type, policy]) => ({
      id:          source_type,
      source_type,
      policy,
      rationale:   null,
      updated_by:  null,
      updated_at:  new Date().toISOString(),
      created_at:  new Date().toISOString(),
    }));
  }
}

// ── getSourcePolicy ───────────────────────────────────────────────────────────
// Single-type lookup. Returns default if not in DB.

export async function getSourcePolicy(sourceType: string): Promise<SourcePolicy> {
  try {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb.from("source_policies") as any)
      .select("policy")
      .eq("source_type", sourceType)
      .maybeSingle();

    if (data?.policy) return data.policy as SourcePolicy;
    return POLICY_DEFAULTS[sourceType] ?? "review_required";
  } catch {
    return POLICY_DEFAULTS[sourceType] ?? "review_required";
  }
}

// ── buildPolicyMap ────────────────────────────────────────────────────────────
// Builds a sourceType→{policy, rationale} map from a policies array.
// Used by compile to avoid N+1 policy lookups.

export function buildPolicyMap(
  policies: SourcePolicyRow[]
): Map<string, { policy: SourcePolicy; rationale: string | null }> {
  const map = new Map<string, { policy: SourcePolicy; rationale: string | null }>();
  for (const p of policies) {
    map.set(p.source_type, { policy: p.policy, rationale: p.rationale });
  }
  // Fill in defaults for any type not in DB
  for (const [type, policy] of Object.entries(POLICY_DEFAULTS)) {
    if (!map.has(type)) map.set(type, { policy, rationale: null });
  }
  return map;
}

// ── evaluateArtifacts ─────────────────────────────────────────────────────────
// Given a list of artifacts and the policy map, returns:
//   allowed:    artifacts that pass (approved or review_required)
//   blocked:    artifacts whose source_type policy is "blocked"
//   flags:      PolicyFlag[] for all non-approved artifacts (for compile response)

export function evaluateArtifacts(
  artifacts: Array<{ id: string; source_type: string }>,
  policyMap: Map<string, { policy: SourcePolicy; rationale: string | null }>,
  includeBlocked = false
): {
  allowed:  Array<{ id: string; source_type: string }>;
  blocked:  Array<{ id: string; source_type: string }>;
  flags:    PolicyFlag[];
} {
  const allowed: Array<{ id: string; source_type: string }> = [];
  const blocked: Array<{ id: string; source_type: string }> = [];
  const flags:   PolicyFlag[] = [];

  for (const artifact of artifacts) {
    const entry = policyMap.get(artifact.source_type) ?? { policy: "review_required" as SourcePolicy, rationale: null };

    if (entry.policy === "blocked") {
      if (includeBlocked) {
        allowed.push(artifact);
        flags.push({ artifact_id: artifact.id, source_type: artifact.source_type, policy: "blocked", rationale: entry.rationale });
      } else {
        blocked.push(artifact);
        flags.push({ artifact_id: artifact.id, source_type: artifact.source_type, policy: "blocked", rationale: entry.rationale });
      }
    } else if (entry.policy === "review_required") {
      allowed.push(artifact);
      flags.push({ artifact_id: artifact.id, source_type: artifact.source_type, policy: "review_required", rationale: entry.rationale });
    } else {
      allowed.push(artifact);
      // approved — no flag needed
    }
  }

  return { allowed, blocked, flags };
}
