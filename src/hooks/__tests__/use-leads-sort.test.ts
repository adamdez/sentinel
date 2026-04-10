import { describe, expect, it } from "vitest";
import { sortLeadRows, type SortableLeadRow } from "@/hooks/use-leads-sort";

function buildLead(overrides: Partial<SortableLeadRow> & Pick<SortableLeadRow, "id">): SortableLeadRow {
  return {
    id: overrides.id,
    pinned: false,
    score: { composite: 0 },
    predictivePriority: 0,
    address: `${overrides.id} address`,
    ownerName: `${overrides.id} owner`,
    equityPercent: 0,
    status: "lead",
    qualificationRoute: null,
    assignedTo: null,
    nextCallScheduledAt: null,
    followUpDate: null,
    lastContactAt: null,
    totalCalls: 0,
    promotedAt: "2026-03-10T10:00:00Z",
    nextAction: null,
    nextActionDueAt: null,
    introSopActive: false,
    introDayCount: 0,
    introLastCallDate: null,
    requiresIntroExitCategory: false,
    ...overrides,
  };
}

describe("sortLeadRows", () => {
  it("uses the chosen score sort instead of forcing pinned rows to the top", () => {
    const leads = [
      buildLead({ id: "inactive-hot", pinned: false, score: { composite: 99 } }),
      buildLead({ id: "active-cold", pinned: true, score: { composite: 10 } }),
    ];

    expect(sortLeadRows(leads, "score", "desc").map((lead) => lead.id)).toEqual([
      "inactive-hot",
      "active-cold",
    ]);
  });

  it("sorts Do Now by the visible label family instead of hidden urgency buckets", () => {
    const leads = [
      buildLead({
        id: "new-lead",
        pinned: true,
        promotedAt: "2026-03-10T10:00:00Z",
      }),
      buildLead({
        id: "callback-overdue",
        pinned: false,
        totalCalls: 2,
        lastContactAt: "2026-03-09T10:00:00Z",
        nextCallScheduledAt: "2026-03-10T09:00:00Z",
      }),
      buildLead({
        id: "done-for-today",
        pinned: false,
        introSopActive: true,
        introDayCount: 1,
        introLastCallDate: "2026-03-10",
      }),
    ];

    expect(sortLeadRows(leads, "followUp", "asc").map((lead) => lead.id)).toEqual([
      "done-for-today",
      "callback-overdue",
      "new-lead",
    ]);
  });

  it("sorts Due by the visible effective due date even when pinned differs", () => {
    const leads = [
      buildLead({
        id: "later-due",
        pinned: true,
        nextCallScheduledAt: "2026-03-12T10:00:00Z",
      }),
      buildLead({
        id: "earlier-due",
        pinned: false,
        nextActionDueAt: "2026-03-11T10:00:00Z",
      }),
    ];

    expect(sortLeadRows(leads, "due", "asc").map((lead) => lead.id)).toEqual(["earlier-due", "later-due"]);
  });

  it("sorts Last Touch by actual recency instead of pin state", () => {
    const leads = [
      buildLead({
        id: "older-touch",
        pinned: true,
        lastContactAt: "2026-03-08T10:00:00Z",
      }),
      buildLead({
        id: "newer-touch",
        pinned: false,
        lastContactAt: "2026-03-10T10:00:00Z",
      }),
    ];

    expect(sortLeadRows(leads, "lastTouch", "desc").map((lead) => lead.id)).toEqual(["newer-touch", "older-touch"]);
  });

  it("keeps equal visible values stable with tie-breakers", () => {
    const leads = [
      buildLead({ id: "b", ownerName: "Hill", address: "100 Main St" }),
      buildLead({ id: "a", ownerName: "Hill", address: "100 Main St" }),
    ];

    expect(sortLeadRows(leads, "owner", "asc").map((lead) => lead.id)).toEqual(["a", "b"]);
  });
});
