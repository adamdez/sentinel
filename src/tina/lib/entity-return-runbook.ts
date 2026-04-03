import type {
  TinaEntityReturnRunbookSnapshot,
  TinaEntityReturnRunbookStep,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaEntityEconomicsReadiness } from "@/tina/lib/entity-economics-readiness";
import { buildTinaEntityRecordMatrix } from "@/tina/lib/entity-record-matrix";
import { buildTinaFederalReturnRequirements } from "@/tina/lib/federal-return-requirements";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type { TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildStep(step: TinaEntityReturnRunbookStep): TinaEntityReturnRunbookStep {
  return {
    ...step,
    relatedRecordIds: unique(step.relatedRecordIds),
    relatedCheckIds: unique(step.relatedCheckIds),
  };
}

export function buildTinaEntityReturnRunbook(
  draft: TinaWorkspaceDraft
): TinaEntityReturnRunbookSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const federalReturnRequirements = buildTinaFederalReturnRequirements(draft);
  const entityRecordMatrix = buildTinaEntityRecordMatrix(draft);
  const entityEconomicsReadiness = buildTinaEntityEconomicsReadiness(draft);
  const canTinaFinishLane = federalReturnRequirements.canTinaFinishLane;
  const laneId = federalReturnRequirements.laneId;
  const executionMode =
    startPath.route === "blocked"
      ? "blocked"
      : canTinaFinishLane
        ? "tina_supported"
        : laneId === "schedule_c_single_member_llc"
          ? "future_lane"
          : "reviewer_controlled";
  const gatherRecordsStatus =
    entityRecordMatrix.overallStatus === "covered"
      ? "ready"
      : entityRecordMatrix.overallStatus === "partial"
        ? "needs_review"
        : "blocked";
  const economicsStatus =
    entityEconomicsReadiness.overallStatus === "clear"
      ? "ready"
      : entityEconomicsReadiness.overallStatus === "review_required"
        ? "needs_review"
        : "blocked";
  const assembleFormsStatus =
    executionMode === "blocked"
      ? "blocked"
      : canTinaFinishLane
        ? gatherRecordsStatus === "ready" && economicsStatus === "ready"
          ? "ready"
          : gatherRecordsStatus === "blocked" || economicsStatus === "blocked"
            ? "blocked"
            : "needs_review"
        : "needs_review";
  const reviewerStepStatus =
    assembleFormsStatus === "blocked"
      ? "blocked"
      : assembleFormsStatus === "needs_review" || executionMode !== "tina_supported"
        ? "needs_review"
        : "ready";

  const steps: TinaEntityReturnRunbookStep[] = [
    buildStep({
      id: "confirm-return-family",
      title: "Confirm the federal return family",
      audience: "reviewer",
      status:
        startPath.route === "supported"
          ? "ready"
          : startPath.route === "review_only"
            ? "needs_review"
            : "blocked",
      summary:
        startPath.route === "supported"
          ? "Tina has a clean enough lane decision to keep the return family stable."
          : startPath.route === "review_only"
            ? "Tina sees the likely return family, but reviewer confirmation is still needed."
            : "Tina cannot trust the return family yet because the lane is still blocked.",
      deliverable: federalReturnRequirements.returnFamily,
      relatedRecordIds: [],
      relatedCheckIds: [],
    }),
    buildStep({
      id: "gather-entity-records",
      title: "Gather the lane-critical records",
      audience: "owner",
      status: gatherRecordsStatus,
      summary:
        gatherRecordsStatus === "ready"
          ? "Tina sees the key records for this return family."
          : gatherRecordsStatus === "needs_review"
            ? "Tina sees some of the lane-critical records, but the file is still thin."
            : "Tina is still missing critical lane-specific records.",
      deliverable: "Record coverage strong enough for reviewer-grade prep",
      relatedRecordIds: entityRecordMatrix.items.map((item) => item.id),
      relatedCheckIds: [],
    }),
    buildStep({
      id: "resolve-owner-economics",
      title: "Resolve owner, partner, or shareholder economics",
      audience: "reviewer",
      status: economicsStatus,
      summary:
        economicsStatus === "ready"
          ? "Tina has a coherent economics story for this lane."
          : economicsStatus === "needs_review"
            ? "Tina has a partial economics story, but reviewer judgment still matters."
            : "Tina still lacks the economics support needed to trust entity-specific prep.",
      deliverable: "Economics story clear enough for line-level treatment",
      relatedRecordIds: entityRecordMatrix.items
        .filter((item) => item.criticality !== "supporting")
        .map((item) => item.id),
      relatedCheckIds: entityEconomicsReadiness.checks.map((check) => check.id),
    }),
    buildStep({
      id: "assemble-return-family",
      title: "Assemble the return family and supporting schedules",
      audience: executionMode === "tina_supported" ? "tina" : "reviewer",
      status: assembleFormsStatus,
      summary:
        executionMode === "tina_supported"
          ? "Tina can keep assembling this lane herself once the records and economics are clean."
          : "Tina should preserve the runbook and required forms here, but reviewer-controlled execution still owns the lane.",
      deliverable: federalReturnRequirements.items
        .flatMap((item) => item.requiredForms)
        .filter(Boolean)
        .join(", "),
      relatedRecordIds: entityRecordMatrix.items.map((item) => item.id),
      relatedCheckIds: entityEconomicsReadiness.checks.map((check) => check.id),
    }),
    buildStep({
      id: "review-and-signoff",
      title: "Route to reviewer signoff",
      audience: "reviewer",
      status: reviewerStepStatus,
      summary:
        reviewerStepStatus === "ready"
          ? "The lane is coherent enough for a true reviewer signoff pass."
          : reviewerStepStatus === "needs_review"
            ? "The reviewer should use this runbook to control the lane before any final signoff language."
            : "Reviewer signoff should wait until lane, records, and economics stop blocking.",
      deliverable: "Reviewer-controlled final package posture",
      relatedRecordIds: entityRecordMatrix.items.map((item) => item.id),
      relatedCheckIds: entityEconomicsReadiness.checks.map((check) => check.id),
    }),
  ];

  const blockedCount = steps.filter((step) => step.status === "blocked").length;
  const reviewCount = steps.filter((step) => step.status === "needs_review").length;
  const overallStatus =
    blockedCount > 0 ? "blocked" : reviewCount > 0 ? "review_required" : "ready";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId,
    returnFamily: federalReturnRequirements.returnFamily,
    executionMode,
    overallStatus,
    summary:
      overallStatus === "ready"
        ? "Tina has a coherent entity-return runbook for the current lane."
        : overallStatus === "review_required"
          ? `Tina has a usable runbook, but ${reviewCount} step${
              reviewCount === 1 ? "" : "s"
            } still need reviewer control.`
          : `Tina still has ${blockedCount} blocked runbook step${
              blockedCount === 1 ? "" : "s"
            } before the lane feels execution-ready.`,
    nextStep:
      overallStatus === "ready"
        ? "Carry this runbook into packet, bundle, and reviewer workflow artifacts."
        : overallStatus === "review_required"
          ? "Use the runbook to keep the reviewer focused on the remaining lane-control steps."
          : "Clear the blocked runbook steps before Tina treats the lane as coherent.",
    steps,
  };
}
