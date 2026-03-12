/**
 * Communication Truth Helper Tests
 *
 * Tests the shared definitions for contact status, staleness,
 * disposition classification, and contact rate computation.
 *
 * These helpers are used by kpi-summary, source-performance,
 * and analytics.ts to ensure consistent definitions.
 */

import { describe, it, expect } from "vitest";
import {
  isContacted,
  contactClassification,
  contactRate,
  contactRateBreakdown,
  isStale,
  daysSinceContact,
  dispositionCategory,
  isLiveContact,
} from "@/lib/comm-truth";

// ── isContacted ────────────────────────────────────────────────────

describe("isContacted", () => {
  it("returns true when last_contact_at is set", () => {
    expect(isContacted({ last_contact_at: "2026-03-01T10:00:00Z" })).toBe(true);
  });

  it("returns true when total_calls > 0", () => {
    expect(isContacted({ total_calls: 3 })).toBe(true);
  });

  it("returns true when both are set", () => {
    expect(isContacted({ last_contact_at: "2026-03-01T10:00:00Z", total_calls: 5 })).toBe(true);
  });

  it("returns false when both are null", () => {
    expect(isContacted({ last_contact_at: null, total_calls: null })).toBe(false);
  });

  it("returns false when both are missing", () => {
    expect(isContacted({})).toBe(false);
  });

  it("returns false for empty string last_contact_at", () => {
    expect(isContacted({ last_contact_at: "", total_calls: 0 })).toBe(false);
  });

  it("returns false for total_calls = 0", () => {
    expect(isContacted({ last_contact_at: null, total_calls: 0 })).toBe(false);
  });

  it("handles legacy rows with undefined fields", () => {
    expect(isContacted({ last_contact_at: undefined, total_calls: undefined })).toBe(false);
  });
});

// ── contactClassification ──────────────────────────────────────────

describe("contactClassification", () => {
  it("returns 'confirmed' when total_calls > 0", () => {
    expect(contactClassification({ total_calls: 1 })).toBe("confirmed");
  });

  it("returns 'confirmed' when both total_calls and last_contact_at exist", () => {
    expect(
      contactClassification({ total_calls: 3, last_contact_at: "2026-03-01T10:00:00Z" }),
    ).toBe("confirmed");
  });

  it("returns 'estimated' when only last_contact_at is set (no dialer calls)", () => {
    expect(
      contactClassification({ last_contact_at: "2026-03-01T10:00:00Z", total_calls: 0 }),
    ).toBe("estimated");
  });

  it("returns 'estimated' when last_contact_at set and total_calls is null", () => {
    expect(
      contactClassification({ last_contact_at: "2026-03-01T10:00:00Z", total_calls: null }),
    ).toBe("estimated");
  });

  it("returns 'none' when nothing is set", () => {
    expect(contactClassification({ last_contact_at: null, total_calls: null })).toBe("none");
    expect(contactClassification({})).toBe("none");
  });

  it("returns 'none' for empty string last_contact_at with no calls", () => {
    expect(contactClassification({ last_contact_at: "", total_calls: 0 })).toBe("none");
  });
});

// ── contactRate ────────────────────────────────────────────────────

describe("contactRate", () => {
  it("returns null for empty array", () => {
    expect(contactRate([])).toBeNull();
  });

  it("returns 100 when all leads are contacted", () => {
    const leads = [
      { total_calls: 1 },
      { total_calls: 2 },
      { last_contact_at: "2026-03-01T10:00:00Z" },
    ];
    expect(contactRate(leads)).toBe(100);
  });

  it("returns 0 when no leads are contacted", () => {
    const leads = [
      { total_calls: 0 },
      { last_contact_at: null },
      {},
    ];
    expect(contactRate(leads)).toBe(0);
  });

  it("computes correct percentage", () => {
    const leads = [
      { total_calls: 1 },
      { total_calls: 0 },
      { total_calls: 0 },
      { total_calls: 1 },
    ];
    expect(contactRate(leads)).toBe(50);
  });

  it("rounds to 1 decimal place", () => {
    // 1 out of 3 = 33.333...%
    const leads = [{ total_calls: 1 }, {}, {}];
    expect(contactRate(leads)).toBe(33.3);
  });
});

// ── contactRateBreakdown ───────────────────────────────────────────

describe("contactRateBreakdown", () => {
  it("returns zeroes for empty array", () => {
    const result = contactRateBreakdown([]);
    expect(result.rate).toBeNull();
    expect(result.total).toBe(0);
  });

  it("separates confirmed from estimated", () => {
    const leads = [
      { total_calls: 3, last_contact_at: "2026-03-01T10:00:00Z" }, // confirmed
      { total_calls: 0, last_contact_at: "2026-02-15T10:00:00Z" }, // estimated
      { total_calls: null, last_contact_at: null },                  // none
    ];
    const result = contactRateBreakdown(leads);
    expect(result.confirmedCount).toBe(1);
    expect(result.estimatedCount).toBe(1);
    expect(result.noneCount).toBe(1);
    expect(result.rate).toBe(66.7);
    expect(result.total).toBe(3);
  });

  it("counts all confirmed when all have calls", () => {
    const leads = [{ total_calls: 1 }, { total_calls: 5 }];
    const result = contactRateBreakdown(leads);
    expect(result.confirmedCount).toBe(2);
    expect(result.estimatedCount).toBe(0);
    expect(result.rate).toBe(100);
  });
});

// ── isStale ────────────────────────────────────────────────────────

describe("isStale", () => {
  const NOW = new Date("2026-03-12T12:00:00Z").getTime();

  it("returns true for null last_contact_at (never contacted)", () => {
    expect(isStale(null, 7, NOW)).toBe(true);
  });

  it("returns true for undefined last_contact_at", () => {
    expect(isStale(undefined, 7, NOW)).toBe(true);
  });

  it("returns true for invalid date string", () => {
    expect(isStale("not-a-date", 7, NOW)).toBe(true);
  });

  it("returns true when contact is older than threshold", () => {
    // 10 days ago
    const tenDaysAgo = new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(isStale(tenDaysAgo, 7, NOW)).toBe(true);
  });

  it("returns false when contact is within threshold", () => {
    // 3 days ago
    const threeDaysAgo = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(isStale(threeDaysAgo, 7, NOW)).toBe(false);
  });

  it("returns false when contact is exactly at threshold boundary", () => {
    // Exactly 7 days ago (not stale — threshold is GREATER than, not >=)
    const sevenDaysAgo = new Date(NOW - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isStale(sevenDaysAgo, 7, NOW)).toBe(false);
  });

  it("respects custom threshold", () => {
    const threeDaysAgo = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(isStale(threeDaysAgo, 2, NOW)).toBe(true);  // stale at 2-day threshold
    expect(isStale(threeDaysAgo, 5, NOW)).toBe(false);  // not stale at 5-day threshold
  });

  it("returns false for very recent contact", () => {
    const oneHourAgo = new Date(NOW - 60 * 60 * 1000).toISOString();
    expect(isStale(oneHourAgo, 7, NOW)).toBe(false);
  });
});

// ── daysSinceContact ───────────────────────────────────────────────

describe("daysSinceContact", () => {
  const NOW = new Date("2026-03-12T12:00:00Z").getTime();

  it("returns null for null input", () => {
    expect(daysSinceContact(null, NOW)).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(daysSinceContact("garbage", NOW)).toBeNull();
  });

  it("returns 0 for contact today", () => {
    const sixHoursAgo = new Date(NOW - 6 * 60 * 60 * 1000).toISOString();
    expect(daysSinceContact(sixHoursAgo, NOW)).toBe(0);
  });

  it("returns correct days for past contact", () => {
    const fiveDaysAgo = new Date(NOW - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysSinceContact(fiveDaysAgo, NOW)).toBe(5);
  });

  it("returns 0 for future date (shouldn't happen but safe)", () => {
    const tomorrow = new Date(NOW + 24 * 60 * 60 * 1000).toISOString();
    expect(daysSinceContact(tomorrow, NOW)).toBe(0);
  });
});

// ── dispositionCategory ────────────────────────────────────────────

describe("dispositionCategory", () => {
  it("classifies live contact dispositions", () => {
    expect(dispositionCategory("connected")).toBe("live");
    expect(dispositionCategory("interested")).toBe("live");
    expect(dispositionCategory("appointment_set")).toBe("live");
    expect(dispositionCategory("appointment")).toBe("live");
    expect(dispositionCategory("callback")).toBe("live");
    expect(dispositionCategory("contract")).toBe("live");
  });

  it("classifies voicemail dispositions", () => {
    expect(dispositionCategory("voicemail")).toBe("voicemail");
    expect(dispositionCategory("left_voicemail")).toBe("voicemail");
    expect(dispositionCategory("vm")).toBe("voicemail");
  });

  it("classifies no-answer dispositions", () => {
    expect(dispositionCategory("no_answer")).toBe("no_answer");
    expect(dispositionCategory("busy")).toBe("no_answer");
    expect(dispositionCategory("no_pickup")).toBe("no_answer");
  });

  it("classifies dead/compliance dispositions", () => {
    expect(dispositionCategory("wrong_number")).toBe("dead");
    expect(dispositionCategory("disconnected")).toBe("dead");
    expect(dispositionCategory("do_not_call")).toBe("dead");
    expect(dispositionCategory("dnc")).toBe("dead");
    expect(dispositionCategory("dead")).toBe("dead");
  });

  it("returns 'other' for unknown dispositions", () => {
    expect(dispositionCategory("something_new")).toBe("other");
    expect(dispositionCategory("initiating")).toBe("other");
  });

  it("returns 'other' for null/undefined", () => {
    expect(dispositionCategory(null)).toBe("other");
    expect(dispositionCategory(undefined)).toBe("other");
  });

  it("is case-insensitive", () => {
    expect(dispositionCategory("CONNECTED")).toBe("live");
    expect(dispositionCategory("Voicemail")).toBe("voicemail");
    expect(dispositionCategory("NO_ANSWER")).toBe("no_answer");
  });

  it("trims whitespace", () => {
    expect(dispositionCategory("  connected  ")).toBe("live");
  });
});

// ── isLiveContact ──────────────────────────────────────────────────

describe("isLiveContact", () => {
  it("returns true for live dispositions", () => {
    expect(isLiveContact("connected")).toBe(true);
    expect(isLiveContact("interested")).toBe(true);
    expect(isLiveContact("callback")).toBe(true);
  });

  it("returns false for voicemail", () => {
    expect(isLiveContact("voicemail")).toBe(false);
  });

  it("returns false for no_answer", () => {
    expect(isLiveContact("no_answer")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isLiveContact(null)).toBe(false);
  });
});
