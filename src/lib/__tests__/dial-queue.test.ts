import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  hasCompletedSkipTrace,
  queueLeadIdsForUser,
  removeLeadFromDialQueue,
  runSkipTraceForQueuedLeads,
} from "@/lib/dial-queue";

const runSkipTraceIntelMock = vi.fn();

vi.mock("@/lib/skiptrace-intel", () => ({
  runSkipTraceIntel: (...args: unknown[]) => runSkipTraceIntelMock(...args),
}));

type LeadRow = Record<string, unknown>;

function createMockSb(rows: LeadRow[]) {
  const leads = rows;

  const buildSelectChain = (currentRows: LeadRow[]) => ({
    eq(column: string, value: unknown) {
      return buildSelectChain(currentRows.filter((row) => row[column] === value));
    },
    in(column: string, values: unknown[]) {
      return Promise.resolve({
        data: currentRows.filter((row) => values.includes(row[column])),
        error: null,
      });
    },
    order() {
      return Promise.resolve({ data: [...currentRows], error: null });
    },
    maybeSingle() {
      return Promise.resolve({ data: currentRows[0] ?? null, error: null });
    },
  });

  return {
    from(table: string) {
      if (table !== "leads" && table !== "dialer_events") {
        throw new Error(`Unexpected table ${table}`);
      }

      if (table === "dialer_events") {
        return {
          insert: async () => ({ error: null }),
        };
      }

      return {
        select() {
          return buildSelectChain(leads);
        },
        update(values: Record<string, unknown>) {
          let matchingRows = [...leads];
          const applyUpdate = () => {
            if (matchingRows.length === 0) {
              return { error: { message: "not found" } };
            }
            for (const row of matchingRows) {
              Object.assign(row, values);
            }
            return { error: null };
          };

          const chain = {
            eq(column: string, value: unknown) {
              matchingRows = matchingRows.filter((candidate) => candidate[column] === value);
              return chain;
            },
            in(column: string, ids: unknown[]) {
              matchingRows = matchingRows.filter((candidate) => ids.includes(candidate[column]));
              return chain;
            },
            or(expression: string) {
              const allowedAssignedTo = expression
                .split(",")
                .find((part) => part.startsWith("assigned_to.eq."))
                ?.slice("assigned_to.eq.".length);

              matchingRows = matchingRows.filter((candidate) => (
                candidate.assigned_to == null
                || (allowedAssignedTo != null && candidate.assigned_to === allowedAssignedTo)
              ));
              return chain;
            },
            async select() {
              const result = applyUpdate();
              return result.error
                ? { data: null, error: result.error }
                : {
                    data: matchingRows.map((row) => ({ id: String(row.id) })),
                    error: null,
                  };
            },
            then(onFulfilled: (value: { error: { message: string } | null }) => unknown, onRejected?: (reason: unknown) => unknown) {
              const result = applyUpdate();
              return Promise.resolve(result).then(onFulfilled, onRejected);
            },
          };

          return chain;
        },
        insert: async () => ({ error: null }),
      };
    },
  };
}

describe("dial queue service", () => {
  beforeEach(() => {
    runSkipTraceIntelMock.mockReset();
  });

  it("queues unclaimed leads, keeps my leads, and blocks already-owned leads", async () => {
    const sb = createMockSb([
      { id: "lead-1", assigned_to: null, dial_queue_active: false, property_id: "prop-1", status: "lead" },
      { id: "lead-2", assigned_to: "adam", dial_queue_active: false, property_id: "prop-2", status: "lead" },
      { id: "lead-3", assigned_to: "logan", dial_queue_active: false, property_id: "prop-3", status: "lead" },
    ]);

    const result = await queueLeadIdsForUser({
      sb: sb as never,
      userId: "adam",
      leadIds: ["lead-1", "lead-2", "lead-3"],
    });

    expect(result.queuedIds).toEqual(["lead-1", "lead-2"]);
    expect(result.conflictedIds).toEqual(["lead-3"]);
    expect(result.missingIds).toEqual([]);
  });

  it("falls back to assignment-only updates when dial queue columns are missing", async () => {
    const rows = [
      { id: "lead-1", assigned_to: null, property_id: "prop-1", status: "lead" },
    ];

    const sb = {
      from(table: string) {
        if (table !== "leads") throw new Error(`Unexpected table ${table}`);
        return {
          select() {
            return {
              in() {
                return Promise.resolve({ data: rows, error: null });
              },
            };
          },
          update(values: Record<string, unknown>) {
            let matchingRows = [...rows];
            return {
              in(column: string, ids: unknown[]) {
                matchingRows = matchingRows.filter((candidate) => ids.includes(candidate[column]));
                return this;
              },
              or() {
                return this;
              },
              async select() {
                if (matchingRows.length === 0) return { data: null, error: { message: "not found" } };
                if ("dial_queue_active" in values) {
                  return { data: null, error: { message: "column leads.dial_queue_active does not exist" } };
                }
                for (const row of matchingRows) {
                  Object.assign(row, values);
                }
                return {
                  data: matchingRows.map((row) => ({ id: String(row.id) })),
                  error: null,
                };
              },
            };
          },
        };
      },
    };

    const result = await queueLeadIdsForUser({
      sb: sb as never,
      userId: "adam",
      leadIds: ["lead-1"],
    });

    expect(result.queuedIds).toEqual(["lead-1"]);
    expect(rows[0]?.assigned_to).toBe("adam");
  });

  it("removes a lead from the dial queue without unassigning it", async () => {
    const row = {
      id: "lead-1",
      assigned_to: "adam",
      dial_queue_active: true,
      dial_queue_added_at: "2026-03-30T12:00:00.000Z",
      dial_queue_added_by: "adam",
    };
    const sb = createMockSb([row]);

    const result = await removeLeadFromDialQueue({
      sb: sb as never,
      leadId: "lead-1",
      userId: "adam",
    });

    expect(result).toBe("removed");
    expect(row.assigned_to).toBe("adam");
    expect(row.dial_queue_active).toBe(false);
    expect(row.dial_queue_added_at).toBeNull();
  });

  it("treats prior skip-trace flags as completed history", () => {
    expect(hasCompletedSkipTrace({ skipTraceStatus: "completed" })).toBe(true);
    expect(hasCompletedSkipTrace({ skipTraceStatus: "failed" })).toBe(false);
    expect(hasCompletedSkipTrace({ ownerFlags: { skip_trace_intel_at: "2026-03-30T12:00:00.000Z" } })).toBe(true);
    expect(hasCompletedSkipTrace({ ownerFlags: { skip_traced: true } })).toBe(true);
    expect(hasCompletedSkipTrace({ ownerFlags: { all_phones: [{ number: "+15095551234" }] } })).toBe(false);
  });

  it("runs queue skip trace only for leads without a prior completed trace", async () => {
    const sb = createMockSb([
      {
        id: "lead-1",
        property_id: "prop-1",
        assigned_to: "adam",
        dial_queue_active: true,
        skip_trace_status: "not_started",
        properties: { address: "123 Main", city: "Spokane", state: "WA", zip: "99201", owner_name: "A Owner", owner_flags: { all_phones: [{ number: "+15095551234" }] } },
      },
      {
        id: "lead-2",
        property_id: "prop-2",
        assigned_to: "adam",
        dial_queue_active: true,
        skip_trace_status: "completed",
        properties: { address: "999 Done", city: "Spokane", state: "WA", zip: "99201", owner_name: "B Owner", owner_flags: {} },
      },
      {
        id: "lead-3",
        property_id: "prop-3",
        assigned_to: "adam",
        dial_queue_active: true,
        skip_trace_status: "not_started",
        properties: { address: null, owner_flags: {} },
      },
    ]);

    runSkipTraceIntelMock.mockResolvedValue({
      ran: true,
      reason: "completed",
      phonesFound: 3,
      emailsFound: 1,
      newFactsCreated: 2,
      phonesPromoted: 2,
      saveFailures: 0,
      saveErrors: [],
      providers: ["batchdata"],
    });

    const summary = await runSkipTraceForQueuedLeads({
      sb: sb as never,
      userId: "adam",
    });

    expect(runSkipTraceIntelMock).toHaveBeenCalledTimes(1);
    expect(summary.checked).toBe(3);
    expect(summary.tracedNow).toBe(1);
    expect(summary.skippedAlreadyTraced).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.phonesSaved).toBe(2);
  });

  it("falls back when skip-trace state columns are missing but still traces queued leads", async () => {
    const rows = [
      {
        id: "lead-1",
        property_id: "prop-1",
        assigned_to: "adam",
        dial_queue_active: true,
        properties: { address: "123 Main", city: "Spokane", state: "WA", zip: "99201", owner_name: "A Owner", owner_flags: {} },
      },
    ];

    const sb = {
      from(table: string) {
        if (table !== "leads") throw new Error(`Unexpected table ${table}`);
        return {
          select(columns?: string) {
            const includesSkipTraceStatus = typeof columns === "string" && columns.includes("skip_trace_status");
            const buildChain = (currentRows: Array<Record<string, unknown>>) => ({
              eq(column: string, value: unknown) {
                return buildChain(currentRows.filter((row) => row[column] === value));
              },
              order() {
                if (includesSkipTraceStatus) {
                  return Promise.resolve({
                    data: null,
                    error: { message: "column leads.skip_trace_status does not exist", code: "42703" },
                  });
                }
                return Promise.resolve({ data: [...currentRows], error: null });
              },
            });

            return buildChain(rows);
          },
          update() {
            return {
              eq() {
                return { error: null };
              },
            };
          },
        };
      },
    };

    runSkipTraceIntelMock.mockResolvedValue({
      ran: true,
      reason: "completed",
      phonesFound: 2,
      emailsFound: 0,
      newFactsCreated: 1,
      phonesPromoted: 2,
      saveFailures: 0,
      saveErrors: [],
      providers: ["tracerfy"],
    });

    const summary = await runSkipTraceForQueuedLeads({
      sb: sb as never,
      userId: "adam",
    });

    expect(runSkipTraceIntelMock).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({
      checked: 1,
      tracedNow: 1,
      skippedAlreadyTraced: 0,
      failed: 0,
      phonesSaved: 2,
    });
  });

  it("continues queue skip trace when one lead throws unexpectedly", async () => {
    const sb = createMockSb([
      {
        id: "lead-1",
        property_id: "prop-1",
        assigned_to: "adam",
        dial_queue_active: true,
        skip_trace_status: "not_started",
        properties: { address: "123 Main", city: "Spokane", state: "WA", zip: "99201", owner_name: "A Owner", owner_flags: {} },
      },
      {
        id: "lead-2",
        property_id: "prop-2",
        assigned_to: "adam",
        dial_queue_active: true,
        skip_trace_status: "not_started",
        properties: { address: "999 Oak", city: "Spokane", state: "WA", zip: "99201", owner_name: "B Owner", owner_flags: {} },
      },
    ]);

    runSkipTraceIntelMock.mockImplementation(async ({ leadId }: { leadId: string }) => {
      if (leadId === "lead-1") {
        throw new Error("artifact write failed");
      }
      return {
        ran: true,
        reason: "completed",
        phonesFound: 2,
        emailsFound: 0,
        newFactsCreated: 1,
        phonesPromoted: 1,
        saveFailures: 0,
        saveErrors: [],
        providers: ["tracerfy"],
      };
    });

    const summary = await runSkipTraceForQueuedLeads({
      sb: sb as never,
      userId: "adam",
    });

    expect(runSkipTraceIntelMock).toHaveBeenCalledTimes(2);
    expect(summary.checked).toBe(2);
    expect(summary.tracedNow).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.phonesSaved).toBe(1);
    expect(summary.details.some((detail) => detail.reason === "artifact write failed")).toBe(true);
  });
});
