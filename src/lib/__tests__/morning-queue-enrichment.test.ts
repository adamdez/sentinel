/**
 * Morning Queue Enrichment Tests
 *
 * Verifies that the enriched QueueItem (actionLabel + actionUrgency)
 * produces the right operator-facing context for typical morning queue
 * scenarios. These mirror the toItem() wiring in use-morning-queue.ts.
 */

import { describe, it, expect } from "vitest";
import { deriveLeadActionSummary, type UrgencyLevel } from "@/lib/action-derivation";

const NOW = new Date("2026-03-12T14:00:00Z");

/**
 * Simulates the toItem() enrichment in use-morning-queue.ts:
 * maps a snake_case lead row to deriveLeadActionSummary input,
 * returns the action fields that would populate QueueItem.
 */
function enrichQueueItem(lead: {
  status: string;
  qualification_route?: string | null;
  assigned_to?: string | null;
  next_call_scheduled_at?: string | null;
  next_follow_up_at?: string | null;
  last_contact_at?: string | null;
  total_calls?: number | null;
  created_at?: string | null;
  promoted_at?: string | null;
}): { actionLabel: string; actionUrgency: UrgencyLevel } {
  const summary = deriveLeadActionSummary({
    status: lead.status,
    qualificationRoute: lead.qualification_route ?? null,
    assignedTo: lead.assigned_to ?? null,
    nextCallScheduledAt: lead.next_call_scheduled_at ?? null,
    nextFollowUpAt: lead.next_follow_up_at ?? null,
    lastContactAt: lead.last_contact_at ?? null,
    totalCalls: lead.total_calls ?? null,
    createdAt: lead.created_at ?? null,
    promotedAt: lead.promoted_at ?? lead.created_at ?? null,
    now: NOW,
  });
  return { actionLabel: summary.action, actionUrgency: summary.urgency };
}

describe("morning queue enrichment — overdue bucket leads", () => {
  it("overdue callback → critical action label", () => {
    const result = enrichQueueItem({
      status: "lead",
      total_calls: 2,
      last_contact_at: "2026-03-09T10:00:00Z",
      next_call_scheduled_at: "2026-03-10T10:00:00Z",
      created_at: "2026-03-05T10:00:00Z",
    });
    expect(result.actionUrgency).toBe("critical");
    expect(result.actionLabel).toContain("overdue");
  });

  it("overdue follow-up → critical", () => {
    const result = enrichQueueItem({
      status: "lead",
      total_calls: 3,
      last_contact_at: "2026-03-08T10:00:00Z",
      next_follow_up_at: "2026-03-10T10:00:00Z",
      created_at: "2026-03-05T10:00:00Z",
    });
    expect(result.actionUrgency).toBe("critical");
  });
});

describe("morning queue enrichment — due-today bucket leads", () => {
  it("lead with follow-up today and recent contact → not critical", () => {
    const result = enrichQueueItem({
      status: "lead",
      total_calls: 4,
      last_contact_at: "2026-03-11T10:00:00Z",
      next_follow_up_at: "2026-03-12T18:00:00Z",
      qualification_route: "follow_up",
      created_at: "2026-03-05T10:00:00Z",
    });
    // Should not be critical since contact is recent and follow-up is today, not overdue
    expect(result.actionUrgency).not.toBe("critical");
  });
});

describe("morning queue enrichment — needs-qualification bucket", () => {
  it("contacted lead with no route → high urgency, qualification action", () => {
    const result = enrichQueueItem({
      status: "lead",
      total_calls: 3,
      last_contact_at: "2026-03-11T10:00:00Z",
      qualification_route: null,
      created_at: "2026-03-08T10:00:00Z",
    });
    expect(result.actionUrgency).toBe("high");
    expect(result.actionLabel).toBe("Needs next step");
  });
});

describe("morning queue enrichment — new-inbound bucket", () => {
  it("new lead >24h old with no contact → critical uncontacted", () => {
    const result = enrichQueueItem({
      status: "lead",
      total_calls: 0,
      last_contact_at: null,
      created_at: "2026-03-10T10:00:00Z", // >24h old
    });
    expect(result.actionUrgency).toBe("critical");
    expect(result.actionLabel).toContain("No contact attempt");
  });

  it("same-day lead with no contact → not yet critical (within speed-to-lead window)", () => {
    const result = enrichQueueItem({
      status: "lead",
      total_calls: 0,
      last_contact_at: null,
      created_at: "2026-03-12T08:00:00Z", // 6h old, within 24h threshold
    });
    expect(result.actionUrgency).not.toBe("critical");
  });
});

describe("morning queue enrichment — stale nurture bucket", () => {
  it("nurture lead with stale contact → high urgency", () => {
    const result = enrichQueueItem({
      status: "nurture",
      total_calls: 5,
      last_contact_at: "2026-02-20T10:00:00Z", // 20 days ago
      created_at: "2026-01-15T10:00:00Z",
    });
    expect(result.actionUrgency).toBe("high");
    expect(result.actionLabel).toContain("No contact in");
  });
});

describe("morning queue enrichment — null/missing data resilience", () => {
  it("null totalCalls and null lastContactAt → still produces valid enrichment", () => {
    const result = enrichQueueItem({
      status: "lead",
      total_calls: null,
      last_contact_at: null,
      created_at: "2026-03-10T10:00:00Z",
    });
    expect(result.actionLabel).toBeDefined();
    expect(result.actionLabel.length).toBeGreaterThan(0);
    expect(result.actionUrgency).toBeDefined();
  });

  it("null promoted_at falls back to created_at", () => {
    const result = enrichQueueItem({
      status: "lead",
      total_calls: 0,
      last_contact_at: null,
      created_at: "2026-03-10T10:00:00Z",
      promoted_at: null,
    });
    // Should still produce a valid action based on created_at age
    expect(result.actionLabel).toBeDefined();
  });

  it("prospect status → awaiting promotion", () => {
    const result = enrichQueueItem({
      status: "prospect",
      created_at: "2026-03-10T10:00:00Z",
    });
    expect(result.actionLabel).toContain("Awaiting promotion");
    expect(result.actionUrgency).toBe("low");
  });

  it("dead lead → none urgency, not actionable label", () => {
    const result = enrichQueueItem({
      status: "dead",
      created_at: "2026-03-01T10:00:00Z",
    });
    expect(result.actionUrgency).toBe("none");
  });
});

describe("morning queue enrichment — action labels are operator-readable", () => {
  it("action labels are short enough for queue display", () => {
    const scenarios = [
      { status: "lead", total_calls: 0, last_contact_at: null, created_at: "2026-03-10T10:00:00Z" },
      { status: "lead", total_calls: 3, last_contact_at: "2026-03-11T10:00:00Z", qualification_route: null, created_at: "2026-03-08T10:00:00Z" },
      { status: "nurture", total_calls: 5, last_contact_at: "2026-02-20T10:00:00Z", created_at: "2026-01-15T10:00:00Z" },
    ];

    for (const s of scenarios) {
      const result = enrichQueueItem(s);
      expect(result.actionLabel.length).toBeGreaterThan(3);
      expect(result.actionLabel.length).toBeLessThan(50);
    }
  });
});
