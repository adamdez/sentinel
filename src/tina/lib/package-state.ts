import { buildTinaCpaPacketExport } from "@/tina/lib/cpa-packet-export";
import type {
  TinaPackageSnapshotRecord,
  TinaPackageState,
  TinaReviewerDecisionRecord,
  TinaReviewerSignoffSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function createDefaultTinaReviewerSignoffSnapshot(): TinaReviewerSignoffSnapshot {
  return {
    lastEvaluatedAt: null,
    packageState: "provisional",
    summary: "Tina has not evaluated reviewer signoff yet.",
    nextStep: "Build the package and capture a stable snapshot before reviewer signoff.",
    activeSnapshotId: null,
    activeDecisionId: null,
    currentPackageFingerprint: null,
    signedOffPackageFingerprint: null,
    hasDriftSinceSignoff: false,
  };
}

export function buildTinaPackageFingerprint(draft: TinaWorkspaceDraft): string {
  const shape = {
    profile: draft.profile,
    documents: draft.documents.map((document) => ({
      id: document.id,
      category: document.category,
      requestId: document.requestId,
      uploadedAt: document.uploadedAt,
    })),
    sourceFacts: draft.sourceFacts.map((fact) => ({
      id: fact.id,
      sourceDocumentId: fact.sourceDocumentId,
      label: fact.label,
      value: fact.value,
      confidence: fact.confidence,
    })),
    issueQueue: draft.issueQueue.items
      .filter((item) => item.status === "open")
      .map((item) => item.id)
      .sort(),
    reviewerFinal: draft.reviewerFinal.lines.map((line) => ({
      id: line.id,
      label: line.label,
      amount: line.amount,
      status: line.status,
      sourceDocumentIds: uniqueSorted(line.sourceDocumentIds),
      sourceFactIds: uniqueSorted(line.sourceFactIds),
    })),
    scheduleCDraft: draft.scheduleCDraft.fields.map((field) => ({
      id: field.id,
      lineNumber: field.lineNumber,
      amount: field.amount,
      status: field.status,
      sourceDocumentIds: uniqueSorted(field.sourceDocumentIds),
    })),
    packageReadiness: {
      level: draft.packageReadiness.level,
      items: draft.packageReadiness.items.map((item) => ({
        id: item.id,
        severity: item.severity,
      })),
    },
    authorityWork: draft.authorityWork.map((item) => ({
      ideaId: item.ideaId,
      status: item.status,
      reviewerDecision: item.reviewerDecision,
      disclosureDecision: item.disclosureDecision,
      citations: item.citations.length,
    })),
  };

  return hashString(JSON.stringify(shape));
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

export function buildTinaPackageState(draft: TinaWorkspaceDraft): TinaPackageState {
  const approvedSnapshot = findTinaApprovedSnapshot(draft);
  if (approvedSnapshot) {
    return tinaHasReviewerDrift(draft) ? "signed_off_stale" : "signed_off";
  }

  if (draft.packageReadiness.status !== "complete") {
    return "provisional";
  }

  if (draft.packageReadiness.level === "blocked") return "blocked";
  if (draft.packageReadiness.level === "ready_for_cpa") return "ready_for_cpa_review";
  return "provisional";
}

export function buildTinaReviewerSignoffSnapshot(
  draft: TinaWorkspaceDraft
): TinaReviewerSignoffSnapshot {
  const packageState = buildTinaPackageState(draft);
  const latestDecision = pickLatestTinaReviewerDecision(draft.reviewerDecisions);
  const approvedSnapshot = findTinaApprovedSnapshot(draft);
  const currentPackageFingerprint = buildTinaPackageFingerprint(draft);
  const signedOffPackageFingerprint = approvedSnapshot?.packageFingerprint ?? null;
  const hasDriftSinceSignoff = tinaHasReviewerDrift(draft);

  let summary = "Tina has not reached reviewer signoff yet.";
  let nextStep = "Build the package and capture a stable snapshot before reviewer signoff.";

  if (packageState === "blocked") {
    summary = "Tina still has blocking issues, so reviewer signoff is closed.";
    nextStep = "Clear the blocking package items before asking for reviewer signoff.";
  } else if (packageState === "ready_for_cpa_review") {
    summary = "Tina has a package that is ready for reviewer signoff.";
    nextStep = "Capture an immutable package snapshot and send it to the reviewer.";
  } else if (packageState === "signed_off") {
    summary = "A reviewer has signed off on the current Tina package snapshot.";
    nextStep = "Preserve the signed snapshot unless facts or numbers change.";
  } else if (packageState === "signed_off_stale") {
    summary = "A reviewer signed off on an older Tina snapshot, but the live package changed.";
    nextStep = "Capture a new snapshot and run reviewer signoff again.";
  }

  return {
    lastEvaluatedAt: new Date().toISOString(),
    packageState,
    summary,
    nextStep,
    activeSnapshotId: approvedSnapshot?.id ?? null,
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
  const packet = buildTinaCpaPacketExport(draft);
  const blockerCount = draft.packageReadiness.items.filter(
    (item) => item.severity === "blocking"
  ).length;
  const attentionCount = draft.packageReadiness.items.filter(
    (item) => item.severity === "needs_attention"
  ).length;
  const packageFingerprint = buildTinaPackageFingerprint(draft);

  return {
    id: `tina-snapshot-${createdAt.replace(/[^0-9]/g, "").slice(0, 14)}-${packageFingerprint.slice(0, 8)}`,
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

export function recordTinaReviewerDecision(input: {
  snapshotId: string;
  reviewerName: string;
  decision: TinaReviewerDecisionRecord["decision"];
  notes?: string;
  decidedAt?: string;
}): TinaReviewerDecisionRecord {
  const decidedAt = input.decidedAt ?? new Date().toISOString();
  return {
    id: `tina-review-${decidedAt.replace(/[^0-9]/g, "").slice(0, 14)}-${input.snapshotId.slice(-6)}`,
    snapshotId: input.snapshotId,
    decision: input.decision,
    reviewerName: input.reviewerName,
    notes: input.notes ?? "",
    decidedAt,
  };
}
