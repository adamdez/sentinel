import {
  buildTinaDocumentIntelligence,
  listTinaDocumentIntelligenceFactsByKind,
} from "@/tina/lib/document-intelligence";
import { buildTinaEntityAmbiguityResolver } from "@/tina/lib/entity-ambiguity-resolver";
import { buildTinaEntityContinuitySignalProfileFromText } from "@/tina/lib/entity-continuity-signals";
import { buildTinaEntityFilingRemediationSignalProfileFromText } from "@/tina/lib/entity-filing-remediation-signals";
import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import { buildTinaStartPathAssessment, describeTinaLane } from "@/tina/lib/start-path";
import type {
  TinaEntityFilingRemediationIssue,
  TinaEntityFilingRemediationReturnAction,
  TinaEntityFilingRemediationSignal,
  TinaEntityFilingRemediationSnapshot,
  TinaFilingLaneId,
  TinaWorkspaceDraft,
} from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniqueLanes(values: TinaFilingLaneId[]): TinaFilingLaneId[] {
  return Array.from(new Set(values.filter((value) => value !== "unknown")));
}

function buildSignal(
  signal: TinaEntityFilingRemediationSignal
): TinaEntityFilingRemediationSignal {
  return {
    ...signal,
    relatedLaneIds: uniqueLanes(signal.relatedLaneIds),
    relatedFactIds: unique(signal.relatedFactIds),
    relatedDocumentIds: unique(signal.relatedDocumentIds),
  };
}

function buildIssue(
  issue: TinaEntityFilingRemediationIssue
): TinaEntityFilingRemediationIssue {
  return {
    ...issue,
    relatedFactIds: unique(issue.relatedFactIds),
    relatedDocumentIds: unique(issue.relatedDocumentIds),
  };
}

function buildAction(
  action: TinaEntityFilingRemediationReturnAction
): TinaEntityFilingRemediationReturnAction {
  return {
    ...action,
    taxYears: unique(action.taxYears),
    relatedSignalIds: unique(action.relatedSignalIds),
  };
}

function returnFamilyForLane(laneId: TinaFilingLaneId | null): string {
  switch (laneId) {
    case "schedule_c_single_member_llc":
      return "Form 1040 Schedule C";
    case "1065":
      return "Form 1065 and Schedule K-1 package";
    case "1120_s":
      return "Form 1120-S";
    case "1120":
      return "Form 1120";
    default:
      return "Entity return family";
  }
}

function buildDraftEvidenceText(draft: TinaWorkspaceDraft): string {
  return [
    ...Object.values(draft.profile).map((value) =>
      value === null || value === undefined ? "" : String(value)
    ),
    ...draft.sourceFacts.flatMap((fact) => [fact.label, fact.value]),
    ...draft.documents.flatMap((document) => [
      document.name,
      document.requestLabel ?? "",
      document.requestId ?? "",
    ]),
    ...draft.documentReadings.flatMap((reading) => [
      reading.summary,
      reading.nextStep,
      ...reading.detailLines,
      ...reading.facts.flatMap((fact) => [fact.label, fact.value]),
    ]),
  ]
    .filter(Boolean)
    .join("\n");
}

function priorYearLabel(taxYear: string): string {
  const parsed = Number.parseInt(taxYear, 10);
  return Number.isFinite(parsed) ? String(parsed - 1) : "prior_years";
}

export function buildTinaEntityFilingRemediation(
  draft: TinaWorkspaceDraft
): TinaEntityFilingRemediationSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const entityAmbiguity = buildTinaEntityAmbiguityResolver(draft);
  const ownershipTimeline = buildTinaOwnershipTimeline(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const aggregatedText = buildDraftEvidenceText(draft);
  const continuitySignals = buildTinaEntityContinuitySignalProfileFromText(aggregatedText);
  const remediationSignals =
    buildTinaEntityFilingRemediationSignalProfileFromText(aggregatedText);
  const priorFilingSignals = listTinaDocumentIntelligenceFactsByKind({
    snapshot: documentIntelligence,
    kind: "prior_filing_signal",
  });
  const electionSignals = listTinaDocumentIntelligenceFactsByKind({
    snapshot: documentIntelligence,
    kind: "election_signal",
  });
  const stateSignals = listTinaDocumentIntelligenceFactsByKind({
    snapshot: documentIntelligence,
    kind: "state_registration_signal",
  });
  const currentLaneId = startPath.recommendation.laneId;
  const priorFilingDocumentIds = documentIntelligence.items
    .filter((item) =>
      item.extractedFacts.some((fact) => fact.kind === "prior_filing_signal")
    )
    .map((item) => item.documentId);
  const electionDocumentIds = documentIntelligence.items
    .filter((item) => item.extractedFacts.some((fact) => fact.kind === "election_signal"))
    .map((item) => item.documentId);
  const stateDocumentIds = documentIntelligence.items
    .filter((item) =>
      item.extractedFacts.some((fact) => fact.kind === "state_registration_signal")
    )
    .map((item) => item.documentId);
  const likelyPriorLaneIds = uniqueLanes([
    ...priorFilingSignals.flatMap((fact) => (fact.laneId ? [fact.laneId] : [])),
    ...continuitySignals.priorFilingLanes,
    ...remediationSignals.priorReturnLanes,
  ]);
  const alternateLaneIds = uniqueLanes(
    entityAmbiguity.hypotheses
      .filter((hypothesis) => hypothesis.status !== "leading")
      .map((hypothesis) => hypothesis.laneId)
  );
  const ownershipProofEvents = ownershipTimeline.events.filter(
    (event) => event.status === "needs_proof"
  );
  const needsElectionProof = startPath.proofRequirements.some(
    (requirement) => requirement.id === "entity-election" && requirement.status === "needed"
  );
  const hasCorporateElectionPressure =
    currentLaneId === "1120_s" ||
    currentLaneId === "1120" ||
    remediationSignals.electionLanes.length > 0 ||
    draft.profile.taxElection === "s_corp" ||
    draft.profile.taxElection === "c_corp";
  const priorReturnDrift =
    likelyPriorLaneIds.length > 0 &&
    likelyPriorLaneIds.some((laneId) => laneId !== currentLaneId);
  const missingReturnBacklog =
    remediationSignals.hasMissingReturnSignal ||
    remediationSignals.likelyMissingLanes.length > 0 ||
    remediationSignals.hasBacklogYearSignal;
  const priorYearBooksDrift =
    remediationSignals.hasBeginningBalanceDriftSignal ||
    remediationSignals.hasAmendedReturnSignal ||
    remediationSignals.hasAmendmentSequencingSignal;
  const lateElectionRelief =
    (remediationSignals.hasElectionReliefSignal || continuitySignals.hasLateElectionSignal) &&
    (remediationSignals.hasElectionUnprovedSignal ||
      !remediationSignals.hasElectionAcceptanceSignal);
  const electionTrailGap =
    needsElectionProof ||
    remediationSignals.hasElectionReliefSignal ||
    remediationSignals.hasElectionUnprovedSignal ||
    (remediationSignals.hasElectionSignal &&
      electionSignals.length === 0 &&
      (draft.profile.taxElection === "s_corp" || draft.profile.taxElection === "c_corp"));
  const amendmentSequencingPressure =
    priorYearBooksDrift ||
    (priorReturnDrift && remediationSignals.hasAmendmentSequencingSignal) ||
    (missingReturnBacklog && remediationSignals.hasAmendedReturnSignal);
  const transitionYearRebuild =
    remediationSignals.hasTransitionTimelineSignal ||
    continuitySignals.hasEntityChangeSignal ||
    continuitySignals.hasOwnershipChangeSignal;
  const stateRegistrationDrift =
    remediationSignals.hasStateRegistrationDriftSignal ||
    continuitySignals.hasMultiStateSignal ||
    stateSignals.length > 0;
  const ownershipTimelineGap =
    ownershipProofEvents.length > 0 ||
    remediationSignals.hasOwnerCountDuringYearSignal ||
    (currentLaneId === "1065" &&
      (draft.profile.ownerCount === null || draft.profile.ownerCount > 1) &&
      ownershipTimeline.likelyOwnerCount !== null &&
      ownershipProofEvents.length > 0);

  const routeConflictDocumentIds = unique([
    ...startPath.relatedDocumentIds,
    ...priorFilingDocumentIds,
    ...documentIntelligence.items.map((item) => item.documentId),
  ]);
  const routeConflictFactIds = unique([
    ...startPath.relatedFactIds,
    ...documentIntelligence.items.flatMap((item) => item.relatedFactIds),
  ]);

  const signals: TinaEntityFilingRemediationSignal[] = [];

  if (priorReturnDrift || documentIntelligence.identityConflictCount > 0) {
    signals.push(
      buildSignal({
        id: "current-vs-prior-route-drift",
        title: "Current lane still conflicts with prior-return history",
        category: "current_vs_prior_route_drift",
        severity:
          entityAmbiguity.overallStatus === "blocked" || startPath.route === "blocked"
            ? "blocking"
            : "review",
        summary:
          likelyPriorLaneIds.length > 0
            ? `Prior-return signals still point to ${likelyPriorLaneIds
                .map((laneId) => describeTinaLane(laneId))
                .join(", ")}, while the current route is ${describeTinaLane(currentLaneId)}.`
            : "Structured papers still disagree about which entity or return family owns the current year.",
        relatedLaneIds: [currentLaneId, ...likelyPriorLaneIds],
        relatedFactIds: routeConflictFactIds,
        relatedDocumentIds: routeConflictDocumentIds,
      })
    );
  }

  if (ownershipTimelineGap) {
    signals.push(
      buildSignal({
        id: "ownership-timeline-gap",
        title: "Ownership timeline still needs proof before entity filing is trustworthy",
        category: "ownership_timeline_gap",
        severity:
          currentLaneId === "1065" && ownershipProofEvents.length > 0 ? "blocking" : "review",
        summary:
          ownershipProofEvents.length > 0
            ? `Ownership timeline still has ${ownershipProofEvents.length} proof gap${
                ownershipProofEvents.length === 1 ? "" : "s"
              } that can change who should file and how allocations should be built.`
            : "Entity filing still depends on a cleaner owner-count and owner-timing story.",
        relatedLaneIds: [currentLaneId, ...alternateLaneIds],
        relatedFactIds: ownershipProofEvents.flatMap((event) => event.relatedFactIds),
        relatedDocumentIds: ownershipProofEvents.flatMap((event) => event.relatedDocumentIds),
      })
    );
  }

  if (electionTrailGap) {
    signals.push(
      buildSignal({
        id: "election-trail-gap",
        title: "Election trail still changes the return family",
        category: "election_trail_gap",
        severity:
          remediationSignals.hasElectionReliefSignal ||
          remediationSignals.hasElectionUnprovedSignal ||
          needsElectionProof
            ? "blocking"
            : "review",
        summary:
          remediationSignals.hasElectionReliefSignal || remediationSignals.hasElectionUnprovedSignal
            ? "Election paperwork, acceptance, or relief posture is still too weak to trust the corporate route."
            : "Corporate election clues exist, but Tina still needs the actual election trail before treating the entity path as settled.",
        relatedLaneIds: [currentLaneId, ...remediationSignals.electionLanes, ...alternateLaneIds],
        relatedFactIds: startPath.proofRequirements
          .filter((requirement) => requirement.id === "entity-election")
          .flatMap((requirement) => requirement.relatedFactIds),
        relatedDocumentIds: unique([
          ...startPath.proofRequirements
            .filter((requirement) => requirement.id === "entity-election")
            .flatMap((requirement) => requirement.relatedDocumentIds),
          ...electionDocumentIds,
        ]),
      })
    );
  }

  if (missingReturnBacklog) {
    signals.push(
      buildSignal({
        id: "missing-return-backlog",
        title: "Likely missing entity-return backlog",
        category: "missing_return_backlog",
        severity: "blocking",
        summary:
          remediationSignals.likelyMissingLanes.length > 0
            ? `Tina sees likely missing filing work in ${remediationSignals.likelyMissingLanes
                .map((laneId) => describeTinaLane(laneId))
                .join(", ")}.`
            : "The file reads like prior entity-return work may have been omitted, not just undocumented.",
        relatedLaneIds: [
          currentLaneId,
          ...remediationSignals.likelyMissingLanes,
          ...likelyPriorLaneIds,
          ...alternateLaneIds,
        ],
        relatedFactIds: routeConflictFactIds,
        relatedDocumentIds: routeConflictDocumentIds,
      })
    );
  }

  if (priorYearBooksDrift) {
    signals.push(
      buildSignal({
        id: "prior-year-books-drift",
        title: "Prior-year filed posture and current books still drift apart",
        category: "prior_year_books_drift",
        severity: amendmentSequencingPressure ? "blocking" : "review",
        summary:
          "Beginning balances, manual rollforwards, or current books still do not tie cleanly to filed prior-year returns, so Tina should not blur book cleanup with tax-return remediation.",
        relatedLaneIds: [currentLaneId, ...likelyPriorLaneIds, ...alternateLaneIds],
        relatedFactIds: routeConflictFactIds,
        relatedDocumentIds: routeConflictDocumentIds,
      })
    );
  }

  if (transitionYearRebuild) {
    signals.push(
      buildSignal({
        id: "transition-year-rebuild",
        title: "Transition-year continuity still needs rebuilding",
        category: "transition_year",
        severity:
          startPath.route === "blocked" || entityAmbiguity.overallStatus === "blocked"
            ? "blocking"
            : "review",
        summary:
          "Entity conversion or ownership-change timing still needs to be rebuilt before Tina should trust current-year filing continuity.",
        relatedLaneIds: [currentLaneId, ...likelyPriorLaneIds, ...alternateLaneIds],
        relatedFactIds: unique([
          ...routeConflictFactIds,
          ...ownershipProofEvents.flatMap((event) => event.relatedFactIds),
        ]),
        relatedDocumentIds: unique([
          ...routeConflictDocumentIds,
          ...ownershipProofEvents.flatMap((event) => event.relatedDocumentIds),
        ]),
      })
    );
  }

  if (lateElectionRelief) {
    signals.push(
      buildSignal({
        id: "late-election-relief",
        title: "Late-election relief may control the corporate route",
        category: "late_election_relief",
        severity: hasCorporateElectionPressure ? "blocking" : "review",
        summary:
          "Tina sees election timing pressure that may only work if late-election relief applies, so payroll and corporate-route behavior should stay conditional.",
        relatedLaneIds: [currentLaneId, ...remediationSignals.electionLanes, ...alternateLaneIds],
        relatedFactIds: routeConflictFactIds,
        relatedDocumentIds: unique([...routeConflictDocumentIds, ...electionDocumentIds]),
      })
    );
  }

  if (amendmentSequencingPressure) {
    signals.push(
      buildSignal({
        id: "amended-return-sequencing",
        title: "Amended-return sequencing still matters before current-year confidence can rise",
        category: "amended_return_sequencing",
        severity: priorYearBooksDrift || missingReturnBacklog ? "blocking" : "review",
        summary:
          "Tina still needs to separate bookkeeping cleanup, amended-return pressure, and current-year prep order instead of treating the file like one isolated return.",
        relatedLaneIds: [currentLaneId, ...likelyPriorLaneIds, ...alternateLaneIds],
        relatedFactIds: routeConflictFactIds,
        relatedDocumentIds: routeConflictDocumentIds,
      })
    );
  }

  if (stateRegistrationDrift) {
    signals.push(
      buildSignal({
        id: "state-registration-drift",
        title: "State registration posture can still change cleanup order",
        category: "state_registration_drift",
        severity: "review",
        summary:
          "Formation, qualification, or state-account posture is still part of the entity-filing cleanup story.",
        relatedLaneIds: [currentLaneId, ...alternateLaneIds],
        relatedFactIds: documentIntelligence.items.flatMap((item) => item.relatedFactIds),
        relatedDocumentIds: stateDocumentIds,
      })
    );
  }

  const issues: TinaEntityFilingRemediationIssue[] = signals.map((signal) =>
    buildIssue({
      id: `${signal.id}-issue`,
      title: signal.title,
      summary: signal.summary,
      severity: signal.severity === "blocking" ? "blocking" : "needs_attention",
      relatedFactIds: signal.relatedFactIds,
      relatedDocumentIds: signal.relatedDocumentIds,
    })
  );

  const blockedIssueCount = issues.filter((issue) => issue.severity === "blocking").length;
  const reviewIssueCount = issues.filter((issue) => issue.severity === "needs_attention").length;
  const historyStatus: TinaEntityFilingRemediationSnapshot["historyStatus"] =
    missingReturnBacklog || priorYearBooksDrift
      ? "blocked"
      : priorReturnDrift || transitionYearRebuild
        ? "review_required"
        : "aligned";
  const electionStatus: TinaEntityFilingRemediationSnapshot["electionStatus"] =
    !hasCorporateElectionPressure && !remediationSignals.hasElectionSignal
      ? "not_applicable"
      : remediationSignals.hasElectionAcceptanceSignal &&
          !remediationSignals.hasElectionRejectionSignal &&
          !lateElectionRelief &&
          !remediationSignals.hasElectionUnprovedSignal
        ? "accepted_or_timely"
        : lateElectionRelief
          ? "relief_candidate"
          : "unproved";
  const amendmentStatus: TinaEntityFilingRemediationSnapshot["amendmentStatus"] =
    amendmentSequencingPressure
      ? "sequencing_required"
      : (priorReturnDrift && !missingReturnBacklog) || transitionYearRebuild
        ? "possible"
        : "not_applicable";
  const overallStatus: TinaEntityFilingRemediationSnapshot["overallStatus"] =
    blockedIssueCount > 0 || entityAmbiguity.overallStatus === "blocked"
      ? "blocked"
      : reviewIssueCount > 0 || entityAmbiguity.overallStatus === "competing_routes"
        ? "review_required"
        : "aligned";
  const posture: TinaEntityFilingRemediationSnapshot["posture"] = missingReturnBacklog
    ? "missing_return_backlog"
    : lateElectionRelief
      ? "late_election_relief"
      : amendmentSequencingPressure
        ? "amended_return_pressure"
        : transitionYearRebuild
          ? "transition_year_rebuild"
          : electionTrailGap
            ? "election_unproved"
            : priorReturnDrift
              ? "prior_return_drift"
              : entityAmbiguity.overallStatus === "competing_routes"
                ? "competing_entity_paths"
                : "aligned_current_path";

  const questions = unique([
    ...(ownershipTimelineGap
      ? [
          "How many owners existed during the year and when?",
          "What ownership percentages or profit splits actually applied during the year?",
        ]
      : []),
    ...(electionTrailGap
      ? [
          "Was Form 2553 or Form 8832 actually filed, and is there IRS acceptance or relief correspondence?",
        ]
      : []),
    ...(lateElectionRelief || hasCorporateElectionPressure
      ? [
          "What was the initial entity type before the election posture was claimed?",
          "Were any extension, rejection, or late-election relief filings submitted?",
        ]
      : []),
    ...(priorReturnDrift || missingReturnBacklog
      ? [
          "What return family, if any, was actually filed for prior years?",
          "Which prior preparer or filing package created the current route mismatch?",
        ]
      : []),
    ...(priorYearBooksDrift || amendmentSequencingPressure
      ? [
          "Do beginning balances tie to filed prior-year returns or to manual rollforwards?",
          "Is this a bookkeeping-only correction, an amended-return issue, or both?",
        ]
      : []),
    ...(transitionYearRebuild
      ? [
          "What are the exact legal conversion, election, or owner-change dates?",
          "Did prior preparers change the return family when the entity changed?",
        ]
      : []),
    ...(stateRegistrationDrift
      ? [
          "Which state was the entity formed in, qualified in, and actually operating in during the year?",
        ]
      : []),
    ...entityAmbiguity.priorityQuestions,
    ...documentIntelligence.continuityQuestions,
  ]).slice(0, 8);

  const remediationStepsFirst = unique([
    ...(missingReturnBacklog
      ? [
          "Decide what should have been filed for each year before treating the current return as standalone prep.",
        ]
      : []),
    ...(transitionYearRebuild
      ? [
          "Build the entity continuity timeline first so Tina does not mix old-entity and current-entity posture.",
        ]
      : []),
    ...(electionTrailGap
      ? [
          "Verify the election trail or late-election relief path before trusting the corporate filing route.",
        ]
      : []),
    ...(lateElectionRelief
      ? [
          "Build the late-election relief chronology before Tina trusts payroll, distributions, or the S-corp path.",
        ]
      : []),
    ...(priorReturnDrift
      ? [
          "Align prior-return history, current books, and the current-year route before continuing prep.",
        ]
      : []),
    ...(priorYearBooksDrift
      ? [
          "Tie opening balances and current books back to filed prior-year returns before trusting current-year numbers.",
        ]
      : []),
    ...(amendmentSequencingPressure
      ? [
          "Decide whether remediation is books-only, amended-return, or both before current-year prep outruns prior-year errors.",
        ]
      : []),
    ...(ownershipTimelineGap
      ? [
          "Establish the real ownership timeline and percentages before finalizing an entity return.",
        ]
      : []),
    ...((currentLaneId === "1065" || alternateLaneIds.includes("1065")) &&
    (missingReturnBacklog || ownershipTimelineGap)
      ? [
          "Reconstruct K-1 economics, capital changes, and partner timing before treating the 1065 as current-year only.",
        ]
      : []),
    ...(stateRegistrationDrift
      ? [
          "Separate federal entity filing cleanup from state registration, qualification, and annual-report cleanup.",
        ]
      : []),
  ]).slice(0, 6);

  const actions: TinaEntityFilingRemediationReturnAction[] = [
    buildAction({
      id: "current-year-return-path",
      title: `${draft.profile.taxYear || "Current-year"} ${returnFamilyForLane(currentLaneId)}`,
      kind: "current_year_return",
      status: overallStatus === "aligned" ? "aligned" : "reviewer_controlled",
      summary:
        overallStatus === "aligned"
          ? `Current-year filing continuity is coherent on ${returnFamilyForLane(currentLaneId)}.`
          : amendmentStatus === "sequencing_required"
            ? `Current-year filing still points toward ${returnFamilyForLane(currentLaneId)}, but Tina should keep it under reviewer control until prior-year drift, amended-return pressure, and opening-balance cleanup are sequenced.`
            : `Current-year filing still points toward ${returnFamilyForLane(currentLaneId)}, but Tina should keep it under reviewer control until continuity gaps close.`,
      whyNow:
        overallStatus === "aligned"
          ? "Tina can carry this route forward consistently."
          : amendmentStatus === "sequencing_required"
            ? "Current-year prep should not outrun unresolved prior-year remediation and amendment-order debt."
            : "Current-year prep should not outrun unresolved entity-filing continuity debt.",
      returnFamily: returnFamilyForLane(currentLaneId),
      laneId: currentLaneId,
      taxYears: [draft.profile.taxYear || "current_year"],
      relatedSignalIds: signals
        .filter((signal) => signal.relatedLaneIds.includes(currentLaneId))
        .map((signal) => signal.id),
    }),
    ...uniqueLanes([
      ...remediationSignals.likelyMissingLanes,
      ...(missingReturnBacklog && currentLaneId !== "unknown" ? [currentLaneId] : []),
    ])
      .slice(0, 2)
      .map((laneId) =>
        buildAction({
          id: `missing-return-${laneId}`,
          title: `${returnFamilyForLane(laneId)} backlog`,
          kind: "prior_year_remediation",
          status: "likely_missing",
          summary: `Tina sees a likely missing or stale ${returnFamilyForLane(laneId)} story that should be triaged before she treats the file as current-year only.`,
          whyNow:
            "Entity-return backlog changes which numbers and owner schedules are safe to trust downstream.",
          returnFamily: returnFamilyForLane(laneId),
          laneId,
          taxYears: [priorYearLabel(draft.profile.taxYear), "prior_years"],
          relatedSignalIds: ["missing-return-backlog"],
        })
      ),
    ...(priorReturnDrift && likelyPriorLaneIds.length > 0
      ? [
          buildAction({
            id: "prior-return-route-reconciliation",
            title: "Prior-return route reconciliation",
            kind: "prior_year_remediation",
            status: overallStatus === "blocked" ? "likely_missing" : "reviewer_controlled",
            summary: `Prior-return history still points to ${likelyPriorLaneIds
              .map((laneId) => describeTinaLane(laneId))
              .join(", ")}, so Tina should reconcile the old filing family before acting as though the current route stands alone.`,
            whyNow:
              "Prior-return drift can make a clean current-year route attach to the wrong entity history.",
            returnFamily: "Prior-year entity return family",
            laneId: likelyPriorLaneIds[0] ?? null,
            taxYears: [priorYearLabel(draft.profile.taxYear), "prior_years"],
            relatedSignalIds: ["current-vs-prior-route-drift"],
          }),
        ]
      : []),
    ...(electionTrailGap
      ? [
          buildAction({
            id: "election-relief-or-proof",
            title: "Election proof or late-election relief",
            kind: "election_relief",
            status:
              remediationSignals.hasElectionReliefSignal || needsElectionProof
                ? "reviewer_controlled"
                : "conditional",
            summary:
              "The corporate filing family should stay conditional until Tina sees the actual election paperwork, IRS acceptance, or a relief path.",
            whyNow:
              "Election proof determines whether Tina is looking at the right entity return at all.",
            returnFamily:
              remediationSignals.electionLanes.length > 0
                ? remediationSignals.electionLanes.map((laneId) => returnFamilyForLane(laneId)).join(" / ")
                : "Corporate election path",
            laneId: remediationSignals.electionLanes[0] ?? null,
            taxYears: [draft.profile.taxYear || "current_year", priorYearLabel(draft.profile.taxYear)],
            relatedSignalIds: ["election-trail-gap"],
          }),
        ]
      : []),
    ...(priorYearBooksDrift
      ? [
          buildAction({
            id: "prior-year-books-drift-rebuild",
            title: "Prior-year books versus filed-return rebuild",
            kind: "prior_year_remediation",
            status: "reviewer_controlled",
            summary:
              "Opening balances and current books should be tied back to the filed prior-year returns before Tina trusts the current-year tax posture.",
            whyNow:
              "A file can have the right route and still be wrong because the prior-year tax truth never made it into the books.",
            returnFamily: "Prior-year return and opening-balance reconciliation",
            laneId: likelyPriorLaneIds[0] ?? currentLaneId,
            taxYears: [priorYearLabel(draft.profile.taxYear), draft.profile.taxYear || "current_year"],
            relatedSignalIds: ["prior-year-books-drift"],
          }),
        ]
      : []),
    ...(amendmentSequencingPressure
      ? [
          buildAction({
            id: "amended-return-sequencing",
            title: "Amended-return and current-year sequencing",
            kind: "amended_return",
            status: "conditional",
            summary:
              "Tina still needs reviewer-controlled sequencing on whether the mismatch belongs in amended prior years, current-year book cleanup, or both.",
            whyNow:
              "The wrong remediation order can poison current-year confidence even when Tina guessed the likely route correctly.",
            returnFamily: "Amended prior-year remediation sequencing",
            laneId: likelyPriorLaneIds[0] ?? null,
            taxYears: [priorYearLabel(draft.profile.taxYear), "prior_years", draft.profile.taxYear || "current_year"],
            relatedSignalIds: ["amended-return-sequencing"],
          }),
        ]
      : []),
    ...(stateRegistrationDrift
      ? [
          buildAction({
            id: "state-registration-alignment",
            title: "State registration and entity filing alignment",
            kind: "state_alignment",
            status: "conditional",
            summary:
              "State qualification, annual-report, and account posture still need to be aligned with the federal entity story.",
            whyNow:
              "State drift can change the cleanup order and which filing family Tina should trust operationally.",
            returnFamily: "State registration and entity alignment",
            laneId: null,
            taxYears: [draft.profile.taxYear || "current_year"],
            relatedSignalIds: ["state-registration-drift"],
          }),
        ]
      : []),
  ];

  const summary =
    overallStatus === "aligned"
      ? `Tina sees an aligned entity-filing story on ${returnFamilyForLane(currentLaneId)}.`
      : posture === "missing_return_backlog"
        ? "Tina sees a likely missing entity-return backlog that should be triaged before current-year prep is trusted."
        : posture === "late_election_relief"
          ? "Tina sees a corporate route that may only stand if late-election relief or acceptance can be proved."
          : posture === "amended_return_pressure"
            ? "Tina sees prior-year drift that still needs opening-balance cleanup and amended-return sequencing before current-year confidence can rise."
        : posture === "transition_year_rebuild"
          ? "Tina sees a transition-year entity story that still needs continuity rebuilding before the filing route can be trusted."
          : posture === "election_unproved"
            ? "Tina sees a route that still depends on election proof or relief before the entity filing family can be trusted."
            : posture === "prior_return_drift"
              ? "Tina sees prior-return drift between historical filing evidence and the current-year route."
              : "Tina still sees competing entity-filing paths that should stay visible until the continuity questions are resolved.";
  const nextStep =
    overallStatus === "aligned"
      ? "Carry the aligned filing story through the rest of Tina's packet, confidence, and form work."
      : blockedIssueCount > 0
        ? remediationStepsFirst[0] ??
          "Resolve the blocking entity-filing continuity issues before Tina treats current-year prep as settled."
        : questions[0] ??
          "Keep the leading and alternate entity-filing paths visible while the remaining continuity questions are answered.";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    posture,
    historyStatus,
    electionStatus,
    amendmentStatus,
    currentLaneId,
    likelyPriorLaneIds,
    alternateLaneIds,
    summary,
    nextStep,
    priorityQuestions: questions,
    remediationStepsFirst,
    blockedIssueCount,
    reviewIssueCount,
    signals,
    issues,
    actions,
    relatedFactIds: unique(signals.flatMap((signal) => signal.relatedFactIds)),
    relatedDocumentIds: unique(signals.flatMap((signal) => signal.relatedDocumentIds)),
  };
}
