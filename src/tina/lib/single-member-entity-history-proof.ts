import type {
  TinaSingleMemberEntityHistoryIssue,
  TinaSingleMemberEntityHistorySnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaDocumentIntelligence } from "@/tina/lib/document-intelligence";
import { buildTinaEntityAmbiguityResolver } from "@/tina/lib/entity-ambiguity-resolver";
import { buildTinaEntityFilingRemediation } from "@/tina/lib/entity-filing-remediation";
import { buildTinaOwnerFlowBasisAdjudication } from "@/tina/lib/owner-flow-basis-adjudication";
import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import { buildTinaSingleMemberEntityHistorySignalProfileFromText } from "@/tina/lib/single-member-entity-history-signals";
import { buildTinaSingleOwnerCorporateRouteProof } from "@/tina/lib/single-owner-corporate-route-proof";
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

function buildDraftSignalProfile(draft: TinaWorkspaceDraft) {
  return buildTinaSingleMemberEntityHistorySignalProfileFromText(
    [
      draft.profile.notes,
      draft.profile.principalBusinessActivity,
      ...draft.documents.map((document) => documentText(draft, document)),
      ...draft.sourceFacts.map((fact) => `${fact.label} ${fact.value}`),
      ...draft.documentReadings.flatMap((reading) => reading.detailLines),
    ].join(" ")
  );
}

function buildIssue(
  issue: TinaSingleMemberEntityHistoryIssue
): TinaSingleMemberEntityHistoryIssue {
  return {
    ...issue,
    relatedDocumentIds: unique(issue.relatedDocumentIds),
    relatedFactIds: unique(issue.relatedFactIds),
  };
}

export function buildTinaSingleMemberEntityHistoryProof(
  draft: TinaWorkspaceDraft
): TinaSingleMemberEntityHistorySnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const entityAmbiguity = buildTinaEntityAmbiguityResolver(draft);
  const entityFilingRemediation = buildTinaEntityFilingRemediation(draft);
  const ownershipTimeline = buildTinaOwnershipTimeline(draft);
  const ownerFlowBasis = buildTinaOwnerFlowBasisAdjudication(draft);
  const singleOwnerCorporateRoute = buildTinaSingleOwnerCorporateRouteProof(draft);
  const signals = buildDraftSignalProfile(draft);

  const structuredOwnershipArtifacts = documentIntelligence.items.filter(
    (item) =>
      item.status !== "signal_only" &&
      item.roles.some((role) =>
        [
          "operating_agreement",
          "cap_table",
          "ownership_schedule",
          "buyout_agreement",
        ].includes(role)
      )
  );
  const openingOwnersEvent = ownershipTimeline.events.find((event) => event.id === "opening-owners");
  const communityPropertyEvent = ownershipTimeline.events.find(
    (event) => event.id === "community-property-exception"
  );
  const midYearEvent = ownershipTimeline.events.find((event) => event.id === "mid-year-change");
  const buyoutEvent = ownershipTimeline.events.find(
    (event) => event.id === "buyout-or-redemption"
  );

  const likelyScheduleCPath =
    startPath.recommendation.laneId === "schedule_c_single_member_llc" ||
    entityFilingRemediation.currentLaneId === "schedule_c_single_member_llc" ||
    entityFilingRemediation.likelyPriorLaneIds.includes("schedule_c_single_member_llc") ||
    entityAmbiguity.hypotheses.some(
      (hypothesis) => hypothesis.laneId === "schedule_c_single_member_llc"
    );
  const spouseExceptionPossible =
    draft.profile.spouseCommunityPropertyTreatment === "confirmed" ||
    draft.profile.spouseCommunityPropertyTreatment === "possible" ||
    signals.spouseSignal ||
    signals.communityPropertySignal ||
    Boolean(communityPropertyEvent);
  const singleMemberLikely =
    draft.profile.ownerCount === 1 ||
    ownershipTimeline.likelyOwnerCount === 1 ||
    draft.profile.entityType === "single_member_llc" ||
    draft.profile.entityType === "sole_prop" ||
    signals.singleMemberSignal ||
    signals.solePropSignal ||
    likelyScheduleCPath;
  const multiOwnerPressure =
    (draft.profile.ownerCount !== null && draft.profile.ownerCount > 1) ||
    (ownershipTimeline.likelyOwnerCount !== null && ownershipTimeline.likelyOwnerCount > 1) ||
    signals.multiOwnerSignal ||
    entityAmbiguity.hypotheses.some((hypothesis) => hypothesis.laneId === "1065");
  const transitionYearPressure =
    ownershipTimeline.hasMidYearChange ||
    draft.profile.ownershipChangedDuringYear ||
    draft.profile.hasOwnerBuyoutOrRedemption ||
    draft.profile.hasFormerOwnerPayments ||
    signals.ownershipChangeSignal ||
    signals.transitionTimelineSignal ||
    entityFilingRemediation.posture === "transition_year_rebuild";
  const booksNotCaughtUp =
    signals.booksNotCaughtUpSignal ||
    entityFilingRemediation.posture === "transition_year_rebuild" ||
    entityFilingRemediation.amendmentStatus === "sequencing_required" ||
    (transitionYearPressure &&
      (signals.corporateBooksSignal ||
        signals.payrollStartedSignal ||
        entityFilingRemediation.historyStatus !== "aligned"));
  const priorFilingConflict =
    entityFilingRemediation.historyStatus === "blocked" ||
    signals.priorReturnMismatchSignal ||
    documentIntelligence.continuityConflictCount > 0;
  const hasStructuredOwnershipProof =
    structuredOwnershipArtifacts.length > 0 ||
    openingOwnersEvent?.status === "known" ||
    signals.ownershipProofSignal;
  const corporateOverlay =
    singleOwnerCorporateRoute.overallStatus !== "not_applicable" &&
    singleOwnerCorporateRoute.posture !== "single_owner_default_path";
  const applicable =
    singleMemberLikely ||
    spouseExceptionPossible ||
    (likelyScheduleCPath && (multiOwnerPressure || transitionYearPressure || priorFilingConflict)) ||
    corporateOverlay;

  const ownerHistoryStatus: TinaSingleMemberEntityHistorySnapshot["ownerHistoryStatus"] =
    !applicable
      ? "not_applicable"
      : multiOwnerPressure &&
          !spouseExceptionPossible &&
          (transitionYearPressure ||
            entityAmbiguity.overallStatus === "blocked" ||
            ownerFlowBasis.transitionEconomicsStatus === "blocked")
        ? "conflicted"
        : singleMemberLikely && hasStructuredOwnershipProof && !transitionYearPressure
          ? "proved"
          : singleMemberLikely || spouseExceptionPossible
            ? "conditional"
            : "missing";
  const spouseExceptionStatus: TinaSingleMemberEntityHistorySnapshot["spouseExceptionStatus"] =
    !spouseExceptionPossible
      ? "not_applicable"
      : draft.profile.spouseCommunityPropertyTreatment === "confirmed" &&
          communityPropertyEvent?.status === "known"
        ? "proved"
        : draft.profile.spouseCommunityPropertyTreatment === "confirmed" ||
            draft.profile.spouseCommunityPropertyTreatment === "possible" ||
            signals.spouseSignal ||
            signals.communityPropertySignal
          ? "conditional"
          : "missing";
  const priorFilingAlignmentStatus: TinaSingleMemberEntityHistorySnapshot["priorFilingAlignmentStatus"] =
    !applicable
      ? "not_applicable"
      : entityFilingRemediation.historyStatus === "aligned" &&
          !signals.priorReturnMismatchSignal &&
          documentIntelligence.continuityConflictCount === 0
        ? "aligned"
        : priorFilingConflict
          ? "conflicted"
          : entityFilingRemediation.historyStatus === "review_required" ||
              entityFilingRemediation.likelyPriorLaneIds.length > 0 ||
              signals.priorReturnSignal
            ? "conditional"
            : "aligned";
  const transitionYearStatus: TinaSingleMemberEntityHistorySnapshot["transitionYearStatus"] =
    !transitionYearPressure
      ? "not_applicable"
      : booksNotCaughtUp ||
          ownerFlowBasis.transitionEconomicsStatus === "blocked" ||
          midYearEvent?.status === "needs_proof" ||
          buyoutEvent?.status === "needs_proof"
        ? "conflicted"
        : midYearEvent?.status === "known" || buyoutEvent?.status === "known"
          ? "proved"
          : "conditional";
  const booksPostureStatus: TinaSingleMemberEntityHistorySnapshot["booksPostureStatus"] =
    !applicable
      ? "not_applicable"
      : booksNotCaughtUp
        ? "not_caught_up"
        : signals.corporateBooksSignal ||
            signals.payrollStartedSignal ||
            entityFilingRemediation.amendmentStatus === "possible"
          ? "conditional"
          : multiOwnerPressure &&
              likelyScheduleCPath &&
              !spouseExceptionPossible
            ? "conflicted"
            : "aligned";

  let posture: TinaSingleMemberEntityHistorySnapshot["posture"] = "not_applicable";
  if (applicable) {
    if (booksPostureStatus === "not_caught_up") {
      posture = "books_not_caught_up";
    } else if (transitionYearStatus === "conflicted") {
      posture = "transition_year_conflicted";
    } else if (ownerHistoryStatus === "conflicted") {
      posture = "multi_owner_history_conflicted";
    } else if (corporateOverlay && (ownerHistoryStatus !== "proved" || priorFilingAlignmentStatus !== "aligned")) {
      posture = "corporate_overlay_without_history";
    } else if (
      spouseExceptionStatus !== "not_applicable" &&
      spouseExceptionStatus !== "proved"
    ) {
      posture = "spouse_exception_candidate";
    } else if (
      ownerHistoryStatus === "proved" &&
      priorFilingAlignmentStatus === "aligned" &&
      transitionYearStatus === "not_applicable" &&
      (booksPostureStatus === "aligned" || booksPostureStatus === "not_applicable")
    ) {
      posture = "single_member_path_proved";
    } else {
      posture = "single_member_path_conditional";
    }
  }

  const relatedDocumentIds = unique([
    ...startPath.relatedDocumentIds,
    ...entityFilingRemediation.relatedDocumentIds,
    ...ownershipTimeline.events.flatMap((event) => event.relatedDocumentIds),
    ...ownerFlowBasis.items.flatMap((item) => item.relatedDocumentIds),
    ...singleOwnerCorporateRoute.relatedDocumentIds,
    ...structuredOwnershipArtifacts.map((item) => item.documentId),
  ]);
  const relatedFactIds = unique([
    ...startPath.relatedFactIds,
    ...entityFilingRemediation.relatedFactIds,
    ...entityAmbiguity.signals.flatMap((signal) => signal.relatedFactIds),
    ...ownershipTimeline.events.flatMap((event) => event.relatedFactIds),
    ...ownerFlowBasis.items.flatMap((item) => item.relatedFactIds),
    ...singleOwnerCorporateRoute.relatedFactIds,
  ]);

  const issues: TinaSingleMemberEntityHistoryIssue[] = [];

  if (applicable && ownerHistoryStatus === "conflicted") {
    issues.push(
      buildIssue({
        id: "single-member-owner-history-conflict",
        title: "Single-member owner history still conflicts with the current route",
        severity: "blocking",
        summary:
          "Tina sees multi-owner or transition-year pressure strong enough that she should not trust a clean single-member path yet.",
        relatedDocumentIds,
        relatedFactIds,
      })
    );
  } else if (applicable && ownerHistoryStatus === "conditional") {
    issues.push(
      buildIssue({
        id: "single-member-owner-history-needs-proof",
        title: "Single-member owner history still needs proof",
        severity: "needs_review",
        summary:
          "Tina sees a likely single-member story, but opening or closing owner proof is still too thin to treat the route as settled.",
        relatedDocumentIds,
        relatedFactIds,
      })
    );
  }

  if (spouseExceptionStatus === "conditional" || spouseExceptionStatus === "missing") {
    issues.push(
      buildIssue({
        id: "single-member-spouse-exception-proof",
        title: "Spouse or community-property exception still needs proof",
        severity:
          likelyScheduleCPath && multiOwnerPressure ? "blocking" : "needs_review",
        summary:
          "Tina should not keep a married-couple file near the single-member path unless the narrow spouse or community-property exception is actually proved.",
        relatedDocumentIds,
        relatedFactIds,
      })
    );
  }

  if (priorFilingAlignmentStatus === "conflicted") {
    issues.push(
      buildIssue({
        id: "single-member-prior-filing-conflict",
        title: "Prior filings still conflict with the single-member history story",
        severity: "blocking",
        summary:
          "Prior returns, election trail, or continuity conflicts still disagree with the current single-member posture.",
        relatedDocumentIds,
        relatedFactIds,
      })
    );
  } else if (priorFilingAlignmentStatus === "conditional") {
    issues.push(
      buildIssue({
        id: "single-member-prior-filing-review",
        title: "Prior filing alignment still needs review",
        severity: "needs_review",
        summary:
          "Tina still needs prior-return and entity-history proof before she should treat the single-member route as durable.",
        relatedDocumentIds,
        relatedFactIds,
      })
    );
  }

  if (transitionYearStatus === "conflicted") {
    issues.push(
      buildIssue({
        id: "single-member-transition-year-conflict",
        title: "Transition-year ownership proof still changes the route story",
        severity: "blocking",
        summary:
          "Tina sees a midyear ownership change, buyout, or stale transition that still controls whether the single-member story holds.",
        relatedDocumentIds,
        relatedFactIds,
      })
    );
  } else if (transitionYearStatus === "conditional") {
    issues.push(
      buildIssue({
        id: "single-member-transition-year-review",
        title: "Transition-year ownership story still needs review",
        severity: "needs_review",
        summary:
          "Tina sees ownership-change pressure, but the legal and economics timeline is not yet strong enough to travel as settled truth.",
        relatedDocumentIds,
        relatedFactIds,
      })
    );
  }

  if (booksPostureStatus === "not_caught_up") {
    issues.push(
      buildIssue({
        id: "single-member-books-not-caught-up",
        title: "Books still reflect an older entity story",
        severity: "blocking",
        summary:
          "The current books, payroll labels, or owner-flow posture still look like the old business, so Tina should fail closed on the single-member route.",
        relatedDocumentIds,
        relatedFactIds,
      })
    );
  } else if (booksPostureStatus === "conditional" || booksPostureStatus === "conflicted") {
    issues.push(
      buildIssue({
        id: "single-member-books-posture-review",
        title: "Books posture still needs entity-history cleanup",
        severity: "needs_review",
        summary:
          "The books, payroll timing, or owner-equity labels still need cleanup before Tina should treat the single-member story as coherent.",
        relatedDocumentIds,
        relatedFactIds,
      })
    );
  }

  const blockedIssueCount = issues.filter((issue) => issue.severity === "blocking").length;
  const reviewIssueCount = issues.filter((issue) => issue.severity === "needs_review").length;

  const questions: string[] = [];
  if (ownerHistoryStatus !== "proved" && ownerHistoryStatus !== "not_applicable") {
    questions.push(
      "How many owners existed at opening and closing, and did that change during the year?"
    );
  }
  if (spouseExceptionStatus !== "not_applicable" && spouseExceptionStatus !== "proved") {
    questions.push(
      "Are the owners spouses, what state controls the property-law posture, and does the narrow community-property exception actually apply?"
    );
  }
  if (priorFilingAlignmentStatus !== "aligned" && priorFilingAlignmentStatus !== "not_applicable") {
    questions.push(
      "How were prior years actually filed, and when did any Schedule C, 1065, 1120-S, or 1120 path start?"
    );
  }
  if (transitionYearStatus !== "not_applicable") {
    questions.push(
      "What changed during the year, on what date, and was it an owner sale, redemption, or legal conversion?"
    );
  }
  if (booksPostureStatus !== "aligned" && booksPostureStatus !== "not_applicable") {
    questions.push(
      "When did the books, payroll, and owner-equity labels actually catch up to the real entity posture?"
    );
  }

  const cleanupStepsFirst: string[] = [];
  if (ownerHistoryStatus !== "proved" && ownerHistoryStatus !== "not_applicable") {
    cleanupStepsFirst.push(
      "Rebuild the opening and closing owner count before Tina trusts a single-member route."
    );
  }
  if (spouseExceptionStatus !== "not_applicable" && spouseExceptionStatus !== "proved") {
    cleanupStepsFirst.push(
      "Prove the spouse or community-property exception before keeping a married-couple file near the single-member path."
    );
  }
  if (priorFilingAlignmentStatus !== "aligned" && priorFilingAlignmentStatus !== "not_applicable") {
    cleanupStepsFirst.push(
      "Tie prior filed returns, election notices, and current-year route claims into one entity-history timeline before prep."
    );
  }
  if (transitionYearStatus !== "not_applicable") {
    cleanupStepsFirst.push(
      "Build the transition-year ownership and economics timeline before final allocations or entity-route claims."
    );
  }
  if (booksPostureStatus !== "aligned" && booksPostureStatus !== "not_applicable") {
    cleanupStepsFirst.push(
      "Restate books, payroll labels, and owner-equity accounts to the actual entity posture before return prep."
    );
  }

  const overallStatus: TinaSingleMemberEntityHistorySnapshot["overallStatus"] =
    !applicable
      ? "not_applicable"
      : blockedIssueCount > 0
        ? "blocked"
        : reviewIssueCount > 0 || posture === "single_member_path_conditional"
          ? "review_required"
          : "clear";

  const summary =
    overallStatus === "not_applicable"
      ? "Tina does not currently see a single-member entity-history question that should control the file."
      : overallStatus === "clear"
        ? "Tina sees a coherent single-member entity-history story with prior filings and books aligned closely enough to carry the route."
        : overallStatus === "review_required"
          ? posture === "spouse_exception_candidate"
            ? "Tina sees a possible single-member or spouse-exception path, but the owner-history proof still needs reviewer control."
            : "Tina sees a plausible single-member history, but prior filings, ownership proof, or books posture still need review."
          : posture === "books_not_caught_up"
            ? "Tina should fail closed because the books still reflect an older entity story."
            : posture === "transition_year_conflicted"
              ? "Tina should fail closed because transition-year ownership proof still changes the route story."
              : "Tina should fail closed because the file still conflicts with a clean single-member history.";
  const nextStep =
    overallStatus === "clear"
      ? "Carry this single-member history truth into classification, confidence, and reviewer artifacts without widening the claim."
      : overallStatus === "not_applicable"
        ? "Keep single-member history logic quiet unless route or ownership signals make it relevant."
        : "Resolve owner history, prior filings, spouse-exception proof, and books catch-up before Tina trusts the single-member route.";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    posture,
    ownerHistoryStatus,
    spouseExceptionStatus,
    priorFilingAlignmentStatus,
    transitionYearStatus,
    booksPostureStatus,
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
