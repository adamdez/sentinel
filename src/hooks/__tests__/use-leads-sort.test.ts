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
      buildLead({ id: "unpinned-hot", pinned: false, score: { composite: 99 } }),
      buildLead({ id: "pinned-cold", pinned: true, score: { composite: 10 } }),
    ];

    expect(sortLeadRows(leads, "score", "desc").map((lead) => lead.id)).toEqual([
      "pinned-cold",
      "unpinned-hot",
    ]);
  });

  it("applies active-first ordering before follow-up urgency", () => {
    const leads = [
      buildLead({
        id: "unpinned-overdue",
        pinned: false,
        totalCalls: 2,
        lastContactAt: "2026-03-09T10:00:00Z",
        nextCallScheduledAt: "2026-03-10T10:00:00Z",
      }),
      buildLead({ id: "pinned-no-action", pinned: true }),
    ];

    expect(sortLeadRows(leads, "followUp", "asc").map((lead) => lead.id)).toEqual([
      "pinned-no-action",
      "unpinned-overdue",
    ]);
  });

  it("keeps the existing score order within the active group", () => {
    const leads = [
      buildLead({ id: "pinned-low", pinned: true, score: { composite: 30 } }),
      buildLead({ id: "pinned-high", pinned: true, score: { composite: 80 } }),
      buildLead({ id: "unpinned-top", pinned: false, score: { composite: 100 } }),
    ];

    expect(sortLeadRows(leads, "score", "desc").map((lead) => lead.id)).toEqual([
      "pinned-high",
      "pinned-low",
      "unpinned-top",
    ]);
  });
});
