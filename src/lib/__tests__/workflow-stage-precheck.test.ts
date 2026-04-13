import { describe, expect, it } from "vitest";
import { precheckWorkflowStageChange } from "@/lib/workflow-stage-precheck";
import type { LeadStatus } from "@/lib/types";

describe("precheckWorkflowStageChange", () => {
  const base = {
    currentStatus: "lead" as LeadStatus,
    targetStatus: "lead" as LeadStatus,
    assignedTo: "user-1",
    lastContactAt: "2026-04-10T16:00:00.000Z",
    totalCalls: 2,
    dispositionCode: null,
    nextCallScheduledAt: null,
    nextFollowUpAt: null,
    qualificationRoute: null,
    nextAction: null,
    notes: null,
    noteDraft: "",
    hasActivityNoteContext: false,
  };

  it("allows nurture with a free-text next step, future date, and context", () => {
    const result = precheckWorkflowStageChange({
      ...base,
      targetStatus: "nurture",
      nextFollowUpAt: "2026-10-10",
      nextAction: "Call back in 6 months",
      noteDraft: "Family asked us to revisit this later in the year.",
    });

    expect(result.ok).toBe(true);
    expect(result.requiredActions).toEqual([]);
  });

  it("blocks nurture without context even when nurture intent is present", () => {
    const result = precheckWorkflowStageChange({
      ...base,
      targetStatus: "nurture",
      nextFollowUpAt: "2026-10-10",
      qualificationRoute: "nurture",
      nextAction: "Nurture check-in in 6 months",
      noteDraft: "",
      dispositionCode: null,
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReason).toContain("requires context");
  });

  it("allows nurture with future date, route, and context", () => {
    const result = precheckWorkflowStageChange({
      ...base,
      targetStatus: "nurture",
      nextFollowUpAt: "2026-10-10",
      qualificationRoute: "nurture",
      nextAction: "Nurture check-in in 6 months",
      noteDraft: "Family requested a six-month check-in after probate paperwork settles.",
    });

    expect(result.ok).toBe(true);
    expect(result.requiredActions).toEqual([]);
  });
});
