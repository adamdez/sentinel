import type {
  TinaCaseMemoryLedgerEntry,
  TinaCaseMemoryLedgerSnapshot,
  TinaCaseMemoryOverride,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaConfidenceCalibration } from "@/tina/lib/confidence-calibration";
import {
  buildTinaReviewerSignoffSnapshot,
  findTinaApprovedSnapshot,
  pickLatestTinaReviewerDecision,
} from "@/tina/lib/package-state";
import { buildTinaPackageReadiness } from "@/tina/lib/package-readiness";
import { buildTinaReviewerObservedDeltas } from "@/tina/lib/reviewer-observed-deltas";
import { buildTinaUnknownPatternEngine } from "@/tina/lib/unknown-pattern-engine";
import type { TinaPackageSnapshotRecord, TinaReviewerDecisionRecord, TinaWorkspaceDraft } from "@/tina/types";

const caseMemoryLedgerCache = new WeakMap<TinaWorkspaceDraft, TinaCaseMemoryLedgerSnapshot>();

function parseTimestamp(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortSnapshots(
  snapshots: TinaPackageSnapshotRecord[]
): TinaPackageSnapshotRecord[] {
  return [...snapshots].sort(
    (left, right) => parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt)
  );
}

function sortDecisions(
  decisions: TinaReviewerDecisionRecord[]
): TinaReviewerDecisionRecord[] {
  return [...decisions].sort(
    (left, right) => parseTimestamp(right.decidedAt) - parseTimestamp(left.decidedAt)
  );
}

function buildEntry(entry: TinaCaseMemoryLedgerEntry): TinaCaseMemoryLedgerEntry {
  return entry;
}

function buildOverride(override: TinaCaseMemoryOverride): TinaCaseMemoryOverride {
  return override;
}

function isOverrideDecision(
  decision: TinaReviewerDecisionRecord
): decision is TinaReviewerDecisionRecord & {
  decision: "changes_requested" | "revoked";
} {
  return decision.decision === "changes_requested" || decision.decision === "revoked";
}

function latestApprovedAfter(
  decisions: TinaReviewerDecisionRecord[],
  decision: TinaReviewerDecisionRecord
): TinaReviewerDecisionRecord | null {
  return (
    decisions.find(
      (candidate) =>
        candidate.decision === "approved" &&
        parseTimestamp(candidate.decidedAt) > parseTimestamp(decision.decidedAt)
    ) ?? null
  );
}

function summarizeDecision(decision: TinaReviewerDecisionRecord): string {
  if (decision.decision === "approved") {
    return `${decision.reviewerName} approved snapshot ${decision.snapshotId}.`;
  }

  if (decision.decision === "changes_requested") {
    return `${decision.reviewerName} requested changes on snapshot ${decision.snapshotId}.`;
  }

  return `${decision.reviewerName} revoked trust in snapshot ${decision.snapshotId}.`;
}

export function buildTinaCaseMemoryLedger(
  draft: TinaWorkspaceDraft
): TinaCaseMemoryLedgerSnapshot {
  const cached = caseMemoryLedgerCache.get(draft);
  if (cached) {
    return cached;
  }

  const reviewerSignoff = buildTinaReviewerSignoffSnapshot(draft);
  const packageState = reviewerSignoff.packageState;
  const reviewerObservedDeltas = buildTinaReviewerObservedDeltas(draft);
  const packageReadiness =
    draft.packageReadiness.status === "complete"
      ? draft.packageReadiness
      : buildTinaPackageReadiness(draft);
  const approvedSnapshot = findTinaApprovedSnapshot(draft);
  const latestDecision = pickLatestTinaReviewerDecision(draft.reviewerDecisions);
  const snapshots = sortSnapshots(draft.packageSnapshots);
  const decisions = sortDecisions(draft.reviewerDecisions);
  const latestSnapshot = snapshots[0] ?? null;
  const currentBlockingCount = packageReadiness.items.filter(
    (item) => item.severity === "blocking"
  ).length;
  const currentAttentionCount = packageReadiness.items.filter(
    (item) => item.severity === "needs_attention"
  ).length;

  const driftReasons: string[] = [];

  if (approvedSnapshot && reviewerSignoff.hasDriftSinceSignoff) {
    const confidenceCalibration = buildTinaConfidenceCalibration(draft);
    const unknownPatternEngine = buildTinaUnknownPatternEngine(draft);

    if (approvedSnapshot.readinessLevel !== packageReadiness.level) {
      driftReasons.push(
        `Readiness changed from ${approvedSnapshot.readinessLevel} to ${packageReadiness.level}.`
      );
    }

    if (approvedSnapshot.blockerCount !== currentBlockingCount) {
      driftReasons.push(
        `Blocking item count changed from ${approvedSnapshot.blockerCount} to ${currentBlockingCount}.`
      );
    }

    if (approvedSnapshot.attentionCount !== currentAttentionCount) {
      driftReasons.push(
        `Needs-attention item count changed from ${approvedSnapshot.attentionCount} to ${currentAttentionCount}.`
      );
    }

    if (approvedSnapshot.packageState !== packageState) {
      driftReasons.push(
        `Package state changed from ${approvedSnapshot.packageState} to ${packageState}.`
      );
    }

    if (unknownPatternEngine.overallStatus !== "known_pattern") {
      driftReasons.push(
        `Unknown-pattern handling is now ${unknownPatternEngine.overallStatus.replace(/_/g, " ")}.`
      );
    }

    if (confidenceCalibration.overallStatus !== "calibrated") {
      driftReasons.push(
        `Confidence posture is now ${confidenceCalibration.overallStatus} with ${confidenceCalibration.debts.length} open debt item${confidenceCalibration.debts.length === 1 ? "" : "s"}.`
      );
    }

    if (driftReasons.length === 0) {
      driftReasons.push(
        "The live package fingerprint no longer matches the approved snapshot, even though the high-level counts still look similar."
      );
    }
  }

  const overrides = decisions
    .filter(isOverrideDecision)
    .map((decision) => {
      const resolvedBy = latestApprovedAfter(decisions, decision);

      return buildOverride({
        id: `override-${decision.id}`,
        decisionId: decision.id,
        snapshotId: decision.snapshotId,
        decision: decision.decision,
        status: resolvedBy ? "resolved" : "open",
        reviewerName: decision.reviewerName,
        decidedAt: decision.decidedAt,
        summary:
          decision.decision === "changes_requested"
            ? `${decision.reviewerName} asked for changes before trusting snapshot ${decision.snapshotId}.`
            : `${decision.reviewerName} revoked prior trust in snapshot ${decision.snapshotId}.`,
        notes: decision.notes,
      });
    });
  const openOverrideCount = overrides.filter((override) => override.status === "open").length;

  const entries: TinaCaseMemoryLedgerEntry[] = [
    buildEntry({
      id: "case-memory-current-state",
      type: "current_state",
      actor: "system",
      severity:
        packageState === "signed_off_stale" || packageState === "blocked"
          ? "blocking"
          : packageState === "ready_for_cpa_review"
            ? "needs_attention"
            : "info",
      occurredAt: reviewerSignoff.lastEvaluatedAt ?? new Date().toISOString(),
      title:
        packageState === "signed_off"
          ? "Approved anchor still matches the live package"
          : packageState === "signed_off_stale"
            ? "Approved anchor no longer matches the live package"
            : packageState === "ready_for_cpa_review"
              ? "File is review-ready but not anchored yet"
              : "Current package is not safe to anchor yet",
      summary:
        packageState === "signed_off"
          ? "Tina has a current approved snapshot she can safely lean on."
          : packageState === "signed_off_stale"
            ? "Tina has prior reviewer approval, but the live package changed after signoff."
            : packageState === "ready_for_cpa_review"
              ? "Tina has a package that could be anchored next, but no current reviewer-approved snapshot exists."
              : "Tina should not treat current reviewer history as settled because the live package is still blocked or provisional.",
      effectOnTrust:
        packageState === "signed_off"
          ? "Reviewer trust can flow from the approved anchor into current artifacts."
          : packageState === "signed_off_stale"
            ? "Treat prior reviewer approval as stale until Tina captures a new immutable snapshot."
            : packageState === "ready_for_cpa_review"
              ? "Capture a snapshot before Tina sounds like the package is durably approved."
              : "Do not let old reviewer decisions make the live file sound more finished than it is.",
      relatedSnapshotId: approvedSnapshot?.id ?? latestSnapshot?.id ?? null,
      relatedDecisionId: latestDecision?.id ?? null,
    }),
  ];

  if (driftReasons.length > 0) {
    entries.push(
      buildEntry({
        id: "case-memory-drift",
        type: "drift",
        actor: "system",
        severity: "blocking",
        occurredAt: reviewerSignoff.lastEvaluatedAt ?? new Date().toISOString(),
        title: "Drift detected since the last approved snapshot",
        summary: driftReasons.join(" "),
        effectOnTrust:
          "Prior approval should not be treated as current until Tina captures a fresh snapshot and reruns reviewer signoff.",
        relatedSnapshotId: approvedSnapshot?.id ?? null,
        relatedDecisionId: latestDecision?.id ?? null,
      })
    );
  }

  entries.push(
    ...snapshots.map((snapshot) =>
      buildEntry({
        id: `case-memory-snapshot-${snapshot.id}`,
        type: "snapshot",
        actor: "tina",
        severity:
          snapshot.packageState === "blocked"
            ? "blocking"
            : snapshot.packageState === "ready_for_cpa_review"
              ? "needs_attention"
              : "info",
        occurredAt: snapshot.createdAt,
        title: `Snapshot captured: ${snapshot.id}`,
        summary: `${snapshot.summary} Readiness ${snapshot.readinessLevel}, ${snapshot.blockerCount} blocking item${snapshot.blockerCount === 1 ? "" : "s"}, ${snapshot.attentionCount} attention item${snapshot.attentionCount === 1 ? "" : "s"}.`,
        effectOnTrust:
          snapshot.packageState === "ready_for_cpa_review"
            ? "This snapshot is a clean reviewer handoff candidate."
            : snapshot.packageState === "blocked"
              ? "This snapshot should not be used as a trust anchor without more work."
              : "This snapshot preserves the file state Tina showed the reviewer.",
        relatedSnapshotId: snapshot.id,
        relatedDecisionId: null,
      })
    )
  );

  entries.push(
    ...reviewerObservedDeltas.items.map((item) =>
      buildEntry({
        id: `case-memory-observed-delta-${item.id}`,
        type: "reviewer_observed_delta",
        actor: "reviewer",
        severity:
          item.kind === "rejected" || item.kind === "stale_after_acceptance"
            ? "blocking"
            : item.kind === "change_requested"
              ? "needs_attention"
              : "info",
        occurredAt: item.occurredAt,
        title: item.title,
        summary: item.summary,
        effectOnTrust: item.trustEffect,
        relatedSnapshotId: item.relatedSnapshotId,
        relatedDecisionId: item.relatedDecisionId,
      })
    )
  );

  entries.push(
    ...decisions.map((decision) =>
      buildEntry({
        id: `case-memory-decision-${decision.id}`,
        type: "reviewer_decision",
        actor: "reviewer",
        severity:
          decision.decision === "approved"
            ? "info"
            : decision.decision === "changes_requested"
              ? "needs_attention"
              : "blocking",
        occurredAt: decision.decidedAt,
        title:
          decision.decision === "approved"
            ? "Reviewer approved snapshot"
            : decision.decision === "changes_requested"
              ? "Reviewer requested changes"
              : "Reviewer revoked prior approval",
        summary: `${summarizeDecision(decision)}${decision.notes ? ` Notes: ${decision.notes}` : ""}`,
        effectOnTrust:
          decision.decision === "approved"
            ? "Tina can use this decision as a trust anchor until the live package drifts."
            : decision.decision === "changes_requested"
              ? "Tina should keep the affected snapshot under reviewer control until the requested changes are addressed."
              : "Tina should not rely on the old approval after this revocation.",
        relatedSnapshotId: decision.snapshotId,
        relatedDecisionId: decision.id,
      })
    )
  );

  entries.sort(
    (left, right) => parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt)
  );

  const overallStatus: TinaCaseMemoryLedgerSnapshot["overallStatus"] =
    packageState === "signed_off"
      ? "stable"
      : packageState === "signed_off_stale"
        ? "drifted"
        : packageState === "blocked"
          ? "blocked"
          : "review_pending";

  const caseMemoryLedger: TinaCaseMemoryLedgerSnapshot = {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "stable"
        ? "Tina has a stable reviewer-approved anchor and can explain how the current package ties back to it."
        : overallStatus === "drifted"
          ? "Tina remembers the approved anchor, but she also knows the live package no longer matches it."
          : overallStatus === "blocked"
            ? "Tina has reviewer history, but the current package is still too blocked to lean on it safely."
            : "Tina has package history, but she still needs a fresh reviewer anchor before she should sound durably settled.",
    nextStep:
      overallStatus === "stable"
        ? "Preserve the approved anchor and only reopen reviewer signoff if the live package changes."
        : overallStatus === "drifted"
          ? "Capture a new immutable snapshot and run reviewer signoff again before Tina sounds anchored."
          : overallStatus === "blocked"
            ? "Clear the blocking file issues first, then capture a new snapshot when Tina is review-ready again."
            : reviewerObservedDeltas.changeRequestedCount > 0 || openOverrideCount > 0
              ? "Resolve the open reviewer override before Tina sounds anchored."
              : "Capture the next clean snapshot so Tina can convert review history into a current trust anchor.",
    activeAnchorSnapshotId: approvedSnapshot?.id ?? null,
    latestSnapshotId: latestSnapshot?.id ?? null,
    latestDecisionId: latestDecision?.id ?? null,
    openOverrideCount,
    driftReasons,
    entries,
    overrides,
  };

  caseMemoryLedgerCache.set(draft, caseMemoryLedger);
  return caseMemoryLedger;
}
