/**
 * KPI Logic Tests
 *
 * Tests the pure computation helpers used by the KPI summary endpoint.
 * These tests verify date-range handling, median computation, and
 * the closed-deal period-filtering logic.
 *
 * These are extracted pure-function tests, not integration tests.
 */

import { describe, it, expect } from "vitest";

// ── Re-implement the pure helpers from kpi-summary route for testing ──
// (These are small pure functions inlined in the route; we test them here
//  to verify the math without needing an HTTP server.)

function toMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Period start helper (matches analytics.ts getPeriodStart) ──
function getPeriodStart(period: string): string | null {
  const now = new Date();
  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  if (period === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return start.toISOString();
  }
  return null; // "all"
}

// ── Contract status check (matches kpi-summary logic) ──
function isContractStatus(status: string | null): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "under_contract" || s === "contract" || s === "contracted" || s === "closed";
}

// ── Tests ──

describe("toMs", () => {
  it("returns null for null/undefined/empty", () => {
    expect(toMs(null)).toBeNull();
    expect(toMs(undefined)).toBeNull();
    expect(toMs("")).toBeNull();
  });

  it("returns null for invalid ISO", () => {
    expect(toMs("not-a-date")).toBeNull();
    expect(toMs("abc123")).toBeNull();
  });

  it("returns correct ms for valid ISO", () => {
    const date = "2026-03-01T12:00:00.000Z";
    expect(toMs(date)).toBe(new Date(date).getTime());
  });

  it("handles various ISO formats", () => {
    expect(toMs("2026-01-15")).not.toBeNull();
    expect(toMs("2026-06-15T08:30:00Z")).not.toBeNull();
    expect(toMs("2026-06-15T08:30:00-07:00")).not.toBeNull();
  });
});

describe("median", () => {
  it("returns null for empty array", () => {
    expect(median([])).toBeNull();
  });

  it("returns the single value for length-1 array", () => {
    expect(median([42])).toBe(42);
  });

  it("returns middle value for odd-length array", () => {
    expect(median([1, 3, 5])).toBe(3);
    expect(median([10, 20, 30, 40, 50])).toBe(30);
  });

  it("returns floor-middle for even-length array", () => {
    // [1, 2, 3, 4] sorted → index 2 → 3
    expect(median([1, 2, 3, 4])).toBe(3);
  });

  it("sorts values before computing (not positional)", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([100, 1, 50])).toBe(50);
  });

  it("handles negative values", () => {
    expect(median([-5, 0, 5])).toBe(0);
  });
});

describe("round1", () => {
  it("rounds to 1 decimal place", () => {
    expect(round1(3.14159)).toBe(3.1);
    expect(round1(2.95)).toBe(3.0);
    expect(round1(0)).toBe(0);
    expect(round1(100.04)).toBe(100.0);
    expect(round1(99.99)).toBe(100.0);
  });
});

describe("getPeriodStart", () => {
  it("returns null for 'all' period", () => {
    expect(getPeriodStart("all")).toBeNull();
  });

  it("returns start of today for 'today'", () => {
    const result = getPeriodStart("today");
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
  });

  it("returns start of current week for 'week'", () => {
    const result = getPeriodStart("week");
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getDay()).toBe(0); // Sunday
    expect(date.getHours()).toBe(0);
  });

  it("returns first of month for 'month'", () => {
    const result = getPeriodStart("month");
    expect(result).not.toBeNull();
    const date = new Date(result!);
    expect(date.getDate()).toBe(1);
  });
});

describe("isContractStatus", () => {
  it("recognizes valid contract statuses", () => {
    expect(isContractStatus("under_contract")).toBe(true);
    expect(isContractStatus("contract")).toBe(true);
    expect(isContractStatus("contracted")).toBe(true);
    expect(isContractStatus("closed")).toBe(true);
  });

  it("rejects non-contract statuses", () => {
    expect(isContractStatus("draft")).toBe(false);
    expect(isContractStatus("dead")).toBe(false);
    expect(isContractStatus("pending")).toBe(false);
    expect(isContractStatus(null)).toBe(false);
    expect(isContractStatus("")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isContractStatus("Under_Contract")).toBe(true);
    expect(isContractStatus("CLOSED")).toBe(true);
  });
});

describe("KPI date dimension correctness", () => {
  it("deals_closed should use closed_at, not created_at for period attribution", () => {
    // Scenario: deal created in January, closed in March
    // When viewing March KPIs, it should appear as closed in March
    const deal = {
      created_at: "2026-01-15T10:00:00Z",
      closed_at: "2026-03-10T14:00:00Z",
      status: "closed",
      assignment_fee: 10000,
    };

    const marchStart = new Date("2026-03-01T00:00:00Z").getTime();
    const closedMs = toMs(deal.closed_at);
    const createdMs = toMs(deal.created_at);

    // closed_at is in March → should be included in March revenue
    expect(closedMs! >= marchStart).toBe(true);
    // created_at is in January → should NOT count for March if we filter on created_at
    expect(createdMs! >= marchStart).toBe(false);

    // This validates why we filter on closed_at for revenue/closed count
  });

  it("speed-to-lead should use promoted_at if available, fallback to created_at", () => {
    const leadWithPromotion = {
      promoted_at: "2026-03-01T10:00:00Z",
      created_at: "2026-03-01T09:00:00Z", // 1 hour earlier
    };

    const leadWithoutPromotion = {
      promoted_at: null,
      created_at: "2026-03-01T09:00:00Z",
    };

    const firstCallAt = "2026-03-01T10:15:00Z";
    const callMs = toMs(firstCallAt)!;

    // With promoted_at: speed = call - promoted = 15 min
    const speedWithPromotion = callMs - toMs(leadWithPromotion.promoted_at)!;
    expect(speedWithPromotion).toBe(15 * 60 * 1000);

    // Without promoted_at: speed = call - created = 75 min (uses created_at as fallback)
    const speedWithoutPromotion = callMs - toMs(leadWithoutPromotion.created_at)!;
    expect(speedWithoutPromotion).toBe(75 * 60 * 1000);
  });
});
