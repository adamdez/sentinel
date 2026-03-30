import { buildTinaChecklist } from "@/tina/lib/checklist";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { getTinaIrsAuthorityRegistryStatus } from "@/tina/lib/irs-authority-registry";
import { buildTinaOfficialFormCoverageGaps } from "@/tina/lib/official-form-coverage";
import type {
  TinaChecklistItem,
  TinaIrsAuthorityWatchStatus,
  TinaPackageReadinessItem,
  TinaPackageReadinessLevel,
  TinaPackageReadinessSnapshot,
  TinaScheduleCDraftField,
  TinaScheduleCDraftNote,
  TinaWorkspaceDraft,
} from "@/tina/types";

function createEmptySnapshot(): TinaPackageReadinessSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    level: "blocked",
    summary: "Tina has not checked filing-package readiness yet.",
    nextStep: "Build the Schedule C draft first, then let Tina check what still blocks the package.",
    items: [],
  };
}

export function createDefaultTinaPackageReadiness(): TinaPackageReadinessSnapshot {
  return createEmptySnapshot();
}

export function markTinaPackageReadinessStale(
  snapshot: TinaPackageReadinessSnapshot
): TinaPackageReadinessSnapshot {
  if (snapshot.status === "idle" || snapshot.status === "stale") return snapshot;

  return {
    ...snapshot,
    status: "stale",
    summary: "Your draft, review state, or source papers changed, so Tina should check package readiness again.",
    nextStep: "Run the package check again so Tina does not lean on old filing-readiness answers.",
  };
}

function createItem(args: {
  id: string;
  title: string;
  summary: string;
  severity: "blocking" | "needs_attention";
  relatedFieldIds?: string[];
  relatedNoteIds?: string[];
  relatedReviewItemIds?: string[];
  sourceDocumentIds?: string[];
}): TinaPackageReadinessItem {
  return {
    id: args.id,
    title: args.title,
    summary: args.summary,
    severity: args.severity,
    relatedFieldIds: args.relatedFieldIds ?? [],
    relatedNoteIds: args.relatedNoteIds ?? [],
    relatedReviewItemIds: args.relatedReviewItemIds ?? [],
    sourceDocumentIds: args.sourceDocumentIds ?? [],
  };
}

function fieldNeedsBlockingReview(field: TinaScheduleCDraftField): boolean {
  return field.status === "waiting";
}

function fieldNeedsAttention(field: TinaScheduleCDraftField): boolean {
  return field.status === "needs_attention";
}

function noteNeedsAttention(note: TinaScheduleCDraftNote): boolean {
  return note.severity === "needs_attention";
}

function isReturnTypeConflictIssueId(id: string): boolean {
  return (
    id === "return-type-hint-conflict" ||
    id === "llc-tax-treatment-conflict" ||
    id === "llc-community-property-conflict"
  );
}

function checklistItemBlocksPackage(
  item: TinaChecklistItem,
  draft: TinaWorkspaceDraft
): boolean {
  if (item.status !== "needed") return false;
  if (item.priority === "required") return true;
  if (item.id !== "lane-review") return false;

  return !draft.issueQueue.items.some(
    (issue) =>
      issue.status === "open" &&
      issue.severity === "blocking" &&
      isReturnTypeConflictIssueId(issue.id)
  );
}

export function buildTinaPackageReadiness(
  draft: TinaWorkspaceDraft,
  options?: {
    irsAuthorityWatchStatus?: TinaIrsAuthorityWatchStatus | null;
  }
): TinaPackageReadinessSnapshot {
  const now = new Date().toISOString();
  const lane = recommendTinaFilingLane(draft.profile, draft.sourceFacts);
  const checklist = buildTinaChecklist(draft, lane);
  const irsAuthorityWatchStatus = options?.irsAuthorityWatchStatus ?? null;
  const items: TinaPackageReadinessItem[] = [];

  if (lane.support !== "supported" || lane.laneId !== "schedule_c_single_member_llc") {
    items.push(
      createItem({
        id: "lane-not-supported",
        title: "Tina is not on a supported filing lane yet",
        summary:
          "This first filing package check only works for Tina's supported Schedule C path. Tina should stop here instead of pretending the package is ready.",
        severity: "blocking",
      })
    );
  }

  const irsAuthorityStatus = getTinaIrsAuthorityRegistryStatus(
    lane.laneId,
    draft.profile.taxYear
  );

  if (irsAuthorityStatus.level === "blocked") {
    items.push(
      createItem({
        id: "irs-authority-registry",
        title: "IRS authority year support is not certified yet",
        summary: `${irsAuthorityStatus.summary} ${irsAuthorityStatus.nextStep}`,
        severity: "blocking",
      })
    );
  }

  if (irsAuthorityWatchStatus?.level === "needs_review") {
    items.push(
      createItem({
        id: "irs-authority-watch",
        title: "IRS freshness watch needs review",
        summary: `${irsAuthorityWatchStatus.summary} ${irsAuthorityWatchStatus.nextStep}`,
        severity: "blocking",
      })
    );
  }

  if (draft.reviewerFinal.status !== "complete") {
    items.push(
      createItem({
        id: "reviewer-final-missing",
        title: "Tina still needs the return-facing review layer",
        summary:
          "Tina cannot call the package filing-ready until the return-facing review layer is built from approved tax moves.",
        severity: "blocking",
      })
    );
  }

  if (draft.scheduleCDraft.status !== "complete") {
    items.push(
      createItem({
        id: "schedule-c-missing",
        title: "Tina still needs the Schedule C draft",
        summary:
          "Tina cannot check the filing package until the first supported form draft is built.",
        severity: "blocking",
      })
    );
  }

  buildTinaOfficialFormCoverageGaps(draft).forEach((gap) => {
    items.push(
      createItem({
        id: `federal-form-${gap.id}`,
        title: `${gap.formNumber}: ${gap.title}`,
        summary: `${gap.summary} Tina should keep the CPA handoff moving, but she should not pretend the IRS-facing business form packet is complete yet.`,
        severity: "needs_attention",
      })
    );
  });

  checklist
    .filter((item) => checklistItemBlocksPackage(item, draft))
    .forEach((item) => {
      items.push(
        createItem({
          id: `${item.priority === "required" ? "required" : "review"}-${item.id}`,
          title: item.label,
          summary: `${item.reason} Tina should get this before calling the package ready.`,
          severity: "blocking",
        })
      );
    });

  draft.bootstrapReview.items
    .filter((item) => item.status === "open")
    .forEach((item) => {
      items.push(
        createItem({
          id: `bootstrap-${item.id}`,
          title: item.title,
          summary: item.summary,
          severity: item.severity === "blocking" ? "blocking" : "needs_attention",
          relatedReviewItemIds: [item.id],
          sourceDocumentIds: item.documentId ? [item.documentId] : [],
        })
      );
    });

  draft.issueQueue.items
    .filter((item) => item.status === "open")
    .forEach((item) => {
      items.push(
        createItem({
          id: `issue-${item.id}`,
          title: item.title,
          summary: item.summary,
          severity: item.severity === "blocking" ? "blocking" : "needs_attention",
          relatedReviewItemIds: [item.id],
          sourceDocumentIds: item.documentId ? [item.documentId] : [],
        })
      );
    });

  draft.taxAdjustments.adjustments
    .filter((adjustment) => adjustment.status === "needs_authority")
    .forEach((adjustment) => {
      items.push(
        createItem({
          id: `adjustment-authority-${adjustment.id}`,
          title: adjustment.title,
          summary:
            "Tina still needs authority proof or reviewer approval before this tax move can safely reach the filing package.",
          severity: "blocking",
          sourceDocumentIds: adjustment.sourceDocumentIds,
        })
      );
    });

  draft.taxAdjustments.adjustments
    .filter((adjustment) => adjustment.status === "ready_for_review")
    .forEach((adjustment) => {
      items.push(
        createItem({
          id: `adjustment-review-${adjustment.id}`,
          title: adjustment.title,
          summary:
            "This tax move is waiting for a human review call before Tina can treat the package as filing-ready.",
          severity: "blocking",
          sourceDocumentIds: adjustment.sourceDocumentIds,
        })
      );
    });

  draft.scheduleCDraft.fields
    .filter((field) => fieldNeedsBlockingReview(field))
    .forEach((field) => {
      items.push(
        createItem({
          id: `field-waiting-${field.id}`,
          title: `${field.lineNumber}: ${field.label}`,
          summary: field.summary,
          severity: "blocking",
          relatedFieldIds: [field.id],
          sourceDocumentIds: field.sourceDocumentIds,
        })
      );
    });

  draft.scheduleCDraft.fields
    .filter((field) => fieldNeedsAttention(field))
    .forEach((field) => {
      items.push(
        createItem({
          id: `field-review-${field.id}`,
          title: `${field.lineNumber}: ${field.label}`,
          summary: field.summary,
          severity: "needs_attention",
          relatedFieldIds: [field.id],
          sourceDocumentIds: field.sourceDocumentIds,
        })
      );
    });

  draft.scheduleCDraft.notes
    .filter((note) => noteNeedsAttention(note))
    .forEach((note) => {
      items.push(
        createItem({
          id: `note-${note.id}`,
          title: note.title,
          summary: note.summary,
          severity: "needs_attention",
          relatedNoteIds: [note.id],
          sourceDocumentIds: note.sourceDocumentIds,
        })
      );
    });

  const blockingCount = items.filter((item) => item.severity === "blocking").length;
  const attentionCount = items.filter((item) => item.severity === "needs_attention").length;

  let level: TinaPackageReadinessLevel = "ready_for_cpa";
  if (blockingCount > 0) level = "blocked";
  else if (attentionCount > 0) level = "needs_review";

  let summary = "Tina does not see anything blocking a CPA-ready federal business packet right now.";
  if (level === "blocked") {
    summary = `Tina found ${blockingCount} blocking item${blockingCount === 1 ? "" : "s"} before this federal business packet can be called filing-ready.`;
    if (attentionCount > 0) {
      summary += ` ${attentionCount} more ${attentionCount === 1 ? "item needs" : "items need"} review after that.`;
    }
  } else if (level === "needs_review") {
    summary = `Tina does not see a hard stop, but ${attentionCount} item${attentionCount === 1 ? " still needs" : "s still need"} review before a CPA should trust the federal business packet.`;
  }

  let nextStep =
    "Tina can hand this federal business packet to a CPA review flow next, but it is still worth doing a final human scan.";
  if (level === "blocked") {
    nextStep =
      "Work through the blocking items first. Tina should not call this federal business packet filing-ready until those are cleared.";
  } else if (level === "needs_review") {
    nextStep =
      "Clear the review items next so Tina can say the federal business packet is ready for CPA handoff with confidence.";
  }

  return {
    lastRunAt: now,
    status: "complete",
    level,
    summary,
    nextStep,
    items,
  };
}
