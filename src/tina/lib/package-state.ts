// Use a simple string hash instead of node:crypto to avoid webpack client-side errors
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
import { buildTinaCpaPacketExport } from "@/tina/lib/cpa-packet-export";
import type {
  TinaPackageSnapshotRecord,
  TinaPackageState,
  TinaReviewerDecisionRecord,
  TinaReviewerSignoffSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function pickLatestTinaReviewerDecision(
  decisions: TinaReviewerDecisionRecord[]
): TinaReviewerDecisionRecord | null {
  if (decisions.length === 0) return null;

  return decisions.reduce((latest, candidate) =>
    parseTimestamp(candidate.decidedAt) > parseTimestamp(latest.decidedAt) ? candidate : latest
  );
}

export function findTinaApprovedSnapshot(
  draft: TinaWorkspaceDraft
): TinaPackageSnapshotRecord | null {
  const latestDecision = pickLatestTinaReviewerDecision(draft.reviewerDecisions);
  if (!latestDecision || latestDecision.decision !== "approved") return null;
  return (
    draft.packageSnapshots.find((snapshot) => snapshot.id === latestDecision.snapshotId) ?? null
  );
}

export function tinaHasReviewerDrift(draft: TinaWorkspaceDraft): boolean {
  const approvedSnapshot = findTinaApprovedSnapshot(draft);
  if (!approvedSnapshot) return false;
  return approvedSnapshot.packageFingerprint !== buildTinaPackageFingerprint(draft);
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

export function createDefaultTinaReviewerSignoffSnapshot(): TinaReviewerSignoffSnapshot {
  return {
    lastEvaluatedAt: null,
    packageState: "provisional",
    summary: "Tina has not evaluated reviewer signoff state yet.",
    nextStep: "Build the package, then let Tina evaluate signoff readiness and drift.",
    activeSnapshotId: null,
    activeDecisionId: null,
    currentPackageFingerprint: null,
    signedOffPackageFingerprint: null,
    hasDriftSinceSignoff: false,
  };
}

export function buildTinaPackageFingerprint(draft: TinaWorkspaceDraft): string {
  const packageShape = {
    profile: draft.profile,
    documents: draft.documents.map((document) => ({
      id: document.id,
      category: document.category,
      uploadedAt: document.uploadedAt,
    })),
    sourceFacts: draft.sourceFacts.map((fact) => ({
      id: fact.id,
      sourceDocumentId: fact.sourceDocumentId,
      label: fact.label,
      value: fact.value,
      confidence: fact.confidence,
    })),
    bootstrapReview: {
      status: draft.bootstrapReview.status,
      profileFingerprint: draft.bootstrapReview.profileFingerprint ?? null,
      openItems: draft.bootstrapReview.items
        .filter((item) => item.status === "open")
        .map((item) => item.id),
    },
    issueQueue: {
      status: draft.issueQueue.status,
      profileFingerprint: draft.issueQueue.profileFingerprint ?? null,
      openItems: draft.issueQueue.items
        .filter((item) => item.status === "open")
        .map((item) => item.id),
    },
    reviewerFinal: draft.reviewerFinal.lines.map((line) => ({
      id: line.id,
      label: line.label,
      amount: line.amount,
      status: line.status,
      sourceDocumentIds: uniqueSorted(line.sourceDocumentIds),
      sourceFactIds: uniqueSorted(line.sourceFactIds),
    })),
    scheduleCDraft: {
      fields: draft.scheduleCDraft.fields.map((field) => ({
        id: field.id,
        lineNumber: field.lineNumber,
        amount: field.amount,
        status: field.status,
        reviewerFinalLineIds: uniqueSorted(field.reviewerFinalLineIds),
        taxAdjustmentIds: uniqueSorted(field.taxAdjustmentIds),
        sourceDocumentIds: uniqueSorted(field.sourceDocumentIds),
      })),
      notes: draft.scheduleCDraft.notes.map((note) => ({
        id: note.id,
        title: note.title,
        severity: note.severity,
        reviewerFinalLineIds: uniqueSorted(note.reviewerFinalLineIds),
        taxAdjustmentIds: uniqueSorted(note.taxAdjustmentIds),
        sourceDocumentIds: uniqueSorted(note.sourceDocumentIds),
      })),
    },
    taxAdjustments: draft.taxAdjustments.adjustments.map((adjustment) => ({
      id: adjustment.id,
      kind: adjustment.kind,
      status: adjustment.status,
      risk: adjustment.risk,
      amount: adjustment.amount,
      authorityWorkIdeaIds: uniqueSorted(adjustment.authorityWorkIdeaIds),
      sourceDocumentIds: uniqueSorted(adjustment.sourceDocumentIds),
      sourceFactIds: uniqueSorted(adjustment.sourceFactIds),
    })),
    packageReadiness: {
      status: draft.packageReadiness.status,
      level: draft.packageReadiness.level,
      items: draft.packageReadiness.items.map((item) => ({
        id: item.id,
        severity: item.severity,
        relatedFieldIds: uniqueSorted(item.relatedFieldIds),
        relatedNoteIds: uniqueSorted(item.relatedNoteIds),
        relatedReviewItemIds: uniqueSorted(item.relatedReviewItemIds),
        sourceDocumentIds: uniqueSorted(item.sourceDocumentIds),
      })),
    },
    cpaHandoff: {
      status: draft.cpaHandoff.status,
      artifacts: draft.cpaHandoff.artifacts.map((artifact) => ({
        id: artifact.id,
        status: artifact.status,
        relatedReadinessItemIds: uniqueSorted(artifact.relatedReadinessItemIds),
        sourceDocumentIds: uniqueSorted(artifact.sourceDocumentIds),
      })),
    },
    authorityWork: draft.authorityWork.map((item) => ({
      ideaId: item.ideaId,
      status: item.status,
      reviewerDecision: item.reviewerDecision,
      disclosureDecision: item.disclosureDecision,
      citationCount: item.citations.length,
      missingAuthority: uniqueSorted(item.missingAuthority),
    })),
    appendix: draft.appendix.items.map((item) => ({
      id: item.id,
      taxPositionBucket: item.taxPositionBucket,
      factIds: uniqueSorted(item.factIds),
      documentIds: uniqueSorted(item.documentIds),
    })),
  };

  return simpleHash(JSON.stringify(packageShape));
}

export function buildTinaPackageState(draft: TinaWorkspaceDraft): TinaPackageState {
  const hasPackageCore =
    draft.reviewerFinal.status === "complete" &&
    draft.scheduleCDraft.status === "complete" &&
    draft.packageReadiness.status === "complete" &&
    draft.cpaHandoff.status === "complete";
  const currentFingerprint = buildTinaPackageFingerprint(draft);
  const signedOffSnapshot = findTinaApprovedSnapshot(draft);

  if (signedOffSnapshot) {
    return signedOffSnapshot.packageFingerprint === currentFingerprint
      ? "signed_off"
      : "signed_off_stale";
  }

  if (!hasPackageCore) {
    return draft.packageReadiness.status === "complete" && draft.packageReadiness.level === "blocked"
      ? "blocked"
      : "provisional";
  }

  if (draft.packageReadiness.level === "blocked") {
    return "blocked";
  }

  if (draft.packageReadiness.level === "ready_for_cpa") {
    return "ready_for_cpa_review";
  }

  return "provisional";
}

export function buildTinaReviewerSignoffSnapshot(
  draft: TinaWorkspaceDraft
): TinaReviewerSignoffSnapshot {
  const packageState = buildTinaPackageState(draft);
  const currentPackageFingerprint = buildTinaPackageFingerprint(draft);
  const latestDecision = pickLatestTinaReviewerDecision(draft.reviewerDecisions);
  const signedOffSnapshot = findTinaApprovedSnapshot(draft);
  const signedOffPackageFingerprint = signedOffSnapshot?.packageFingerprint ?? null;
  const hasDriftSinceSignoff = tinaHasReviewerDrift(draft);

  let summary = "Tina has not reached reviewer signoff yet.";
  let nextStep = "Finish the package and capture a stable snapshot before reviewer signoff.";

  if (packageState === "blocked") {
    summary = "Tina still has blocking issues, so reviewer signoff is closed.";
    nextStep = "Clear the blocking package items before asking for reviewer signoff.";
  } else if (packageState === "provisional") {
    summary = "Tina has a draft package, but it still needs reviewer work before signoff.";
    nextStep = "Clear the remaining review items, then capture a stable package snapshot.";
  } else if (packageState === "ready_for_cpa_review") {
    summary = "Tina has a stable package that is ready for reviewer signoff.";
    nextStep = "Capture an immutable package snapshot and route it to the reviewer.";
  } else if (packageState === "signed_off") {
    summary = "A reviewer has signed off on the current Tina package snapshot.";
    nextStep = "Preserve the signed snapshot and keep post-signoff changes out unless a new review cycle begins.";
  } else if (packageState === "signed_off_stale") {
    summary =
      "A reviewer signed off on an older Tina snapshot, but the live package changed afterward.";
    nextStep = "Capture a new snapshot and run reviewer signoff again so post-approval drift is explicit.";
  }

  return {
    lastEvaluatedAt: new Date().toISOString(),
    packageState,
    summary,
    nextStep,
    activeSnapshotId: signedOffSnapshot?.id ?? null,
    activeDecisionId: latestDecision?.id ?? null,
    currentPackageFingerprint,
    signedOffPackageFingerprint,
    hasDriftSinceSignoff,
  };
}

export function createTinaPackageSnapshotRecord(
  draft: TinaWorkspaceDraft,
  createdAt = new Date().toISOString()
): TinaPackageSnapshotRecord {
  const packageState = buildTinaPackageState(draft);
  const packet = buildTinaCpaPacketExport(draft, { packageStateOverride: packageState });
  const packageFingerprint = buildTinaPackageFingerprint(draft);
  const blockerCount = draft.packageReadiness.items.filter(
    (item) => item.severity === "blocking"
  ).length;
  const attentionCount = draft.packageReadiness.items.filter(
    (item) => item.severity === "needs_attention"
  ).length;

  return {
    id: `package-snapshot-${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}-${packageFingerprint.slice(0, 8)}`,
    createdAt,
    packageFingerprint,
    packageState,
    readinessLevel: draft.packageReadiness.level,
    blockerCount,
    attentionCount,
    summary: draft.packageReadiness.summary,
    exportFileName: packet.fileName,
    exportContents: packet.contents,
  };
}

export function recordTinaReviewerDecision(
  draft: TinaWorkspaceDraft,
  input: {
    snapshotId: string;
    reviewerName: string;
    decision: TinaReviewerDecisionRecord["decision"];
    notes?: string;
    decidedAt?: string;
  }
): TinaReviewerDecisionRecord {
  const decidedAt = input.decidedAt ?? new Date().toISOString();
  return {
    id: `reviewer-decision-${decidedAt.replace(/[^0-9]/g, "").slice(0, 14)}-${input.snapshotId.slice(-8)}`,
    snapshotId: input.snapshotId,
    decision: input.decision,
    reviewerName: input.reviewerName,
    notes: input.notes ?? "",
    decidedAt,
  };
}
