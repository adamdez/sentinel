import { describe, expect, it } from "vitest";

import { ensureAutoCycleEnrollmentForQueuedLeads } from "@/lib/dialer/auto-cycle-enrollment";

type TableRows = Record<string, unknown>[];

function createEnrollmentSb(input: {
  leads: TableRows;
  leadPhones: TableRows;
  cycleLeads?: TableRows;
  insertedCycleLeads?: TableRows;
}) {
  const leads = input.leads;
  const leadPhones = input.leadPhones;
  const cycleLeads = input.cycleLeads ?? [];
  const insertedCycleLeads = input.insertedCycleLeads ?? [];
  const insertedCyclePhoneRows: TableRows = [];

  return {
    insertedCyclePhoneRows,
    sb: {
      from(table: string) {
        if (table === "leads") {
          return {
            select() {
              let rows = [...leads];
              const chain = {
                in(column: string, values: unknown[]) {
                  rows = rows.filter((row) => values.includes(row[column]));
                  return chain;
                },
                eq(column: string, value: unknown) {
                  rows = rows.filter((row) => row[column] === value);
                  return Promise.resolve({ data: rows, error: null });
                },
              };
              return chain;
            },
          };
        }

        if (table === "lead_phones") {
          return {
            select() {
              let rows = [...leadPhones];
              const chain = {
                in(column: string, values: unknown[]) {
                  rows = rows.filter((row) => values.includes(row[column]));
                  return chain;
                },
                eq(column: string, value: unknown) {
                  rows = rows.filter((row) => row[column] === value);
                  return chain;
                },
                order() {
                  return chain;
                },
                then(onFulfilled: (value: { data: TableRows; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
                  return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
                },
              };
              return chain;
            },
          };
        }

        if (table === "dialer_auto_cycle_leads") {
          return {
            select() {
              let rows = [...cycleLeads];
              const chain = {
                in(column: string, values: unknown[]) {
                  rows = rows.filter((row) => values.includes(row[column]));
                  return chain;
                },
                eq(column: string, value: unknown) {
                  rows = rows.filter((row) => row[column] === value);
                  return Promise.resolve({ data: rows, error: null });
                },
              };
              return chain;
            },
            insert(values: Record<string, unknown>[]) {
              return {
                select() {
                  const inserted = values.map((value, index) => ({
                    id: `cycle-${index + 1}`,
                    lead_id: value.lead_id,
                    ...(insertedCycleLeads[index] ?? {}),
                  }));
                  return Promise.resolve({ data: inserted, error: null });
                },
              };
            },
          };
        }

        if (table === "dialer_auto_cycle_phones") {
          return {
            insert(values: Record<string, unknown>[]) {
              insertedCyclePhoneRows.push(...values);
              return Promise.resolve({ error: null });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    },
  };
}

describe("ensureAutoCycleEnrollmentForQueuedLeads", () => {
  it("enrolls newly queued prospect and lead files with active phones", async () => {
    const { sb, insertedCyclePhoneRows } = createEnrollmentSb({
      leads: [
        { id: "lead-1", status: "lead", assigned_to: "user-1", properties: { owner_phone: "+15095550000" } },
        { id: "lead-2", status: "prospect", assigned_to: "user-1", properties: { owner_phone: "+15095550001" } },
      ],
      leadPhones: [
        { id: "phone-1", lead_id: "lead-1", phone: "+15095551111", position: 0, status: "active" },
        { id: "phone-2", lead_id: "lead-2", phone: "+15095552222", position: 1, status: "active" },
      ],
    });

    const result = await ensureAutoCycleEnrollmentForQueuedLeads({
      sb: sb as never,
      userId: "user-1",
      leadIds: ["lead-1", "lead-2"],
      now: new Date("2026-04-13T18:00:00.000Z"),
    });

    expect(result.enrolledIds).toEqual(["lead-1", "lead-2"]);
    expect(insertedCyclePhoneRows).toHaveLength(2);
    expect(insertedCyclePhoneRows[0]).toMatchObject({
      lead_id: "lead-1",
      phone_id: "phone-1",
      next_due_at: "2026-04-13T18:00:00.000Z",
    });
  });

  it("skips files that already have auto-cycle state or are not auto-cycle eligible", async () => {
    const { sb, insertedCyclePhoneRows } = createEnrollmentSb({
      leads: [
        { id: "lead-1", status: "lead", assigned_to: "user-1", properties: { owner_phone: "+15095550000" } },
        { id: "lead-2", status: "active", assigned_to: "user-1", properties: { owner_phone: "+15095550001" } },
      ],
      leadPhones: [
        { id: "phone-1", lead_id: "lead-1", phone: "+15095551111", position: 0, status: "active" },
      ],
      cycleLeads: [
        { id: "cycle-existing", lead_id: "lead-1", user_id: "user-1" },
      ],
    });

    const result = await ensureAutoCycleEnrollmentForQueuedLeads({
      sb: sb as never,
      userId: "user-1",
      leadIds: ["lead-1", "lead-2"],
      now: new Date("2026-04-13T18:00:00.000Z"),
    });

    expect(result.enrolledIds).toEqual([]);
    expect(insertedCyclePhoneRows).toEqual([]);
  });
});
