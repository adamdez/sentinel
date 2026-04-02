import { describe, expect, it } from "vitest";
import { computeFounderHoursFromWorkLogs, findFounderWorkLogGaps } from "@/lib/founder-worklog";

describe("computeFounderHoursFromWorkLogs", () => {
  const windowStart = "2026-04-01T00:00:00.000Z";
  const windowEnd = "2026-04-02T00:00:00.000Z";

  it("merges overlapping intervals for the same user", () => {
    const summary = computeFounderHoursFromWorkLogs(
      [
        { user_id: "u1", started_at: "2026-04-01T10:00:00.000Z", ended_at: "2026-04-01T11:00:00.000Z" },
        { user_id: "u1", started_at: "2026-04-01T10:30:00.000Z", ended_at: "2026-04-01T11:30:00.000Z" },
      ],
      windowStart,
      windowEnd,
    );

    expect(summary.rawIntervals).toBe(2);
    expect(summary.mergedIntervals).toBe(1);
    expect(summary.totalMinutes).toBe(90);
    expect(summary.founderHours).toBe(1.5);
  });

  it("keeps separate users additive", () => {
    const summary = computeFounderHoursFromWorkLogs(
      [
        { user_id: "u1", started_at: "2026-04-01T09:00:00.000Z", ended_at: "2026-04-01T10:00:00.000Z" },
        { user_id: "u2", started_at: "2026-04-01T09:30:00.000Z", ended_at: "2026-04-01T10:30:00.000Z" },
      ],
      windowStart,
      windowEnd,
    );

    expect(summary.totalMinutes).toBe(120);
    expect(summary.founderHours).toBe(2);
  });

  it("clamps logs to the scorecard window", () => {
    const summary = computeFounderHoursFromWorkLogs(
      [
        { user_id: "u1", started_at: "2026-03-31T23:30:00.000Z", ended_at: "2026-04-01T00:30:00.000Z" },
        { user_id: "u1", started_at: "2026-04-01T23:30:00.000Z", ended_at: "2026-04-02T01:00:00.000Z" },
      ],
      windowStart,
      windowEnd,
    );

    expect(summary.totalMinutes).toBe(60);
    expect(summary.founderHours).toBe(1);
  });

  it("supports open sessions and optional user filtering", () => {
    const summary = computeFounderHoursFromWorkLogs(
      [
        { user_id: "u1", started_at: "2026-04-01T20:00:00.000Z", ended_at: null },
        { user_id: "u2", started_at: "2026-04-01T21:00:00.000Z", ended_at: "2026-04-01T22:00:00.000Z" },
      ],
      windowStart,
      windowEnd,
      ["u1"],
    );

    expect(summary.totalMinutes).toBe(240);
    expect(summary.founderHours).toBe(4);
  });
});

describe("findFounderWorkLogGaps", () => {
  it("flags founders with meaningful call activity but low logged hours", () => {
    const gaps = findFounderWorkLogGaps([
      { userId: "u1", callCount: 6, founderHours: 0.2 },
      { userId: "u2", callCount: 4, founderHours: 0.7 },
      { userId: "u3", callCount: 2, founderHours: 0 },
    ]);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.userId).toBe("u1");
    expect(gaps[0]?.minCallsForReminder).toBe(3);
    expect(gaps[0]?.minHoursForReminder).toBe(0.5);
  });

  it("sorts reminder candidates by highest call load then lowest logged hours", () => {
    const gaps = findFounderWorkLogGaps([
      { userId: "u3", callCount: 5, founderHours: 0.4 },
      { userId: "u2", callCount: 8, founderHours: 0.4 },
      { userId: "u1", callCount: 8, founderHours: 0.1 },
    ]);

    expect(gaps.map((row) => row.userId)).toEqual(["u1", "u2", "u3"]);
  });
});
