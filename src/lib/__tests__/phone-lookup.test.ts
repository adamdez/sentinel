import { describe, expect, it } from "vitest";
import { searchPhoneCandidates } from "@/lib/dialer/phone-lookup";

type QueryState = {
  eq: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
  ilike?: [string, string];
  not?: [string, string, unknown];
  order?: [string, boolean];
  limit?: number;
  or?: string;
};

type Dataset = {
  contacts?: Array<Record<string, unknown>>;
  lead_phones?: Array<Record<string, unknown>>;
  properties?: Array<Record<string, unknown>>;
  intake_leads?: Array<Record<string, unknown>>;
  calls_log?: Array<Record<string, unknown>>;
  call_sessions?: Array<Record<string, unknown>>;
  sms_messages?: Array<Record<string, unknown>>;
  dialer_auto_cycle_phones?: Array<Record<string, unknown>>;
  leads?: Array<Record<string, unknown>>;
};

function matchesIlike(value: unknown, pattern?: string) {
  if (!pattern) return true;
  const haystack = String(value ?? "");
  return haystack.toLowerCase().includes(pattern.replace(/%/g, "").toLowerCase());
}

function createSupabaseDouble(dataset: Dataset) {
  return {
    from(table: string) {
      const state: QueryState = { eq: [], in: [] };
      const builder = {
        select() {
          return builder;
        },
        eq(field: string, value: unknown) {
          state.eq.push([field, value]);
          return builder;
        },
        in(field: string, values: unknown[]) {
          state.in.push([field, values]);
          return builder;
        },
        ilike(field: string, pattern: string) {
          state.ilike = [field, pattern];
          return builder;
        },
        not(field: string, op: string, value: unknown) {
          state.not = [field, op, value];
          return builder;
        },
        order(field: string, options?: { ascending?: boolean }) {
          state.order = [field, options?.ascending ?? true];
          return builder;
        },
        limit(value: number) {
          state.limit = value;
          return builder;
        },
        or(value: string) {
          state.or = value;
          return builder;
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve(resolveQuery(table, state, dataset)).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

function resolveQuery(table: string, state: QueryState, dataset: Dataset) {
  let rows = [...((dataset[table as keyof Dataset] as Array<Record<string, unknown>> | undefined) ?? [])];

  for (const [field, value] of state.eq) {
    rows = rows.filter((row) => row[field] === value);
  }

  for (const [field, values] of state.in) {
    rows = rows.filter((row) => values.includes(row[field]));
  }

  if (state.not) {
    const [field, op, value] = state.not;
    if (op === "is" && value === null) {
      rows = rows.filter((row) => row[field] != null);
    }
  }

  if (state.ilike) {
    const [field, pattern] = state.ilike;
    rows = rows.filter((row) => matchesIlike(row[field], pattern));
  }

  if (state.order) {
    const [field, ascending] = state.order;
    rows.sort((a, b) => {
      const left = new Date(String(a[field] ?? 0)).getTime();
      const right = new Date(String(b[field] ?? 0)).getTime();
      return ascending ? left - right : right - left;
    });
  }

  if (typeof state.limit === "number") {
    rows = rows.slice(0, state.limit);
  }

  return { data: rows, error: null };
}

describe("searchPhoneCandidates", () => {
  it("finds last-4 matches that only exist in lead_phones", async () => {
    const sb = createSupabaseDouble({
      lead_phones: [
        { phone: "+15095551234", lead_id: "lead-1", status: "active" },
      ],
      leads: [
        { id: "lead-1", property_id: "property-1" },
      ],
      properties: [
        { id: "property-1", owner_name: "Linda Example", address: "2302 S Davis Ct" },
      ],
    });

    const results = await searchPhoneCandidates("1234", sb as never, { limit: 5 });

    expect(results[0]).toMatchObject({
      leadId: "lead-1",
      matchSource: "lead_phones",
      matchReason: "Direct phone",
      ownerName: "Linda Example",
      propertyAddress: "2302 S Davis Ct",
    });
  });

  it("finds last-4 matches that only exist in calls_log history", async () => {
    const sb = createSupabaseDouble({
      calls_log: [
        { lead_id: "lead-2", phone_dialed: "+15097771234", created_at: "2026-04-09T20:00:00.000Z" },
      ],
      leads: [
        { id: "lead-2", property_id: "property-2" },
      ],
      properties: [
        { id: "property-2", owner_name: "Clay Nickoloff", address: "10008 S Unknown Ave" },
      ],
    });

    const results = await searchPhoneCandidates("1234", sb as never, { limit: 5 });

    expect(results[0]).toMatchObject({
      leadId: "lead-2",
      matchSource: "calls_log",
      matchReason: "Historical call",
      ownerName: "Clay Nickoloff",
      propertyAddress: "10008 S Unknown Ave",
    });
  });

  it("keeps the strongest direct 7+ digit match ahead of historical candidates", async () => {
    const sb = createSupabaseDouble({
      lead_phones: [
        { phone: "+15095551234", lead_id: "lead-1", status: "active" },
      ],
      calls_log: [
        { lead_id: "lead-2", phone_dialed: "+15095551234", created_at: "2026-04-09T21:00:00.000Z" },
      ],
      leads: [
        { id: "lead-1", property_id: "property-1" },
        { id: "lead-2", property_id: "property-2" },
      ],
      properties: [
        { id: "property-1", owner_name: "Direct Match", address: "1 Main St", owner_phone: "+15095551234", leads: [{ id: "lead-1" }] },
        { id: "property-2", owner_name: "Historical Match", address: "2 Main St" },
      ],
    });

    const results = await searchPhoneCandidates("5095551234", sb as never, { limit: 5 });

    expect(results[0]).toMatchObject({
      leadId: "lead-1",
      matchReason: "Direct phone",
    });
    expect(results.some((result) => result.leadId === "lead-2" && result.matchReason === "Historical call")).toBe(true);
  });
});
