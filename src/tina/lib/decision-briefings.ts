import { buildTinaAttachmentStatements } from "@/tina/lib/attachment-statements";
import { buildTinaAccountingArtifactCoverage } from "@/tina/lib/accounting-artifact-coverage";
import { buildTinaCaseMemoryLedger } from "@/tina/lib/case-memory-ledger";
import { buildTinaConfidenceCalibration } from "@/tina/lib/confidence-calibration";
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import { buildTinaOfficialFormExecution } from "@/tina/lib/official-form-execution";
import { buildTinaPackageReadiness } from "@/tina/lib/package-readiness";
import { buildTinaPlanningActionBoard } from "@/tina/lib/planning-action-board";
import { buildTinaReviewerLearningLoop } from "@/tina/lib/reviewer-learning-loop";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import { buildTinaUnknownPatternEngine } from "@/tina/lib/unknown-pattern-engine";
import type { TinaDecisionBriefingSnapshot, TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildTinaDecisionBriefings(
  draft: TinaWorkspaceDraft
): TinaDecisionBriefingSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const packageReadiness = buildTinaPackageReadiness(draft);
  const officialFormFill = buildTinaOfficialFormFill(draft);
  const attachmentStatements = buildTinaAttachmentStatements(draft);
  const accountingArtifactCoverage = buildTinaAccountingArtifactCoverage(draft);
  const officialFormExecution = buildTinaOfficialFormExecution(draft);
  const planningActionBoard = buildTinaPlanningActionBoard(draft);
  const unknownPatternEngine = buildTinaUnknownPatternEngine(draft);
  const confidenceCalibration = buildTinaConfidenceCalibration(draft);
  const caseMemoryLedger = buildTinaCaseMemoryLedger(draft);
  const reviewerLearningLoop = buildTinaReviewerLearningLoop(draft);

  const reviewerKeyPoints = unique([
    `Route: ${startPath.recommendation.title} (${startPath.route}).`,
    `Package readiness: ${packageReadiness.level.replace(/_/g, " ")}.`,
    `Official-form execution: ${officialFormExecution.overallStatus.replace(/_/g, " ")}.`,
    `Accounting artifact coverage: ${accountingArtifactCoverage.overallStatus}.`,
    `Attachment schedules and statements: ${attachmentStatements.items.length}.`,
    `Planning action board: ${planningActionBoard.overallStatus}.`,
    `Unknown-pattern engine: ${unknownPatternEngine.overallStatus.replace(/_/g, " ")}.`,
    `Confidence calibration: ${confidenceCalibration.overallStatus} / ${confidenceCalibration.recommendedPosture.replace(/_/g, " ")}.`,
    `Case memory ledger: ${caseMemoryLedger.overallStatus.replace(/_/g, " ")}.`,
    `Reviewer learning loop: ${reviewerLearningLoop.overallStatus.replace(/_/g, " ")}.`,
  ]);
  const reviewerOpenQuestions = unique([
    ...startPath.blockingReasons,
    ...startPath.reviewReasons,
    ...accountingArtifactCoverage.items
      .filter((item) => item.criticality === "critical" && item.status !== "covered")
      .slice(0, 3)
      .map((item) => item.title),
    ...officialFormExecution.items
      .filter((item) => item.status !== "ready_to_fill")
      .slice(0, 3)
      .map((item) => item.title),
    ...planningActionBoard.items
      .filter((item) => item.status === "review" || item.status === "hold" || item.status === "reject")
      .slice(0, 3)
      .map((item) => item.title),
    ...unknownPatternEngine.customProofRequests.slice(0, 3),
    ...confidenceCalibration.debts.slice(0, 3).map((debt) => debt.title),
    ...caseMemoryLedger.driftReasons.slice(0, 3),
    ...caseMemoryLedger.overrides
      .filter((override) => override.status === "open")
      .slice(0, 2)
      .map((override) => override.summary),
    ...reviewerLearningLoop.policyCandidates.slice(0, 2).map((candidate) => candidate.title),
    ...packageReadiness.items
      .filter((item) => item.severity === "blocking")
      .slice(0, 3)
      .map((item) => item.title),
    ...attachmentStatements.items
      .filter((item) => item.status !== "ready")
      .slice(0, 3)
      .map((item) => item.title),
  ]);
  const reviewerRecommendedActions = unique([
    startPath.route === "supported"
      ? "Confirm the lane stays supported as the package firms up."
      : "Resolve the lane or ownership questions before trusting deeper prep.",
    accountingArtifactCoverage.overallStatus === "covered"
      ? "Lean on the accounting artifact set to validate the books picture quickly."
      : "Request the missing critical bookkeeping artifacts before treating the books picture as veteran-grade.",
    officialFormExecution.overallStatus === "ready_to_fill"
      ? "Use the official-form execution stack to drive blank-form output."
      : "Clear the blocked or review-required forms before treating execution as final.",
    officialFormFill.overallStatus === "ready"
      ? "Use the official-form placement plan when producing the final Schedule C artifact."
      : "Clear the blocked or review-only fill placements before treating official-form output as ready.",
    attachmentStatements.items.length > 0
      ? "Carry the attachment statements with the packet so unsupported areas stay explicit."
      : "No extra attachment statements are required from the current facts.",
    planningActionBoard.items.some((item) => item.status === "advance")
      ? "Review the high-priority planning moves before final signoff."
      : "Strengthen support behind the planning queue before moving opportunities into use.",
    confidenceCalibration.overallStatus === "calibrated"
      ? "Keep the current confidence posture intact as the packet advances."
      : "Do not widen Tina's certainty language until the remaining confidence debt is resolved.",
    caseMemoryLedger.overallStatus === "stable"
      ? "Keep the current reviewer anchor intact and reopen it only if the live package drifts."
      : caseMemoryLedger.overallStatus === "drifted"
        ? "Treat the old reviewer approval as stale and capture a fresh snapshot before leaning on it."
        : "Use the case-memory ledger to keep reviewer history visible while Tina works toward a stable anchor.",
    reviewerLearningLoop.overallStatus === "stable"
      ? "Keep the anchored reviewer lessons protected in regression coverage as Tina grows."
      : reviewerLearningLoop.overallStatus === "active_learning"
        ? "Turn the queued reviewer lessons into policy and regression follow-through before widening confidence language."
        : "Promote the high-priority reviewer lessons into policy updates before Tina sounds more certain next time.",
  ]);

  const ownerKeyPoints = unique([
    startPath.route === "supported"
      ? `Tina believes this file belongs on ${startPath.recommendation.title}.`
      : "Tina still needs a human review before she can trust the starting tax path.",
    packageReadiness.level === "ready_for_cpa"
      ? "The current package is close to CPA review."
      : "The current package still has open items before it is ready for final review.",
    accountingArtifactCoverage.overallStatus === "covered"
      ? "Tina has the core bookkeeping support she wants behind the file."
      : "Tina still needs stronger bookkeeping support behind the file.",
    planningActionBoard.items.some((item) => item.status === "advance")
      ? "Tina sees meaningful savings opportunities worth reviewing."
      : "Tina is still building a stronger savings plan from the facts on hand.",
    unknownPatternEngine.overallStatus === "known_pattern"
      ? "Tina thinks this file fits a known pattern cleanly."
      : "Tina thinks this file still has unusual pattern risk and should stay under tighter review.",
    confidenceCalibration.overallStatus === "calibrated"
      ? "Tina's confidence level is lining up well with the proof she has."
      : "Tina is still keeping some of her confidence under tighter control because parts of the file are not fully earned yet.",
    caseMemoryLedger.overallStatus === "stable"
      ? "Tina has a current reviewer-approved anchor for this file."
      : caseMemoryLedger.overallStatus === "drifted"
        ? "Tina had reviewer approval before, but the file changed and that approval is now stale."
        : "Tina is still building a durable review history for this file.",
    reviewerLearningLoop.activeLessonCount > 0
      ? "Tina is carrying forward reviewer lessons from similar files so she stays stricter where reviewers already pushed back."
      : "Tina does not have active reviewer-learning carry-forward pressure on this file right now.",
  ]);
  const ownerOpenQuestions = unique([
    ...startPath.proofRequirements
      .filter((requirement) => requirement.status === "needed")
      .map((requirement) => requirement.label),
    ...accountingArtifactCoverage.items
      .filter((item) => item.criticality === "critical" && item.status !== "covered")
      .map((item) => item.title),
    ...attachmentStatements.items
      .filter((item) => item.status === "blocked")
      .map((item) => item.title),
    ...unknownPatternEngine.customProofRequests.slice(0, 2),
    ...confidenceCalibration.debts.slice(0, 2).map((debt) => debt.title),
    ...caseMemoryLedger.driftReasons.slice(0, 2),
    ...reviewerLearningLoop.policyCandidates.slice(0, 1).map((candidate) => candidate.title),
  ]);
  const ownerRecommendedActions = unique([
    ownerOpenQuestions.length > 0
      ? "Upload the missing ownership, bookkeeping, or support papers Tina is asking for."
      : "Stay available to confirm any reviewer questions that come back from the file.",
    planningActionBoard.items.some((item) => item.status === "hold")
      ? "Answer Tina's open fact questions so she can unlock more tax-saving moves."
      : "No extra owner action is needed for the current planning queue yet.",
    confidenceCalibration.overallStatus === "calibrated"
      ? "No extra confidence-control step is needed right now."
      : "Expect Tina to stay more cautious until the missing proof or reviewer calls are resolved.",
    caseMemoryLedger.overallStatus === "drifted"
      ? "Expect Tina to ask for a fresh reviewer pass because the file changed after the last approval."
      : "No special case-memory action is needed from the owner unless Tina asks for new proof.",
    reviewerLearningLoop.activeLessonCount > 0
      ? "Expect Tina to stay stricter on the areas where prior reviewer feedback already taught her to be careful."
      : "There is no extra reviewer-learning follow-up for the owner right now.",
  ]);

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    reviewer: {
      audience: "reviewer",
      headline:
        reviewerOpenQuestions.length === 0
          ? "Tina has a tight reviewer brief with no major open decision points."
          : "Tina has a reviewer brief, but there are still open decisions to resolve before final confidence.",
      summary:
        "This briefing is designed to put the reviewer on the highest-value judgment calls immediately instead of making them reconstruct the file.",
      keyPoints: reviewerKeyPoints,
      openQuestions: reviewerOpenQuestions,
      recommendedActions: reviewerRecommendedActions,
    },
    owner: {
      audience: "owner",
      headline:
        ownerOpenQuestions.length === 0
          ? "Tina has a clean owner brief with no urgent document asks."
          : "Tina still needs a few owner-facing answers or uploads before she can tighten the file.",
      summary:
        "This briefing explains the file in plain language so the owner sees what Tina believes, what is still missing, and what comes next.",
      keyPoints: ownerKeyPoints,
      openQuestions: ownerOpenQuestions,
      recommendedActions: ownerRecommendedActions,
    },
  };
}
