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
    ...overrides,
  };
}

describe("sortLeadRows", () => {
  it("floats active leads above higher-scoring inactive leads", () => {
    const leads = [
      buildLead({ id: "inactive-hot", pinned: false, score: { composite: 99 } }),
      buildLead({ id: "active-cold", pinned: true, score: { composite: 10 } }),
    ];

    expect(sortLeadRows(leads, "score", "desc").map((lead) => lead.id)).toEqual([
      "active-cold",
      "inactive-hot",
    ]);
  });

  it("applies active-first ordering before follow-up urgency", () => {
    const leads = [
      buildLead({
        id: "inactive-overdue",
        pinned: false,
        totalCalls: 2,
        lastContactAt: "2026-03-09T10:00:00Z",
        nextCallScheduledAt: "2026-03-10T10:00:00Z",
      }),
      buildLead({ id: "active-no-action", pinned: true }),
    ];

    expect(sortLeadRows(leads, "followUp", "asc").map((lead) => lead.id)).toEqual([
      "active-no-action",
      "inactive-overdue",
    ]);
  });

  it("keeps the existing score order within the active group", () => {
    const leads = [
      buildLead({ id: "active-low", pinned: true, score: { composite: 30 } }),
      buildLead({ id: "active-high", pinned: true, score: { composite: 80 } }),
      buildLead({ id: "inactive-top", pinned: false, score: { composite: 100 } }),
    ];

    expect(sortLeadRows(leads, "score", "desc").map((lead) => lead.id)).toEqual([
      "active-high",
      "active-low",
      "inactive-top",
    ]);
  });
});
