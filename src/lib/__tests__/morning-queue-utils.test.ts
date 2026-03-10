import { describe, expect, it } from "vitest";
import { classifyQueueDueWork } from "@/lib/morning-queue-utils";

describe("morning queue due-work classification", () => {
  it("marks overdue from next_follow_up_at when next_call_scheduled_at is null", () => {
    const now = new Date("2026-03-10T12:00:00.000Z");
    const result = classifyQueueDueWork({
      now,
      leads: [
        {
          id: "lead-1",
          status: "lead",
          next_follow_up_at: "2026-03-10T08:00:00.000Z",
          next_call_scheduled_at: null,
        },
      ],
      tasks: [],
    });

    expect(result.overdueLeadIds.has("lead-1")).toBe(true);
  });

  it("marks overdue from legacy follow_up_date when newer follow-up fields are empty", () => {
    const now = new Date("2026-03-10T12:00:00.000Z");
    const result = classifyQueueDueWork({
      now,
      leads: [
        {
          id: "lead-legacy",
          status: "lead",
          next_follow_up_at: null,
          next_call_scheduled_at: null,
          follow_up_date: "2026-03-10T06:00:00.000Z",
        },
      ],
      tasks: [],
    });

    expect(result.overdueLeadIds.has("lead-legacy")).toBe(true);
  });

  it("marks due-today from pending task due_at even when lead has no follow-up fields", () => {
    const now = new Date("2026-03-10T12:00:00.000Z");
    const result = classifyQueueDueWork({
      now,
      leads: [
        {
          id: "lead-2",
          status: "negotiation",
          next_follow_up_at: null,
          next_call_scheduled_at: null,
        },
      ],
      tasks: [
        {
          id: "task-1",
          lead_id: "lead-2",
          due_at: "2026-03-10T18:00:00.000Z",
          status: "pending",
        },
      ],
    });

    expect(result.dueTodayLeadIds.has("lead-2")).toBe(true);
  });

  it("marks overdue from next_call_scheduled_at when next_follow_up_at is empty", () => {
    const now = new Date("2026-03-10T12:00:00.000Z");
    const result = classifyQueueDueWork({
      now,
      leads: [
        {
          id: "lead-call",
          status: "prospect",
          next_follow_up_at: null,
          next_call_scheduled_at: "2026-03-10T07:00:00.000Z",
        },
      ],
      tasks: [],
    });

    expect(result.overdueLeadIds.has("lead-call")).toBe(true);
  });

  it("ignores tasks linked to dead/closed leads", () => {
    const now = new Date("2026-03-10T12:00:00.000Z");
    const result = classifyQueueDueWork({
      now,
      leads: [
        {
          id: "lead-3",
          status: "dead",
          next_follow_up_at: null,
          next_call_scheduled_at: null,
        },
      ],
      tasks: [
        {
          id: "task-2",
          lead_id: "lead-3",
          due_at: "2026-03-10T09:00:00.000Z",
          status: "pending",
        },
      ],
    });

    expect(result.overdueLeadIds.has("lead-3")).toBe(false);
    expect(result.dueTodayLeadIds.has("lead-3")).toBe(false);
  });
});
