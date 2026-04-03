import { normalizeCounty } from "@/lib/dedup";
import { getBlockedLeadSourceTags } from "@/lib/lead-ingest-policy";
import { createServerClient } from "@/lib/supabase";

export const HIDDEN_LEAD_STATUSES = ["staging", "prospect"] as const;
export const HIDDEN_LEAD_SOURCES = ["craigslist", "EliteSeed_Top10_20260301"] as const;

type HiddenLeadStatus = (typeof HIDDEN_LEAD_STATUSES)[number];

export interface HiddenLeadBucketRow {
  id: string;
  status: string | null;
  source: string | null;
  assigned_to: string | null;
  next_action: string | null;
  property_id: string | null;
  properties: {
    state: string | null;
    county: string | null;
  } | null;
}

export interface HiddenLeadBucketDrift {
  state: string;
  county: string;
  expectedState: string;
  count: number;
}

export interface HiddenLeadBucketAudit {
  totalHiddenLeads: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  bySourceStatus: Record<string, number>;
  blockedSourceRows: number;
  blockedSourceLeadIds: string[];
  missingNextActionRows: number;
  stateCountyDrift: HiddenLeadBucketDrift[];
}

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

export function expectedStateForCounty(county: string | null | undefined): string | null {
  if (!county) return null;
  return COUNTY_STATE_MAP[normalizeCounty(county).toLowerCase()] ?? null;
}

export function buildHiddenLeadBucketAudit(
  rows: HiddenLeadBucketRow[],
  blockedSources = getBlockedLeadSourceTags(),
): HiddenLeadBucketAudit {
  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const bySourceStatus: Record<string, number> = {};
  const driftCounts: Record<string, HiddenLeadBucketDrift> = {};
  const blockedSourceLeadIds: string[] = [];
  let missingNextActionRows = 0;

  for (const row of rows) {
    const status = row.status ?? "unknown";
    const source = row.source ?? "unknown";
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    bySource[source] = (bySource[source] ?? 0) + 1;
    bySourceStatus[`${status}::${source}`] = (bySourceStatus[`${status}::${source}`] ?? 0) + 1;

    if (!row.next_action) {
      missingNextActionRows += 1;
    }

    if (blockedSources.includes(source)) {
      blockedSourceLeadIds.push(row.id);
    }

    const state = (row.properties?.state ?? "").toUpperCase();
    const county = normalizeCounty(row.properties?.county ?? "");
    const expectedState = expectedStateForCounty(county);
    if (state && county && expectedState && state !== expectedState) {
      const key = `${state}::${county}::${expectedState}`;
      driftCounts[key] = driftCounts[key] ?? {
        state,
        county,
        expectedState,
        count: 0,
      };
      driftCounts[key].count += 1;
    }
  }

  return {
    totalHiddenLeads: rows.length,
    byStatus,
    bySource,
    bySourceStatus,
    blockedSourceRows: blockedSourceLeadIds.length,
    blockedSourceLeadIds,
    missingNextActionRows,
    stateCountyDrift: Object.values(driftCounts).sort((a, b) => b.count - a.count),
  };
}

export async function loadHiddenLeadBucketAudit(
  sb: ReturnType<typeof createServerClient>,
  statuses: HiddenLeadStatus[] = [...HIDDEN_LEAD_STATUSES],
): Promise<HiddenLeadBucketAudit> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("leads") as any)
    .select("id, status, source, assigned_to, next_action, property_id, properties(state, county)")
    .in("status", statuses);

  if (error) {
    throw new Error(error.message);
  }

  return buildHiddenLeadBucketAudit((data ?? []) as HiddenLeadBucketRow[]);
}
