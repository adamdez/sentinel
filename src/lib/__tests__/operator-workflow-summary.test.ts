import { describe, expect, it } from "vitest";
import { buildOperatorWorkflowSummary } from "@/components/sentinel/operator-workflow-summary";

const NOW = new Date("2026-04-09T19:30:00Z");

function buildSummary(overrides: Partial<Parameters<typeof buildOperatorWorkflowSummary>[0]> = {}) {
  return buildOperatorWorkflowSummary({
    status: "lead",
    qualificationRoute: null,
    assignedTo: "user-1",
    nextCallScheduledAt: null,
    nextFollowUpAt: null,
    lastContactAt: null,
    totalCalls: 0,
    nextAction: null,
    nextActionDueAt: null,
    createdAt: "2026-04-08T16:00:00Z",
    promotedAt: "2026-04-08T16:00:00Z",
    introSopActive: true,
    introDayCount: 0,
    introLastCallDate: null,
    requiresIntroExitCategory: false,
    now: NOW,
    ...overrides,
  });
}

describe("buildOperatorWorkflowSummary intro flow", () => {
  it("renders untouched intro leads as day 1 due today", () => {
    const summary = buildSummary();

    expect(summary.introBadgeLabel).toBe("Day 1/3");
    expect(summary.doNow).toBe("Call day 1/3");
    expect(summary.dueLabel).toBe("Due today");
    expect(summary.lastTouchLabel).toBe("No touch");
  });

  it("keeps same-day first-pass leads on day 1 and done for today", () => {
    const summary = buildSummary({
      introDayCount: 1,
      introLastCallDate: "2026-04-09",
      lastContactAt: "2026-04-09T18:00:00Z",
      totalCalls: 1,
    });

    expect(summary.introBadgeLabel).toBe("Day 1/3");
    expect(summary.doNow).toBe("Done for today");
    expect(summary.dueLabel).toBe("Due tomorrow");
    expect(summary.lastTouchLabel).toBe("Today");
  });

  it("advances to day 2 when yesterday was day 1", () => {
    const summary = buildSummary({
      introDayCount: 1,
      introLastCallDate: "2026-04-08",
      lastContactAt: "2026-04-08T18:00:00Z",
      totalCalls: 1,
    });

    expect(summary.introBadgeLabel).toBe("Day 2/3");
    expect(summary.doNow).toBe("Call day 2/3");
    expect(summary.dueLabel).toBe("Due today");
    expect(summary.lastTouchLabel).toBe("Yesterday");
  });

  it("advances to day 3 when yesterday was day 2", () => {
    const summary = buildSummary({
      introDayCount: 2,
      introLastCallDate: "2026-04-08",
      lastContactAt: "2026-04-08T18:00:00Z",
      totalCalls: 2,
    });

    expect(summary.introBadgeLabel).toBe("Day 3/3");
    expect(summary.doNow).toBe("Call day 3/3");
    expect(summary.dueLabel).toBe("Due today");
  });

  it("renders category-required intro leads as day 3 complete", () => {
    const summary = buildSummary({
      introSopActive: false,
      introDayCount: 3,
      introLastCallDate: "2026-04-09",
      requiresIntroExitCategory: true,
      lastContactAt: "2026-04-09T18:00:00Z",
      totalCalls: 3,
    });

    expect(summary.introBadgeLabel).toBe("Day 3 complete");
    expect(summary.doNow).toBe("Choose category");
    expect(summary.dueLabel).toBe("Now");
    expect(summary.lastTouchLabel).toBe("Today");
  });

  it("preserves generic next-step behavior for non-intro leads", () => {
    const summary = buildOperatorWorkflowSummary({
      status: "lead",
      qualificationRoute: null,
      assignedTo: "user-1",
      nextCallScheduledAt: null,
      nextFollowUpAt: null,
      lastContactAt: "2026-04-09T18:00:00Z",
      totalCalls: 1,
      nextAction: null,
      nextActionDueAt: null,
      createdAt: "2026-04-08T16:00:00Z",
      promotedAt: "2026-04-08T16:00:00Z",
      introSopActive: false,
      introDayCount: 1,
      introLastCallDate: "2026-04-09",
      requiresIntroExitCategory: false,
      now: NOW,
    });

    expect(summary.introBadgeLabel).toBeNull();
    expect(summary.doNow).toBe("Needs next step");
    expect(summary.lastTouchLabel).toBe("Today");
  });

  it("surfaces deep-dive files as an intentional prep lane", () => {
    const summary = buildOperatorWorkflowSummary({
      status: "lead",
      qualificationRoute: "follow_up",
      assignedTo: "user-1",
      nextCallScheduledAt: null,
      nextFollowUpAt: null,
      lastContactAt: "2026-04-09T18:00:00Z",
      totalCalls: 2,
      nextAction: "Deep Dive",
      nextActionDueAt: "2026-04-09T23:30:00Z",
      createdAt: "2026-04-08T16:00:00Z",
      promotedAt: "2026-04-08T16:00:00Z",
      introSopActive: false,
      requiresIntroExitCategory: false,
      now: NOW,
    });

    expect(summary.introBadgeLabel).toBeNull();
    expect(summary.doNow).toBe("Deep dive — today");
    expect(summary.dueLabel).toBe("Due today");
    expect(summary.lastTouchLabel).toBe("Today");
  });
});
