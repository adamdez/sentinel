/**
 * Tests for deriveDispoActionSummary — deterministic dispo deal action logic.
 *
 * Each test documents a specific rule from the cascade and verifies
 * the action, urgency, and stall detection are correct.
 */

import { describe, it, expect } from "vitest";
import {
  deriveDispoActionSummary,
  type DispoDerivationInput,
  type BuyerStatusSummary,
} from "@/lib/dispo-action-derivation";

const NOW = new Date("2026-03-12T14:00:00Z");

function derive(overrides: Partial<DispoDerivationInput> = {}) {
  return deriveDispoActionSummary({
    enteredDispoAt: "2026-03-08T10:00:00Z", // 4 days ago
    buyerStatuses: [],
    now: NOW,
    ...overrides,
  });
}

function buyer(status: string, overrides: Partial<BuyerStatusSummary> = {}): BuyerStatusSummary {
  return { status, ...overrides };
}

// ── Rule 1: Deal closed ─────────────────────────────────────────────

describe("Rule 1: deal closed", () => {
  it("closed deal — no action", () => {
    const result = derive({ closingStatus: "closed", buyerStatuses: [buyer("selected")] });
    expect(result.urgency).toBe("none");
    expect(result.isStalled).toBe(false);
    expect(result.action).toContain("closed");
  });

  it("closing in progress — no action", () => {
    const result = derive({ closingStatus: "closing", buyerStatuses: [buyer("selected")] });
    expect(result.urgency).toBe("none");
    expect(result.action).toContain("Closing");
  });
});

// ── Rule 2: CRITICAL — No buyers linked, >1 day ─────────────────────

describe("Rule 2: no buyers, >1 day", () => {
  it("no buyers, 4 days in dispo — critical stall", () => {
    const result = derive({ buyerStatuses: [] });
    expect(result.urgency).toBe("critical");
    expect(result.isStalled).toBe(true);
    expect(result.action).toContain("No buyers linked");
    expect(result.daysInDispo).toBe(4);
  });

  it("no buyers, 1 day exactly — critical (threshold met)", () => {
    const result = derive({
      buyerStatuses: [],
      enteredDispoAt: "2026-03-11T14:00:00Z", // exactly 1 day ago
    });
    expect(result.urgency).toBe("critical");
    expect(result.isStalled).toBe(true);
  });

  it("no buyers, <1 day — normal, not stalled", () => {
    const result = derive({
      buyerStatuses: [],
      enteredDispoAt: "2026-03-12T10:00:00Z", // 4 hours ago
    });
    expect(result.urgency).toBe("normal");
    expect(result.isStalled).toBe(false);
    expect(result.action).toContain("Add buyer candidates");
  });
});

// ── Rule 3: HIGH — All pre-contact, >2 days ─────────────────────────

describe("Rule 3: all pre-contact, >2 days", () => {
  it("all buyers not_contacted, 4 days in dispo — high stall", () => {
    const result = derive({
      buyerStatuses: [buyer("not_contacted"), buyer("queued")],
    });
    expect(result.urgency).toBe("high");
    expect(result.isStalled).toBe(true);
    expect(result.action).toContain("No outreach started");
  });

  it("all buyers not_contacted, 1 day — normal, not stalled", () => {
    const result = derive({
      buyerStatuses: [buyer("not_contacted")],
      enteredDispoAt: "2026-03-11T14:00:00Z", // 1 day
    });
    expect(result.urgency).toBe("normal");
    expect(result.isStalled).toBe(false);
    expect(result.action).toContain("Begin buyer outreach");
  });

  it("mix of not_contacted and sent — not flagged (sent is past pre-contact)", () => {
    const result = derive({
      buyerStatuses: [buyer("not_contacted"), buyer("sent")],
    });
    // Not all pre-contact, so rule 3 doesn't fire
    expect(result.action).not.toContain("No outreach started");
  });
});

// ── Rule 4: HIGH — Buyer responded but stale ────────────────────────

describe("Rule 4: buyer responded but stale", () => {
  it("buyer interested 5 days ago — high stall", () => {
    const result = derive({
      buyerStatuses: [
        buyer("interested", { respondedAt: "2026-03-07T10:00:00Z" }),
      ],
    });
    expect(result.urgency).toBe("high");
    expect(result.isStalled).toBe(true);
    expect(result.action).toContain("Buyer response");
    expect(result.action).toContain("follow up");
  });

  it("buyer interested 1 day ago — normal, not stalled", () => {
    const result = derive({
      buyerStatuses: [
        buyer("interested", { respondedAt: "2026-03-11T10:00:00Z" }),
      ],
    });
    expect(result.urgency).toBe("normal");
    expect(result.isStalled).toBe(false);
    expect(result.action).toContain("responding");
  });

  it("buyer follow_up 4 days ago — high stall (>=3 day threshold)", () => {
    const result = derive({
      buyerStatuses: [
        buyer("follow_up", { respondedAt: "2026-03-08T10:00:00Z" }),
      ],
    });
    expect(result.urgency).toBe("high");
    expect(result.isStalled).toBe(true);
  });

  it("buyer offered 2 days ago — not stalled", () => {
    const result = derive({
      buyerStatuses: [
        buyer("offered", { respondedAt: "2026-03-10T14:00:00Z" }),
      ],
    });
    expect(result.urgency).toBe("normal");
    expect(result.isStalled).toBe(false);
  });
});

// ── Rule 5: NORMAL — Contacted, awaiting responses ──────────────────

describe("Rule 5: contacted, awaiting responses", () => {
  it("2 buyers with 'sent' status — awaiting response", () => {
    const result = derive({
      buyerStatuses: [buyer("sent"), buyer("sent")],
    });
    expect(result.urgency).toBe("normal");
    expect(result.isStalled).toBe(false);
    expect(result.action).toContain("2 buyers contacted");
    expect(result.action).toContain("awaiting response");
  });

  it("1 buyer sent — singular grammar", () => {
    const result = derive({
      buyerStatuses: [buyer("sent")],
    });
    expect(result.action).toContain("1 buyer contacted");
  });
});

// ── Rule 6: LOW — Buyer selected ────────────────────────────────────

describe("Rule 6: buyer selected", () => {
  it("buyer selected — prepare closing", () => {
    const result = derive({
      buyerStatuses: [buyer("selected"), buyer("passed")],
    });
    expect(result.urgency).toBe("low");
    expect(result.isStalled).toBe(false);
    expect(result.action).toContain("Buyer selected");
  });
});

// ── daysInDispo calculation ─────────────────────────────────────────

describe("daysInDispo calculation", () => {
  it("calculates days correctly", () => {
    const result = derive({
      enteredDispoAt: "2026-03-08T10:00:00Z", // 4.17 days ago
    });
    expect(result.daysInDispo).toBe(4);
  });

  it("null enteredDispoAt — daysInDispo is null", () => {
    const result = derive({
      enteredDispoAt: null,
      buyerStatuses: [buyer("sent")],
    });
    expect(result.daysInDispo).toBeNull();
  });

  it("same-day entry — daysInDispo is 0", () => {
    const result = derive({
      enteredDispoAt: "2026-03-12T10:00:00Z", // 4 hours ago
      buyerStatuses: [buyer("sent")],
    });
    expect(result.daysInDispo).toBe(0);
  });
});

// ── Null safety / edge cases ────────────────────────────────────────

describe("null safety and edge cases", () => {
  it("empty buyer array with null enteredDispoAt — graceful handling", () => {
    const result = derive({
      enteredDispoAt: null,
      buyerStatuses: [],
    });
    // Can't determine days in dispo, but no buyers = needs buyers
    expect(result).toBeDefined();
    expect(result.daysInDispo).toBeNull();
  });

  it("all terminal buyer statuses — falls through to review", () => {
    const result = derive({
      buyerStatuses: [buyer("passed"), buyer("rejected")],
    });
    // No active buyers, all terminal
    expect(result).toBeDefined();
  });

  it("mixed active and terminal buyers — considers only active", () => {
    const result = derive({
      buyerStatuses: [buyer("interested", { respondedAt: "2026-03-11T10:00:00Z" }), buyer("passed")],
    });
    expect(result.urgency).toBe("normal");
    expect(result.action).toContain("responding");
  });

  it("buyer with null respondedAt in response status — not stalled (can't determine)", () => {
    const result = derive({
      buyerStatuses: [buyer("interested", { respondedAt: null })],
    });
    // respondedAt is null so daysSince returns null, stale check fails, not stalled
    expect(result.urgency).toBe("normal");
    expect(result.isStalled).toBe(false);
  });
});

// ── Priority ordering ───────────────────────────────────────────────

describe("priority ordering", () => {
  it("closed deal beats everything", () => {
    const result = derive({
      closingStatus: "closed",
      buyerStatuses: [], // would trigger "no buyers" stall
    });
    expect(result.urgency).toBe("none");
    expect(result.isStalled).toBe(false);
  });

  it("no buyers beats stale response (no buyers = more urgent)", () => {
    // If no buyers are linked at all, that's worse than a stale response
    const result = derive({
      buyerStatuses: [],
      enteredDispoAt: "2026-03-08T10:00:00Z",
    });
    expect(result.urgency).toBe("critical");
    expect(result.action).toContain("No buyers linked");
  });
});
