import { randomUUID } from "crypto";

import { normalizeCounty } from "@/lib/dedup";
import { createServerClient } from "@/lib/supabase";

export interface LeadSourceCleanupFilter {
  statuses: string[];
  sources: string[];
}

export interface LeadSourceCleanupSummary {
  totalLeads: number;
  totalProperties: number;
  leadIds: string[];
  propertyIds: string[];
  orphanPropertyIds: string[];
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  bySourceStatus: Record<string, number>;
  stateCountyDrift: Array<{
    state: string;
    county: string;
    count: number;
  }>;
}

export interface LeadSourceCleanupSnapshot {
  schemaVersion: 1;
  snapshotId: string;
  filter: LeadSourceCleanupFilter;
  summary: LeadSourceCleanupSummary;
  leads: Record<string, unknown>[];
  properties: Record<string, unknown>[];
  distressEvents: Record<string, unknown>[];
  scoringRecords: Record<string, unknown>[];
  scoringPredictions: Record<string, unknown>[];
}

export interface LeadSourceCleanupExecuteResult {
  snapshotId: string;
  summary: LeadSourceCleanupSummary;
  deletedLeadIds: string[];
  skippedLeadIds: string[];
  deletedProperties: number;
}

interface BulkDeleteResult {
  deletedLeadIds: string[];
  skippedLeadIds: string[];
  deletedProperties: number;
}

const PROPERTY_REFERENCE_TABLES = [
  "deals",
  "calls_log",
  "lead_phones",
  "dossiers",
  "dossier_artifacts",
  "research_runs",
  "recorded_documents",
] as const;

const COUNTY_STATE_MAP: Record<string, string> = {
  asotin: "WA",
  benewah: "ID",
  bonner: "ID",
  clearwater: "ID",
  flathead: "MT",
  kootenai: "ID",
  latah: "ID",
  lincoln: "WA",
  mineral: "MT",
  missoula: "MT",
  "nez perce": "ID",
  okanogan: "WA",
  "pend oreille": "WA",
  sanders: "MT",
  shoshone: "ID",
  spokane: "WA",
  stevens: "WA",
  whitman: "WA",
};

function expectedStateForCounty(county: string | null | undefined): string | null {
  if (!county) return null;
  return COUNTY_STATE_MAP[normalizeCounty(county).toLowerCase()] ?? null;
}

function buildSummary(
  leads: Array<Record<string, unknown>>,
  properties: Array<Record<string, unknown>>,
  orphanPropertyIds: string[],
): LeadSourceCleanupSummary {
  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const bySourceStatus: Record<string, number> = {};
  const driftCounts: Record<string, { state: string; county: string; count: number }> = {};
  const leadIds = leads
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string");
  const propertyIds = properties
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string");

  for (const row of leads) {
    const status = typeof row.status === "string" ? row.status : "unknown";
    const source = typeof row.source === "string" ? row.source : "unknown";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    bySource[source] = (bySource[source] ?? 0) + 1;
    bySourceStatus[`${status}::${source}`] = (bySourceStatus[`${status}::${source}`] ?? 0) + 1;
  }

  for (const property of properties) {
    const state = typeof property.state === "string" ? property.state.toUpperCase() : "";
    const county = typeof property.county === "string" ? normalizeCounty(property.county) : "";
    const expectedState = expectedStateForCounty(county);
    if (state && county && expectedState && state !== expectedState) {
      const key = `${state}::${county}`;
      driftCounts[key] = driftCounts[key] ?? { state, county, count: 0 };
      driftCounts[key].count += 1;
    }
  }

  return {
    totalLeads: leads.length,
    totalProperties: properties.length,
    leadIds,
    propertyIds,
    orphanPropertyIds,
    byStatus,
    bySource,
    bySourceStatus,
    stateCountyDrift: Object.values(driftCounts).sort((a, b) => b.count - a.count),
  };
}

async function bulkDeleteLeadIds(
  sb: ReturnType<typeof createServerClient>,
  leadIds: string[],
): Promise<BulkDeleteResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rpcData, error: rpcErr } = await (sb as any).rpc("delete_customer_files", {
    p_lead_ids: leadIds,
  });

  if (rpcErr) {
    throw new Error(rpcErr.message);
  }

  const result = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData;
  if (!result || result.success === false) {
    throw new Error(result?.error ?? "Lead cleanup delete failed");
  }

  return {
    deletedLeadIds: Array.isArray(result.deleted_lead_ids) ? result.deleted_lead_ids : [],
    skippedLeadIds: Array.isArray(result.skipped_lead_ids) ? result.skipped_lead_ids : [],
    deletedProperties: typeof result.deleted_properties === "number" ? result.deleted_properties : 0,
  };
}

async function collectProtectedPropertyIds(
  sb: ReturnType<typeof createServerClient>,
  propertyIds: string[],
  targetedLeadIds: string[],
): Promise<Set<string>> {
  const protectedIds = new Set<string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: remainingLeadRows, error: remainingLeadError } = await (sb.from("leads") as any)
    .select("id, property_id")
    .in("property_id", propertyIds);

  if (remainingLeadError) {
    throw new Error(remainingLeadError.message);
  }

  for (const row of (remainingLeadRows ?? []) as Array<{ id?: string | null; property_id?: string | null }>) {
    if (!row.property_id) continue;
    if (row.id && targetedLeadIds.includes(row.id)) continue;
    protectedIds.add(row.property_id);
  }

  const referenceResults = await Promise.all(
    PROPERTY_REFERENCE_TABLES.map(async (tableName) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (sb.from(tableName) as any).select("property_id").in("property_id", propertyIds);
    }),
  );

  for (const result of referenceResults) {
    if (result.error) {
      throw new Error(result.error.message);
    }

    for (const row of (result.data ?? []) as Array<{ property_id?: string | null }>) {
      if (row.property_id) {
        protectedIds.add(row.property_id);
      }
    }
  }

  return protectedIds;
}

export async function collectLeadSourceCleanupSnapshot(
  sb: ReturnType<typeof createServerClient>,
  filter: LeadSourceCleanupFilter,
): Promise<LeadSourceCleanupSnapshot> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leadsData, error: leadsError } = await (sb.from("leads") as any)
    .select("*")
    .in("status", filter.statuses)
    .in("source", filter.sources)
    .order("created_at", { ascending: true });

  if (leadsError) {
    throw new Error(leadsError.message);
  }

  const leads = (leadsData ?? []) as Array<Record<string, unknown>>;
  const leadIds = leads
    .map((row) => row.id)
    .filter((value): value is string => typeof value === "string");
  const propertyIds = Array.from(new Set(
    leads
      .map((row) => row.property_id)
      .filter((value): value is string => typeof value === "string")
  ));

  let properties: Record<string, unknown>[] = [];
  let orphanPropertyIds: string[] = [];
  let distressEvents: Record<string, unknown>[] = [];
  let scoringRecords: Record<string, unknown>[] = [];
  let scoringPredictions: Record<string, unknown>[] = [];

  if (propertyIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: propertiesData, error: propertiesError } = await (sb.from("properties") as any)
      .select("*")
      .in("id", propertyIds);

    if (propertiesError) {
      throw new Error(propertiesError.message);
    }

    properties = (propertiesData ?? []) as Record<string, unknown>[];
    const protectedPropertyIds = await collectProtectedPropertyIds(sb, propertyIds, leadIds);
    orphanPropertyIds = propertyIds.filter((propertyId) => !protectedPropertyIds.has(propertyId));

    if (orphanPropertyIds.length > 0) {
      const [
        distressEventsResult,
        scoringRecordsResult,
        scoringPredictionsResult,
      ] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.from("distress_events") as any).select("*").in("property_id", orphanPropertyIds),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.from("scoring_records") as any).select("*").in("property_id", orphanPropertyIds),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb.from("scoring_predictions") as any).select("*").in("property_id", orphanPropertyIds),
      ]);

      if (distressEventsResult.error) throw new Error(distressEventsResult.error.message);
      if (scoringRecordsResult.error) throw new Error(scoringRecordsResult.error.message);
      if (scoringPredictionsResult.error) throw new Error(scoringPredictionsResult.error.message);

      distressEvents = (distressEventsResult.data ?? []) as Record<string, unknown>[];
      scoringRecords = (scoringRecordsResult.data ?? []) as Record<string, unknown>[];
      scoringPredictions = (scoringPredictionsResult.data ?? []) as Record<string, unknown>[];
    }
  }

  return {
    schemaVersion: 1,
    snapshotId: randomUUID(),
    filter,
    summary: buildSummary(leads, properties, orphanPropertyIds),
    leads,
    properties,
    distressEvents,
    scoringRecords,
    scoringPredictions,
  };
}

export async function persistLeadSourceCleanupSnapshot(
  sb: ReturnType<typeof createServerClient>,
  snapshot: LeadSourceCleanupSnapshot,
  executedBy: string | null,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("lead_cleanup_snapshots") as any)
    .insert({
      cleanup_run_id: snapshot.snapshotId,
      filter: snapshot.filter,
      summary: snapshot.summary,
      snapshot,
      status: "snapshotted",
      executed_by: executedBy,
      executed_at: new Date().toISOString(),
    })
    .select("id, cleanup_run_id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to persist cleanup snapshot");
  }

  return data.cleanup_run_id ?? data.id;
}

export async function markLeadSourceCleanupExecuted(
  sb: ReturnType<typeof createServerClient>,
  cleanupRunId: string,
  payload: BulkDeleteResult,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("lead_cleanup_snapshots") as any)
    .update({
      status: "executed",
      execution_result: {
        deletedLeadIds: payload.deletedLeadIds,
        skippedLeadIds: payload.skippedLeadIds,
        deletedProperties: payload.deletedProperties,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("cleanup_run_id", cleanupRunId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function executeLeadSourceCleanup(
  sb: ReturnType<typeof createServerClient>,
  filter: LeadSourceCleanupFilter,
  executedBy: string | null,
): Promise<LeadSourceCleanupExecuteResult> {
  const snapshot = await collectLeadSourceCleanupSnapshot(sb, filter);
  const cleanupRunId = await persistLeadSourceCleanupSnapshot(sb, snapshot, executedBy);

  if (snapshot.summary.totalLeads === 0) {
    await markLeadSourceCleanupExecuted(sb, cleanupRunId, {
      deletedLeadIds: [],
      skippedLeadIds: [],
      deletedProperties: 0,
    });
    return {
      snapshotId: cleanupRunId,
      summary: snapshot.summary,
      deletedLeadIds: [],
      skippedLeadIds: [],
      deletedProperties: 0,
    };
  }

  const deleteResult = await bulkDeleteLeadIds(sb, snapshot.summary.leadIds);
  await markLeadSourceCleanupExecuted(sb, cleanupRunId, deleteResult);

  return {
    snapshotId: cleanupRunId,
    summary: snapshot.summary,
    deletedLeadIds: deleteResult.deletedLeadIds,
    skippedLeadIds: deleteResult.skippedLeadIds,
    deletedProperties: deleteResult.deletedProperties,
  };
}

export async function restoreLeadSourceCleanup(
  sb: ReturnType<typeof createServerClient>,
  cleanupRunId: string,
  restoredBy: string | null,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("lead_cleanup_snapshots") as any)
    .select("*")
    .eq("cleanup_run_id", cleanupRunId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Cleanup snapshot not found");
  }

  const snapshot = data.snapshot as LeadSourceCleanupSnapshot | null;
  if (!snapshot) {
    throw new Error("Cleanup snapshot payload missing");
  }

  const properties = Array.isArray(snapshot.properties) ? snapshot.properties : [];
  const distressEvents = Array.isArray(snapshot.distressEvents) ? snapshot.distressEvents : [];
  const scoringRecords = Array.isArray(snapshot.scoringRecords) ? snapshot.scoringRecords : [];
  const scoringPredictions = Array.isArray(snapshot.scoringPredictions) ? snapshot.scoringPredictions : [];
  const leads = Array.isArray(snapshot.leads) ? snapshot.leads : [];

  if (properties.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: propertyError } = await (sb.from("properties") as any)
      .upsert(properties, { onConflict: "id" });
    if (propertyError) throw new Error(propertyError.message);
  }

  if (distressEvents.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: distressError } = await (sb.from("distress_events") as any)
      .upsert(distressEvents, { onConflict: "id" });
    if (distressError) throw new Error(distressError.message);
  }

  if (scoringRecords.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: scoringRecordsError } = await (sb.from("scoring_records") as any)
      .upsert(scoringRecords, { onConflict: "id" });
    if (scoringRecordsError) throw new Error(scoringRecordsError.message);
  }

  if (scoringPredictions.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: scoringPredictionsError } = await (sb.from("scoring_predictions") as any)
      .upsert(scoringPredictions, { onConflict: "id" });
    if (scoringPredictionsError) throw new Error(scoringPredictionsError.message);
  }

  if (leads.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: leadError } = await (sb.from("leads") as any)
      .upsert(leads, { onConflict: "id" });
    if (leadError) throw new Error(leadError.message);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (sb.from("lead_cleanup_snapshots") as any)
    .update({
      status: "restored",
      restored_by: restoredBy,
      restored_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("cleanup_run_id", cleanupRunId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    cleanupRunId,
    restoredLeads: leads.length,
    restoredProperties: properties.length,
    restoredDistressEvents: distressEvents.length,
    restoredScoringRecords: scoringRecords.length,
    restoredScoringPredictions: scoringPredictions.length,
  };
}
