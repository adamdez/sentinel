import { resolveMarket } from "@/lib/market-resolver";

type SupabaseClientLike = {
  from: (table: string) => any;
};

export type ScoutIngestMode = "create" | "enrich";
export type ScoutIngestStatus = "created" | "enriched" | "skipped" | "failed";

export interface ScoutNormalizedAddress {
  address: string;
  city: string;
  state: string;
  zip: string;
  apn?: string | null;
  county?: string | null;
}

export interface ScoutIngestionContract {
  source_system: string;
  source_run_id: string;
  source_record_id: string;
  ingest_mode: ScoutIngestMode;
  property: ScoutNormalizedAddress;
  owner_name?: string | null;
  county_data?: Record<string, unknown> | null;
  scout_data?: Record<string, unknown> | null;
  photos?: Array<{ url: string; source?: string; capturedAt?: string }>;
  buyer_signals?: Record<string, unknown> | null;
  tax_signals?: Record<string, unknown> | null;
}

export interface ScoutWriteResultEnvelope {
  ok: boolean;
  ingest_status: ScoutIngestStatus;
  persisted_updates: number;
  failure_reason: string | null;
  entity_ids: {
    property_id: string | null;
    lead_id: string | null;
  };
}

type PropertyRow = {
  id: string;
  apn: string | null;
  county: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  owner_name: string | null;
  owner_flags: Record<string, unknown> | null;
};

function normalizeCountyInput(input: string | null | undefined): string {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) return "";
  return raw.endsWith("county") ? raw : `${raw} county`;
}

function normalizeAddressValue(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function canCreateProperty(input: ScoutIngestionContract): boolean {
  const hasAddress = Boolean(input.property.address && input.property.city && input.property.state);
  const hasApn = Boolean(input.property.apn && input.property.county);
  return hasAddress || hasApn;
}

function isSpokaneScoutSource(sourceSystem: string): boolean {
  const normalized = sourceSystem.trim().toLowerCase();
  return normalized.includes("spokane") && normalized.includes("scout");
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getScoutPriorDelinquentYears(taxSignals: Record<string, unknown> | null | undefined): number | null {
  if (!taxSignals) return null;

  const directCount = taxSignals.prior_delinquent_years ?? taxSignals.priorDelinquentYears ?? taxSignals.delinquent_years;
  const normalizedDirectCount = numberFromUnknown(directCount);
  if (normalizedDirectCount != null) {
    return Math.max(0, Math.trunc(normalizedDirectCount));
  }

  const taxYears = taxSignals.tax_years_owing;
  if (!Array.isArray(taxYears)) return null;

  const currentYear = new Date().getFullYear();
  return taxYears.filter((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const row = entry as { year?: unknown; owing?: unknown };
    const year = Number(row.year);
    const owing = Number(row.owing);
    return Number.isFinite(year) && year < currentYear && Number.isFinite(owing) && owing > 0;
  }).length;
}

function estimateScoutMissedPayments(taxSignals: Record<string, unknown> | null | undefined): number | null {
  if (!taxSignals) return null;

  const priorDelinquentYears = getScoutPriorDelinquentYears(taxSignals) ?? 0;
  const explicitPaymentsBehind = Math.max(priorDelinquentYears * 2, 0);

  const totalTaxOwed =
    numberFromUnknown(taxSignals.total_tax_owed) ??
    numberFromUnknown(taxSignals.totalTaxOwed) ??
    numberFromUnknown(taxSignals.total_charges_owing) ??
    numberFromUnknown(taxSignals.totalChargesOwing) ??
    numberFromUnknown(taxSignals.current_remaining_charges_owing) ??
    numberFromUnknown(taxSignals.currentRemainingChargesOwing) ??
    numberFromUnknown(taxSignals.amount_owed) ??
    numberFromUnknown(taxSignals.amountOwed);
  const annualTaxes =
    numberFromUnknown(taxSignals.current_annual_taxes) ??
    numberFromUnknown(taxSignals.currentAnnualTaxes) ??
    numberFromUnknown(taxSignals.annual_taxes) ??
    numberFromUnknown(taxSignals.annualTaxes);

  if (totalTaxOwed != null && annualTaxes != null && annualTaxes > 0) {
    const perPaymentAmount = annualTaxes / 2;
    if (perPaymentAmount > 0) {
      const estimatedPayments = Math.max(Math.floor(totalTaxOwed / perPaymentAmount), 0);
      return Math.max(explicitPaymentsBehind, estimatedPayments);
    }
  }

  return explicitPaymentsBehind > 0 ? explicitPaymentsBehind : null;
}

function mergePhotos(
  existing: unknown,
  incoming: ScoutIngestionContract["photos"] | undefined,
): Array<{ url: string; source: string; capturedAt: string }> {
  const result: Array<{ url: string; source: string; capturedAt: string }> = [];
  const seen = new Set<string>();
  const base = Array.isArray(existing) ? existing : [];
  const next = Array.isArray(incoming) ? incoming : [];

  for (const item of [...base, ...next]) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as { url?: unknown; source?: unknown; capturedAt?: unknown };
    const url = typeof candidate.url === "string" ? candidate.url.trim() : "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({
      url,
      source: typeof candidate.source === "string" && candidate.source.trim() ? candidate.source : "spokane_scout",
      capturedAt: typeof candidate.capturedAt === "string" && candidate.capturedAt.trim()
        ? candidate.capturedAt
        : new Date().toISOString(),
    });
  }

  return result;
}

async function logScoutIngestEvent(
  sb: SupabaseClientLike,
  contract: ScoutIngestionContract,
  result: ScoutWriteResultEnvelope,
): Promise<void> {
  const details = {
    source_system: contract.source_system,
    source_run_id: contract.source_run_id,
    source_record_id: contract.source_record_id,
    ingest_mode: contract.ingest_mode,
    ingest_status: result.ingest_status,
    failure_reason: result.failure_reason,
    entity_ids: result.entity_ids,
    persisted_updates: result.persisted_updates,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    entity_type: "scout_ingest",
    entity_id: contract.source_record_id,
    action: "SCOUT_INGEST",
    user_id: null,
    details,
  });
}

async function findPropertyByIdentity(
  sb: SupabaseClientLike,
  input: ScoutIngestionContract,
): Promise<PropertyRow | null> {
  const county = normalizeCountyInput(input.property.county);
  const apn = (input.property.apn ?? "").trim();

  if (apn && county) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb.from("properties") as any)
      .select("id, apn, county, address, city, state, zip, owner_name, owner_flags")
      .eq("apn", apn)
      .eq("county", county)
      .maybeSingle();
    if (data) return data as PropertyRow;
  }

  const address = normalizeAddressValue(input.property.address);
  const city = normalizeAddressValue(input.property.city);
  const state = normalizeAddressValue(input.property.state);
  const zip = (input.property.zip ?? "").replace(/\D/g, "").slice(0, 5);

  if (!address || !city || !state) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("properties") as any)
    .select("id, apn, county, address, city, state, zip, owner_name, owner_flags")
    .eq("address", input.property.address)
    .eq("city", input.property.city)
    .eq("state", input.property.state)
    .eq("zip", zip || input.property.zip)
    .maybeSingle();
  return (data ?? null) as PropertyRow | null;
}

async function createProperty(
  sb: SupabaseClientLike,
  input: ScoutIngestionContract,
): Promise<PropertyRow | null> {
  const county = normalizeCountyInput(input.property.county);
  const ownerFlags: Record<string, unknown> = {
    scout_ingest: {
      source_system: input.source_system,
      source_run_id: input.source_run_id,
      source_record_id: input.source_record_id,
      ingest_mode: input.ingest_mode,
      ingest_status: "created",
      last_ingested_at: new Date().toISOString(),
    },
  };

  if (input.county_data) ownerFlags.county_data = input.county_data;
  if (input.scout_data) ownerFlags.scout_data = input.scout_data;
  if (input.photos && input.photos.length > 0) ownerFlags.photos = mergePhotos([], input.photos);
  if (input.tax_signals) ownerFlags.scout_tax_signals = input.tax_signals;
  if (input.buyer_signals) ownerFlags.scout_buyer_signals = input.buyer_signals;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("properties") as any)
    .insert({
      apn: input.property.apn ?? null,
      county: county || null,
      address: input.property.address,
      city: input.property.city,
      state: input.property.state,
      zip: input.property.zip,
      owner_name: input.owner_name ?? null,
      owner_flags: ownerFlags,
      updated_at: new Date().toISOString(),
    })
    .select("id, apn, county, address, city, state, zip, owner_name, owner_flags")
    .single();

  return (data ?? null) as PropertyRow | null;
}

async function findActiveLeadForProperty(
  sb: SupabaseClientLike,
  propertyId: string,
): Promise<{ id: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("leads") as any)
    .select("id")
    .eq("property_id", propertyId)
    .in("status", ["staging", "prospect", "lead", "negotiation", "nurture"])
    .order("created_at", { ascending: true })
    .maybeSingle();
  return (data ?? null) as { id: string } | null;
}

async function createLeadForProperty(
  sb: SupabaseClientLike,
  propertyId: string,
  sourceSystem: string,
  county: string | null | undefined,
): Promise<{ id: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("leads") as any)
    .insert({
      property_id: propertyId,
      status: "prospect",
      source: sourceSystem,
      priority: 1,
      market: resolveMarket(county ?? ""),
      notes: `Scout ingest create path (${sourceSystem})`,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return (data ?? null) as { id: string } | null;
}

export async function applyScoutIngestionPolicy(
  sb: SupabaseClientLike,
  contract: ScoutIngestionContract,
): Promise<ScoutWriteResultEnvelope> {
  const fail = async (reason: string, entityIds?: ScoutWriteResultEnvelope["entity_ids"]) => {
    const result: ScoutWriteResultEnvelope = {
      ok: false,
      ingest_status: reason.startsWith("missing_") ? "skipped" : "failed",
      persisted_updates: 0,
      failure_reason: reason,
      entity_ids: entityIds ?? { property_id: null, lead_id: null },
    };
    await logScoutIngestEvent(sb, contract, result);
    return result;
  };

  const skip = async (reason: string, entityIds?: ScoutWriteResultEnvelope["entity_ids"]) => {
    const result: ScoutWriteResultEnvelope = {
      ok: true,
      ingest_status: "skipped",
      persisted_updates: 0,
      failure_reason: reason,
      entity_ids: entityIds ?? { property_id: null, lead_id: null },
    };
    await logScoutIngestEvent(sb, contract, result);
    return result;
  };

  if (!contract.source_system || !contract.source_run_id || !contract.source_record_id) {
    return fail("missing_required_source_metadata");
  }

  if (!contract.property?.address && !contract.property?.apn) {
    return fail("missing_property_identity");
  }

  if (contract.ingest_mode === "create" && isSpokaneScoutSource(contract.source_system)) {
    const missedPayments = estimateScoutMissedPayments(contract.tax_signals);
    if (missedPayments != null && missedPayments < 5) {
      return skip("below_tax_threshold_5_payments");
    }
  }

  let property = await findPropertyByIdentity(sb, contract);
  let persisted = 0;
  let leadId: string | null = null;
  let status: ScoutIngestStatus = "enriched";

  if (!property) {
    if (contract.ingest_mode !== "create") {
      return fail("missing_property_for_enrich");
    }
    if (!canCreateProperty(contract)) {
      return fail("missing_required_fields_for_create");
    }
    property = await createProperty(sb, contract);
    if (!property) {
      return fail("property_create_failed");
    }
    persisted++;
    status = "created";
  }

  const existingFlags = (property.owner_flags ?? {}) as Record<string, unknown>;
  const ownerFlags: Record<string, unknown> = {
    ...existingFlags,
    scout_ingest: {
      source_system: contract.source_system,
      source_run_id: contract.source_run_id,
      source_record_id: contract.source_record_id,
      ingest_mode: contract.ingest_mode,
      ingest_status: status,
      failure_reason: null,
      last_ingested_at: new Date().toISOString(),
    },
    scout_ingest_lineage: {
      ...((existingFlags.scout_ingest_lineage as Record<string, unknown>) ?? {}),
      [contract.source_record_id]: {
        source_system: contract.source_system,
        source_run_id: contract.source_run_id,
        ingested_at: new Date().toISOString(),
      },
    },
  };

  if (contract.county_data) {
    ownerFlags.county_data = {
      ...((existingFlags.county_data as Record<string, unknown>) ?? {}),
      ...contract.county_data,
    };
    ownerFlags.county_data_at = new Date().toISOString();
  }

  if (contract.scout_data) {
    ownerFlags.scout_data = {
      ...((existingFlags.scout_data as Record<string, unknown>) ?? {}),
      ...contract.scout_data,
    };
    ownerFlags.scout_data_at = new Date().toISOString();
  }

  if (contract.tax_signals) {
    ownerFlags.scout_tax_signals = {
      ...((existingFlags.scout_tax_signals as Record<string, unknown>) ?? {}),
      ...contract.tax_signals,
    };
  }

  if (contract.buyer_signals) {
    ownerFlags.scout_buyer_signals = {
      ...((existingFlags.scout_buyer_signals as Record<string, unknown>) ?? {}),
      ...contract.buyer_signals,
    };
  }

  if (contract.photos && contract.photos.length > 0) {
    ownerFlags.photos = mergePhotos(existingFlags.photos, contract.photos);
    ownerFlags.photos_fetched_at = new Date().toISOString();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: propUpdateError } = await (sb.from("properties") as any)
    .update({
      apn: contract.property.apn ?? property.apn ?? null,
      county: normalizeCountyInput(contract.property.county) || property.county || null,
      address: contract.property.address || property.address || null,
      city: contract.property.city || property.city || null,
      state: contract.property.state || property.state || null,
      zip: contract.property.zip || property.zip || null,
      owner_name: contract.owner_name ?? property.owner_name ?? null,
      owner_flags: ownerFlags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", property.id);

  if (propUpdateError) {
    return fail(`property_update_failed:${propUpdateError.message}`, { property_id: property.id, lead_id: null });
  }
  persisted++;

  const activeLead = await findActiveLeadForProperty(sb, property.id);
  if (activeLead) {
    leadId = activeLead.id;
  } else if (contract.ingest_mode === "create") {
    const createdLead = await createLeadForProperty(sb, property.id, contract.source_system, contract.property.county);
    if (createdLead) {
      leadId = createdLead.id;
      persisted++;
      status = "created";
    } else {
      return fail("lead_create_failed", { property_id: property.id, lead_id: null });
    }
  } else {
    status = "skipped";
    const skippedResult: ScoutWriteResultEnvelope = {
      ok: true,
      ingest_status: status,
      persisted_updates: persisted,
      failure_reason: "missing_lead_for_enrich",
      entity_ids: { property_id: property.id, lead_id: null },
    };
    await logScoutIngestEvent(sb, contract, skippedResult);
    return skippedResult;
  }

  const result: ScoutWriteResultEnvelope = {
    ok: true,
    ingest_status: status,
    persisted_updates: persisted,
    failure_reason: null,
    entity_ids: { property_id: property.id, lead_id: leadId },
  };
  await logScoutIngestEvent(sb, contract, result);
  return result;
}
