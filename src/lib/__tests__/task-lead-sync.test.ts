import { describe, expect, it } from "vitest";

import {
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
});
