export type LeadIngestSourceId = "craigslist_fsbo" | "elite_seed_top10";
export type LeadIngestPolicy = "enabled" | "disabled";

export interface LeadIngestSourceConfig {
  sourceId: LeadIngestSourceId;
  sourceTags: string[];
  envKey: string;
  label: string;
}

export interface LeadIngestPolicyDecision extends LeadIngestSourceConfig {
  policy: LeadIngestPolicy;
  reason: string;
}

export interface LeadIngestPolicySkip {
  sourceId: LeadIngestSourceId;
  label: string;
  policy: LeadIngestPolicy;
  reason: string;
  skipped_by_policy: boolean;
}

const SOURCE_CONFIG: Record<LeadIngestSourceId, LeadIngestSourceConfig> = {
  craigslist_fsbo: {
    sourceId: "craigslist_fsbo",
    sourceTags: ["craigslist"],
    envKey: "LEAD_INGEST_POLICY_CRAIGSLIST_FSBO",
    label: "Craigslist FSBO",
  },
  elite_seed_top10: {
    sourceId: "elite_seed_top10",
    sourceTags: ["EliteSeed_Top10_20260301"],
    envKey: "LEAD_INGEST_POLICY_ELITE_SEED_TOP10",
    label: "Elite Seed Top 10",
  },
};

function normalizePolicy(raw: string | undefined): LeadIngestPolicy {
  return raw?.trim().toLowerCase() === "enabled" ? "enabled" : "disabled";
}

export function getLeadIngestPolicy(
  sourceId: LeadIngestSourceId,
  env: NodeJS.ProcessEnv = process.env,
): LeadIngestPolicyDecision {
  const config = SOURCE_CONFIG[sourceId];
  const raw = env[config.envKey];
  const policy = normalizePolicy(raw);
  const reason = raw
    ? `${policy} via ${config.envKey}`
    : "disabled by default";

  return {
    ...config,
    policy,
    reason,
  };
}

export function getAllLeadIngestPolicies(
  env: NodeJS.ProcessEnv = process.env,
): LeadIngestPolicyDecision[] {
  return (Object.keys(SOURCE_CONFIG) as LeadIngestSourceId[]).map((sourceId) =>
    getLeadIngestPolicy(sourceId, env)
  );
}

export function isLeadIngestEnabled(
  sourceId: LeadIngestSourceId,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getLeadIngestPolicy(sourceId, env).policy === "enabled";
}

export function getBlockedLeadSourceTags(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return getAllLeadIngestPolicies(env)
    .filter((entry) => entry.policy === "disabled")
    .flatMap((entry) => entry.sourceTags);
}

export function buildLeadIngestPolicySkip(sourceId: LeadIngestSourceId): LeadIngestPolicySkip {
  const decision = getLeadIngestPolicy(sourceId);
  return {
    sourceId: decision.sourceId,
    label: decision.label,
    policy: decision.policy,
    reason: decision.reason,
    skipped_by_policy: decision.policy === "disabled",
  };
}
