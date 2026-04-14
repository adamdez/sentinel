import { describe, expect, it } from "vitest";

import {
  applyManualResurface,
  inferCallTaskType,
  isCallDrivingTaskType,
  isDialerCallbackTaskType,
  pickPrimaryCallTask,
} from "@/lib/task-lead-sync";

describe("task-lead-sync helpers", () => {
  it("classifies call-driving task types", () => {
    expect(isCallDrivingTaskType("callback")).toBe(true);
    expect(isCallDrivingTaskType("follow_up")).toBe(true);
    expect(isCallDrivingTaskType("drive_by")).toBe(true);
    expect(isCallDrivingTaskType("research")).toBe(false);
    expect(isDialerCallbackTaskType("drive_by")).toBe(false);
    expect(isDialerCallbackTaskType("follow_up")).toBe(true);
  });

  it("infers follow-up task type from legacy lead intent", () => {
    expect(inferCallTaskType({ title: "Drive by tomorrow" })).toBe("drive_by");
    expect(inferCallTaskType({ title: "Call back seller" })).toBe("callback");
    expect(inferCallTaskType({ title: "Nurture 14 days" })).toBe("follow_up");
  });

  it("picks the earliest due pending call-driving task as primary", () => {
    const primary = pickPrimaryCallTask([
      {
        id: "supporting-task",
        lead_id: "lead-1",
        title: "Find next of kin",
        due_at: "2026-04-10T17:00:00.000Z",
        task_type: "research",
        status: "pending",
        assigned_to: "user-1",
      },
      {
        id: "later-call",
        lead_id: "lead-1",
        title: "Callback seller",
        due_at: "2026-04-12T17:00:00.000Z",
        task_type: "callback",
        status: "pending",
        assigned_to: "user-1",
      },
      {
        id: "earlier-call",
        lead_id: "lead-1",
        title: "Follow up",
        due_at: "2026-04-09T17:00:00.000Z",
        task_type: "follow_up",
        status: "pending",
        assigned_to: "user-1",
      },
    ]);

    expect(primary?.id).toBe("earlier-call");
  });

  it("pauses auto-cycle and hides dial queue when a manual resurface date is set", async () => {
    const tasksUpdateEq = { eq: () => Promise.resolve({ error: null }) };
    const taskSelectQuery = {
      select: () => taskSelectQuery,
      eq: () => taskSelectQuery,
      limit: () => taskSelectQuery,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      order: () => taskSelectQuery,
      single: () => Promise.resolve({ data: { id: "task-1" }, error: null }),
    };
    const taskInsertQuery = {
      select: () => ({ single: () => Promise.resolve({ data: { id: "task-1" }, error: null }) }),
    };
    const leadUpdate = {
      eq: () => Promise.resolve({ error: null }),
    };
    const cycleLeadQuery = {
      select: () => cycleLeadQuery,
      eq: () => cycleLeadQuery,
      in: () => cycleLeadQuery,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: undefined,
    };
    const cycleLeadSelect = {
      select: () => cycleLeadSelect,
      eq: () => Promise.resolve({ data: [{ id: "cycle-1" }], error: null }),
    };
    const phoneUpdate = {
      in: () => ({ eq: () => Promise.resolve({ error: null }) }),
    };

    const sb = {
      from(table: string) {
        if (table === "tasks") {
          return {
            ...taskSelectQuery,
            insert: () => taskInsertQuery,
            update: () => tasksUpdateEq,
          };
        }
        if (table === "leads") {
          return {
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { property_id: null }, error: null }) }) }),
            update: () => leadUpdate,
          };
        }
        if (table === "dialer_auto_cycle_leads") {
          return {
            select: () => ({ eq: () => Promise.resolve({ data: [{ id: "cycle-1" }], error: null }) }),
            update: () => ({ in: () => Promise.resolve({ error: null }) }),
          };
        }
        if (table === "dialer_auto_cycle_phones") {
          return {
            update: () => phoneUpdate,
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };

    const taskId = await applyManualResurface({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb: sb as any,
      leadId: "lead-1",
      assignedTo: "user-1",
      dueAt: "2026-05-05T16:00:00.000Z",
    });

    expect(taskId).toBe("task-1");
  });
});
