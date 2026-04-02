import { describe, it, expect } from "vitest";
import {
  isContractStatus,
  isClosedDeal,
  parseFounderUserIds,
  computeFounderEffortFromCalls,
} from "@/lib/analytics-helpers";
import { normalizeSource } from "@/lib/source-normalization";

describe("isContractStatus", () => {
  it("returns true for valid contract statuses (case insensitive)", () => {
    const valid = [
      "under_contract",
      "contract",
      "contracted",
      "closed",
      "assigned",
      "Under_Contract",
      "CONTRACT",
      "Closed",
      "ASSIGNED",
      "  contracted  ",
    ];
    for (const s of valid) {
      expect(isContractStatus(s)).toBe(true);
    }
  });

  it("returns false for non-contract statuses", () => {
    const invalid = ["negotiating", "draft", "pending", "new", "open"];
    for (const s of invalid) {
      expect(isContractStatus(s)).toBe(false);
    }
  });

  it("returns false for null, undefined, and empty string", () => {
    expect(isContractStatus(null)).toBe(false);
    expect(isContractStatus(undefined)).toBe(false);
    expect(isContractStatus("")).toBe(false);
  });

  it("'negotiating' must NOT be treated as a contract status (regression)", () => {
    expect(isContractStatus("negotiating")).toBe(false);
    expect(isContractStatus("Negotiating")).toBe(false);
    expect(isContractStatus("NEGOTIATING")).toBe(false);
  });
});

describe("isClosedDeal", () => {
  it("returns true when status is 'closed'", () => {
    expect(isClosedDeal({ status: "closed" })).toBe(true);
    expect(isClosedDeal({ status: "Closed" })).toBe(true);
  });

  it("returns true when closed_at is set regardless of status", () => {
    expect(
      isClosedDeal({ status: "under_contract", closed_at: "2026-01-15" })
    ).toBe(true);
    expect(isClosedDeal({ status: null, closed_at: "2026-02-01" })).toBe(true);
  });

  it("returns false when status is not closed and no closed_at", () => {
    expect(isClosedDeal({ status: "negotiating" })).toBe(false);
    expect(isClosedDeal({ status: "negotiating", closed_at: null })).toBe(
      false
    );
    expect(isClosedDeal({})).toBe(false);
  });
});

describe("contract counting agreement", () => {
  it("kpi-summary and source-performance use the same isContractStatus function", () => {
    // Both API routes now import isContractStatus from analytics-helpers.
    // This test verifies the canonical list so any future change is caught.
    const canonicalContractStatuses = [
      "under_contract",
      "contract",
      "contracted",
      "closed",
      "assigned",
    ];
    for (const s of canonicalContractStatuses) {
      expect(isContractStatus(s)).toBe(true);
    }
    // Non-contract statuses must stay out
    expect(isContractStatus("negotiating")).toBe(false);
    expect(isContractStatus("pending")).toBe(false);
  });
});

describe("normalizeSource + isContractStatus consistency", () => {
  it("normalizeSource output is independent of contract status checks", () => {
    // normalizeSource transforms source labels; isContractStatus checks deal status.
    // They operate on different fields but should never interfere with each other.
    const sources = ["google", "facebook", "direct_mail", "referral", null];
    for (const src of sources) {
      const normalized = normalizeSource(src as string);
      // normalizeSource should return a string, never a contract status concept
      expect(typeof normalized).toBe("string");
      // Feeding a source name into isContractStatus should always be false
      expect(isContractStatus(normalized)).toBe(false);
    }
  });
});

describe("founder effort helpers", () => {
  it("parses founder IDs from comma-separated input", () => {
    expect(parseFounderUserIds("  u1, u2,u1 ,, u3  ")).toEqual(["u1", "u2", "u3"]);
    expect(parseFounderUserIds("")).toEqual([]);
    expect(parseFounderUserIds(null)).toEqual([]);
  });

  it("computes founder hours from call duration plus wrap-time", () => {
    const summary = computeFounderEffortFromCalls(
      [
        { duration_sec: 180 }, // 3m
        { duration_sec: 60 },  // 1m
        { duration_sec: 0 },   // still a call attempt
      ],
      2, // +2m wrap per call
    );

    expect(summary.callCount).toBe(3);
    expect(summary.talkMinutes).toBe(4);
    expect(summary.wrapMinutes).toBe(6);
    expect(summary.founderHours).toBeCloseTo(0.2, 5);
  });
});
