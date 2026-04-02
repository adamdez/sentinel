import { buildTinaChecklist } from "@/tina/lib/checklist";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { buildTinaProfileFingerprint } from "@/tina/lib/profile-fingerprint";
import type {
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

function parseTimestamp(value: string | null): number {
  if (!value || value.trim().length === 0) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface EvidenceTimestampRollup {
  latest: number;
  hasInvalid: boolean;
}

function collectTimestamp(value: string | null): { parsed: number; invalid: boolean } {
  if (!value || value.trim().length === 0) {
    return { parsed: 0, invalid: false };
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return { parsed: 0, invalid: true };
  }

  return { parsed, invalid: false };
}

function latestEvidenceTimestamp(draft: TinaWorkspaceDraft): EvidenceTimestampRollup {
  const candidates = [
    ...draft.documents.map((document) => collectTimestamp(document.uploadedAt)),
    ...draft.sourceFacts.map((fact) => collectTimestamp(fact.capturedAt)),
    ...draft.documentReadings.map((reading) => collectTimestamp(reading.lastReadAt)),
    collectTimestamp(draft.priorReturn?.capturedAt ?? null),
  ];

  const latest = Math.max(0, ...candidates.map((candidate) => candidate.parsed));
  const hasInvalid = candidates.some((candidate) => candidate.invalid);

  return { latest, hasInvalid };
}

function hasCurrentReviewRun(
  status: string,
  lastRunAt: string | null,
  runProfileFingerprint: string | null | undefined,
  currentProfileFingerprint: string,
  evidence: EvidenceTimestampRollup
): boolean {
  if (status !== "complete" || typeof lastRunAt !== "string" || lastRunAt.trim().length === 0) {
    return false;
  }

  if (
    typeof runProfileFingerprint !== "string" ||
    runProfileFingerprint.trim().length === 0 ||
    runProfileFingerprint !== currentProfileFingerprint
  ) {
    return false;
  }

  const runAt = parseTimestamp(lastRunAt);
  if (runAt <= 0) return false;
  if (evidence.hasInvalid) return false;
  if (evidence.latest > 0 && runAt < evidence.latest) return false;
  return true;
}

export function buildTinaPackageReadiness(
  draft: TinaWorkspaceDraft
): TinaPackageReadinessSnapshot {
  const now = new Date().toISOString();
  const lane = recommendTinaFilingLane(draft.profile);
  const checklist = buildTinaChecklist(draft, lane);
  const items: TinaPackageReadinessItem[] = [];
  const evidence = latestEvidenceTimestamp(draft);
  const currentProfileFingerprint = buildTinaProfileFingerprint(draft.profile);

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

  if (
    !hasCurrentReviewRun(
      draft.bootstrapReview.status,
      draft.bootstrapReview.lastRunAt,
      draft.bootstrapReview.profileFingerprint,
      currentProfileFingerprint,
      evidence
    )
  ) {
    items.push(
      createItem({
        id: "bootstrap-review-not-current",
        title: "Bootstrap review is not current",
        summary:
          evidence.hasInvalid
            ? "Tina found invalid evidence timestamps, so bootstrap review freshness cannot be trusted yet."
            : "Tina needs a current bootstrap review run before claiming package readiness. This keeps setup conflicts from slipping past the filing check.",
        severity: "blocking",
      })
    );
  }

  if (
    !hasCurrentReviewRun(
      draft.issueQueue.status,
      draft.issueQueue.lastRunAt,
      draft.issueQueue.profileFingerprint,
      currentProfileFingerprint,
      evidence
    )
  ) {
    items.push(
      createItem({
        id: "issue-queue-not-current",
        title: "Issue queue is not current",
        summary:
          evidence.hasInvalid
            ? "Tina found invalid evidence timestamps, so issue-queue freshness cannot be trusted yet."
            : "Tina needs a current issue-queue run before claiming package readiness. This keeps paper conflicts from slipping past the filing check.",
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

  checklist
    .filter((item) => item.priority === "required" && item.status === "needed")
    .forEach((item) => {
      items.push(
        createItem({
          id: `required-${item.id}`,
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
      if (item.severity === "watch") {
        return;
      }
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

  let summary = "Tina does not see anything blocking a CPA-ready package right now.";
  if (level === "blocked") {
    summary = `Tina found ${blockingCount} blocking item${blockingCount === 1 ? "" : "s"} before this package can be called filing-ready.`;
    if (attentionCount > 0) {
      summary += ` ${attentionCount} more ${attentionCount === 1 ? "item needs" : "items need"} review after that.`;
    }
  } else if (level === "needs_review") {
    summary = `Tina does not see a hard stop, but ${attentionCount} item${attentionCount === 1 ? " still needs" : "s still need"} review before a CPA should trust the package.`;
  }

  let nextStep =
    "Tina can hand this package to a CPA review flow next, but it is still worth doing a final human scan.";
  if (level === "blocked") {
    nextStep =
      "Work through the blocking items first. Tina should not call this package filing-ready until those are cleared.";
  } else if (level === "needs_review") {
    nextStep =
      "Clear the review items next so Tina can say the package is ready for CPA handoff with confidence.";
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
