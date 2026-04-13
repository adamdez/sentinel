import { describe, expect, it } from "vitest";
import {
  classifyActiveWork,
  isDialReadyActiveWork,
  isNonDialingNextActionText,
  resolveLeadDueAt,
} from "@/lib/active-work";

describe("active-work helpers", () => {
  const now = new Date("2026-04-13T18:00:00.000Z");

  it("prefers next_action_due_at when resolving due time", () => {
    expect(resolveLeadDueAt({
      nextActionDueAt: "2026-04-14T16:00:00.000Z",
      nextCallScheduledAt: "2026-04-15T16:00:00.000Z",
    })).toBe("2026-04-14T16:00:00.000Z");
  });

  it("flags missing ownership or next-step discipline as broken", () => {
    expect(classifyActiveWork({
      assignedTo: "user-1",
      nextAction: "",
      nextActionDueAt: "2026-04-14T16:00:00.000Z",
    }, now)).toBe("broken");
  });

  it("marks overdue work as call_now", () => {
    expect(classifyActiveWork({
      assignedTo: "user-1",
      nextAction: "Call seller about tenant timeline",
      nextActionDueAt: "2026-04-13T16:00:00.000Z",
    }, now)).toBe("call_now");
  });

  it("marks later-today work as due_today", () => {
    expect(classifyActiveWork({
      assignedTo: "user-1",
      nextAction: "Call seller after work",
      nextActionDueAt: "2026-04-13T23:30:00.000Z",
    }, now)).toBe("due_today");
  });

  it("marks old untouched files as stale when they are not already due now", () => {
    expect(classifyActiveWork({
      assignedTo: "user-1",
      nextAction: "Call seller next week",
      nextActionDueAt: "2026-04-20T18:00:00.000Z",
      lastContactAt: "2026-04-01T18:00:00.000Z",
    }, now)).toBe("stale");
  });

  it("treats deep dive and drive by as non-dialing work", () => {
    expect(isNonDialingNextActionText("Drive by tomorrow")).toBe(true);
    expect(isNonDialingNextActionText("Deep dive title issue")).toBe(true);
  });

  it("only treats due or stale dialing work as queue-ready", () => {
    expect(isDialReadyActiveWork({
      assignedTo: "user-1",
      nextAction: "Call seller",
      nextActionDueAt: "2026-04-13T16:00:00.000Z",
    }, now)).toBe(true);

    expect(isDialReadyActiveWork({
      assignedTo: "user-1",
      nextAction: "Drive by tomorrow",
      nextActionDueAt: "2026-04-13T16:00:00.000Z",
    }, now)).toBe(false);

    expect(isDialReadyActiveWork({
      assignedTo: "user-1",
      nextAction: "Call seller next week",
      nextActionDueAt: "2026-04-20T18:00:00.000Z",
    }, now)).toBe(false);
  });
});
