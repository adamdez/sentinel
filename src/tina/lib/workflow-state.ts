import { buildTinaAppendix } from "@/tina/lib/appendix";
import { buildTinaOperationalStatus } from "@/tina/lib/operational-status";
import {
  buildTinaReviewerSignoffSnapshot,
  createTinaPackageSnapshotRecord,
  recordTinaReviewerDecision,
} from "@/tina/lib/package-state";
import type { TinaReviewerDecision, TinaWorkspaceDraft } from "@/tina/types";

export function refreshTinaWorkflowState(draft: TinaWorkspaceDraft): TinaWorkspaceDraft {
  const appendix = buildTinaAppendix(draft);
  const withAppendix = { ...draft, appendix };
  const reviewerSignoff = buildTinaReviewerSignoffSnapshot(withAppendix);
  const withSignoff = { ...withAppendix, reviewerSignoff };
  const operationalStatus = buildTinaOperationalStatus(withSignoff);
  return { ...withSignoff, operationalStatus };
}

export function captureTinaPackageSnapshot(draft: TinaWorkspaceDraft): TinaWorkspaceDraft {
  const refreshed = refreshTinaWorkflowState(draft);
  const snapshot = createTinaPackageSnapshotRecord(refreshed);
  return refreshTinaWorkflowState({
    ...refreshed,
    packageSnapshots: [snapshot, ...refreshed.packageSnapshots],
  });
}

export function applyTinaReviewerDecision(
  draft: TinaWorkspaceDraft,
  input: {
    snapshotId: string;
    reviewerName: string;
    decision: TinaReviewerDecision;
    notes?: string;
    decidedAt?: string;
  }
): TinaWorkspaceDraft {
  const reviewerDecision = recordTinaReviewerDecision(input);
  return refreshTinaWorkflowState({
    ...draft,
    reviewerDecisions: [reviewerDecision, ...draft.reviewerDecisions],
  });
}
