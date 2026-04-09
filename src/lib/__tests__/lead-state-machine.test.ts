import { describe, it, expect } from "vitest";
import {
  validateStatusTransition,
  validateStageTransition,
  getAllowedTransitions,
  incrementLockVersion,
} from "@/lib/lead-guardrails";
import { evaluateStageEntryPrerequisites } from "@/lib/lead-guards";
import type { LeadStatus } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  validateStatusTransition                                          */
/* ------------------------------------------------------------------ */

describe("validateStatusTransition", () => {
  const validTransitions: [LeadStatus, LeadStatus][] = [
    ["staging", "prospect"],
    ["staging", "dead"],
    ["prospect", "lead"],
    ["prospect", "active"],
    ["prospect", "nurture"],
    ["prospect", "dead"],
    ["lead", "active"],
    ["active", "negotiation"],
    ["active", "nurture"],
    ["active", "dead"],
    ["lead", "nurture"],
    ["lead", "dead"],
    ["negotiation", "disposition"],
    ["negotiation", "nurture"],
    ["negotiation", "dead"],
    ["disposition", "closed"],
    ["disposition", "nurture"],
    ["disposition", "dead"],
  ];

  it.each(validTransitions)("allows %s -> %s", (current, next) => {
    expect(validateStatusTransition(current, next)).toBe(true);
  });

  const invalidTransitions: [LeadStatus, LeadStatus][] = [
    ["staging", "negotiation"],
    ["staging", "closed"],
    ["closed", "staging"],
    ["closed", "prospect"],
    ["closed", "dead"],
    ["prospect", "closed"],
    ["prospect", "disposition"],
    ["prospect", "negotiation"],
    ["lead", "staging"],
    ["lead", "negotiation"],
    ["active", "lead"],
    ["dead", "prospect"],
  ];

  it.each(invalidTransitions)("rejects %s -> %s", (current, next) => {
    expect(validateStatusTransition(current, next)).toBe(false);
  });

  it("allows dead -> nurture (recovery)", () => {
    expect(validateStatusTransition("dead", "nurture")).toBe(true);
  });

  it("allows dead -> lead (resurrection)", () => {
    expect(validateStatusTransition("dead", "lead")).toBe(true);
  });

  it("allows nurture -> lead (re-engagement)", () => {
    expect(validateStatusTransition("nurture", "lead")).toBe(true);
  });

  it("allows nurture -> active (re-engagement with seller progress)", () => {
    expect(validateStatusTransition("nurture", "active")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  getAllowedTransitions                                             */
/* ------------------------------------------------------------------ */

describe("getAllowedTransitions", () => {
  const expected: Record<LeadStatus, ReadonlyArray<LeadStatus>> = {
    staging: ["prospect", "dead"],
    prospect: ["lead", "active", "nurture", "dead"],
    lead: ["active", "nurture", "dead"],
    active: ["negotiation", "nurture", "dead"],
    negotiation: ["disposition", "nurture", "dead"],
    disposition: ["closed", "nurture", "dead"],
    nurture: ["lead", "active", "dead"],
    dead: ["lead", "nurture"],
    closed: [],
  };

  for (const [status, transitions] of Object.entries(expected)) {
    it(`returns correct transitions for ${status}`, () => {
      expect(getAllowedTransitions(status as LeadStatus)).toEqual(transitions);
    });
  }
});

/* ------------------------------------------------------------------ */
/*  incrementLockVersion                                              */
/* ------------------------------------------------------------------ */

describe("incrementLockVersion", () => {
  it("increments by 1", () => {
    expect(incrementLockVersion(0)).toBe(1);
    expect(incrementLockVersion(5)).toBe(6);
    expect(incrementLockVersion(99)).toBe(100);
  });
});

/* ------------------------------------------------------------------ */
/*  validateStageTransition                                           */
/* ------------------------------------------------------------------ */

describe("validateStageTransition", () => {
  it("allows dead to lead resurrection without next_action", () => {
    expect(validateStageTransition("dead", "lead", null)).toEqual({
      valid: true,
      requiresNextAction: false,
    });
  });

  it("still requires next_action for a normal prospect to lead advance", () => {
    expect(validateStageTransition("prospect", "lead", null)).toEqual({
      valid: false,
      code: "missing_next_action",
      message: 'A next_action is required when advancing to "lead". Describe what happens next for this lead.',
    });
  });

  it("allows prospect to lead when next_action is provided", () => {
    expect(validateStageTransition("prospect", "lead", "Call back tomorrow morning")).toEqual({
      valid: true,
      requiresNextAction: true,
    });
  });

  it("allows dead to lead when next_action is provided", () => {
    expect(validateStageTransition("dead", "lead", "Call back tomorrow morning")).toEqual({
      valid: true,
      requiresNextAction: false,
    });
  });
});

/* ------------------------------------------------------------------ */
/*  evaluateStageEntryPrerequisites                                   */
/* ------------------------------------------------------------------ */

describe("evaluateStageEntryPrerequisites", () => {
  const base = {
    currentStatus: "prospect" as LeadStatus,
    targetStatus: "prospect" as LeadStatus,
    effectiveAssignedTo: "logan",
    hasContactEvidence: true,
    effectiveNextCallAt: null,
    effectiveNextFollowUpAt: null,
    nextQualificationRoute: null,
    noteAppendText: "",
    existingNotes: null,
    hasActivityNoteContext: false,
    dispositionCode: null,
  };

  it("blocks active without a short note", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      targetStatus: "active",
      noteAppendText: "",
      existingNotes: null,
    });
    expect(err).toBeTruthy();
    expect(err).toContain("Active");
  });

  it("allows active with a short progress note", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      targetStatus: "active",
      noteAppendText: "see notes",
    });
    expect(err).toBeNull();
  });

  it("allows active with legacy lead notes", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      targetStatus: "active",
      existingNotes: "Prior seller note on file.",
    });
    expect(err).toBeNull();
  });

  it("allows active with prior manual activity notes", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      targetStatus: "active",
      hasActivityNoteContext: true,
    });
    expect(err).toBeNull();
  });

  it("blocks negotiation without assigned_to", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      targetStatus: "negotiation",
      effectiveAssignedTo: null,
      hasContactEvidence: true,
    });
    expect(err).toBeTruthy();
    expect(err).toContain("assign");
  });

  it("blocks negotiation without contact evidence", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      targetStatus: "negotiation",
      effectiveAssignedTo: "logan",
      hasContactEvidence: false,
    });
    expect(err).toBeTruthy();
    expect(err).toContain("contact");
  });

  it("allows negotiation with assigned_to and contact evidence", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      targetStatus: "negotiation",
      effectiveAssignedTo: "logan",
      hasContactEvidence: true,
    });
    expect(err).toBeNull();
  });

  it("blocks nurture without follow-up date", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      targetStatus: "nurture",
      effectiveNextFollowUpAt: null,
      nextQualificationRoute: "nurture",
    });
    expect(err).toBeTruthy();
  });

  it("blocks nurture without reason", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      targetStatus: "nurture",
      effectiveNextFollowUpAt: "2026-04-01T12:00:00Z",
      nextQualificationRoute: null,
      noteAppendText: "",
      dispositionCode: null,
    });
    expect(err).toBeTruthy();
  });

  it("allows nurture with follow-up date and nurture route", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      targetStatus: "nurture",
      effectiveNextFollowUpAt: "2026-04-01T12:00:00Z",
      nextQualificationRoute: "nurture",
    });
    expect(err).toBeNull();
  });

  it("blocks dead without reason", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      targetStatus: "dead",
      nextQualificationRoute: null,
      noteAppendText: "",
      dispositionCode: null,
      existingNotes: null,
    });
    expect(err).toBeTruthy();
  });

  it("allows dead with dead route", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      targetStatus: "dead",
      nextQualificationRoute: "dead",
    });
    expect(err).toBeNull();
  });

  it("allows dead with dead disposition code (do_not_call)", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      targetStatus: "dead",
      nextQualificationRoute: null,
      dispositionCode: "do_not_call",
    });
    expect(err).toBeNull();
  });

  it("allows dead with notes (>= 12 chars)", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      targetStatus: "dead",
      nextQualificationRoute: null,
      dispositionCode: null,
      noteAppendText: "Seller not interested in any offer",
    });
    expect(err).toBeNull();
  });

  it("blocks disposition if currentStatus is not negotiation", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      currentStatus: "lead",
      targetStatus: "disposition",
      effectiveNextFollowUpAt: "2026-04-01T12:00:00Z",
    });
    expect(err).toBeTruthy();
  });

  it("blocks disposition without follow-up date", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      currentStatus: "negotiation",
      targetStatus: "disposition",
      effectiveNextFollowUpAt: null,
    });
    expect(err).toBeTruthy();
  });

  it("allows disposition from negotiation with follow-up date", () => {
    const err = evaluateStageEntryPrerequisites({
      ...base,
      currentStatus: "negotiation",
      targetStatus: "disposition",
      effectiveNextFollowUpAt: "2026-04-01T12:00:00Z",
    });
    expect(err).toBeNull();
  });
});
