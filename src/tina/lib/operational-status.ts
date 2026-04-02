import { buildTinaPackageState } from "@/tina/lib/package-state";
import type {
  TinaOperationalMaturity,
  TinaOperationalStatusSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

export function createDefaultTinaOperationalStatus(): TinaOperationalStatusSnapshot {
  return {
    lastRunAt: null,
    maturity: "foundation",
    packageState: "provisional",
    summary: "Tina still reports as foundation until the reviewer-grade package path is active.",
    nextStep: "Keep building durable reviewer workflow and truthful readiness signals.",
    truths: [
      "Supported lane today: schedule_c_single_member_llc.",
      "Reviewer signoff and immutable snapshots are not active yet.",
    ],
    blockers: [],
  };
}

function determineMaturity(draft: TinaWorkspaceDraft): TinaOperationalMaturity {
  const hasScheduleCCore =
    draft.reviewerFinal.status === "complete" &&
    draft.scheduleCDraft.status === "complete" &&
    draft.packageReadiness.status === "complete" &&
    draft.cpaHandoff.status === "complete";
  const hasReviewerGradeCore =
    draft.packageSnapshots.length > 0 &&
    draft.reviewerDecisions.length > 0 &&
    draft.appendix.status === "complete";

  if (hasReviewerGradeCore) return "reviewer_grade_core";
  if (hasScheduleCCore) return "schedule_c_core";
  return "foundation";
}

export function buildTinaOperationalStatus(
  draft: TinaWorkspaceDraft
): TinaOperationalStatusSnapshot {
  const packageState = buildTinaPackageState(draft);
  const maturity = determineMaturity(draft);
  const blockingReadinessItems = draft.packageReadiness.items.filter(
    (item) => item.severity === "blocking"
  );
  const truths = [
    "Supported lane today: schedule_c_single_member_llc.",
    draft.packageSnapshots.length > 0
      ? `${draft.packageSnapshots.length} immutable package snapshot${draft.packageSnapshots.length === 1 ? "" : "s"} saved.`
      : "Immutable package snapshots have not been captured yet.",
    draft.reviewerDecisions.length > 0
      ? `${draft.reviewerDecisions.length} reviewer decision${draft.reviewerDecisions.length === 1 ? "" : "s"} recorded.`
      : "No reviewer decisions recorded yet.",
    draft.appendix.status === "complete"
      ? `${draft.appendix.items.length} appendix item${draft.appendix.items.length === 1 ? "" : "s"} preserved for reviewer inspection.`
      : "Reviewer appendix lane has not run yet.",
  ];

  const blockers = [
    ...blockingReadinessItems.map((item) => item.title),
    ...(draft.reviewerSignoff.hasDriftSinceSignoff
      ? ["Live package drifted after reviewer signoff."]
      : []),
  ];

  let summary = "Tina is still in foundation mode.";
  let nextStep = "Keep building durable reviewer workflow and truthful readiness signals.";

  if (maturity === "schedule_c_core") {
    summary =
      packageState === "ready_for_cpa_review"
        ? "Tina has a strong Schedule C core and a package that is ready for CPA review."
        : "Tina has a strong Schedule C core, but the reviewer-grade flow still needs more work.";
    nextStep =
      packageState === "ready_for_cpa_review"
        ? "Capture an immutable package snapshot and route it through reviewer signoff."
        : "Clear the remaining package blockers and add reviewer signoff durability.";
  } else if (maturity === "reviewer_grade_core") {
    summary =
      packageState === "signed_off"
        ? "Tina has a reviewer-grade core and a currently signed-off package."
        : "Tina has the backend pieces for reviewer-grade core, but the live package still needs review discipline.";
    nextStep =
      packageState === "signed_off"
        ? "Preserve the signed snapshot and restart signoff only when facts or numbers change."
        : "Use the snapshot and signoff flow to keep reviewer state truthful.";
  }

  return {
    lastRunAt: new Date().toISOString(),
    maturity,
    packageState,
    summary,
    nextStep,
    truths,
    blockers,
  };
}
