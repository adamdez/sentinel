/**
 * Lead Stage Entry Prerequisites
 *
 * Extracted from prospects route for testability.
 * Pure function — no DB calls, no side effects.
 *
 * Returns null if transition is allowed, or an error message string if blocked.
 */

import type { LeadStatus, QualificationRoute } from "@/lib/types";

export type StageEntryPrereqInput = {
  currentStatus: LeadStatus;
  targetStatus: LeadStatus;
  effectiveAssignedTo: string | null;
  hasContactEvidence: boolean;
  effectiveNextCallAt: string | null;
  effectiveNextFollowUpAt: string | null;
  nextQualificationRoute: QualificationRoute | null;
  nextAction: string | null;
  noteAppendText: string;
  existingNotes: string | null;
  hasActivityNoteContext: boolean;
  dispositionCode: string | null;
};

const DEAD_DISPOSITION_SIGNALS = new Set([
  "dead",
  "do_not_call",
  "wrong_number",
  "disconnected",
  "ghost",
  "not_interested",
  "not_qualified",
]);

function hasNurtureIntentSignal(
  qualificationRoute: QualificationRoute | null,
  nextAction: string | null,
): boolean {
  if (qualificationRoute === "nurture") return true;
  return typeof nextAction === "string" && nextAction.trim().length > 0;
}

export function evaluateStageEntryPrerequisites(input: StageEntryPrereqInput): string | null {
  void input.nextQualificationRoute;
  void input.nextAction;
  void input.noteAppendText;
  void input.existingNotes;
  void input.hasActivityNoteContext;
  void input.dispositionCode;

  if (input.targetStatus === "negotiation") {
    if (!input.effectiveAssignedTo) {
      return "Move to Negotiation requires an owner assignment. Claim or assign the lead first.";
    }
    if (!input.hasContactEvidence) {
      return "Move to Negotiation requires contact effort (last contact or call activity). Log a contact attempt first.";
    }
  }

  if (input.targetStatus === "nurture") {
    if (!input.effectiveNextCallAt && !input.effectiveNextFollowUpAt) {
      return "Move to Nurture requires a due date.";
    }
  }

  if (input.targetStatus === "disposition") {
    if (input.currentStatus !== "negotiation") {
      return "Move to Disposition requires active negotiation context. Move through Negotiation first.";
    }
    if (!input.effectiveNextCallAt && !input.effectiveNextFollowUpAt) {
      return "Move to Disposition requires a due date.";
    }
  }

  return null;
}
