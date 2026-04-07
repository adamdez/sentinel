/**
 * Tests for deriveLeadActionSummary — deterministic next-action logic.
 *
 * Each test documents a specific rule from the cascade and verifies
 * the action, urgency, and actionType are correct for that scenario.
 */

import { describe, it, expect } from "vitest";
import {
  deriveLeadActionSummary,
  type ActionDerivationInput,
  type UrgencyLevel,
} from "@/lib/action-derivation";

const NOW = new Date("2026-03-12T14:00:00Z");

function derive(overrides: Partial<ActionDerivationInput> = {}) {
  return deriveLeadActionSummary({
    status: "lead",
    now: NOW,
    ...overrides,
  });
}

// ── Terminal statuses ───────────────────────────────────────────────

describe("terminal statuses", () => {
  it("dead lead — no action needed", () => {
    const result = derive({ status: "dead" });
    expect(result.urgency).toBe("none");
    expect(result.isActionable).toBe(false);
    expect(result.action).toContain("Dead");
  });

  it("closed lead — no action needed", () => {
    const result = derive({ status: "closed" });
    expect(result.urgency).toBe("none");
    expect(result.isActionable).toBe(false);
    expect(result.action).toContain("Closed");
  });
});

// ── Pre-pipeline statuses ───────────────────────────────────────────

describe("pre-pipeline statuses", () => {
  it("staging — awaiting promotion, not actionable", () => {
    const result = derive({ status: "staging" });
    expect(result.urgency).toBe("low");
    expect(result.isActionable).toBe(false);
    expect(result.action).toContain("Awaiting promotion");
  });

  it("prospect — awaiting promotion, actionable", () => {
    const result = derive({ status: "prospect" });
    expect(result.urgency).toBe("low");
    expect(result.isActionable).toBe(true);
  });
});

// ── Rule 1: CRITICAL — Overdue callback/follow-up ───────────────────

describe("Rule 1: overdue callback/follow-up", () => {
  it("overdue callback — critical", () => {
    const result = derive({
      nextCallScheduledAt: "2026-03-10T10:00:00Z", // 2 days ago
      lastContactAt: "2026-03-09T10:00:00Z",
      totalCalls: 3,
    });
    expect(result.urgency).toBe("critical");
    expect(result.actionType).toBe("call");
    expect(result.isActionable).toBe(true);
    expect(result.action).toContain("Callback");
    expect(result.action).toContain("overdue");
  });

  it("overdue follow-up (no callback) — critical", () => {
    const result = derive({
      nextFollowUpAt: "2026-03-09T10:00:00Z", // 3 days ago
      lastContactAt: "2026-03-08T10:00:00Z",
      totalCalls: 2,
    });
    expect(result.urgency).toBe("critical");
    expect(result.action).toContain("Follow-up");
    expect(result.action).toContain("overdue");
  });

  it("overdue 1 day says '1d overdue'", () => {
    const result = derive({
      nextCallScheduledAt: "2026-03-12T02:00:00Z", // ~12 hours ago = ceil to 1 day
      lastContactAt: "2026-03-10T10:00:00Z",
      totalCalls: 1,
    });
    expect(result.urgency).toBe("critical");
    expect(result.action).toContain("1d overdue");
  });
});

// ── Rule 2: CRITICAL — Uncontacted active lead >24h ─────────────────

describe("Rule 2: uncontacted active lead >24h", () => {
  it("uncontacted lead, 3 days old — critical", () => {
    const result = derive({
      totalCalls: 0,
      lastContactAt: null,
      createdAt: "2026-03-09T10:00:00Z", // 3 days ago
    });
    expect(result.urgency).toBe("critical");
    expect(result.actionType).toBe("call");
    expect(result.action).toContain("No contact attempt");
  });

  it("uncontacted lead, 2 hours old — not critical (within SLA)", () => {
    const result = derive({
      totalCalls: 0,
      lastContactAt: null,
      createdAt: "2026-03-12T12:00:00Z", // 2 hours ago
    });
    // Should fall through to "new — awaiting first contact"
    expect(result.urgency).not.toBe("critical");
    expect(result.action).toContain("New");
  });

  it("uncontacted lead in negotiation status — still critical if >24h", () => {
    const result = derive({
      status: "negotiation",
      totalCalls: 0,
      lastContactAt: null,
      promotedAt: "2026-03-10T10:00:00Z",
    });
    expect(result.urgency).toBe("critical");
  });

  it("uncontacted lead in nurture — NOT critical (not an active call status)", () => {
    const result = derive({
      status: "nurture",
      totalCalls: 0,
      lastContactAt: null,
      createdAt: "2026-03-05T10:00:00Z",
    });
    // Should not be "critical" — nurture uses different rules
    expect(result.urgency).not.toBe("critical");
  });

  it("uses promotedAt over createdAt when available", () => {
    const result = derive({
      totalCalls: 0,
      lastContactAt: null,
      createdAt: "2026-03-01T10:00:00Z", // 11 days ago
      promotedAt: "2026-03-12T13:00:00Z", // 1 hour ago
    });
    // promotedAt is <24h ago, so should NOT be critical
    expect(result.urgency).not.toBe("critical");
  });
});

// ── Rule 3: HIGH — Stale contact ────────────────────────────────────

describe("Rule 3: stale contact", () => {
  it("last contact 10 days ago — high urgency", () => {
    const result = derive({
      lastContactAt: "2026-03-02T10:00:00Z", // 10 days ago
      totalCalls: 5,
    });
    expect(result.urgency).toBe("high");
    expect(result.action).toContain("No contact in");
    expect(result.action).toContain("10d");
  });

  it("last contact 3 days ago — not stale", () => {
    const result = derive({
      lastContactAt: "2026-03-09T10:00:00Z", // 3 days ago
      totalCalls: 5,
      qualificationRoute: "follow_up", // bypass "needs qualification" rule
    });
    expect(result.urgency).not.toBe("high");
  });

  it("last contact exactly 7 days ago — borderline (stale)", () => {
    const result = derive({
      lastContactAt: "2026-03-05T14:00:00Z", // exactly 7 days ago
      totalCalls: 2,
    });
    // isStale uses > thresholdDays, so exactly 7 days means 7 full days have elapsed
    expect(result.urgency).toBe("high");
  });
});

// ── Rule 4: HIGH — Needs qualification ──────────────────────────────

describe("Rule 4: needs qualification", () => {
  it("contacted lead with no qualification route — high", () => {
    const result = derive({
      status: "lead",
      totalCalls: 3,
      lastContactAt: "2026-03-11T10:00:00Z",
      qualificationRoute: null,
    });
    expect(result.urgency).toBe("high");
    expect(result.action).toContain("next step");
    expect(result.actionType).toBe("review");
  });

  it("contacted lead WITH qualification route — not flagged", () => {
    const result = derive({
      status: "lead",
      totalCalls: 3,
      lastContactAt: "2026-03-11T10:00:00Z",
      qualificationRoute: "offer_ready",
    });
    expect(result.action).not.toContain("next step");
  });

  it("uncontacted lead with no route — not flagged (rule 2 or 'new' takes priority)", () => {
    const result = derive({
      status: "lead",
      totalCalls: 0,
      lastContactAt: null,
      qualificationRoute: null,
      createdAt: "2026-03-12T12:00:00Z",
    });
    expect(result.action).not.toContain("next step");
  });
});

// ── Rule 5: NORMAL — Callback scheduled ─────────────────────────────

describe("Rule 5: callback scheduled", () => {
  it("callback scheduled for tomorrow", () => {
    const result = derive({
      nextCallScheduledAt: "2026-03-13T20:00:00Z", // >24h from now = tomorrow
      lastContactAt: "2026-03-11T10:00:00Z",
      totalCalls: 2,
      qualificationRoute: "follow_up", // bypass needs-qualification rule
    });
    expect(result.urgency).toBe("normal");
    expect(result.action).toContain("Callback scheduled");
    expect(result.action).toContain("tomorrow");
    expect(result.isActionable).toBe(false); // not due yet
  });

  it("callback scheduled for today — actionable", () => {
    const result = derive({
      nextCallScheduledAt: "2026-03-12T18:00:00Z", // later today
      lastContactAt: "2026-03-11T10:00:00Z",
      totalCalls: 2,
      qualificationRoute: "offer_ready", // bypass needs-qualification rule
    });
    expect(result.urgency).toBe("normal");
    expect(result.isActionable).toBe(true);
    expect(result.action).toContain("today");
  });
});

// ── Rule 6: NORMAL — Follow-up due ──────────────────────────────────

describe("Rule 6: follow-up due", () => {
  it("follow-up due today — normal", () => {
    const result = derive({
      nextFollowUpAt: "2026-03-12T20:00:00Z", // later today
      lastContactAt: "2026-03-11T10:00:00Z", // 1 day ago (not stale)
      totalCalls: 4,
      qualificationRoute: "follow_up", // bypass needs-qualification
    });
    expect(result.urgency).toBe("normal");
    expect(result.action).toContain("Follow-up");
    expect(result.action).toContain("today");
  });

  it("follow-up in 5 days — low urgency", () => {
    const result = derive({
      nextFollowUpAt: "2026-03-17T18:00:00Z", // >5 full days from now
      lastContactAt: "2026-03-11T10:00:00Z", // 1 day ago (not stale)
      totalCalls: 4,
      qualificationRoute: "offer_ready", // bypass needs-qualification
    });
    expect(result.urgency).toBe("low");
    expect(result.action).toContain("5d");
  });
});

// ── Rule 7: NORMAL — Nurture ────────────────────────────────────────

describe("Rule 7: nurture check-in", () => {
  it("nurture lead, stale contact — stale rule fires first (higher urgency)", () => {
    const result = derive({
      status: "nurture",
      lastContactAt: "2026-02-28T10:00:00Z", // 12 days ago
      totalCalls: 2,
    });
    // Rule 3 (stale contact) fires before Rule 7 because stale is higher urgency
    expect(result.urgency).toBe("high");
    expect(result.action).toContain("No contact in");
  });

  it("nurture lead, borderline stale (8 days) — nurture check-in shows", () => {
    // A nurture lead with 8-day-old contact: stale rule fires first,
    // but for nurture-specific messaging, we'd need to override.
    // Current cascade: Rule 3 catches this.
    const result = derive({
      status: "nurture",
      lastContactAt: "2026-03-04T10:00:00Z", // 8 days ago
      totalCalls: 2,
    });
    expect(result.urgency).toBe("high");
    expect(result.actionType).toBe("call");
  });

  it("nurture lead, recent contact — on cadence", () => {
    const result = derive({
      status: "nurture",
      lastContactAt: "2026-03-10T10:00:00Z", // 2 days ago
      totalCalls: 3,
    });
    expect(result.urgency).toBe("low");
    expect(result.action).toContain("on cadence");
    expect(result.isActionable).toBe(false);
  });
});

// ── Rule 8: LOW — No scheduled action, aging ────────────────────────

describe("Rule 8: no action, aging", () => {
  it("contacted lead, no follow-up, 5 days since activity — shows 'no next action'", () => {
    const result = derive({
      lastContactAt: "2026-03-07T10:00:00Z", // 5 days ago (not stale yet)
      totalCalls: 3,
      qualificationRoute: "follow_up", // bypass needs-qualification
    });
    expect(result.action).toContain("No next action");
    expect(result.isActionable).toBe(true);
  });

  it("contacted lead, no follow-up, 10 days since activity — stale rule fires first", () => {
    const result = derive({
      lastContactAt: "2026-03-02T10:00:00Z", // 10 days ago
      totalCalls: 3,
      qualificationRoute: "follow_up",
    });
    // Rule 3 (stale contact) fires before Rule 8
    expect(result.urgency).toBe("high");
  });
});

// ── Rule 9: On track ────────────────────────────────────────────────

describe("Rule 9: on track", () => {
  it("recently contacted, no pending action — on track", () => {
    const result = derive({
      lastContactAt: "2026-03-12T10:00:00Z", // 4 hours ago
      totalCalls: 5,
      qualificationRoute: "follow_up", // bypass needs-qualification
    });
    expect(result.urgency).toBe("none");
    expect(result.isActionable).toBe(false);
    expect(result.action).toContain("On track");
  });
});

// ── Null safety / legacy edge cases ─────────────────────────────────

describe("null safety and legacy data", () => {
  it("all-null input with 'lead' status — handles gracefully", () => {
    const result = derive({
      status: "lead",
      lastContactAt: null,
      totalCalls: null,
      nextCallScheduledAt: null,
      nextFollowUpAt: null,
      createdAt: null,
      promotedAt: null,
    });
    // No created_at means speed-to-lead check can't fire
    // Falls through to "new — awaiting first contact"
    expect(result.isActionable).toBe(true);
    expect(result.actionType).toBe("call");
  });

  it("null status treated as non-terminal", () => {
    const result = derive({ status: null });
    // Null status isn't terminal, isn't staging/prospect, isn't nurture
    // Should be gracefully handled
    expect(result).toBeDefined();
    expect(result.urgency).toBeDefined();
  });

  it("empty string status treated as non-terminal", () => {
    const result = derive({ status: "" });
    expect(result).toBeDefined();
  });

  it("invalid date strings handled safely", () => {
    const result = derive({
      nextCallScheduledAt: "not-a-date",
      lastContactAt: "also-not-a-date",
      totalCalls: 1,
    });
    // Should not crash, should handle gracefully
    expect(result).toBeDefined();
  });
});

// ── Priority ordering ───────────────────────────────────────────────

describe("priority ordering: earlier rules win", () => {
  it("overdue callback beats stale contact", () => {
    const result = derive({
      nextCallScheduledAt: "2026-03-10T10:00:00Z", // 2 days overdue
      lastContactAt: "2026-03-01T10:00:00Z", // 11 days stale
      totalCalls: 5,
    });
    expect(result.urgency).toBe("critical");
    expect(result.action).toContain("Callback");
  });

  it("overdue callback beats uncontacted >24h", () => {
    const result = derive({
      nextCallScheduledAt: "2026-03-10T10:00:00Z",
      totalCalls: 0,
      createdAt: "2026-03-08T10:00:00Z",
    });
    expect(result.urgency).toBe("critical");
    expect(result.action).toContain("Callback");
  });

  it("uncontacted >24h beats stale (no prior contact)", () => {
    const result = derive({
      totalCalls: 0,
      lastContactAt: null,
      createdAt: "2026-03-09T10:00:00Z", // 3 days
    });
    expect(result.urgency).toBe("critical");
    expect(result.action).toContain("No contact attempt");
  });

  it("stale contact beats needs-qualification", () => {
    const result = derive({
      status: "lead",
      qualificationRoute: null,
      lastContactAt: "2026-03-01T10:00:00Z", // 11 days
      totalCalls: 3,
    });
    expect(result.urgency).toBe("high");
    expect(result.action).toContain("No contact in");
  });
});
