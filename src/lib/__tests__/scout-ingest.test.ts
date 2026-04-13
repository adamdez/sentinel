import { describe, expect, it } from "vitest";
import {
  applyScoutIngestionPolicy,
  type ScoutIngestionContract,
} from "@/lib/scout-ingest";

type Row = Record<string, unknown>;

function createMockSb() {
  const properties: Row[] = [];
  const leads: Row[] = [];
  const eventLog: Row[] = [];

  const tableFor = (name: string) => {
    if (name === "properties") return properties;
    if (name === "leads") return leads;
    if (name === "event_log") return eventLog;
    throw new Error(`Unexpected table: ${name}`);
  };

  const sb = {
    tables: { properties, leads, eventLog },
    from(table: string) {
      const rows = tableFor(table);
      const selectChain = (currentRows: Row[]) => ({
        eq(column: string, value: unknown) {
          return selectChain(currentRows.filter((row) => row[column] === value));
        },
        in(column: string, values: unknown[]) {
          return selectChain(currentRows.filter((row) => values.includes(row[column])));
        },
        order(_column: string, _opts?: unknown) {
          return selectChain([...currentRows]);
        },
        maybeSingle: async () => ({ data: currentRows[0] ?? null, error: null }),
        single: async () => ({ data: currentRows[0] ?? null, error: null }),
      });

      return {
        select() {
          return selectChain(rows);
        },
        insert(payload: Row | Row[]) {
          const inserted = Array.isArray(payload) ? payload : [payload];
          inserted.forEach((row) => {
            const next = { ...row };
            if (!next.id) next.id = `${table}-${rows.length + 1}`;
            rows.push(next);
          });

          return {
            select() {
              return {
                single: async () => ({ data: rows[rows.length - 1], error: null }),
              };
            },
            then(onFulfilled: (value: { error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
              return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
            },
          };
        },
        update(values: Row) {
          let targetRows = [...rows];
          const chain = {
            eq(column: string, value: unknown) {
              targetRows = targetRows.filter((row) => row[column] === value);
              for (const row of targetRows) Object.assign(row, values);
              return Promise.resolve({ error: null });
            },
          };
          return chain;
        },
      };
    },
  };

  return sb;
}

function baseContract(overrides: Partial<ScoutIngestionContract> = {}): ScoutIngestionContract {
  return {
    source_system: "spokane_scout_crawler",
    source_run_id: "run-1",
    source_record_id: "record-1",
    ingest_mode: "create",
    property: {
      apn: "12345.0001",
      county: "spokane",
      address: "123 Main St",
      city: "Spokane",
      state: "WA",
      zip: "99201",
    },
    owner_name: "Alice Owner",
    scout_data: {
      last_sale_date: "2019-06-15",
    },
    ...overrides,
  };
}

describe("applyScoutIngestionPolicy", () => {
  it("creates property + lead once, then idempotently enriches on repeat", async () => {
    const sb = createMockSb();

    const first = await applyScoutIngestionPolicy(sb as never, baseContract());
    expect(first.ok).toBe(true);
    expect(first.ingest_status).toBe("created");
    expect(first.entity_ids.property_id).toBeTruthy();
    expect(first.entity_ids.lead_id).toBeTruthy();
    expect(sb.tables.properties).toHaveLength(1);
    expect(sb.tables.leads).toHaveLength(1);

    const second = await applyScoutIngestionPolicy(sb as never, baseContract({ source_record_id: "record-2" }));
    expect(second.ok).toBe(true);
    expect(second.ingest_status).toBe("enriched");
    expect(sb.tables.properties).toHaveLength(1);
    expect(sb.tables.leads).toHaveLength(1);
  });

  it("returns skipped when enrich mode has no matching property", async () => {
    const sb = createMockSb();
    const result = await applyScoutIngestionPolicy(sb as never, baseContract({
      ingest_mode: "enrich",
      source_record_id: "record-enrich-miss",
    }));

    expect(result.ok).toBe(false);
    expect(result.ingest_status).toBe("skipped");
    expect(result.failure_reason).toBe("missing_property_for_enrich");
  });

  it("skips Spokane Scout create payloads below the 5-payment tax threshold", async () => {
    const sb = createMockSb();
    const result = await applyScoutIngestionPolicy(sb as never, baseContract({
      source_record_id: "record-below-threshold",
      tax_signals: {
        tax_years_owing: [
          { year: new Date().getFullYear() - 1, owing: 1200 },
        ],
        current_annual_taxes: 2000,
        total_tax_owed: 1800,
      },
    }));

    expect(result.ok).toBe(true);
    expect(result.ingest_status).toBe("skipped");
    expect(result.failure_reason).toBe("below_tax_threshold_5_payments");
    expect(sb.tables.properties).toHaveLength(0);
    expect(sb.tables.leads).toHaveLength(0);
  });

  it("skips Spokane Scout create payloads missing a last sale date", async () => {
    const sb = createMockSb();
    const result = await applyScoutIngestionPolicy(sb as never, baseContract({
      source_record_id: "record-missing-sale-date",
      scout_data: {},
      tax_signals: {
        tax_years_owing: [
          { year: new Date().getFullYear() - 2, owing: 1200 },
          { year: new Date().getFullYear() - 1, owing: 1200 },
        ],
        current_annual_taxes: 2000,
        total_tax_owed: 5600,
      },
    }));

    expect(result.ok).toBe(true);
    expect(result.ingest_status).toBe("skipped");
    expect(result.failure_reason).toBe("missing_last_sale_date_for_pre2021_gate");
    expect(sb.tables.properties).toHaveLength(0);
    expect(sb.tables.leads).toHaveLength(0);
  });

  it("skips Spokane Scout create payloads when ownership started in 2021 or later", async () => {
    const sb = createMockSb();
    const result = await applyScoutIngestionPolicy(sb as never, baseContract({
      source_record_id: "record-recent-owner",
      scout_data: {
        last_sale_date: "2021-01-01",
      },
      tax_signals: {
        tax_years_owing: [
          { year: new Date().getFullYear() - 2, owing: 1200 },
          { year: new Date().getFullYear() - 1, owing: 1200 },
        ],
        current_annual_taxes: 2000,
        total_tax_owed: 5600,
      },
    }));

    expect(result.ok).toBe(true);
    expect(result.ingest_status).toBe("skipped");
    expect(result.failure_reason).toBe("recent_owner_after_2020_cutoff");
    expect(sb.tables.properties).toHaveLength(0);
    expect(sb.tables.leads).toHaveLength(0);
  });

  it("keeps Spokane Scout create payloads when owed amount implies 5+ missed payments", async () => {
    const sb = createMockSb();
    const result = await applyScoutIngestionPolicy(sb as never, baseContract({
      source_record_id: "record-five-payments",
      tax_signals: {
        tax_years_owing: [
          { year: new Date().getFullYear() - 2, owing: 1200 },
          { year: new Date().getFullYear() - 1, owing: 1200 },
        ],
        current_annual_taxes: 2000,
        total_tax_owed: 5600,
      },
    }));

    expect(result.ok).toBe(true);
    expect(result.ingest_status).toBe("created");
    expect(result.failure_reason).toBeNull();
    expect(sb.tables.properties).toHaveLength(1);
    expect(sb.tables.leads).toHaveLength(1);
    expect((sb.tables.leads[0]?.tags as string[] | undefined) ?? []).toContain("tax_lien");
  });

  it("merges owner_flags safely without clobbering existing scout blocks", async () => {
    const sb = createMockSb();
    sb.tables.properties.push({
      id: "prop-1",
      apn: "12345.0001",
      county: "spokane county",
      address: "123 Main St",
      city: "Spokane",
      state: "WA",
      zip: "99201",
      owner_name: "Alice Owner",
      owner_flags: {
        custom_key: "keep-me",
        scout_data: { oldField: "present" },
      },
    });
    sb.tables.leads.push({
      id: "lead-1",
      property_id: "prop-1",
      status: "prospect",
    });

    const result = await applyScoutIngestionPolicy(sb as never, baseContract({
      ingest_mode: "enrich",
      source_record_id: "record-merge",
      scout_data: { newField: "added" },
      county_data: { assessed: 100000 },
    }));

    expect(result.ok).toBe(true);
    expect(result.ingest_status).toBe("enriched");

    const updated = sb.tables.properties[0] as Row;
    const flags = (updated.owner_flags ?? {}) as Record<string, unknown>;
    expect(flags.custom_key).toBe("keep-me");
    expect((flags.scout_data as Record<string, unknown>).oldField).toBe("present");
    expect((flags.scout_data as Record<string, unknown>).newField).toBe("added");
    expect((flags.county_data as Record<string, unknown>).assessed).toBe(100000);
  });

  it("does not apply the pre-2021 ownership gate during enrich mode", async () => {
    const sb = createMockSb();
    sb.tables.properties.push({
      id: "prop-1",
      apn: "12345.0001",
      county: "spokane county",
      address: "123 Main St",
      city: "Spokane",
      state: "WA",
      zip: "99201",
      owner_name: "Alice Owner",
      owner_flags: {},
    });
    sb.tables.leads.push({
      id: "lead-1",
      property_id: "prop-1",
      status: "prospect",
    });

    const result = await applyScoutIngestionPolicy(sb as never, baseContract({
      ingest_mode: "enrich",
      source_record_id: "record-enrich-recent-owner",
      scout_data: {
        last_sale_date: "2024-02-10",
      },
    }));

    expect(result.ok).toBe(true);
    expect(result.ingest_status).toBe("enriched");
    expect(result.failure_reason).toBeNull();
  });
});
