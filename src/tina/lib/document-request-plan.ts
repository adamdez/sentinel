import type {
  TinaDocumentRequestPlanItem,
  TinaDocumentRequestPlanSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import { buildTinaBooksReconstruction } from "@/tina/lib/books-reconstruction";
import { buildTinaCompanionFormCalculations } from "@/tina/lib/companion-form-calculations";
import {
  buildTinaDocumentIntelligence,
  listTinaDocumentIntelligenceDistinctValues,
  listTinaDocumentIntelligenceFactsByKind,
} from "@/tina/lib/document-intelligence";
import { buildTinaDisclosureReadiness } from "@/tina/lib/disclosure-readiness";
import { buildTinaEntityEconomicsReadiness } from "@/tina/lib/entity-economics-readiness";
import { buildTinaEntityFilingRemediation } from "@/tina/lib/entity-filing-remediation";
import { buildTinaEntityRecordMatrix } from "@/tina/lib/entity-record-matrix";
import { buildTinaEvidenceSufficiency } from "@/tina/lib/evidence-sufficiency";
import { buildTinaIndustryEvidenceMatrix } from "@/tina/lib/industry-evidence-matrix";
import { buildTinaOwnerFlowBasisAdjudication } from "@/tina/lib/owner-flow-basis-adjudication";
import { buildTinaPayrollComplianceReconstruction } from "@/tina/lib/payroll-compliance-reconstruction";
import { buildTinaSingleMemberEntityHistoryProof } from "@/tina/lib/single-member-entity-history-proof";
import { buildTinaSingleOwnerCorporateRouteProof } from "@/tina/lib/single-owner-corporate-route-proof";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import { buildTinaUnknownPatternEngine } from "@/tina/lib/unknown-pattern-engine";
import type { TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildItem(item: TinaDocumentRequestPlanItem): TinaDocumentRequestPlanItem {
  return {
    ...item,
    relatedFactIds: unique(item.relatedFactIds),
    relatedDocumentIds: unique(item.relatedDocumentIds),
  };
}

function existingIds(items: TinaDocumentRequestPlanItem[]): Set<string> {
  return new Set(items.map((item) => item.id));
}

export function buildTinaDocumentRequestPlan(
  draft: TinaWorkspaceDraft
): TinaDocumentRequestPlanSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const authorityPositionMatrix = buildTinaAuthorityPositionMatrix(draft);
  const booksReconstruction = buildTinaBooksReconstruction(draft);
  const entityRecordMatrix = buildTinaEntityRecordMatrix(draft);
  const entityEconomicsReadiness = buildTinaEntityEconomicsReadiness(draft);
  const entityFilingRemediation = buildTinaEntityFilingRemediation(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const disclosureReadiness = buildTinaDisclosureReadiness(draft);
  const evidenceSufficiency = buildTinaEvidenceSufficiency(draft);
  const industryEvidenceMatrix = buildTinaIndustryEvidenceMatrix(draft);
  const companionFormCalculations = buildTinaCompanionFormCalculations(draft);
  const unknownPatternEngine = buildTinaUnknownPatternEngine(draft);
  const ownerFlowBasis = buildTinaOwnerFlowBasisAdjudication(draft);
  const payrollCompliance = buildTinaPayrollComplianceReconstruction(draft);
  const singleMemberEntityHistory = buildTinaSingleMemberEntityHistoryProof(draft);
  const singleOwnerCorporateRoute = buildTinaSingleOwnerCorporateRouteProof(draft);
  const identityValues = listTinaDocumentIntelligenceDistinctValues({
    snapshot: documentIntelligence,
    kind: "identity_signal",
    label: "Employer identification number",
  });
  const entityNameValues = listTinaDocumentIntelligenceDistinctValues({
    snapshot: documentIntelligence,
    kind: "entity_name_signal",
    label: "Entity name signal",
  });
  const homeOfficeFacts = listTinaDocumentIntelligenceFactsByKind({
    snapshot: documentIntelligence,
    kind: "home_office_input",
  });
  const assetFacts = listTinaDocumentIntelligenceFactsByKind({
    snapshot: documentIntelligence,
    kind: "asset_signal",
  });
  const inventoryFacts = listTinaDocumentIntelligenceFactsByKind({
    snapshot: documentIntelligence,
    kind: "inventory_signal",
  });
  const items: TinaDocumentRequestPlanItem[] = [];
  const ownerFlowItemsById = new Map(ownerFlowBasis.items.map((item) => [item.id, item]));
  const ownerFlowSubset = (ids: string[]) =>
    ids
      .map((id) => ownerFlowItemsById.get(id) ?? null)
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

  startPath.proofRequirements
    .filter((requirement) => requirement.status === "needed")
    .forEach((requirement) => {
      items.push(
        buildItem({
          id: `proof-${requirement.id}`,
          audience: "owner",
          category: "ownership",
          priority:
            startPath.route === "blocked" || requirement.priority === "required"
              ? "immediate"
              : "next",
          title: requirement.label,
          summary: requirement.reason,
          request: `Upload or confirm: ${requirement.label}.`,
          whyItMatters: "Tina needs this proof to set the correct tax lane and stop wrong-lane prep.",
          relatedFactIds: requirement.relatedFactIds,
          relatedDocumentIds: requirement.relatedDocumentIds,
        })
      );
    });

  if (entityFilingRemediation.overallStatus !== "aligned") {
    const hasRouteDriftSignal = entityFilingRemediation.signals.some(
      (signal) =>
        signal.category === "current_vs_prior_route_drift" ||
        signal.category === "missing_return_backlog" ||
        signal.category === "prior_year_books_drift"
    );
    const hasElectionSignal = entityFilingRemediation.signals.some(
      (signal) =>
        signal.category === "election_trail_gap" ||
        signal.category === "late_election_relief"
    );
    const hasOwnershipSignal = entityFilingRemediation.signals.some(
      (signal) => signal.category === "ownership_timeline_gap"
    );
    const hasTransitionSignal = entityFilingRemediation.signals.some(
      (signal) => signal.category === "transition_year"
    );
    const hasAmendmentSignal = entityFilingRemediation.signals.some(
      (signal) =>
        signal.category === "prior_year_books_drift" ||
        signal.category === "amended_return_sequencing"
    );
    const hasStateSignal = entityFilingRemediation.signals.some(
      (signal) => signal.category === "state_registration_drift"
    );

    if (hasRouteDriftSignal) {
      items.push(
        buildItem({
          id: "entity-filing-remediation-prior-return-history",
          audience: "owner",
          category: "entity",
          priority:
            entityFilingRemediation.overallStatus === "blocked" ? "immediate" : "next",
          title: "Entity filing continuity: prior return family and backlog",
          summary:
            "Tina sees a likely mismatch between current-year route, prior filing history, or possible missing entity-return years.",
          request:
            "Upload the most recent filed returns for each possible entity path, any extension filings, and confirm which years were never filed at all.",
          whyItMatters:
            "Tina should not treat the current year as standalone prep if the old filing family or missing-return backlog can still change the route.",
          relatedFactIds: entityFilingRemediation.relatedFactIds,
          relatedDocumentIds: entityFilingRemediation.relatedDocumentIds,
        })
      );
    }

    if (hasElectionSignal) {
      items.push(
        buildItem({
          id: "entity-filing-remediation-election-trail",
          audience: "owner",
          category: "entity",
          priority:
            entityFilingRemediation.overallStatus === "blocked" ? "immediate" : "next",
          title: "Entity filing continuity: election trail",
          summary:
            "Election proof or late-election relief still determines whether Tina is using the right entity return family.",
          request:
            "Upload Form 2553 or Form 8832, IRS acceptance or rejection letters, initial entity-formation papers, EIN notices, and any late-election relief correspondence.",
          whyItMatters:
            "Election paperwork is what separates a real corporate path from books or payroll that only looked corporate operationally.",
          relatedFactIds: entityFilingRemediation.relatedFactIds,
          relatedDocumentIds: entityFilingRemediation.relatedDocumentIds,
        })
      );
    }

    if (hasOwnershipSignal) {
      items.push(
        buildItem({
          id: "entity-filing-remediation-ownership-timeline",
          audience: "owner",
          category: "ownership",
          priority:
            entityFilingRemediation.overallStatus === "blocked" ? "immediate" : "next",
          title: "Entity filing continuity: owner timeline during the year",
          summary:
            "Tina still needs a year-by-year owner story before the entity filing path and allocations are trustworthy.",
          request:
            "Upload the operating agreement, ownership breakdown, and any transfer or buyout documents showing who owned what and when.",
          whyItMatters:
            "Entity route, K-1 economics, and owner-level taxability can all change when the owner timeline is still fuzzy.",
          relatedFactIds: entityFilingRemediation.relatedFactIds,
          relatedDocumentIds: entityFilingRemediation.relatedDocumentIds,
        })
      );
    }

    if (hasTransitionSignal) {
      items.push(
        buildItem({
          id: "entity-filing-remediation-transition-timeline",
          audience: "owner",
          category: "entity",
          priority:
            entityFilingRemediation.overallStatus === "blocked" ? "immediate" : "next",
          title: "Entity filing continuity: transition-year timeline",
          summary:
            "A conversion, election, or ownership-change timeline still needs to be rebuilt before Tina should trust the current route.",
          request:
            "Upload conversion papers, election dates, prior preparer workpapers, and any timeline showing when separate books, payroll, or return families actually changed.",
          whyItMatters:
            "Transition-year files are where clean current-year books can still be attached to the wrong historical filing posture.",
          relatedFactIds: entityFilingRemediation.relatedFactIds,
          relatedDocumentIds: entityFilingRemediation.relatedDocumentIds,
        })
      );
    }

    if (hasAmendmentSignal) {
      items.push(
        buildItem({
          id: "entity-filing-remediation-amended-return-sequencing",
          audience: "owner",
          category: "books",
          priority:
            entityFilingRemediation.overallStatus === "blocked" ? "immediate" : "next",
          title: "Entity filing continuity: beginning balances and amended-return sequencing",
          summary:
            "Tina still needs to tie opening balances to filed prior-year returns and decide whether the fix is books-only, amended-return work, or both.",
          request:
            "Upload prior-year workpapers, opening-balance support, any amended returns already filed, and notes showing which balances were rolled forward manually.",
          whyItMatters:
            "Cross-year drift can make a clean current-year return wrong even when the current route itself looks plausible.",
          relatedFactIds: entityFilingRemediation.relatedFactIds,
          relatedDocumentIds: entityFilingRemediation.relatedDocumentIds,
        })
      );
    }

    if (hasStateSignal) {
      items.push(
        buildItem({
          id: "entity-filing-remediation-state-alignment",
          audience: "owner",
          category: "entity",
          priority: "next",
          title: "Entity filing continuity: state registration alignment",
          summary:
            "State formation, qualification, or annual-report posture is still part of the entity cleanup story.",
          request:
            "Upload formation-state records, qualification or certificate-of-authority papers, and any state account or annual-report notices tied to the entity history.",
          whyItMatters:
            "State posture can help prove which entity story is real and which cleanup items belong outside the federal return lane.",
          relatedFactIds: entityFilingRemediation.relatedFactIds,
          relatedDocumentIds: entityFilingRemediation.relatedDocumentIds,
        })
      );
    }
  }

  booksReconstruction.areas
    .filter((area) => area.status !== "ready")
    .forEach((area) => {
      items.push(
        buildItem({
          id: `books-${area.id}`,
          audience: "owner",
          category: "books",
          priority: area.status === "blocked" ? "immediate" : "next",
          title: area.title,
          summary: area.summary,
          request: `Upload cleaner ledger, bank, or support detail for ${area.title.toLowerCase()}.`,
          whyItMatters: "Tina needs a cleaner books-to-tax picture before she can treat the file like reviewer-grade work.",
          relatedFactIds: area.relatedFactIds,
          relatedDocumentIds: area.relatedDocumentIds,
        })
      );
    });

  entityRecordMatrix.items
    .filter(
      (item) =>
        item.status === "missing" &&
        (item.criticality === "critical" || startPath.recommendation.laneId !== "schedule_c_single_member_llc")
    )
    .forEach((item) => {
      items.push(
        buildItem({
          id: `entity-record-${item.id}`,
          audience: "owner",
          category: "entity",
          priority: item.criticality === "critical" ? "immediate" : "next",
          title: item.title,
          summary: item.summary,
          request: `Upload or confirm the records Tina needs for: ${item.title}.`,
          whyItMatters:
            "Lane-specific entity records are what let Tina move from rough routing into believable return-family prep.",
          relatedFactIds: item.matchedFactIds,
          relatedDocumentIds: item.matchedDocumentIds,
        })
      );
    });

  entityEconomicsReadiness.checks
    .filter((check) => check.status === "blocked" || check.status === "needs_review")
    .forEach((check) => {
      items.push(
        buildItem({
          id: `economics-${check.id}`,
          audience: "reviewer",
          category: "economics",
          priority: check.status === "blocked" ? "immediate" : "next",
          title: check.title,
          summary: check.summary,
          request: `Reviewer should resolve the economics story for ${check.title.toLowerCase()}.`,
          whyItMatters: check.whyItMatters,
          relatedFactIds: check.relatedFactIds,
          relatedDocumentIds: check.relatedDocumentIds,
        })
      );
    });

  if (
    ownerFlowBasis.openingFootingStatus === "blocked" ||
    ownerFlowBasis.openingFootingStatus === "review_required"
  ) {
    const relatedItems = ownerFlowSubset(["opening-basis-footing"]);
    items.push(
      buildItem({
        id: "owner-flow-opening-footing",
        audience: "owner",
        category: "ownership",
        priority: ownerFlowBasis.openingFootingStatus === "blocked" ? "immediate" : "next",
        title: "Owner-flow footing: opening basis or capital balances",
        summary:
          "Tina still needs the opening owner footing before current-year owner-flow and distribution treatment can be trusted.",
        request:
          "Upload prior-year K-1s, basis or capital schedules, prior returns, and opening-balance workpapers that tie the owner footing into the current year.",
        whyItMatters:
          "Opening footing is what keeps current-year owner flows from sounding cleaner than the real basis or capital history allows.",
        relatedFactIds: relatedItems.flatMap((item) => item.relatedFactIds),
        relatedDocumentIds: relatedItems.flatMap((item) => item.relatedDocumentIds),
      })
    );
  }

  if (
    singleMemberEntityHistory.overallStatus !== "not_applicable" &&
    singleMemberEntityHistory.ownerHistoryStatus !== "proved" &&
    singleMemberEntityHistory.ownerHistoryStatus !== "not_applicable"
  ) {
    items.push(
      buildItem({
        id: "single-member-entity-history-owner-proof",
        audience: "owner",
        category: "entity",
        priority:
          singleMemberEntityHistory.overallStatus === "blocked" ? "immediate" : "next",
        title: "Single-member entity history: owner count and transition proof",
        summary:
          "Tina still needs a clean opening-versus-closing owner story before she should trust a single-member route.",
        request:
          "Upload operating agreements, cap tables, ownership schedules, buyout or transfer papers, and any timeline showing who owned the business at opening and closing.",
        whyItMatters:
          "A file can sound like a single-member LLC while still hiding a spouse exception, multi-owner year, or transition-year ownership change.",
        relatedFactIds: singleMemberEntityHistory.relatedFactIds,
        relatedDocumentIds: singleMemberEntityHistory.relatedDocumentIds,
      })
    );
  }

  if (
    singleMemberEntityHistory.overallStatus !== "not_applicable" &&
    singleMemberEntityHistory.spouseExceptionStatus !== "not_applicable" &&
    singleMemberEntityHistory.spouseExceptionStatus !== "proved"
  ) {
    items.push(
      buildItem({
        id: "single-member-entity-history-spouse-exception",
        audience: "owner",
        category: "entity",
        priority:
          singleMemberEntityHistory.overallStatus === "blocked" ? "immediate" : "next",
        title: "Single-member entity history: spouse or community-property proof",
        summary:
          "Tina still needs the legal-owner and property-law story before she should keep a married-couple file near the single-member path.",
        request:
          "Confirm state of residence, which spouse legally owned the business or assets, whether both spouses materially participated, and upload any community-property or ownership paperwork.",
        whyItMatters:
          "The spouse exception is narrow, and the federal return family can change if the legal-owner or community-property story is wrong.",
        relatedFactIds: singleMemberEntityHistory.relatedFactIds,
        relatedDocumentIds: singleMemberEntityHistory.relatedDocumentIds,
      })
    );
  }

  if (
    singleMemberEntityHistory.overallStatus !== "not_applicable" &&
    singleMemberEntityHistory.priorFilingAlignmentStatus !== "aligned" &&
    singleMemberEntityHistory.priorFilingAlignmentStatus !== "not_applicable"
  ) {
    items.push(
      buildItem({
        id: "single-member-entity-history-prior-filings",
        audience: "owner",
        category: "entity",
        priority:
          singleMemberEntityHistory.priorFilingAlignmentStatus === "conflicted"
            ? "immediate"
            : "next",
        title: "Single-member entity history: prior-return and election trail",
        summary:
          "Tina still needs prior returns, EIN notices, and election history tied into one route story before she should trust the current path.",
        request:
          "Upload prior-year returns, any Form 2553 or Form 8832 filings, IRS acceptance or rejection letters, EIN notices, and any prior-preparer notes about entity changes.",
        whyItMatters:
          "Single-member route truth depends on prior filing family, election trail, and when any route change actually started.",
        relatedFactIds: singleMemberEntityHistory.relatedFactIds,
        relatedDocumentIds: singleMemberEntityHistory.relatedDocumentIds,
      })
    );
  }

  if (
    singleMemberEntityHistory.overallStatus !== "not_applicable" &&
    (singleMemberEntityHistory.transitionYearStatus !== "not_applicable" ||
      singleMemberEntityHistory.booksPostureStatus !== "aligned") &&
    singleMemberEntityHistory.booksPostureStatus !== "not_applicable"
  ) {
    items.push(
      buildItem({
        id: "single-member-entity-history-books-catch-up",
        audience: "reviewer",
        category: "books",
        priority:
          singleMemberEntityHistory.booksPostureStatus === "not_caught_up"
            ? "immediate"
            : "next",
        title: "Single-member entity history: books and payroll catch-up",
        summary:
          "Tina still needs the books, payroll labels, and owner-equity posture tied to the real entity timeline before current-year prep can sound clean.",
        request:
          "Upload chart of accounts exports, bookkeeping workpapers, payroll setup dates, and any transition memo showing when books and payroll actually changed to match the legal and tax posture.",
        whyItMatters:
          "A file can have the right route on paper while the books still describe the old business.",
        relatedFactIds: singleMemberEntityHistory.relatedFactIds,
        relatedDocumentIds: singleMemberEntityHistory.relatedDocumentIds,
      })
    );
  }

  if (
    singleOwnerCorporateRoute.overallStatus !== "not_applicable" &&
    singleOwnerCorporateRoute.electionProofStatus !== "proved"
  ) {
    items.push(
      buildItem({
        id: "single-owner-corporate-route-election-proof",
        audience: "owner",
        category: "entity",
        priority:
          singleOwnerCorporateRoute.overallStatus === "blocked" ? "immediate" : "next",
        title: "Single-owner corporate route: election proof",
        summary:
          "Tina sees a single-owner corporate path being claimed or implied, but the election trail is still missing or conditional.",
        request:
          "Upload Form 2553 or Form 8832, any IRS acceptance or rejection letters, EIN notices, and any late-election relief correspondence tied to the single-owner entity.",
        whyItMatters:
          "Single-owner files can look operationally corporate while still lacking the proof that makes the federal route real.",
        relatedFactIds: singleOwnerCorporateRoute.relatedFactIds,
        relatedDocumentIds: singleOwnerCorporateRoute.relatedDocumentIds,
      })
    );
  }

  if (
    singleOwnerCorporateRoute.overallStatus !== "not_applicable" &&
    singleOwnerCorporateRoute.ownerServiceStatus !== "not_applicable"
  ) {
    items.push(
      buildItem({
        id: "single-owner-corporate-route-owner-services",
        audience: "owner",
        category: "entity",
        priority:
          singleOwnerCorporateRoute.overallStatus === "blocked" ? "immediate" : "next",
        title: "Single-owner corporate route: owner services and compensation facts",
        summary:
          "Tina still needs a clean story for what work the owner performed and how owner pay was supposed to work.",
        request:
          "Confirm what services the owner performed, whether the owner was active all year, and how cash left the business: wages, officer pay, draws, or distributions.",
        whyItMatters:
          "Single-owner corporate files often fail when active-owner economics are described loosely but compensation treatment is not proved.",
        relatedFactIds: singleOwnerCorporateRoute.relatedFactIds,
        relatedDocumentIds: singleOwnerCorporateRoute.relatedDocumentIds,
      })
    );
  }

  if (
    singleOwnerCorporateRoute.overallStatus !== "not_applicable" &&
    singleOwnerCorporateRoute.payrollRequirementStatus !== "supported" &&
    singleOwnerCorporateRoute.payrollRequirementStatus !== "not_applicable"
  ) {
    items.push(
      buildItem({
        id: "single-owner-corporate-route-payroll-proof",
        audience:
          singleOwnerCorporateRoute.payrollRequirementStatus === "missing" ? "owner" : "reviewer",
        category: "forms",
        priority:
          singleOwnerCorporateRoute.overallStatus === "blocked" ? "immediate" : "next",
        title: "Single-owner corporate route: payroll proof",
        summary:
          "Tina still needs payroll-account, filing, and owner-pay proof before the single-owner corporate posture is trustworthy.",
        request:
          "Upload payroll account or provider records, Form 941 and W-2/W-3 support, payroll tax deposit detail, and any workpaper tying owner pay to wages instead of draws or distributions.",
        whyItMatters:
          "A single-owner S-corp posture without payroll proof is one of the easiest ways for a file to look cleaner than it really is.",
        relatedFactIds: singleOwnerCorporateRoute.relatedFactIds,
        relatedDocumentIds: singleOwnerCorporateRoute.relatedDocumentIds,
      })
    );
  }

  if (
    ownerFlowBasis.basisRollforwardStatus === "blocked" ||
    ownerFlowBasis.basisRollforwardStatus === "review_required"
  ) {
    const relatedItems = ownerFlowSubset([
      "opening-basis-footing",
      "basis-rollforward-continuity",
    ]);
    items.push(
      buildItem({
        id: "owner-flow-basis-rollforward",
        audience: "owner",
        category: "ownership",
        priority: ownerFlowBasis.basisRollforwardStatus === "blocked" ? "immediate" : "next",
        title: "Owner-flow continuity: basis and capital rollforward",
        summary:
          "Tina still needs a beginning-to-ending owner rollforward before she should trust distributions, losses, or carry items.",
        request:
          "Upload basis or capital rollforwards, current-year contribution/loan/distribution detail, and any closing owner schedule that explains how year-end footing was reached.",
        whyItMatters:
          "A missing rollforward is how plausible owner economics turn into wrong taxability or wrong loss support.",
        relatedFactIds: relatedItems.flatMap((item) => item.relatedFactIds),
        relatedDocumentIds: relatedItems.flatMap((item) => item.relatedDocumentIds),
      })
    );
  }

  if (
    ownerFlowBasis.loanEquityStatus === "blocked" ||
    ownerFlowBasis.loanEquityStatus === "review_required"
  ) {
    const relatedItems = ownerFlowSubset(["loan-vs-equity", "debt-basis-overlap"]);
    items.push(
      buildItem({
        id: "owner-flow-loan-equity",
        audience: "owner",
        category: "ownership",
        priority: ownerFlowBasis.loanEquityStatus === "blocked" ? "immediate" : "next",
        title: "Owner-flow characterization: debt versus equity proof",
        summary:
          "Tina still cannot cleanly separate real owner debt from capital infusions, draws, or distributions.",
        request:
          "Upload promissory notes, repayment history, interest terms, and any schedule that separates owner loans from capital contributions or distributions.",
        whyItMatters:
          "Debt-versus-equity posture changes basis, deductions, distribution analysis, and how skeptical reviewers will trust the file.",
        relatedFactIds: relatedItems.flatMap((item) => item.relatedFactIds),
        relatedDocumentIds: relatedItems.flatMap((item) => item.relatedDocumentIds),
      })
    );
  }

  if (
    ownerFlowBasis.distributionTaxabilityStatus === "blocked" ||
    ownerFlowBasis.distributionTaxabilityStatus === "review_required"
  ) {
    const relatedItems = ownerFlowSubset(["distribution-taxability"]);
    items.push(
      buildItem({
        id: "owner-flow-distribution-taxability",
        audience: "owner",
        category: "ownership",
        priority:
          ownerFlowBasis.distributionTaxabilityStatus === "blocked" ? "immediate" : "next",
        title: "Owner-flow taxability: distribution support",
        summary:
          "Tina still needs owner-level footing before she should trust whether distributions were nontaxable, partially taxable, or fully taxable.",
        request:
          "Upload distribution detail, prior-year K-1s or shareholder basis schedules, and any current-year owner-flow workpaper tying distributions back to basis or capital.",
        whyItMatters:
          "Distribution taxability is one of the fastest places for a plausible entity file to still be materially wrong.",
        relatedFactIds: relatedItems.flatMap((item) => item.relatedFactIds),
        relatedDocumentIds: relatedItems.flatMap((item) => item.relatedDocumentIds),
      })
    );
  }

  if (
    ownerFlowBasis.transitionEconomicsStatus === "blocked" ||
    ownerFlowBasis.transitionEconomicsStatus === "review_required"
  ) {
    const relatedItems = ownerFlowSubset(["ownership-change-allocation", "buyout-redemption"]);
    items.push(
      buildItem({
        id: "owner-flow-transition-economics",
        audience: "owner",
        category: "ownership",
        priority:
          ownerFlowBasis.transitionEconomicsStatus === "blocked" ? "immediate" : "next",
        title: "Owner-flow transition: ownership-change and buyout economics",
        summary:
          "Tina still needs the economics of the owner transition before she should trust allocations, redemptions, or ending owner footing.",
        request:
          "Upload transfer, buyout, redemption, settlement, payout, and note documents showing who owned what before and after the transaction and how cash or notes changed hands.",
        whyItMatters:
          "Transition-year owner economics can change route truth, allocation timing, distribution treatment, and basis all at once.",
        relatedFactIds: relatedItems.flatMap((item) => item.relatedFactIds),
        relatedDocumentIds: relatedItems.flatMap((item) => item.relatedDocumentIds),
      })
    );
  }

  authorityPositionMatrix.items
    .filter(
      (item) =>
        item.recommendation === "hold_for_authority" ||
        item.recommendation === "hold_for_facts"
    )
    .forEach((item) => {
      items.push(
        buildItem({
          id: `authority-${item.id}`,
          audience: item.recommendation === "hold_for_facts" ? "owner" : "reviewer",
          category: "authority",
          priority: item.priority,
          title: item.title,
          summary: item.summary,
          request:
            item.recommendation === "hold_for_authority"
              ? `Reviewer should build or confirm authority support for ${item.title.toLowerCase()}.`
              : `Upload stronger support for ${item.title.toLowerCase()}.`,
          whyItMatters:
            "Authority-backed planning is only real when Tina can show both the law and the facts behind the position.",
          relatedFactIds: item.relatedFactIds,
          relatedDocumentIds: item.relatedDocumentIds,
        })
      );
    });

  disclosureReadiness.items
    .filter((item) => item.status === "required" || item.status === "needs_review")
    .forEach((item) => {
      items.push(
        buildItem({
          id: `disclosure-${item.id}`,
          audience: "reviewer",
          category: "authority",
          priority: item.status === "required" ? "immediate" : "next",
          title: item.title,
          summary: item.summary,
          request: item.requiredAction,
          whyItMatters: item.whyItMatters,
          relatedFactIds: [],
          relatedDocumentIds: item.relatedDocumentIds,
        })
      );
    });

  industryEvidenceMatrix.items
    .filter((item) => item.status !== "covered")
    .forEach((item) => {
      items.push(
        buildItem({
          id: `industry-${item.id}`,
          audience: "owner",
          category: "industry",
          priority: item.status === "missing" && item.materiality === "low" ? "later" : "next",
          title: `${item.playbookTitle}: ${item.requirement}`,
          summary: item.summary,
          request: `Upload or point Tina to: ${item.requirement}.`,
          whyItMatters:
            "Industry-specific records are often what separate a plausible tax position from a reviewer-trusted one.",
          relatedFactIds: item.matchedFactIds,
          relatedDocumentIds: item.matchedDocumentIds,
        })
      );
    });

  companionFormCalculations.items
    .filter((item) => item.status === "blocked" || item.status === "needs_review")
    .forEach((item) => {
      items.push(
        buildItem({
          id: `forms-${item.id}`,
          audience: "owner",
          category: "forms",
          priority: item.status === "blocked" ? "immediate" : "next",
          title: item.title,
          summary: item.summary,
          request:
            item.requiredRecords.length > 0
              ? `Upload or confirm: ${item.requiredRecords.slice(0, 3).join("; ")}.`
              : `Provide the missing support Tina needs for ${item.title.toLowerCase()}.`,
          whyItMatters:
            "These records are what let Tina move from a core Schedule C view toward a more complete federal form set.",
          relatedFactIds: [],
          relatedDocumentIds: item.relatedDocumentIds,
        })
      );
    });

  evidenceSufficiency.lines
    .filter((line) => line.level === "missing" || line.level === "weak")
    .slice(0, 5)
    .forEach((line) => {
      items.push(
        buildItem({
          id: `evidence-${line.id}`,
          audience: line.relatedDocumentIds.length > 0 ? "reviewer" : "owner",
          category: "evidence",
          priority: line.level === "missing" ? "immediate" : "next",
          title: `${line.lineNumber} ${line.label}`,
          summary: line.summary,
          request:
            line.relatedDocumentIds.length > 0
              ? `Reviewer should verify the support chain for ${line.lineNumber} before trusting it as final.`
              : `Upload stronger support for ${line.lineNumber} ${line.label}.`,
          whyItMatters:
            "Weak or missing line-level evidence is exactly the kind of thing a skeptical CPA will challenge first.",
          relatedFactIds: line.relatedFactIds,
          relatedDocumentIds: line.relatedDocumentIds,
        })
      );
    });

  draft.scheduleCDraft.fields
    .filter(
      (field) =>
        typeof field.amount === "number" &&
        field.amount !== 0 &&
        field.sourceDocumentIds.length === 0 &&
        !existingIds(items).has(`evidence-${field.id}`)
    )
    .slice(0, 5)
    .forEach((field) => {
      items.push(
        buildItem({
          id: `evidence-${field.id}`,
          audience: "owner",
          category: "evidence",
          priority: "immediate",
          title: `${field.lineNumber} ${field.label}`,
          summary: "Tina has a non-zero draft line here, but no attached source documents yet.",
          request: `Upload stronger support for ${field.lineNumber} ${field.label}.`,
          whyItMatters:
            "A non-zero line without attached support is exactly the kind of gap a reviewer will challenge immediately.",
          relatedFactIds: [],
          relatedDocumentIds: [],
        })
      );
    });

  documentIntelligence.missingCriticalRoles.forEach((role, index) => {
    items.push(
      buildItem({
        id: `document-intelligence-${index + 1}`,
        audience: "owner",
        category: "evidence",
        priority: "immediate",
        title: `Structured paper gap: ${role}`,
        summary:
          "Tina can see the broader fact pattern, but she still lacks one of the paper types that would turn it into durable structured truth.",
        request: `Upload or identify Tina's ${role}.`,
        whyItMatters:
          "This is the kind of paper that lets Tina move from surface clues into deeper route, economics, and treatment confidence.",
        relatedFactIds: unique(
          documentIntelligence.items.flatMap((item) => item.relatedFactIds)
        ),
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  });

  documentIntelligence.continuityQuestions.forEach((question, index) => {
    items.push(
      buildItem({
        id: `document-intelligence-continuity-${index + 1}`,
        audience: "owner",
        category: "entity",
        priority: "immediate",
        title: "Structured paper continuity question",
        summary:
          "Tina found enough paper-truth to know the entity story is still moving, but not enough to collapse it safely.",
        request: question,
        whyItMatters:
          "Continuity gaps are one of the fastest ways for a correct-looking return family to be tied to the wrong entity story.",
        relatedFactIds: unique(
          documentIntelligence.items.flatMap((item) => item.relatedFactIds)
        ),
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  });

  if (identityValues.length > 1) {
    items.push(
      buildItem({
        id: "document-intelligence-identity-conflict",
        audience: "owner",
        category: "entity",
        priority: "immediate",
        title: "Structured paper conflict: multiple EINs",
        summary:
          "Tina found more than one EIN in the structured paper trail and should not assume which entity the current return belongs to.",
        request: `Confirm which EIN belongs to the current filing entity and explain the relationship among ${identityValues.join(", ")}.`,
        whyItMatters:
          "Identity conflicts can make a clean-looking return posture wrong even when the route hints look strong.",
        relatedFactIds: unique(
          documentIntelligence.items.flatMap((item) => item.relatedFactIds)
        ),
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  if (entityNameValues.length > 1) {
    items.push(
      buildItem({
        id: "document-intelligence-entity-name-conflict",
        audience: "owner",
        category: "entity",
        priority: "immediate",
        title: "Structured paper conflict: multiple entity names",
        summary:
          "Tina found more than one legal-entity name in the structured paper trail and should not assume which one belongs on the return.",
        request: `Confirm which legal entity name belongs to the current-year return and explain why the paper trail names ${entityNameValues.join(", ")}.`,
        whyItMatters:
          "Entity-name drift can make election papers, prior returns, and payroll evidence look stronger than they really are for the current filer.",
        relatedFactIds: unique(
          documentIntelligence.items.flatMap((item) => item.relatedFactIds)
        ),
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  if (
    homeOfficeFacts.length > 0 &&
    !homeOfficeFacts.some((fact) => fact.label === "Office square footage")
  ) {
    items.push(
      buildItem({
        id: "document-intelligence-home-office-area-used",
        audience: "owner",
        category: "forms",
        priority: "next",
        title: "Structured home-office gap: office square footage",
        summary:
          "Tina sees home-office treatment in the paper trail, but the business-use area is not yet structured well enough for stronger Form 8829 work.",
        request: "Upload or confirm the office square footage used regularly and exclusively for business.",
        whyItMatters:
          "Form 8829 execution gets much more trustworthy once the business-use area is explicit instead of inferred from narrative text.",
        relatedFactIds: unique(
          documentIntelligence.items.flatMap((item) => item.relatedFactIds)
        ),
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  if (
    homeOfficeFacts.length > 0 &&
    !homeOfficeFacts.some((fact) => fact.label === "Home square footage")
  ) {
    items.push(
      buildItem({
        id: "document-intelligence-home-office-area-total",
        audience: "owner",
        category: "forms",
        priority: "next",
        title: "Structured home-office gap: total home square footage",
        summary:
          "Tina still needs total home area before she can reuse the home-office evidence as a reliable Form 8829 input.",
        request: "Upload or confirm the total square footage of the home tied to the home-office claim.",
        whyItMatters:
          "Without the total home area, Tina cannot safely derive the business-use percentage for the official home-office form set.",
        relatedFactIds: unique(
          documentIntelligence.items.flatMap((item) => item.relatedFactIds)
        ),
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  if (
    assetFacts.length > 0 &&
    !assetFacts.some((fact) => fact.label === "Placed-in-service support")
  ) {
    items.push(
      buildItem({
        id: "document-intelligence-asset-placed-in-service",
        audience: "owner",
        category: "forms",
        priority: "next",
        title: "Structured asset gap: placed-in-service dates",
        summary:
          "Tina sees asset-history papers, but she still lacks explicit placed-in-service detail for stronger Form 4562 execution.",
        request: "Upload or confirm placed-in-service dates for the assets driving current-year depreciation.",
        whyItMatters:
          "Placed-in-service dates are one of the key inputs that separate a useful depreciation clue from filing-grade asset support.",
        relatedFactIds: unique(
          documentIntelligence.items.flatMap((item) => item.relatedFactIds)
        ),
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  if (
    assetFacts.length > 0 &&
    !assetFacts.some((fact) => fact.label === "Prior depreciation support")
  ) {
    items.push(
      buildItem({
        id: "document-intelligence-asset-prior-depreciation",
        audience: "owner",
        category: "forms",
        priority: "next",
        title: "Structured asset gap: prior depreciation history",
        summary:
          "Tina sees depreciation support, but the paper trail still lacks explicit prior-depreciation history for cleaner Form 4562 carry logic.",
        request: "Upload or confirm prior depreciation taken on the current asset set.",
        whyItMatters:
          "Prior depreciation history is part of what lets Tina move from a depreciation estimate to a trustworthy official-form posture.",
        relatedFactIds: unique(
          documentIntelligence.items.flatMap((item) => item.relatedFactIds)
        ),
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  if (payrollCompliance.overallStatus === "blocked") {
    items.push(
      buildItem({
        id: "payroll-compliance-gap",
        audience: "owner",
        category: "forms",
        priority: "immediate",
        title: "Payroll compliance gap: filings and deposits",
        summary: payrollCompliance.summary,
        request:
          payrollCompliance.questions[0] ??
          "Upload payroll registers, 941/940 filings, W-2/W-3 support, and payroll deposit detail.",
        whyItMatters:
          "Tina should not let wage deductions or owner-compensation treatment outrun broken payroll compliance support.",
        relatedFactIds: payrollCompliance.relatedFactIds,
        relatedDocumentIds: payrollCompliance.relatedDocumentIds,
      })
    );
  }

  if (payrollCompliance.workerClassification === "mixed") {
    items.push(
      buildItem({
        id: "payroll-worker-separation",
        audience: "reviewer",
        category: "books",
        priority: "immediate",
        title: "Labor overlap: payroll and contractor flows",
        summary:
          "Tina sees both payroll and 1099 labor and needs a deliberate separation of worker categories before trusting labor deductions.",
        request:
          "Reviewer should separate W-2 payroll labor, officer compensation, and 1099 subcontractor labor before Tina treats labor costs as settled.",
        whyItMatters:
          "Worker-category overlap is one of the fastest ways for dirty books to look cleaner than they really are.",
        relatedFactIds: payrollCompliance.relatedFactIds,
        relatedDocumentIds: payrollCompliance.relatedDocumentIds,
      })
    );
  }

  if (
    payrollCompliance.ownerCompensationStatus !== "supported" &&
    payrollCompliance.ownerCompensationStatus !== "not_applicable"
  ) {
    items.push(
      buildItem({
        id: "payroll-owner-compensation",
        audience: "reviewer",
        category: "forms",
        priority:
          payrollCompliance.ownerCompensationStatus === "missing" ? "immediate" : "next",
        title: "Owner compensation still needs payroll proof",
        summary:
          "Tina sees owner-compensation pressure, but the payroll trail still does not prove whether owner pay ran through payroll or stayed in draws.",
        request:
          "Reviewer should confirm officer or owner compensation treatment before Tina trusts wage deductions or distributions.",
        whyItMatters:
          "Owner-compensation posture can change payroll exposure, reasonable-comp analysis, and distribution characterization.",
        relatedFactIds: payrollCompliance.relatedFactIds,
        relatedDocumentIds: payrollCompliance.relatedDocumentIds,
      })
    );
  }

  if (
    inventoryFacts.length > 0 &&
    inventoryFacts.some((fact) => fact.label === "Inventory count support") &&
    !inventoryFacts.some((fact) => fact.label === "COGS rollforward support")
  ) {
    items.push(
      buildItem({
        id: "document-intelligence-inventory-rollforward-gap",
        audience: "owner",
        category: "industry",
        priority: "next",
        title: "Structured inventory gap: COGS rollforward",
        summary:
          "Tina sees inventory-count support, but she still needs the matching COGS rollforward to trust inventory treatment more like a reviewer would.",
        request: "Upload the inventory rollforward or COGS support that ties beginning inventory, purchases, and ending inventory together.",
        whyItMatters:
          "A count without a rollforward still leaves inventory treatment more fragile than Tina wants for reviewer-grade work.",
        relatedFactIds: unique(
          documentIntelligence.items.flatMap((item) => item.relatedFactIds)
        ),
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  unknownPatternEngine.customProofRequests.forEach((request, index) => {
    items.push(
      buildItem({
        id: `unknown-pattern-${index + 1}`,
        audience:
          unknownPatternEngine.recommendedHandling === "blocked_until_proved"
            ? "reviewer"
            : "owner",
        category: "evidence",
        priority:
          unknownPatternEngine.recommendedHandling === "continue" ? "later" : "immediate",
        title: `Unknown-pattern proof step ${index + 1}`,
        summary: unknownPatternEngine.summary,
        request,
        whyItMatters:
          "Tina thinks this file does not cleanly fit a known pattern yet, so these proof steps matter more than the nearest canned category.",
        relatedFactIds: unique(
          unknownPatternEngine.signals.flatMap((signal) => signal.relatedFactIds)
        ),
        relatedDocumentIds: unique(
          unknownPatternEngine.signals.flatMap((signal) => signal.relatedDocumentIds)
        ),
      })
    );
  });

  const dedupedItems = items.filter(
    (item, index) => items.findIndex((candidate) => candidate.id === item.id) === index
  );
  const immediateCount = dedupedItems.filter((item) => item.priority === "immediate").length;
  const overallStatus =
    dedupedItems.length === 0
      ? "clear"
      : immediateCount > 0
        ? "blocked"
        : "action_queue";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "clear"
        ? "Tina does not currently see a missing-document action queue beyond the saved file."
        : overallStatus === "blocked"
          ? `Tina sees ${immediateCount} immediate document or proof request${
              immediateCount === 1 ? "" : "s"
            } before she should act finished.`
          : `Tina has ${dedupedItems.length} queued document or proof follow-up item${
              dedupedItems.length === 1 ? "" : "s"
            }.`,
    nextStep:
      overallStatus === "clear"
        ? "Keep the request plan quiet until new blockers or missing-proof gaps appear."
        : overallStatus === "blocked"
          ? "Start with the immediate requests first so Tina can unblock route, books, and companion-form confidence."
          : "Work through the next-tier record requests so Tina can keep raising reviewer confidence.",
    items: dedupedItems,
  };
}
