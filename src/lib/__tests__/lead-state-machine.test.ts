import { describe, it, expect } from "vitest";
import {
  validateStatusTransition,
  getAllowedTransitions,
  incrementLockVersion,
} from "@/lib/lead-guardrails";
import { evaluateStageEntryPrerequisites } from "@/lib/lead-guards";
import type { LeadStatus } from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  validateStatusTransition                                          */
/* ------------------------------------------------------------------ */

describe("validateStatusTransition", () => {
  /* ---- valid forward transitions ---- */
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

  it.each(validTransitions)(
    "allows %s → %s",
    (current, next) => {
      expect(validateStatusTransition(current, next)).toBe(true);
    },
  );

  /* ---- invalid transitions ---- */
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

  it.each(invalidTransitions)(
    "rejects %s → %s",
    (current, next) => {
      expect(validateStatusTransition(current, next)).toBe(false);
    },
  );

  /* ---- backward / recovery transitions ---- */
  it("allows dead → nurture (recovery)", () => {
    expect(validateStatusTransition("dead", "nurture")).toBe(true);
  });

  it("allows nurture → lead (re-engagement)", () => {
    expect(validateStatusTransition("nurture", "lead")).toBe(true);
  });

  it("allows nurture → active (re-engagement with seller progress)", () => {
    expect(validateStatusTransition("nurture", "active")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  getAllowedTransitions                                              */
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
    dead: ["nurture"],
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
    dispositionCode: null,
  };

  /* ---- negotiation guards ---- */

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
      noteAppendText: "Seller discussed timeline and condition details.",
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

  /* ---- nurture guards ---- */

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

  /* ---- dead guards ---- */

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

  /* ---- disposition guards ---- */

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
