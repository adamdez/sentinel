import { buildTinaCompanionFormPlan } from "@/tina/lib/companion-form-plan";
import { buildTinaEvidenceSufficiency } from "@/tina/lib/evidence-sufficiency";
import { buildTinaFormReadiness } from "@/tina/lib/form-readiness";
import { buildTinaPackageReadiness } from "@/tina/lib/package-readiness";
import { buildTinaPackageState } from "@/tina/lib/package-state";
import { buildTinaScheduleCFormCoverage } from "@/tina/lib/schedule-c-form-coverage";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type {
  TinaCrossFormConsistencyIssue,
  TinaCrossFormConsistencySnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function createIssue(args: TinaCrossFormConsistencyIssue): TinaCrossFormConsistencyIssue {
  return {
    ...args,
    relatedLineNumbers: unique(args.relatedLineNumbers),
    relatedFactIds: unique(args.relatedFactIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

export function buildTinaCrossFormConsistency(
  draft: TinaWorkspaceDraft
): TinaCrossFormConsistencySnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const packageState = buildTinaPackageState(draft);
  const packageReadiness = buildTinaPackageReadiness(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const formCoverage = buildTinaScheduleCFormCoverage(draft);
  const formReadiness = buildTinaFormReadiness(draft);
  const evidenceSufficiency = buildTinaEvidenceSufficiency(draft);
  const companionFormPlan = buildTinaCompanionFormPlan(draft);
  const issues: TinaCrossFormConsistencyIssue[] = [];
  const line31Amount =
    scheduleCReturn.fields.find((field) => field.formKey === "netProfitOrLoss")?.amount ?? null;
  const depreciationAmount =
    scheduleCReturn.fields.find((field) => field.formKey === "depreciation")?.amount ?? null;
  const scheduleSEItem = companionFormPlan.items.find((item) => item.formId === "f1040sse");
  const form4562Item = companionFormPlan.items.find((item) => item.formId === "f4562");
  const primaryScheduleCItem = companionFormPlan.items.find((item) => item.formId === "f1040sc");
  const unsupportedCoverageItems = formCoverage.items.filter((item) => item.status === "unsupported");

  if (
    startPath.route !== "supported" &&
    (scheduleCReturn.fields.length > 0 ||
      formCoverage.items.some((item) => item.status !== "unsupported"))
  ) {
    issues.push(
      createIssue({
        id: "blocked-lane-still-carrying-schedule-c",
        title: "Blocked or review-only lane still carries Schedule C output",
        summary:
          "Tina should not show active Schedule C form output or supported coverage when the route is not cleanly supported.",
        severity: "blocking",
        category: "lane",
        relatedLineNumbers: scheduleCReturn.fields.map((field) => field.lineNumber),
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    );
  }

  if (startPath.recommendation.laneId === "schedule_c_single_member_llc" && !primaryScheduleCItem) {
    issues.push(
      createIssue({
        id: "missing-primary-schedule-c-plan",
        title: "Schedule C lane is missing a primary form-plan item",
        summary:
          "Tina should always map the primary Schedule C form into the companion-form plan when this is the supported lane.",
        severity: "blocking",
        category: "form_plan",
        relatedLineNumbers: [],
        relatedFactIds: [],
        relatedDocumentIds: [],
      })
    );
  }

  if (typeof line31Amount === "number" && line31Amount > 0 && !scheduleSEItem) {
    issues.push(
      createIssue({
        id: "missing-schedule-se-plan",
        title: "Positive self-employment income is missing a Schedule SE plan",
        summary:
          "Tina should plan for Schedule SE whenever the supported Schedule C output shows positive self-employment profit.",
        severity: "blocking",
        category: "attachment",
        relatedLineNumbers: ["Line 31"],
        relatedFactIds: [],
        relatedDocumentIds: [],
      })
    );
  }

  if (
    (draft.profile.hasFixedAssets || (typeof depreciationAmount === "number" && depreciationAmount > 0)) &&
    !form4562Item
  ) {
    issues.push(
      createIssue({
        id: "missing-form-4562-plan",
        title: "Fixed-asset activity is missing a Form 4562 plan",
        summary:
          "Tina should not carry depreciation-sensitive activity without also planning the attachment layer that supports it.",
        severity: "blocking",
        category: "attachment",
        relatedLineNumbers: ["Line 13"],
        relatedFactIds: [],
        relatedDocumentIds: [],
      })
    );
  }

  if (
    unsupportedCoverageItems.length > 0 &&
    primaryScheduleCItem?.status === "required_ready"
  ) {
    issues.push(
      createIssue({
        id: "coverage-overstates-readiness",
        title: "Form plan says ready while coverage still shows unsupported sections",
        summary:
          "Tina should not call the primary form ready when the official-form coverage layer still marks sections unsupported.",
        severity: "blocking",
        category: "form_plan",
        relatedLineNumbers: unsupportedCoverageItems.flatMap((item) => item.relatedLineNumbers),
        relatedFactIds: [],
        relatedDocumentIds: [],
      })
    );
  }

  if (
    evidenceSufficiency.overallStatus === "blocked" &&
    formReadiness.level === "reviewer_ready"
  ) {
    issues.push(
      createIssue({
        id: "evidence-readiness-mismatch",
        title: "Form readiness overstates weak evidence",
        summary:
          "Tina should not call form output reviewer-ready while the evidence-sufficiency engine still says the file is blocked.",
        severity: "blocking",
        category: "evidence",
        relatedLineNumbers: evidenceSufficiency.lines.map((line) => line.lineNumber),
        relatedFactIds: evidenceSufficiency.lines.flatMap((line) => line.relatedFactIds),
        relatedDocumentIds: evidenceSufficiency.lines.flatMap((line) => line.relatedDocumentIds),
      })
    );
  }

  if (packageState === "signed_off" && formReadiness.level !== "reviewer_ready") {
    issues.push(
      createIssue({
        id: "signed-off-without-ready-forms",
        title: "Signed-off package no longer matches form readiness",
        summary:
          "A signed-off package should not coexist with form output that is still provisional or not ready.",
        severity: "blocking",
        category: "package_state",
        relatedLineNumbers: [],
        relatedFactIds: [],
        relatedDocumentIds: [],
      })
    );
  }

  if (
    startPath.proofRequirements.some((requirement) => requirement.status === "needed") &&
    packageReadiness.level === "ready_for_cpa"
  ) {
    issues.push(
      createIssue({
        id: "proof-readiness-mismatch",
        title: "Package readiness is too optimistic for missing route-critical proof",
        summary:
          "Tina should not call the package CPA-ready while route-critical ownership or election proof is still missing.",
        severity: "needs_attention",
        category: "lane",
        relatedLineNumbers: [],
        relatedFactIds: startPath.proofRequirements.flatMap((requirement) => requirement.relatedFactIds),
        relatedDocumentIds: startPath.proofRequirements.flatMap(
          (requirement) => requirement.relatedDocumentIds
        ),
      })
    );
  }

  const blockingCount = issues.filter((issue) => issue.severity === "blocking").length;
  const overallStatus =
    blockingCount > 0 ? "blocked" : issues.length > 0 ? "review_required" : "aligned";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "aligned"
        ? "Tina's route, form plan, evidence, and package signals currently agree."
        : overallStatus === "review_required"
          ? `Tina sees ${issues.length} cross-form consistency item${issues.length === 1 ? "" : "s"} that still need reviewer attention.`
          : `Tina sees ${blockingCount} blocking cross-form consistency issue${blockingCount === 1 ? "" : "s"}.`,
    nextStep:
      overallStatus === "aligned"
        ? "Use this alignment check as a guardrail before final reviewer signoff."
        : "Resolve the consistency mismatches before treating the package and form set as coherent.",
    issues,
  };
}
