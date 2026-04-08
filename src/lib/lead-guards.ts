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
  noteAppendText: string;
  existingNotes: string | null;
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

export function evaluateStageEntryPrerequisites(input: StageEntryPrereqInput): string | null {
  const hasExistingNotes = typeof input.existingNotes === "string" && input.existingNotes.trim().length >= 12;
  const hasNoteContext = input.noteAppendText.length > 0 || hasExistingNotes;
  const dispositionCode = (input.dispositionCode ?? "").toLowerCase();
  const hasDispositionSignal = dispositionCode.length > 0;

  if (input.targetStatus === "active") {
    if (!hasNoteContext) {
      return "Move to Active requires a short seller progress note.";
    }
  }

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
      return "Move to Nurture requires a next follow-up date. Set Next Action/Callback first.";
    }
    const hasNurtureReason =
      input.nextQualificationRoute === "nurture"
      || input.nextQualificationRoute === "follow_up"
      || hasDispositionSignal
      || hasNoteContext;
    if (!hasNurtureReason) {
      return "Move to Nurture requires context. Set a qualification route, add disposition context, or add a note.";
    }
  }

  if (input.targetStatus === "dead") {
    const hasDeadReason =
      input.nextQualificationRoute === "dead"
      || DEAD_DISPOSITION_SIGNALS.has(dispositionCode)
      || hasNoteContext;
    if (!hasDeadReason) {
      return "Move to Dead requires a reason signal (qualification route dead, negative disposition, or note context).";
    }
  }

  if (input.targetStatus === "disposition") {
    if (input.currentStatus !== "negotiation") {
      return "Move to Disposition requires active negotiation context. Move through Negotiation first.";
    }
    if (!input.effectiveNextCallAt && !input.effectiveNextFollowUpAt) {
      return "Move to Disposition requires a next decision follow-up date. Set Next Action/Callback first.";
    }
  }

  return null;
}
