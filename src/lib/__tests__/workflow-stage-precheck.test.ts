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

  it("allows nurture with a future date only", () => {
    const result = precheckWorkflowStageChange({
      ...base,
      targetStatus: "nurture",
      nextFollowUpAt: "2026-10-10",
      nextAction: null,
      noteDraft: "",
    });

    expect(result.ok).toBe(true);
    expect(result.requiredActions).toEqual([]);
  });

  it("blocks nurture without a future date", () => {
    const result = precheckWorkflowStageChange({
      ...base,
      targetStatus: "nurture",
      nextFollowUpAt: null,
      qualificationRoute: "nurture",
      nextAction: null,
    });

    expect(result.ok).toBe(false);
    expect(result.blockingReason).toContain("due date");
  });

  it("allows active without requiring note context", () => {
    const result = precheckWorkflowStageChange({
      ...base,
      targetStatus: "active",
      noteDraft: "",
    });

    expect(result.ok).toBe(true);
    expect(result.requiredActions).toEqual([]);
  });
});
