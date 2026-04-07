import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { buildTinaLiveAcceptanceReport } from "@/tina/lib/live-acceptance";
import type { TinaWorkspaceDraft } from "@/tina/types";

export type TinaFilingApprovalStatus = "blocked" | "review_only" | "filing_candidate";

export interface TinaFilingApprovalCheck {
  id: string;
  title: string;
  status: "ready" | "waiting" | "blocked";
  summary: string;
}

export interface TinaFilingApprovalReport {
  status: TinaFilingApprovalStatus;
  summary: string;
  nextStep: string;
  checks: TinaFilingApprovalCheck[];
}

function buildCheck(args: {
  id: string;
  title: string;
  status: "ready" | "waiting" | "blocked";
  summary: string;
}): TinaFilingApprovalCheck {
  return args;
}

export function buildTinaFilingApprovalReport(
  draft: TinaWorkspaceDraft
): TinaFilingApprovalReport {
  const lane = recommendTinaFilingLane(draft.profile);
  const liveAcceptance = buildTinaLiveAcceptanceReport(draft);
  const fragileCurrentFileCohorts = liveAcceptance.currentFileCohorts.filter(
    (cohort) => cohort.trustLevel === "fragile"
  );
  const currentFileNeedsMoreHistory = liveAcceptance.currentFileCohorts.filter(
    (cohort) => cohort.trustLevel === "insufficient_history"
  );

  const checks: TinaFilingApprovalCheck[] = [
    buildCheck({
      id: "supported_lane",
      title: "Supported filing lane",
      status:
        lane.support === "supported" && lane.laneId === "schedule_c_single_member_llc"
          ? "ready"
          : "blocked",
      summary:
        lane.support === "supported" && lane.laneId === "schedule_c_single_member_llc"
          ? "Tina is on her currently supported Schedule C lane."
          : "Tina is not on a filing lane she can honestly finish yet.",
    }),
    buildCheck({
      id: "package_readiness",
      title: "Package readiness",
      status:
        draft.packageReadiness.status !== "complete"
          ? "blocked"
          : draft.packageReadiness.level === "blocked"
            ? "blocked"
            : draft.packageReadiness.level === "needs_review"
              ? "waiting"
              : "ready",
      summary:
        draft.packageReadiness.status !== "complete"
          ? "Tina still needs a current package-readiness pass."
          : draft.packageReadiness.summary,
    }),
    buildCheck({
      id: "tax_position_memory",
      title: "Tax-position memory",
      status:
        draft.taxPositionMemory.status !== "complete"
          ? "blocked"
          : draft.taxPositionMemory.records.some((record) => record.status === "blocked")
            ? "blocked"
            : draft.taxPositionMemory.records.some((record) => record.status === "needs_review")
              ? "waiting"
              : "ready",
      summary:
        draft.taxPositionMemory.status !== "complete"
          ? "Tina still needs a current tax-position register."
          : draft.taxPositionMemory.summary,
    }),
    buildCheck({
      id: "reviewer_acceptance",
      title: "Live reviewer acceptance",
      status:
        fragileCurrentFileCohorts.length > 0
          ? "blocked"
          : currentFileNeedsMoreHistory.length > 0 ||
              liveAcceptance.benchmarkMovement.recommendation === "hold"
          ? "waiting"
          : liveAcceptance.benchmarkMovement.recommendation === "raise_broadly"
            ? "ready"
            : "waiting",
      summary:
        fragileCurrentFileCohorts.length > 0
          ? `The current file falls into fragile live-acceptance cohorts: ${fragileCurrentFileCohorts
              .map((cohort) => cohort.label)
              .join(", ")}.`
          : currentFileNeedsMoreHistory.length > 0
            ? `Tina still needs more live reviewer history for this file type: ${currentFileNeedsMoreHistory
                .map((cohort) => cohort.label)
                .join(", ")}.`
            : liveAcceptance.benchmarkMovement.summary,
    }),
    buildCheck({
      id: "direct_submission_channel",
      title: "Direct submission channel",
      status: "waiting",
      summary:
        "Tina still does not have a governed direct IRS submission or e-file channel in this checkout.",
    }),
  ];

  const blockedCount = checks.filter((check) => check.status === "blocked").length;
  const waitingCount = checks.filter((check) => check.status === "waiting").length;

  if (blockedCount > 0) {
    return {
      status: "blocked",
      summary:
        "Tina is not filing-ready yet. She can still reach a strong review-only state, but at least one filing gate is still blocked.",
      nextStep:
        "Clear the blocked filing gates first. Tina should stay in review-only mode until those gates are actually built and passing.",
      checks,
    };
  }

  if (waitingCount > 0) {
    return {
      status: "review_only",
      summary:
        "Tina has a review-capable package, but the filing-approval layer still needs more signoff and live trust evidence.",
      nextStep:
        "Use Tina in review-only mode, keep gathering live reviewer outcomes, and do not market the package as filing-ready yet.",
      checks,
    };
  }

  return {
    status: "filing_candidate",
    summary:
      "Tina has cleared the current filing-approval checks, but human signoff is still the last guard before any real submission claim.",
    nextStep:
      "Run the final human signoff and validate the filing channel before treating this package as truly submission-ready.",
    checks,
  };
}
