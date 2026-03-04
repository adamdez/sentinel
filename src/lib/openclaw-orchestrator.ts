/**
 * OpenClaw Orchestrator — Decides which research agents to run per property.
 *
 * Uses distress signals, owner flags, and data freshness to pick the
 * most cost-effective mix of agents for each Deep Crawl.
 *
 * Cost discipline:
 *  - ALWAYS run court_records + social_media (cheap, high-value)
 *  - CONDITIONALLY run obituary, county_records, property_photos
 *  - Future: propertyradar_navigator, attom_navigator (Haiku, browser)
 */

import type { AgentTask, AgentPayload } from "./openclaw-client";

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

interface PropertyContext {
  ownerName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  apn?: string;
  radarId?: string;
  lat?: number;
  lng?: number;
  // Signals & flags
  distressSignals: string[];     // e.g. ["pre_foreclosure", "tax_lien"]
  isDeceased: boolean;
  isAbsentee: boolean;
  isVacant: boolean;
  hasForeclosure: boolean;
  hasTaxLien: boolean;
  // Data freshness
  hasPhotos: boolean;            // existing street-level photos?
  prDataAgeHours?: number;       // hours since last PR pull
  attomDataAgeHours?: number;    // hours since last ATTOM pull
}

export interface OrchestrationPlan {
  tasks: AgentTask[];
  rationale: string[];           // human-readable reasons for each agent selection
  estimatedCost: number;         // rough $ estimate
  estimatedDurationMs: number;   // rough total time estimate
}

// ═══════════════════════════════════════════════════════════════════════
// Agent cost estimates (per call)
// ═══════════════════════════════════════════════════════════════════════

const AGENT_COSTS: Record<string, number> = {
  court_records: 0.001,
  obituary_probate: 0.001,
  social_media: 0.003,
  property_photos: 0.001,
  county_records: 0.001,
  propertyradar_navigator: 0.005,
  attom_navigator: 0.005,
};

const AGENT_DURATIONS_MS: Record<string, number> = {
  court_records: 30_000,
  obituary_probate: 25_000,
  social_media: 40_000,
  property_photos: 35_000,
  county_records: 30_000,
  propertyradar_navigator: 60_000,
  attom_navigator: 60_000,
};

// ═══════════════════════════════════════════════════════════════════════
// Main orchestrator
// ═══════════════════════════════════════════════════════════════════════

export function buildAgentPlan(ctx: PropertyContext): OrchestrationPlan {
  const tasks: AgentTask[] = [];
  const rationale: string[] = [];

  const payload: AgentPayload = {
    ownerName: ctx.ownerName,
    address: ctx.address,
    city: ctx.city,
    state: ctx.state,
    county: ctx.county,
    apn: ctx.apn,
    radarId: ctx.radarId,
    lat: ctx.lat,
    lng: ctx.lng,
    distressSignals: ctx.distressSignals,
  };

  // ── ALWAYS run: court records ──
  // Court filings are the highest-value signal — foreclosure dates, bankruptcy,
  // divorce, liens. County sites often have data 2-4 weeks ahead of vendors.
  tasks.push({ agentId: "court_records", payload });
  rationale.push("Court records: ALWAYS — highest-value distress signal source");

  // ── ALWAYS run: social media ──
  // LinkedIn relocations, Facebook life events, business registrations.
  // Uses Haiku for nuanced interpretation.
  tasks.push({ agentId: "social_media", payload });
  rationale.push("Social media: ALWAYS — owner profiling, relocation signals, life events");

  // ── CONDITIONAL: obituary/probate ──
  // Run if: deceased flag, probate signal, owner age >70, or estate-related signals
  if (
    ctx.isDeceased ||
    ctx.distressSignals.some(s => s.includes("probate") || s.includes("estate") || s.includes("deceased")) ||
    ctx.distressSignals.some(s => s.includes("inheritance"))
  ) {
    tasks.push({ agentId: "obituary_probate", payload });
    rationale.push("Obituary/Probate: triggered by deceased/probate/estate signal");
  }

  // ── CONDITIONAL: county records ──
  // Run if: foreclosure, tax lien, or any signal suggesting county-level filings
  if (
    ctx.hasForeclosure ||
    ctx.hasTaxLien ||
    ctx.distressSignals.some(s =>
      s.includes("lien") ||
      s.includes("code_violation") ||
      s.includes("permit") ||
      s.includes("lis_pendens")
    )
  ) {
    tasks.push({ agentId: "county_records", payload });
    rationale.push("County records: triggered by foreclosure/lien/code violation signal");
  }

  // ── CONDITIONAL: property photos ──
  // Run if we don't have street-level photos and we have coordinates
  if (!ctx.hasPhotos && (ctx.lat || ctx.lng)) {
    tasks.push({ agentId: "property_photos", payload });
    rationale.push("Property photos: no existing street-level photos, coordinates available");
  }

  // ── Future: PropertyRadar web navigator ──
  // Uncomment when SKILL.md is deployed on OpenClaw
  // if (ctx.prDataAgeHours != null && ctx.prDataAgeHours > 168) {
  //   tasks.push({ agentId: "propertyradar_navigator", payload });
  //   rationale.push("PR Navigator: PR data >7 days old, refreshing via web portal");
  // }

  // ── Future: ATTOM web navigator ──
  // Uncomment when SKILL.md is deployed on OpenClaw
  // if (ctx.attomDataAgeHours != null && ctx.attomDataAgeHours > 168) {
  //   tasks.push({ agentId: "attom_navigator", payload });
  //   rationale.push("ATTOM Navigator: ATTOM data >7 days old, refreshing via web portal");
  // }

  // Calculate cost and duration estimates
  const estimatedCost = tasks.reduce((sum, t) => sum + (AGENT_COSTS[t.agentId] ?? 0.001), 0);
  // Agents run in parallel, so duration = max single agent time
  const estimatedDurationMs = Math.max(...tasks.map(t => AGENT_DURATIONS_MS[t.agentId] ?? 30_000));

  return {
    tasks,
    rationale,
    estimatedCost,
    estimatedDurationMs,
  };
}

/**
 * Build a PropertyContext from the data available during deep-crawl.
 * This adapter converts the deep-crawl's existing data structures into
 * what the orchestrator needs.
 */
export function buildPropertyContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property: Record<string, any>,
  distressSignalTypes: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ownerFlags: Record<string, any>,
): PropertyContext {
  const prRaw = (ownerFlags.pr_raw ?? {}) as Record<string, unknown>;

  return {
    ownerName: property.owner_name ?? "Unknown",
    address: property.address ?? "",
    city: property.city ?? "",
    state: property.state ?? "",
    zip: property.zip ?? "",
    county: property.county ?? "",
    apn: property.apn ?? undefined,
    radarId: (ownerFlags.radar_id as string) ?? undefined,
    lat: property.lat != null ? Number(property.lat) : undefined,
    lng: property.lng != null ? Number(property.lng) : undefined,
    distressSignals: distressSignalTypes,
    isDeceased: !!(prRaw.OwnerDeceased || ownerFlags.deceased),
    isAbsentee: !!(ownerFlags.absentee || prRaw.Absentee || prRaw.isNotSameMailingOrExempt),
    isVacant: !!(ownerFlags.vacant || prRaw.isSiteVacant),
    hasForeclosure: distressSignalTypes.some(s => s.includes("foreclosure")),
    hasTaxLien: distressSignalTypes.some(s => s.includes("tax")),
    hasPhotos: !!(ownerFlags.deep_crawl?.photos?.length > 0),
    prDataAgeHours: ownerFlags.pr_raw_updated_at
      ? (Date.now() - new Date(ownerFlags.pr_raw_updated_at as string).getTime()) / 3600000
      : undefined,
  };
}
