import { describe, expect, it } from "vitest";
import {
  buildWeeklyMetricDelta,
  buildWeeklyScorecardExceptions,
  type WeeklyTeamWindowMetrics,
} from "@/lib/weekly-scorecard";

function makeWindow(overrides?: Partial<WeeklyTeamWindowMetrics>): WeeklyTeamWindowMetrics {
  return {
    windowStart: "2026-03-20T00:00:00.000Z",
    windowEnd: "2026-03-27T00:00:00.000Z",
    founderCallCount: 40,
    founderHoursEstimated: 22,
    qualifiedConversations: 14,
    appointmentSignals: 6,
    offersMade: 4,
    contractsSigned: 3,
    dealsClosed: 2,
    totalRevenue: 24000,
    jeffInfluencedClosedDeals: 1,
    jeffInfluencedRevenue: 12000,
    jeffInfluenceRatePct: 50,
    contractsPerFounderHour: 0.1,
    revenuePerFounderHour: 1091,
    ...overrides,
  };
}

describe("buildWeeklyMetricDelta", () => {
  it("computes absolute and percent change", () => {
    const delta = buildWeeklyMetricDelta(80, 100);
    expect(delta.absolute).toBe(-20);
    expect(delta.pct).toBe(-20);
    expect(delta.trend).toBe("down");
  });

  it("keeps pct null when previous value is zero", () => {
    const delta = buildWeeklyMetricDelta(10, 0);
    expect(delta.pct).toBeNull();
    expect(delta.trend).toBe("up");
  });
});

describe("buildWeeklyScorecardExceptions", () => {
  it("flags leverage degradation and weak outcomes", () => {
    const current = makeWindow({
      founderHoursEstimated: 30,
      contractsSigned: 1,
      qualifiedConversations: 8,
      appointmentSignals: 3,
      offersMade: 2,
      dealsClosed: 1,
      totalRevenue: 9000,
      contractsPerFounderHour: 0.03,
      revenuePerFounderHour: 300,
      jeffInfluencedClosedDeals: 0,
      jeffInfluenceRatePct: 0,
    });
    const previous = makeWindow({
      founderHoursEstimated: 20,
      contractsSigned: 3,
      qualifiedConversations: 14,
      appointmentSignals: 6,
      offersMade: 4,
      dealsClosed: 2,
      totalRevenue: 24000,
      contractsPerFounderHour: 0.15,
      revenuePerFounderHour: 1200,
      jeffInfluencedClosedDeals: 1,
      jeffInfluenceRatePct: 50,
    });

    const issues = buildWeeklyScorecardExceptions(current, previous);
    const codes = new Set(issues.map((issue) => issue.code));

    expect(codes.has("contracts_per_founder_hour_down")).toBe(true);
    expect(codes.has("revenue_per_founder_hour_down")).toBe(true);
    expect(codes.has("founder_time_up_without_contract_lift")).toBe(true);
    expect(codes.has("qualified_conversations_down")).toBe(true);
    expect(codes.has("appointment_signals_down")).toBe(true);
    expect(codes.has("offers_down")).toBe(true);
    expect(codes.has("zero_jeff_influence_on_closed")).toBe(true);
    expect(codes.has("jeff_influence_rate_down")).toBe(true);
  });

  it("flags critical zero-contract week with high effort", () => {
    const current = makeWindow({
      founderHoursEstimated: 16,
      contractsSigned: 0,
      dealsClosed: 0,
      totalRevenue: 0,
      contractsPerFounderHour: 0,
      revenuePerFounderHour: 0,
    });
    const previous = makeWindow({
      founderHoursEstimated: 14,
      contractsSigned: 2,
    });

    const issues = buildWeeklyScorecardExceptions(current, previous);
    expect(issues.some((issue) => issue.code === "zero_contracts_with_high_effort" && issue.severity === "critical")).toBe(true);
  });
});
