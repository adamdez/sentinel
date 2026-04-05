import type {
  TinaSingleOwnerCorporateRouteIssue,
  TinaSingleOwnerCorporateRouteSnapshot,
} from "@/tina/lib/acceleration-contracts";
import {
  buildTinaSingleOwnerCorporateRouteSignalProfileFromText,
  type TinaSingleOwnerCorporateRouteSignalProfile,
} from "@/tina/lib/single-owner-corporate-route-signals";
import { buildTinaEntityFilingRemediation } from "@/tina/lib/entity-filing-remediation";
import { buildTinaOwnerFlowBasisAdjudication } from "@/tina/lib/owner-flow-basis-adjudication";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type { TinaStoredDocument, TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function documentText(draft: TinaWorkspaceDraft, document: TinaStoredDocument): string {
  const reading = draft.documentReadings.find((item) => item.documentId === document.id);
  const facts = draft.sourceFacts.filter((fact) => fact.sourceDocumentId === document.id);

  return [
    document.name,
    document.requestId ?? "",
    document.requestLabel ?? "",
    reading?.summary ?? "",
    reading?.detailLines.join(" ") ?? "",
    facts.map((fact) => `${fact.label} ${fact.value}`).join(" "),
  ].join(" ");
}

function buildDraftSignalProfile(draft: TinaWorkspaceDraft): TinaSingleOwnerCorporateRouteSignalProfile {
  return buildTinaSingleOwnerCorporateRouteSignalProfileFromText(
    [
      draft.profile.notes,
      draft.profile.principalBusinessActivity,
      ...draft.documents.map((document) => documentText(draft, document)),
      ...draft.sourceFacts.map((fact) => `${fact.label} ${fact.value}`),
      ...draft.documentReadings.flatMap((reading) => reading.detailLines),
    ].join(" ")
  );
}

function buildIssue(issue: TinaSingleOwnerCorporateRouteIssue): TinaSingleOwnerCorporateRouteIssue {
  return {
    ...issue,
    relatedDocumentIds: unique(issue.relatedDocumentIds),
    relatedFactIds: unique(issue.relatedFactIds),
  };
}

export function buildTinaSingleOwnerCorporateRouteProof(
  draft: TinaWorkspaceDraft
): TinaSingleOwnerCorporateRouteSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const entityFilingRemediation = buildTinaEntityFilingRemediation(draft);
  const ownerFlowBasis = buildTinaOwnerFlowBasisAdjudication(draft);
  const signals = buildDraftSignalProfile(draft);

  const explicitCorporateRouteClaim =
    draft.profile.taxElection === "s_corp" ||
    draft.profile.taxElection === "c_corp" ||
    draft.profile.entityType === "s_corp" ||
    draft.profile.entityType === "c_corp" ||
    startPath.recommendation.laneId === "1120_s" ||
    startPath.recommendation.laneId === "1120" ||
    entityFilingRemediation.currentLaneId === "1120_s" ||
    entityFilingRemediation.currentLaneId === "1120" ||
    signals.sCorpSignal ||
    signals.cCorpSignal ||
    signals.corporateSignal;
  const singleOwnerLikely =
    draft.profile.ownerCount === 1 ||
    draft.profile.entityType === "single_member_llc" ||
    draft.profile.entityType === "s_corp" ||
    draft.profile.entityType === "c_corp" ||
    signals.singleOwnerSignal;
  const applicable =
    singleOwnerLikely &&
    (explicitCorporateRouteClaim || draft.profile.entityType === "single_member_llc" || signals.llcSignal);
  const sCorpPressure =
    draft.profile.taxElection === "s_corp" ||
    draft.profile.entityType === "s_corp" ||
    startPath.recommendation.laneId === "1120_s" ||
    entityFilingRemediation.currentLaneId === "1120_s" ||
    signals.sCorpSignal ||
    signals.reasonableCompSignal;
  const ownerServiceLikely =
    Boolean(draft.profile.principalBusinessActivity) ||
    signals.ownerServiceSignal ||
    signals.reasonableCompSignal ||
    signals.distributionSignal ||
    signals.drawSignal ||
    draft.profile.hasPayroll;
  const positivePayrollSignal =
    (signals.payrollSignal || signals.payrollAccountSignal) && !signals.noPayrollSignal;
  const explicitCorporateProofNeeded =
    explicitCorporateRouteClaim ||
    signals.electionSignal ||
    signals.electionAcceptanceSignal ||
    signals.electionReliefSignal;

  const electionProofStatus: TinaSingleOwnerCorporateRouteSnapshot["electionProofStatus"] =
    !applicable || !explicitCorporateProofNeeded
      ? "not_applicable"
      : entityFilingRemediation.electionStatus === "accepted_or_timely" || signals.electionAcceptanceSignal
        ? "proved"
        : entityFilingRemediation.electionStatus === "relief_candidate" || signals.electionReliefSignal
          ? "conditional"
          : "missing";
  const ownerServiceStatus: TinaSingleOwnerCorporateRouteSnapshot["ownerServiceStatus"] =
    !applicable || !sCorpPressure
      ? "not_applicable"
      : ownerServiceLikely
        ? "likely_active"
        : "unclear";
  const payrollRequirementStatus: TinaSingleOwnerCorporateRouteSnapshot["payrollRequirementStatus"] =
    !applicable || !sCorpPressure
      ? "not_applicable"
      : draft.profile.hasPayroll || positivePayrollSignal
        ? "supported"
        : signals.noPayrollSignal && ownerServiceStatus === "likely_active"
          ? "missing"
          : electionProofStatus === "proved" && ownerServiceStatus === "likely_active"
            ? "missing"
            : "review_required";

  let posture: TinaSingleOwnerCorporateRouteSnapshot["posture"] = "not_applicable";
  if (applicable) {
    if (sCorpPressure && payrollRequirementStatus === "missing") {
      posture = "s_corp_no_payroll";
    } else if (explicitCorporateRouteClaim && electionProofStatus === "proved") {
      posture = "corporate_route_proved";
    } else if (explicitCorporateRouteClaim && electionProofStatus === "conditional") {
      posture = "corporate_route_conditional";
    } else if (explicitCorporateRouteClaim && electionProofStatus === "missing") {
      posture = "corporate_behavior_without_route_proof";
    } else {
      posture = "single_owner_default_path";
    }
  }

  const issues: TinaSingleOwnerCorporateRouteIssue[] = [];
  const relatedDocumentIds = unique([
    ...startPath.relatedDocumentIds,
    ...entityFilingRemediation.relatedDocumentIds,
    ...ownerFlowBasis.items.flatMap((item) => item.relatedDocumentIds),
  ]);
  const relatedFactIds = unique([
    ...startPath.relatedFactIds,
    ...entityFilingRemediation.relatedFactIds,
    ...ownerFlowBasis.items.flatMap((item) => item.relatedFactIds),
  ]);

  if (applicable && explicitCorporateProofNeeded && electionProofStatus === "missing") {
    issues.push(
      buildIssue({
        id: "single-owner-corporate-election-proof-missing",
        title: "Single-owner corporate route still lacks election proof",
        severity: posture === "corporate_behavior_without_route_proof" ? "blocking" : "needs_review",
        summary:
          "Tina sees a single-owner corporate path being claimed or implied, but the election trail is still unproved.",
        relatedDocumentIds,
        relatedFactIds,
      })
    );
  }

  if (posture === "s_corp_no_payroll") {
    issues.push(
      buildIssue({
        id: "single-owner-s-corp-no-payroll",
        title: "Single-owner S-corp posture exists without payroll support",
        severity: "blocking",
        summary:
          "Tina sees S-corp pressure plus an active owner story, but no payroll trail strong enough to trust wages versus draws or distributions.",
        relatedDocumentIds,
        relatedFactIds,
      })
    );
  } else if (sCorpPressure && payrollRequirementStatus === "review_required") {
    issues.push(
      buildIssue({
        id: "single-owner-s-corp-payroll-pressure",
        title: "Single-owner S-corp posture still needs payroll proof",
        severity: "needs_review",
        summary:
          "Tina sees S-corp pressure, but the payroll account, filings, and owner-pay treatment are still too thin to call settled.",
        relatedDocumentIds,
        relatedFactIds,
      })
    );
  }

  if (
    applicable &&
    (signals.distributionSignal || signals.drawSignal) &&
    ownerFlowBasis.ownerFlowCharacterizationStatus !== "clear"
  ) {
    issues.push(
      buildIssue({
        id: "single-owner-corporate-draws-vs-payroll",
        title: "Owner cash-out posture is still mixed between draws, distributions, and compensation",
        severity:
          ownerFlowBasis.ownerFlowCharacterizationStatus === "blocked" ? "blocking" : "needs_review",
        summary:
          "Tina still needs a cleaner owner-pay story before she should trust whether cash leaving the business was compensation, draws, or distributions.",
        relatedDocumentIds,
        relatedFactIds,
      })
    );
  }

  const blockedIssueCount = issues.filter((issue) => issue.severity === "blocking").length;
  const reviewIssueCount = issues.filter((issue) => issue.severity === "needs_review").length;
  const questions: string[] = [];
  if (explicitCorporateProofNeeded && electionProofStatus !== "proved") {
    questions.push(
      "Was a valid Form 2553 or Form 8832 filed, and is there an IRS acceptance or relief trail?"
    );
  }
  if (sCorpPressure && ownerServiceStatus !== "not_applicable") {
    questions.push("What work did the owner actually perform in the business during the year?");
  }
  if (sCorpPressure && payrollRequirementStatus !== "supported") {
    questions.push("Did any payroll account, payroll provider, Form 941, or W-2 trail ever exist?");
    questions.push("Did cash leave the business as wages, officer pay, draws, or distributions?");
  }

  const cleanupStepsFirst: string[] = [];
  if (explicitCorporateProofNeeded && electionProofStatus !== "proved") {
    cleanupStepsFirst.push(
      "Settle the single-owner corporate election trail before Tina treats the file as a real corporate route."
    );
  }
  if (posture === "s_corp_no_payroll") {
    cleanupStepsFirst.push(
      "Resolve owner-payroll posture before trusting draws, shareholder distributions, or reasonable-comp conclusions."
    );
  } else if (sCorpPressure && payrollRequirementStatus === "review_required") {
    cleanupStepsFirst.push(
      "Confirm payroll setup, payroll filings, and owner-pay treatment before Tina carries the S-corp story forward."
    );
  }

  const overallStatus: TinaSingleOwnerCorporateRouteSnapshot["overallStatus"] =
    !applicable
      ? "not_applicable"
      : blockedIssueCount > 0
        ? "blocked"
        : reviewIssueCount > 0 || posture === "corporate_route_conditional"
          ? "review_required"
          : "clear";

  const summary =
    overallStatus === "not_applicable"
      ? "Tina does not currently see a single-owner corporate-route issue that should control the file."
      : overallStatus === "clear"
        ? posture === "single_owner_default_path"
          ? "Tina sees a single-owner file without a durable corporate-route claim."
          : "Tina sees a proved single-owner corporate path with payroll posture that is at least coherent enough to carry forward."
        : overallStatus === "review_required"
          ? "Tina sees a plausible single-owner corporate route, but election proof or owner-pay facts still need reviewer control."
          : "Tina should fail closed because the single-owner corporate route or no-payroll S-corp posture is still unsafe.";
  const nextStep =
    overallStatus === "clear"
      ? "Carry the current single-owner route truth into payroll, classification, and reviewer artifacts without widening the claim."
      : overallStatus === "not_applicable"
        ? "Keep the default single-owner path quiet unless new corporate-route proof appears."
        : "Resolve election proof, owner services, and payroll posture before Tina trusts the single-owner corporate story.";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    posture,
    electionProofStatus,
    payrollRequirementStatus,
    ownerServiceStatus,
    summary,
    nextStep,
    blockedIssueCount,
    reviewIssueCount,
    questions: unique(questions),
    cleanupStepsFirst: unique(cleanupStepsFirst),
    issues,
    relatedDocumentIds,
    relatedFactIds,
  };
}
