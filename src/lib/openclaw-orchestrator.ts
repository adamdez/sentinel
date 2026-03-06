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
  // Owner intelligence
  ownerAge?: number;             // estimated age if known
  isLlcOwned: boolean;           // LLC/trust/corp ownership
  mailingDiffersFromProperty: boolean; // mailing address ≠ property address
  // Contact data state
  knownPhones: string[];         // existing phones from skip trace
  knownEmails: string[];         // existing emails from skip trace
  hasSkipTraced: boolean;        // has property been skip traced?
  hasDistressEvents: boolean;    // any existing distress_events?
  equityPercent?: number;        // equity % for hidden lien detection
  // Ownership timeline
  lastSaleDate?: string;         // date current owner purchased (filters pre-ownership records)
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
  contact_finder: 0.002,
  financial_distress: 0.003,
  heir_estate: 0.002,
  employment_relocation: 0.003,
  propertyradar_navigator: 0.005,
  attom_navigator: 0.005,
};

const AGENT_DURATIONS_MS: Record<string, number> = {
  court_records: 30_000,
  obituary_probate: 25_000,
  social_media: 40_000,
  property_photos: 35_000,
  county_records: 30_000,
  contact_finder: 35_000,
  financial_distress: 40_000,
  heir_estate: 35_000,
  employment_relocation: 30_000,
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
    lastSaleDate: ctx.lastSaleDate,
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

  // ── ALWAYS run: contact finder ──
  // Finds phones, emails, and decision-maker contacts that skip trace missed.
  // Especially valuable for LLC owners and heir contacts.
  const contactPayload = {
    ...payload,
    additionalContext: {
      knownPhones: ctx.knownPhones,
      knownEmails: ctx.knownEmails,
    },
  };
  tasks.push({ agentId: "contact_finder", payload: contactPayload });
  rationale.push("Contact finder: ALWAYS — phones, emails, LLC/heir contacts beyond skip trace");

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

  // ── CONDITIONAL: financial distress ──
  // Run if: any distress signal exists OR high equity (hidden liens kill deals)
  if (
    ctx.distressSignals.length > 0 ||
    (ctx.equityPercent != null && ctx.equityPercent > 50) ||
    ctx.hasForeclosure ||
    ctx.hasTaxLien
  ) {
    tasks.push({ agentId: "financial_distress", payload });
    rationale.push(
      ctx.distressSignals.length > 0
        ? `Financial distress: triggered by ${ctx.distressSignals.length} distress signal(s)`
        : "Financial distress: high equity — checking for hidden liens",
    );
  }

  // ── CONDITIONAL: heir/estate ──
  // Run if: deceased flag, probate signal, or owner age ≥ 70
  if (
    ctx.isDeceased ||
    (ctx.ownerAge != null && ctx.ownerAge >= 70) ||
    ctx.distressSignals.some(s =>
      s.includes("probate") || s.includes("estate") ||
      s.includes("deceased") || s.includes("inheritance")
    )
  ) {
    tasks.push({ agentId: "heir_estate", payload });
    rationale.push(
      ctx.isDeceased
        ? "Heir/Estate: owner deceased — finding heirs, executor, attorney"
        : ctx.ownerAge != null && ctx.ownerAge >= 70
          ? `Heir/Estate: owner age ${ctx.ownerAge} — pre-probate intelligence`
          : "Heir/Estate: probate/estate signal detected",
    );
  }

  // ── CONDITIONAL: employment/relocation ──
  // Run if: absentee owner or mailing differs from property
  if (ctx.isAbsentee || ctx.mailingDiffersFromProperty || ctx.isLlcOwned) {
    tasks.push({ agentId: "employment_relocation", payload });
    rationale.push(
      ctx.isAbsentee
        ? "Employment/Relocation: absentee owner — checking for job change, relocation"
        : ctx.isLlcOwned
          ? "Employment/Relocation: LLC-owned — finding actual owner location"
          : "Employment/Relocation: mailing differs from property — owner may have relocated",
    );
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

  // Extract known phones/emails for dedup
  const allPhones = Array.isArray(ownerFlags.all_phones)
    ? ownerFlags.all_phones
        .filter((p: unknown) => typeof p === "object" && p !== null && "number" in (p as Record<string, unknown>))
        .map((p: Record<string, unknown>) => String(p.number))
    : [];
  const allEmails = Array.isArray(ownerFlags.all_emails)
    ? ownerFlags.all_emails
        .filter((e: unknown) => typeof e === "object" && e !== null && "email" in (e as Record<string, unknown>))
        .map((e: Record<string, unknown>) => String(e.email))
    : [];

  // Detect LLC/trust ownership
  const ownerName = String(property.owner_name ?? "Unknown");
  const isLlcOwned = /\b(LLC|L\.L\.C|INC|CORP|TRUST|LP|LLP|PARTNERSHIP|HOLDINGS)\b/i.test(ownerName);

  // Check if mailing differs from property
  const mailingAddr = String(prRaw.MailingAddress ?? ownerFlags.mailing_address ?? "").toLowerCase();
  const propAddr = String(property.address ?? "").toLowerCase();
  const mailingDiffersFromProperty = !!(mailingAddr && propAddr && !mailingAddr.includes(propAddr.split(" ")[0]));

  // Owner age estimate (from PR raw data)
  const ownerAge = typeof prRaw.OwnerAge === "number"
    ? prRaw.OwnerAge
    : typeof prRaw.EstOwnerAge === "number"
      ? prRaw.EstOwnerAge
      : undefined;

  // Equity percent
  const avm = Number(prRaw.AVM ?? property.avm ?? 0);
  const totalLoans = Number(ownerFlags.total_loan_balance ?? prRaw.TotalLoanBalance ?? 0);
  const equityPercent = avm > 0 ? Math.round(((avm - totalLoans) / avm) * 100) : undefined;

  return {
    ownerName,
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
    ownerAge,
    isLlcOwned,
    mailingDiffersFromProperty,
    knownPhones: allPhones,
    knownEmails: allEmails,
    hasSkipTraced: !!ownerFlags.skip_traced,
    hasDistressEvents: distressSignalTypes.length > 0,
    equityPercent,
    lastSaleDate: (prRaw.LastDocSaleDate ?? prRaw.LastTransferRecDate ?? ownerFlags.last_sale_date) as string | undefined,
    hasPhotos: !!(ownerFlags.deep_crawl?.photos?.length > 0),
    prDataAgeHours: ownerFlags.pr_raw_updated_at
      ? (Date.now() - new Date(ownerFlags.pr_raw_updated_at as string).getTime()) / 3600000
      : undefined,
  };
}
