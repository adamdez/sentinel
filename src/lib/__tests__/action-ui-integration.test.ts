/**
 * Action Derivation UI Integration Tests
 *
 * Verifies that the helper wiring used by UI surfaces (lead-table, pipeline,
 * client-file header, dispo cards) produces the expected output shapes for
 * typical data patterns seen in operator workflows.
 *
 * These tests ensure:
 * 1. The helper inputs map correctly from various data shapes (LeadRow, Pipeline Lead, DispoDeal)
 * 2. Null/legacy data doesn't crash
 * 3. The urgency → UI class mapping is consistent
 * 4. Action labels are readable for operators
 */

import { describe, it, expect } from "vitest";
import {
  deriveLeadActionSummary,
  type UrgencyLevel,
} from "@/lib/action-derivation";
import {
  deriveDispoActionSummary,
  type DispoDerivationInput,
  type BuyerStatusSummary,
} from "@/lib/dispo-action-derivation";

const NOW = new Date("2026-03-12T14:00:00Z");

// ── Lead Table Data Shape Tests ─────────────────────────────────────

describe("lead table data shape → action summary", () => {
  /**
   * Mirrors the `deriveActionForLead(lead)` wrapper in lead-table.tsx
   */
  function fromLeadRow(overrides: Partial<{
    status: string;
    qualificationRoute: string | null;
    assignedTo: string | null;
    nextCallScheduledAt: string | null;
    followUpDate: string | null;
    lastContactAt: string | null;
    totalCalls: number;
    promotedAt: string;
  }> = {}) {
    return deriveLeadActionSummary({
      status: overrides.status ?? "lead",
      qualificationRoute: overrides.qualificationRoute ?? null,
      assignedTo: overrides.assignedTo ?? "user-1",
      nextCallScheduledAt: overrides.nextCallScheduledAt ?? null,
      nextFollowUpAt: overrides.followUpDate ?? null,
      lastContactAt: overrides.lastContactAt ?? null,
      totalCalls: overrides.totalCalls ?? 0,
      createdAt: overrides.promotedAt ?? "2026-03-10T10:00:00Z",
      promotedAt: overrides.promotedAt ?? "2026-03-10T10:00:00Z",
      now: NOW,
    });
  }

  it("uncontacted lead 2 days old → critical action", () => {
    const result = fromLeadRow({ totalCalls: 0, lastContactAt: null });
    expect(result.urgency).toBe("critical");
    expect(result.isActionable).toBe(true);
    expect(result.action).toContain("No contact attempt");
  });

  it("contacted lead with no route → high (needs qualification)", () => {
    const result = fromLeadRow({
      totalCalls: 3,
      lastContactAt: "2026-03-11T10:00:00Z",
      qualificationRoute: null,
    });
    expect(result.urgency).toBe("high");
    expect(result.action).toContain("qualification");
    expect(result.actionType).toBe("review");
  });

  it("recently contacted, route set → on track", () => {
    const result = fromLeadRow({
      totalCalls: 5,
      lastContactAt: "2026-03-12T10:00:00Z",
      qualificationRoute: "follow_up",
    });
    expect(result.urgency).toBe("none");
    expect(result.isActionable).toBe(false);
  });

  it("overdue callback → critical", () => {
    const result = fromLeadRow({
      totalCalls: 2,
      lastContactAt: "2026-03-09T10:00:00Z",
      nextCallScheduledAt: "2026-03-10T10:00:00Z", // 2 days ago
    });
    expect(result.urgency).toBe("critical");
    expect(result.action).toContain("overdue");
  });

  it("dead lead → no action", () => {
    const result = fromLeadRow({ status: "dead" });
    expect(result.urgency).toBe("none");
    expect(result.isActionable).toBe(false);
  });

  it("offer-prep active with stale contact → helper still fires stale rule", () => {
    const result = fromLeadRow({
      totalCalls: 4,
      lastContactAt: "2026-03-01T10:00:00Z", // 11 days stale
      qualificationRoute: "offer_ready",
    });
    // Helper detects stale contact; offer-prep check is done separately in UI
    expect(result.urgency).toBe("high");
    expect(result.action).toContain("No contact in");
  });
});

// ── Pipeline Card Data Shape Tests ──────────────────────────────────

describe("pipeline card data shape → action summary", () => {
  /**
   * Pipeline uses snake_case fields and doesn't have totalCalls or lastContactAt.
   * Tests verify the helper handles null totalCalls gracefully.
   */
  function fromPipelineLead(overrides: Partial<{
    status: string;
    qualification_route: string | null;
    owner_id: string | null;
    follow_up_at: string | null;
    promoted_at: string | null;
  }> = {}) {
    return deriveLeadActionSummary({
      status: overrides.status ?? "lead",
      qualificationRoute: overrides.qualification_route ?? null,
      assignedTo: overrides.owner_id ?? "user-1",
      nextFollowUpAt: overrides.follow_up_at ?? null,
      lastContactAt: null, // not available in pipeline Lead type
      totalCalls: null, // not available in pipeline Lead type
      createdAt: overrides.promoted_at ?? "2026-03-10T10:00:00Z",
      promotedAt: overrides.promoted_at ?? "2026-03-10T10:00:00Z",
      now: NOW,
    });
  }

  it("lead with null totalCalls → still produces valid result", () => {
    const result = fromPipelineLead();
    expect(result).toBeDefined();
    expect(result.urgency).toBeDefined();
  });

  it("overdue follow-up in pipeline → critical", () => {
    const result = fromPipelineLead({
      follow_up_at: "2026-03-10T10:00:00Z", // 2 days ago
    });
    expect(result.urgency).toBe("critical");
    expect(result.isActionable).toBe(true);
  });

  it("nurture status with no follow-up → appropriate urgency", () => {
    const result = fromPipelineLead({
      status: "nurture",
      follow_up_at: null,
    });
    // Nurture with null totalCalls and null lastContactAt → on cadence (can't determine stale)
    expect(result).toBeDefined();
    expect(result.urgency).not.toBe("critical");
  });

  it("prospect status → awaiting promotion", () => {
    const result = fromPipelineLead({ status: "prospect" });
    expect(result.action).toContain("Awaiting promotion");
    expect(result.urgency).toBe("low");
  });
});

// ── Dispo Card Data Shape Tests ─────────────────────────────────────

describe("dispo deal data shape → action summary", () => {
  function buyer(status: string, overrides: Partial<BuyerStatusSummary> = {}): BuyerStatusSummary {
    return { status, ...overrides };
  }

  function fromDispoDeal(overrides: Partial<DispoDerivationInput> = {}) {
    return deriveDispoActionSummary({
      enteredDispoAt: "2026-03-08T10:00:00Z",
      buyerStatuses: [],
      now: NOW,
      ...overrides,
    });
  }

  it("no buyers 4 days in → critical stall", () => {
    const result = fromDispoDeal({ buyerStatuses: [] });
    expect(result.urgency).toBe("critical");
    expect(result.isStalled).toBe(true);
    expect(result.daysInDispo).toBe(4);
    expect(result.action).toContain("No buyers linked");
  });

  it("buyer interested 1 day ago → normal, not stalled", () => {
    const result = fromDispoDeal({
      buyerStatuses: [buyer("interested", { respondedAt: "2026-03-11T10:00:00Z" })],
    });
    expect(result.urgency).toBe("normal");
    expect(result.isStalled).toBe(false);
  });

  it("buyer interested 5 days ago → high stall", () => {
    const result = fromDispoDeal({
      buyerStatuses: [buyer("interested", { respondedAt: "2026-03-07T10:00:00Z" })],
    });
    expect(result.urgency).toBe("high");
    expect(result.isStalled).toBe(true);
    expect(result.action).toContain("follow up");
  });

  it("closed deal → none urgency", () => {
    const result = fromDispoDeal({
      closingStatus: "closed",
      buyerStatuses: [buyer("selected")],
    });
    expect(result.urgency).toBe("none");
    expect(result.isStalled).toBe(false);
  });

  it("all pre-contact, 4 days → high stall", () => {
    const result = fromDispoDeal({
      buyerStatuses: [buyer("not_contacted"), buyer("queued")],
    });
    expect(result.urgency).toBe("high");
    expect(result.isStalled).toBe(true);
  });

  it("2 sent buyers → normal, awaiting response", () => {
    const result = fromDispoDeal({
      buyerStatuses: [buyer("sent"), buyer("sent")],
    });
    expect(result.urgency).toBe("normal");
    expect(result.action).toContain("2 buyers contacted");
  });

  it("null enteredDispoAt → daysInDispo is null", () => {
    const result = fromDispoDeal({
      enteredDispoAt: null,
      buyerStatuses: [buyer("sent")],
    });
    expect(result.daysInDispo).toBeNull();
  });
});

// ── Urgency → CSS Class Mapping ─────────────────────────────────────

describe("urgency → UI style mapping", () => {
  /**
   * Mirrors the urgencyTextClass() and dispoUrgencyClass() helpers
   * used in lead-table.tsx and dispo/page.tsx
   */
  function urgencyTextClass(urgency: UrgencyLevel): string {
    switch (urgency) {
      case "critical": return "text-red-400 font-semibold";
      case "high": return "text-amber-300";
      case "normal": return "text-muted-foreground/70";
      case "low": return "text-muted-foreground/50";
      case "none": return "text-muted-foreground/40";
    }
  }

  const levels: UrgencyLevel[] = ["critical", "high", "normal", "low", "none"];

  it("every urgency level maps to a non-empty class string", () => {
    for (const level of levels) {
      expect(urgencyTextClass(level).length).toBeGreaterThan(0);
    }
  });

  it("critical uses red", () => {
    expect(urgencyTextClass("critical")).toContain("red");
  });

  it("high uses amber", () => {
    expect(urgencyTextClass("high")).toContain("amber");
  });

  it("none uses muted foreground", () => {
    expect(urgencyTextClass("none")).toContain("muted-foreground");
  });
});

// ── Action Label Readability ────────────────────────────────────────

describe("action labels are operator-readable", () => {
  it("critical labels describe what to do", () => {
    const overdue = deriveLeadActionSummary({
      status: "lead",
      nextCallScheduledAt: "2026-03-10T10:00:00Z",
      lastContactAt: "2026-03-09T10:00:00Z",
      totalCalls: 2,
      now: NOW,
    });
    // Should be something like "Callback 2d overdue"
    expect(overdue.action.length).toBeGreaterThan(5);
    expect(overdue.action.length).toBeLessThan(50);
    expect(overdue.reason.length).toBeGreaterThan(10);
  });

  it("on-track labels are calm", () => {
    const onTrack = deriveLeadActionSummary({
      status: "lead",
      totalCalls: 5,
      lastContactAt: "2026-03-12T10:00:00Z",
      qualificationRoute: "follow_up",
      now: NOW,
    });
    expect(onTrack.action).toBe("On track");
  });

  it("dispo action labels explain stall reason", () => {
    const nobuyers = deriveDispoActionSummary({
      enteredDispoAt: "2026-03-08T10:00:00Z",
      buyerStatuses: [],
      now: NOW,
    });
    expect(nobuyers.action).toContain("No buyers");
    expect(nobuyers.reason.length).toBeGreaterThan(10);
  });
});

// ── Client File Header Integration ──────────────────────────────────

describe("client file header action banner", () => {
  /**
   * Mirrors the URGENCY_STYLES lookup in client-file-v2/header.tsx.
   * Tests that style selection logic handles all urgency levels safely.
   */
  const URGENCY_STYLES = {
    critical: { border: "border-red-500/25" },
    high: { border: "border-amber-500/25" },
    normal: { border: "border-primary/20" },
  } as const;

  it("critical/high/normal urgency maps to a style", () => {
    for (const key of ["critical", "high", "normal"] as const) {
      expect(URGENCY_STYLES[key]).toBeDefined();
      expect(URGENCY_STYLES[key].border.length).toBeGreaterThan(0);
    }
  });

  it("action summary with isActionable=false → banner should not show", () => {
    const summary = deriveLeadActionSummary({
      status: "dead",
      now: NOW,
    });
    expect(summary.isActionable).toBe(false);
    // UI logic: showAction = isActionable && urgency !== "none" && urgency !== "low"
    const showAction = summary.isActionable && summary.urgency !== "none" && summary.urgency !== "low";
    expect(showAction).toBe(false);
  });

  it("critical lead → banner should show", () => {
    const summary = deriveLeadActionSummary({
      status: "lead",
      totalCalls: 0,
      lastContactAt: null,
      createdAt: "2026-03-09T10:00:00Z",
      now: NOW,
    });
    const showAction = summary.isActionable && summary.urgency !== "none" && summary.urgency !== "low";
    expect(showAction).toBe(true);
  });

  it("low urgency → banner should not show", () => {
    const summary = deriveLeadActionSummary({
      status: "prospect",
      now: NOW,
    });
    expect(summary.urgency).toBe("low");
    const showAction = summary.isActionable && summary.urgency !== "none" && summary.urgency !== "low";
    expect(showAction).toBe(false);
  });
});
