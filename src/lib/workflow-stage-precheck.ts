import { getAllowedTransitions, validateStatusTransition } from "@/lib/lead-guardrails";
import type { LeadStatus, QualificationRoute } from "@/lib/types";

const DEAD_DISPOSITION_SIGNALS = new Set([
  "dead",
  "do_not_call",
  "wrong_number",
  "disconnected",
  "ghost",
  "not_interested",
  "not_qualified",
]);

const STAGE_LABELS: Record<LeadStatus, string> = {
  staging: "Staging",
  prospect: "Prospect",
  lead: "Lead",
  active: "Active",
  negotiation: "Negotiation",
  disposition: "Disposition",
  nurture: "Nurture",
  dead: "Dead",
  closed: "Closed",
};

export interface WorkflowStagePrecheckInput {
  currentStatus: LeadStatus;
  targetStatus: LeadStatus;
  assignedTo: string | null;
  lastContactAt?: string | null;
  totalCalls?: number | null;
  dispositionCode?: string | null;
  nextCallScheduledAt?: string | null;
  nextFollowUpAt?: string | null;
  qualificationRoute?: QualificationRoute | null;
  nextAction?: string | null;
  notes?: string | null;
  noteDraft?: string | null;
  hasActivityNoteContext?: boolean;
}

export interface WorkflowStagePrecheckResult {
  ok: boolean;
  blockingReason: string | null;
  requiredActions: string[];
}

function hasMeaningfulText(value: string | null | undefined, minLen = 12): boolean {
  return typeof value === "string" && value.trim().length >= minLen;
}

function hasAnyText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNurtureIntentSignal(
  qualificationRoute: QualificationRoute | null | undefined,
  nextAction: string | null | undefined,
): boolean {
  if (qualificationRoute === "nurture") return true;
  if (typeof nextAction !== "string") return false;
  return nextAction.trim().toLowerCase().includes("nurture");
}

function stageLabel(status: LeadStatus): string {
  return STAGE_LABELS[status] ?? status;
}

function buildResult(requiredActions: string[]): WorkflowStagePrecheckResult {
  if (requiredActions.length === 0) {
    return { ok: true, blockingReason: null, requiredActions: [] };
  }
  return {
    ok: false,
    blockingReason: requiredActions[0],
    requiredActions,
  };
}

export function precheckWorkflowStageChange(input: WorkflowStagePrecheckInput): WorkflowStagePrecheckResult {
  if (input.currentStatus === input.targetStatus) {
    return { ok: true, blockingReason: null, requiredActions: [] };
  }

  if (!validateStatusTransition(input.currentStatus, input.targetStatus)) {
    const allowed = getAllowedTransitions(input.currentStatus)
      .map((status) => stageLabel(status))
      .join(", ");
    return {
      ok: false,
      blockingReason: `Cannot move from ${stageLabel(input.currentStatus)} to ${stageLabel(input.targetStatus)}.`,
      requiredActions: [
        `Choose an allowed stage: ${allowed || "none (terminal stage)"}.`,
      ],
    };
  }

  const hasContactEvidence =
    Boolean(input.lastContactAt)
    || Number(input.totalCalls ?? 0) > 0
    || hasMeaningfulText(input.dispositionCode, 1);

  const hasNextAction = Boolean(input.nextCallScheduledAt || input.nextFollowUpAt);
  const hasNoteContext = hasMeaningfulText(input.noteDraft) || hasMeaningfulText(input.notes);
  const hasActiveNoteContext =
    hasAnyText(input.noteDraft)
    || hasAnyText(input.notes)
    || input.hasActivityNoteContext === true;
  const hasDispositionContext = hasMeaningfulText(input.dispositionCode, 1);
  const dispositionCode = (input.dispositionCode ?? "").toLowerCase();

  if (input.targetStatus === "active") {
    if (!hasActiveNoteContext) {
      return buildResult([
        "Add a short seller progress note before moving to Active when no prior note exists.",
      ]);
    }
  }

  if (input.targetStatus === "negotiation") {
    const actions: string[] = [];
    if (!input.assignedTo) {
      actions.push("Assign an owner before moving to Negotiation.");
    }
    if (!hasContactEvidence) {
      actions.push("Log at least one contact attempt before moving to Negotiation.");
    }
    return buildResult(actions);
  }

  if (input.targetStatus === "nurture") {
    const actions: string[] = [];
    if (!hasNextAction) {
      actions.push("Move to Nurture requires a nurture follow-up date. Set the nurture callback first.");
    }
    if (!hasNurtureIntentSignal(input.qualificationRoute, input.nextAction)) {
      actions.push("Choose a nurture next step before moving to Nurture. Generic callbacks do not qualify.");
    }
    const hasNurtureContext = hasDispositionContext || hasNoteContext;
    if (!hasNurtureContext) {
      actions.push("Move to Nurture requires context. Add a disposition outcome or note explaining the nurture reason.");
    }
    return buildResult(actions);
  }

  if (input.targetStatus === "dead") {
    const hasDeadReason =
      input.qualificationRoute === "dead"
      || DEAD_DISPOSITION_SIGNALS.has(dispositionCode)
      || hasNoteContext;
    if (!hasDeadReason) {
      return buildResult([
        "Add a dead-lead reason (route = Dead, negative disposition, or note) before moving to Dead.",
      ]);
    }
  }

  if (input.targetStatus === "disposition") {
    const actions: string[] = [];
    if (input.currentStatus !== "negotiation") {
      actions.push("Move through Negotiation before entering Disposition.");
    }
    if (!hasNextAction) {
      actions.push("Set Next Action/Callback before moving to Disposition.");
    }
    return buildResult(actions);
  }

  return { ok: true, blockingReason: null, requiredActions: [] };
}
