import type {
  TinaUnknownPatternEngineSnapshot,
  TinaUnknownPatternHypothesis,
  TinaUnknownPatternSignal,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { rankDiagnosticHypothesis } from "@/tina/lib/diagnostic-hypothesis-ranking";
import {
  buildTinaDocumentIntelligence,
  listTinaDocumentIntelligenceDistinctValues,
  listTinaDocumentIntelligenceFactsByKind,
  listTinaDocumentIntelligenceExtractedFacts,
} from "@/tina/lib/document-intelligence";
import { buildTinaEntityAmbiguityResolver } from "@/tina/lib/entity-ambiguity-resolver";
import { buildTinaEntityEconomicsReadiness } from "@/tina/lib/entity-economics-readiness";
import { buildTinaEntityFilingRemediation } from "@/tina/lib/entity-filing-remediation";
import { buildTinaFederalReturnClassification } from "@/tina/lib/federal-return-classification";
import { buildTinaOwnershipCapitalEvents } from "@/tina/lib/ownership-capital-events";
import { buildTinaStartPathAssessment, describeTinaLane } from "@/tina/lib/start-path";
import { buildTinaTreatmentJudgment } from "@/tina/lib/treatment-judgment";
import type { TinaFilingLaneId, TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function uniqueLanes(values: TinaFilingLaneId[]): TinaFilingLaneId[] {
  return Array.from(new Set(values.filter((value) => value !== "unknown")));
}

function buildSignal(signal: TinaUnknownPatternSignal): TinaUnknownPatternSignal {
  return {
    ...signal,
    relatedLaneIds: uniqueLanes(signal.relatedLaneIds),
    relatedFactIds: unique(signal.relatedFactIds),
    relatedDocumentIds: unique(signal.relatedDocumentIds),
  };
}

function buildHypothesis(
  hypothesis: TinaUnknownPatternHypothesis
): TinaUnknownPatternHypothesis {
  return {
    ...hypothesis,
    whyPlausible: unique(hypothesis.whyPlausible),
    whatCouldDisprove: unique(hypothesis.whatCouldDisprove),
    requiredProof: unique(hypothesis.requiredProof),
    recommendedFirstQuestion: hypothesis.recommendedFirstQuestion ?? null,
    relatedSignalIds: unique(hypothesis.relatedSignalIds),
  };
}

function countFactsByLabels(draft: TinaWorkspaceDraft, labels: string[]): number {
  return draft.sourceFacts.filter((fact) =>
    labels.some((label) => fact.label.toLowerCase().includes(label.toLowerCase()))
  ).length;
}

function buildCrossYearDriftRequest(draft: TinaWorkspaceDraft): string {
  const hasPriorReturn = draft.documents.some((document) => document.category === "prior_return");
  const hasElectionDoc = draft.documents.some(
    (document) =>
      document.requestId === "entity-election" || document.requestId === "formation-papers"
  );

  if (hasPriorReturn && hasElectionDoc) {
    return "Upload the current-year election packet and the most recent filed federal return together so Tina can separate stale history from current-year treatment.";
  }

  if (hasElectionDoc) {
    return "Upload the most recent filed federal return next to the election papers so Tina can tell whether the old filing posture is stale.";
  }

  return "Upload the current-year election proof and the most recent filed federal return together so Tina can resolve the cross-year drift.";
}

function hasExplicitElectionDriftSignal(draft: TinaWorkspaceDraft): boolean {
  if (draft.profile.taxElection === "s_corp" || draft.profile.taxElection === "c_corp") {
    return true;
  }

  const electionPattern =
    /entity election|form 2553|s corporation|s-corp|c corporation|corporate tax treatment/i;

  return (
    draft.sourceFacts.some((fact) => electionPattern.test(`${fact.label} ${fact.value}`)) ||
    draft.documentReadings.some((reading) =>
      reading.detailLines.some((line) => electionPattern.test(line))
    ) ||
    electionPattern.test(draft.profile.notes ?? "")
  );
}

function buildCandidateLanes(
  startPath: ReturnType<typeof buildTinaStartPathAssessment>,
  federalReturnClassification: ReturnType<typeof buildTinaFederalReturnClassification>,
  crossYearDrift: boolean
): TinaFilingLaneId[] {
  return uniqueLanes([
    startPath.recommendation.laneId,
    federalReturnClassification.laneId,
    ...(crossYearDrift ? (["schedule_c_single_member_llc"] as TinaFilingLaneId[]) : []),
    ...startPath.hintedLanes,
  ]);
}

function laneScore(
  laneId: TinaFilingLaneId,
  draft: TinaWorkspaceDraft,
  startPath: ReturnType<typeof buildTinaStartPathAssessment>,
  signals: TinaUnknownPatternSignal[]
): number {
  let score = 0;

  if (laneId === startPath.recommendation.laneId) score += 3;
  if (startPath.hintedLanes.includes(laneId)) score += 2;
  if (draft.profile.taxElection === "s_corp" && laneId === "1120_s") score += 3;
  if (draft.profile.taxElection === "c_corp" && laneId === "1120") score += 3;
  if (
    draft.profile.ownerCount !== null &&
    draft.profile.ownerCount > 1 &&
    laneId === "1065"
  ) {
    score += 2;
  }
  if (
    draft.profile.ownerCount === 1 &&
    (draft.profile.entityType === "sole_prop" || draft.profile.entityType === "single_member_llc") &&
    laneId === "schedule_c_single_member_llc"
  ) {
    score += 2;
  }
  if (
    startPath.ownershipMismatchWithSingleOwnerLane &&
    laneId === "schedule_c_single_member_llc"
  ) {
    score -= 3;
  }

  const relatedSignals = signals.filter((signal) => signal.relatedLaneIds.includes(laneId));
  score += relatedSignals.filter((signal) => signal.severity === "review").length;
  score -= relatedSignals.filter((signal) => signal.severity === "blocking").length;

  return score;
}

export function buildTinaUnknownPatternEngine(
  draft: TinaWorkspaceDraft
): TinaUnknownPatternEngineSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const entityAmbiguity = buildTinaEntityAmbiguityResolver(draft);
  const federalReturnClassification = buildTinaFederalReturnClassification(draft);
  const entityFilingRemediation = buildTinaEntityFilingRemediation(draft);
  const booksNormalization = buildTinaBooksNormalization(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const documentIntelligenceFacts = listTinaDocumentIntelligenceExtractedFacts(
    documentIntelligence
  );
  const distinctEinValues = listTinaDocumentIntelligenceDistinctValues({
    snapshot: documentIntelligence,
    kind: "identity_signal",
    label: "Employer identification number",
  });
  const distinctEntityNameValues = listTinaDocumentIntelligenceDistinctValues({
    snapshot: documentIntelligence,
    kind: "entity_name_signal",
    label: "Entity name signal",
  });
  const priorFilingSignals = listTinaDocumentIntelligenceFactsByKind({
    snapshot: documentIntelligence,
    kind: "prior_filing_signal",
  });
  const electionTimelineSignals = listTinaDocumentIntelligenceFactsByKind({
    snapshot: documentIntelligence,
    kind: "election_timeline_signal",
  });
  const ownershipTimelineSignals = listTinaDocumentIntelligenceFactsByKind({
    snapshot: documentIntelligence,
    kind: "ownership_timeline_signal",
  });
  const stateRegistrationSignals = listTinaDocumentIntelligenceFactsByKind({
    snapshot: documentIntelligence,
    kind: "state_registration_signal",
  });
  const extractedElectionSignals = documentIntelligenceFacts.filter(
    (fact) => fact.kind === "election_signal"
  );
  const entityEconomicsReadiness = buildTinaEntityEconomicsReadiness(draft);
  const ownershipCapitalEvents = buildTinaOwnershipCapitalEvents(draft);
  const treatmentJudgment = buildTinaTreatmentJudgment(draft);
  const routeConflictDocumentIds = unique([
    ...startPath.relatedDocumentIds,
    ...startPath.returnTypeHintFacts.map((fact) => fact.sourceDocumentId),
  ]);
  const routeConflictFactIds = unique([
    ...startPath.relatedFactIds,
    ...startPath.returnTypeHintFacts.map((fact) => fact.id),
  ]);
  const documentIntelligenceHasCrossYearConflict =
    documentIntelligence.items.some(
      (item) =>
        item.roles.includes("prior_return_package") &&
        item.status !== "signal_only" &&
        item.relatedLaneIds.length > 0
    ) &&
    documentIntelligence.items.some(
      (item) =>
        item.roles.includes("entity_election") &&
        item.status !== "signal_only" &&
        item.relatedLaneIds.length > 0
    ) &&
    documentIntelligence.conflictCount > 0;
  const crossYearDrift =
    (draft.documents.some((document) => document.category === "prior_return") &&
      draft.documents.some(
        (document) =>
          document.requestId === "entity-election" || document.requestId === "formation-papers"
      ) &&
      (startPath.hasHintVsOrganizerConflict || hasExplicitElectionDriftSignal(draft))) ||
    documentIntelligenceHasCrossYearConflict ||
    entityFilingRemediation.historyStatus !== "aligned" ||
    entityFilingRemediation.amendmentStatus === "sequencing_required" ||
    entityFilingRemediation.electionStatus === "relief_candidate";
  const blockingNormalizationIssues = booksNormalization.issues.filter(
    (issue) => issue.severity === "blocking"
  );
  const reviewNormalizationIssues = booksNormalization.issues.filter(
    (issue) => issue.severity === "needs_attention" || issue.severity === "watch"
  );
  const reviewOwnershipEvents = ownershipCapitalEvents.events.filter(
    (event) => event.status === "needs_review"
  );
  const blockedOwnershipEvents = ownershipCapitalEvents.events.filter(
    (event) => event.status === "blocked"
  );
  const reviewTreatmentItems = treatmentJudgment.items.filter(
    (item) => item.taxPositionBucket === "review"
  );
  const rejectTreatmentItems = treatmentJudgment.items.filter(
    (item) => item.taxPositionBucket === "reject"
  );
  const cleanupFirstTreatmentItems = treatmentJudgment.items.filter(
    (item) => item.cleanupDependency === "cleanup_first"
  );
  const stateSensitiveTreatmentItems = treatmentJudgment.items.filter(
    (item) => item.federalStateSensitivity !== "federal_only"
  );
  const signals: TinaUnknownPatternSignal[] = [];

  if (startPath.hasMixedHintedLanes || startPath.hasHintVsOrganizerConflict) {
    signals.push(
      buildSignal({
        id: "route-conflict",
        title: "Route conflict across organizer facts and papers",
        category: "route_conflict",
        severity:
          startPath.hasMixedHintedLanes || startPath.route === "blocked" ? "blocking" : "review",
        summary: startPath.hasMixedHintedLanes
          ? `Source papers point to multiple lanes: ${startPath.hintedLanes
              .map((laneId) => describeTinaLane(laneId))
              .join(", ")}.`
          : `Organizer facts and source papers disagree on the likely filing lane.`,
        relatedLaneIds: [startPath.recommendation.laneId, ...startPath.hintedLanes],
        relatedFactIds: routeConflictFactIds,
        relatedDocumentIds: routeConflictDocumentIds,
      })
    );
  }

  if (crossYearDrift) {
    signals.push(
      buildSignal({
        id: "cross-year-drift",
        title: "Cross-year drift between old returns and current-year treatment",
        category: "cross_year_drift",
        severity:
          entityFilingRemediation.amendmentStatus === "sequencing_required" ||
          entityFilingRemediation.electionStatus === "relief_candidate"
            ? "blocking"
            : "review",
        summary:
          entityFilingRemediation.amendmentStatus === "sequencing_required"
            ? "Prior returns, opening balances, and current books still need amended-return sequencing before Tina should treat the current year as stable."
            : entityFilingRemediation.electionStatus === "relief_candidate"
              ? "Older filings and current corporate behavior only align if election-relief posture stands, so Tina should not collapse to one route too early."
              : "Older return history and current-year election papers point in different directions, so Tina should not assume history still controls.",
        relatedLaneIds: uniqueLanes([
          startPath.recommendation.laneId,
          ...startPath.hintedLanes,
          ...entityFilingRemediation.likelyPriorLaneIds,
          ...entityFilingRemediation.alternateLaneIds,
        ]),
        relatedFactIds: unique([
          ...routeConflictFactIds,
          ...entityFilingRemediation.relatedFactIds,
        ]),
        relatedDocumentIds: unique([
          ...routeConflictDocumentIds,
          ...entityFilingRemediation.relatedDocumentIds,
        ]),
      })
    );
  }

  if (
    documentIntelligence.identityConflictCount > 0 ||
    documentIntelligence.continuityConflictCount > 0 ||
    ownershipTimelineSignals.length > 0 ||
    stateRegistrationSignals.length > 0
  ) {
    const continuityFragments = [
      distinctEinValues.length > 1
        ? `multiple EINs (${distinctEinValues.join(", ")})`
        : "",
      distinctEntityNameValues.length > 1
        ? `multiple entity names (${distinctEntityNameValues.join(", ")})`
        : "",
      priorFilingSignals.length > 0 && electionTimelineSignals.length > 0
        ? "prior-return posture does not fully align with current-year election timing"
        : "",
      ownershipTimelineSignals.length > 0
        ? "ownership-timeline signals are still changing the route story"
        : "",
      stateRegistrationSignals.length > 0
        ? "state registration and operating-footprint clues still matter"
        : "",
    ].filter(Boolean);

    signals.push(
      buildSignal({
        id: "entity-continuity",
        title: "Entity identity and continuity story still needs proof",
        category: "entity_continuity",
        severity:
          documentIntelligence.identityConflictCount > 0 ||
          documentIntelligence.continuityConflictCount > 0
            ? "blocking"
            : "review",
        summary:
          continuityFragments.length > 0
            ? `Structured papers suggest ${continuityFragments.join("; ")}.`
            : "Structured papers still leave entity identity, continuity, or timing questions unresolved.",
        relatedLaneIds: uniqueLanes([
          startPath.recommendation.laneId,
          ...startPath.hintedLanes,
          ...priorFilingSignals
            .map((fact) => fact.laneId)
            .filter((laneId): laneId is TinaFilingLaneId => Boolean(laneId)),
          ...electionTimelineSignals
            .map((fact) => fact.laneId)
            .filter((laneId): laneId is TinaFilingLaneId => Boolean(laneId)),
        ]),
        relatedFactIds: unique(
          documentIntelligence.items.flatMap((item) => item.relatedFactIds)
        ),
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  if (entityAmbiguity.overallStatus !== "stable_route") {
    signals.push(
      buildSignal({
        id: "entity-ambiguity",
        title: "Entity route still has competing or blocked paths",
        category: "entity_ambiguity",
        severity:
          entityAmbiguity.overallStatus === "blocked" ? "blocking" : "review",
        summary: entityAmbiguity.summary,
        relatedLaneIds: entityAmbiguity.hypotheses.map((hypothesis) => hypothesis.laneId),
        relatedFactIds: unique(
          entityAmbiguity.signals.flatMap((signal) => signal.relatedFactIds)
        ),
        relatedDocumentIds: unique(
          entityAmbiguity.signals.flatMap((signal) => signal.relatedDocumentIds)
        ),
      })
    );
  }

  const shouldSignalEntityEconomicsNovelty =
    blockedOwnershipEvents.length > 0 ||
    reviewOwnershipEvents.length > 0 ||
    (entityEconomicsReadiness.overallStatus !== "clear" &&
      (startPath.recommendation.laneId !== "schedule_c_single_member_llc" ||
        (draft.profile.ownerCount !== null && draft.profile.ownerCount > 1)));

  if (shouldSignalEntityEconomicsNovelty) {
    signals.push(
      buildSignal({
        id: "entity-economics-novelty",
        title: "Ownership or economics story is not yet pattern-safe",
        category: "entity_economics",
        severity:
          entityEconomicsReadiness.overallStatus === "blocked" || blockedOwnershipEvents.length > 0
            ? "blocking"
            : "review",
        summary:
          "Owner changes, capital events, or economics checks still keep the file from looking like a clean known pattern.",
        relatedLaneIds: [startPath.recommendation.laneId],
        relatedFactIds: unique(
          ownershipCapitalEvents.events.flatMap((event) => event.relatedFactIds)
        ),
        relatedDocumentIds: unique(
          ownershipCapitalEvents.events.flatMap((event) => event.relatedDocumentIds)
        ),
      })
    );
  }

  if (blockingNormalizationIssues.length > 0 || reviewNormalizationIssues.length >= 2) {
    signals.push(
      buildSignal({
        id: "messy-evidence-cluster",
        title: "Evidence shape is messy enough to escape easy categorization",
        category: "messy_evidence",
        severity: blockingNormalizationIssues.length > 0 ? "blocking" : "review",
        summary:
          "Mixed-use, owner-flow, related-party, or bookkeeping contamination is making the facts behave like a harder pattern than the surface lane suggests.",
        relatedLaneIds: [startPath.recommendation.laneId],
        relatedFactIds: draft.sourceFacts.map((fact) => fact.id),
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  if (
    reviewTreatmentItems.length + rejectTreatmentItems.length >= 3 ||
    cleanupFirstTreatmentItems.length >= 2
  ) {
    signals.push(
      buildSignal({
        id: "treatment-novelty-cluster",
        title: "Treatment cluster still looks unusual or novel",
        category: "treatment_novelty",
        severity: rejectTreatmentItems.length > 0 ? "review" : "signal",
        summary:
          cleanupFirstTreatmentItems.length >= 2
            ? `Tina still sees cleanup-first treatment pressure across ${unique(cleanupFirstTreatmentItems.map((item) => item.policyArea)).join(", ")}, so the nearest category may not tell the full story.`
            : "Tina still sees enough mixed-use, owner-flow, sales-tax, inventory, or related-party friction that the nearest category may not tell the full story.",
        relatedLaneIds: [startPath.recommendation.laneId],
        relatedFactIds: unique(treatmentJudgment.items.flatMap((item) => item.relatedFactIds)),
        relatedDocumentIds: unique(
          treatmentJudgment.items.flatMap((item) => item.relatedDocumentIds)
        ),
      })
    );
  }

  if (startPath.proofRequirements.filter((requirement) => requirement.status === "needed").length >= 2) {
    signals.push(
      buildSignal({
        id: "document-shape-gap",
        title: "Document package still does not fit a stable known pattern",
        category: "document_shape",
        severity: startPath.route === "blocked" ? "blocking" : "review",
        summary:
          "The current paper set is still missing multiple route-critical proof items, so Tina should not trust the nearest modeled category yet.",
        relatedLaneIds: [startPath.recommendation.laneId],
        relatedFactIds: startPath.proofRequirements.flatMap((requirement) => requirement.relatedFactIds),
        relatedDocumentIds: startPath.proofRequirements.flatMap(
          (requirement) => requirement.relatedDocumentIds
        ),
      })
    );
  }

  if (
    documentIntelligence.overallStatus === "conflicted" ||
    documentIntelligence.missingCriticalRoleCount > 0 ||
    distinctEinValues.length > 1
  ) {
    signals.push(
      buildSignal({
        id: "document-intelligence-gap",
        title: "Structured paper trail still has conflicts or critical gaps",
        category: "document_intelligence",
        severity:
          documentIntelligence.overallStatus === "conflicted" ||
          documentIntelligence.missingCriticalRoleCount >= 2 ||
          distinctEinValues.length > 1
            ? "review"
            : "signal",
        summary:
          distinctEinValues.length > 1
            ? `Structured document reading found multiple EINs in the paper trail (${distinctEinValues.join(", ")}), so Tina should not collapse identity assumptions too early.`
            : documentIntelligence.overallStatus === "conflicted"
            ? "Structured document reading found competing paper stories that Tina should keep alive instead of collapsing too early."
            : `Structured document reading still lacks critical artifact types: ${documentIntelligence.missingCriticalRoles
                .slice(0, 3)
                .join(", ")}.`,
        relatedLaneIds: uniqueLanes(
          documentIntelligence.items.flatMap((item) => item.relatedLaneIds)
        ),
        relatedFactIds: unique(
          documentIntelligence.items.flatMap((item) => item.relatedFactIds)
        ),
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  const candidateLanes = buildCandidateLanes(
    startPath,
    federalReturnClassification,
    crossYearDrift
  );
  const ambiguityLanes = entityAmbiguity.hypotheses.map((hypothesis) => hypothesis.laneId);
  const hypotheses = candidateLanes
    .concat(ambiguityLanes)
    .filter((laneId, index, values) => values.indexOf(laneId) === index)
    .map((laneId) => {
      const matchingEntityHypothesis = entityAmbiguity.hypotheses.find(
        (hypothesis) => hypothesis.laneId === laneId
      );
      const score = laneScore(laneId, draft, startPath, signals);
      const routeConflictSignal = signals.find((signal) => signal.id === "route-conflict");
      const crossYearSignal = signals.find((signal) => signal.id === "cross-year-drift");
      const relatedSignalIds = signals
        .filter((signal) => signal.relatedLaneIds.includes(laneId))
        .map((signal) => signal.id);
      const requiredProof = startPath.proofRequirements
        .filter(
          (requirement) =>
            requirement.relatedLaneIds.length === 0 ||
            requirement.relatedLaneIds.includes(laneId)
        )
        .map((requirement) => requirement.label);
      const whyPlausible = unique([
        ...(matchingEntityHypothesis?.whyPlausible ?? []),
        laneId === startPath.recommendation.laneId
          ? "Current lane recommendation points here."
          : "One or more source-paper hints point here.",
        startPath.hintedLanes.includes(laneId)
          ? "Source-paper return hints support this lane."
          : "",
        draft.profile.taxElection === "s_corp" && laneId === "1120_s"
          ? "The profile includes an S-corp election signal."
          : "",
        draft.profile.taxElection === "c_corp" && laneId === "1120"
          ? "The profile includes a corporate election signal."
          : "",
        draft.profile.ownerCount !== null && draft.profile.ownerCount > 1 && laneId === "1065"
          ? "Known owner count makes partnership treatment plausible."
          : "",
      ]);
      const whatCouldDisprove = unique([
        ...(matchingEntityHypothesis?.whatCouldChange ?? []),
        routeConflictSignal ? routeConflictSignal.summary : "",
        crossYearSignal ? crossYearSignal.summary : "",
        startPath.ownershipMismatchWithSingleOwnerLane && laneId === "schedule_c_single_member_llc"
          ? "Single-owner Schedule C treatment is weakened by multi-owner or ownership-change clues."
          : "",
        laneId !== startPath.recommendation.laneId
          ? "The current recommendation still points somewhere else."
          : "",
      ]);
      const ranking = rankDiagnosticHypothesis({
        whyPlausible,
        whatCouldChange: whatCouldDisprove,
        requiredProof: unique([
          ...requiredProof,
          ...(matchingEntityHypothesis?.requiredProof ?? []),
        ]),
        baseScore:
          Math.max(50 + score * 8, matchingEntityHypothesis?.stabilityScore ?? 0),
      });

      return buildHypothesis({
        id: `hypothesis-${laneId}`,
        title: `${describeTinaLane(laneId)} hypothesis`,
        laneId,
        status: "fallback",
        confidence: ranking.confidence,
        stabilityScore: ranking.stabilityScore,
        summary:
          laneId === startPath.recommendation.laneId
            ? `Tina currently leans toward ${describeTinaLane(laneId)}, but the file still needs hypothesis-aware proof handling.`
            : `Tina should keep ${describeTinaLane(laneId)} alive as an alternate hypothesis until the conflicting proofs settle.`,
        whyPlausible,
        whatCouldDisprove,
        requiredProof: unique([
          ...requiredProof,
          ...(matchingEntityHypothesis?.requiredProof ?? []),
        ]),
        supportingSignalCount: ranking.supportingSignalCount,
        contradictingSignalCount: ranking.contradictingSignalCount,
        recommendedFirstQuestion: ranking.recommendedFirstQuestion,
        relatedSignalIds,
      });
    })
    .sort((left, right) => {
      return right.stabilityScore - left.stabilityScore;
    })
    .map((hypothesis, index) =>
      buildHypothesis({
        ...hypothesis,
        status:
          index === 0
            ? "leading"
            : index === 1
              ? "plausible"
              : "fallback",
      })
    );

  const blockingSignalCount = signals.filter((signal) => signal.severity === "blocking").length;
  const reviewSignalCount = signals.filter((signal) => signal.severity === "review").length;
  const treatedNovelFactCount =
    countFactsByLabels(draft, [
      "related-party",
      "intercompany",
      "mixed personal/business",
      "former owner",
      "ownership change",
      "entity election",
    ]) +
    rejectTreatmentItems.length +
    cleanupFirstTreatmentItems.length;
  const overallStatus =
    blockingSignalCount > 0 || (signals.length >= 3 && treatedNovelFactCount >= 3)
      ? "novel_pattern"
      : reviewSignalCount > 0 || signals.length > 0
        ? "ambiguous_pattern"
        : "known_pattern";
  const recommendedHandling =
    overallStatus === "known_pattern"
      ? "continue"
      : overallStatus === "ambiguous_pattern"
        ? "reviewer_controlled"
        : "blocked_until_proved";
  const customProofRequests = unique([
    ...startPath.proofRequirements
      .filter((requirement) => requirement.status === "needed")
      .map((requirement) => `Upload or confirm: ${requirement.label}.`),
    ...entityAmbiguity.priorityQuestions.map(
      (question) => `Resolve entity-route question: ${question}.`
    ),
    crossYearDrift ? buildCrossYearDriftRequest(draft) : "",
    signals.some((signal) => signal.id === "messy-evidence-cluster")
      ? "Provide an independent books package that separates owner, related-party, payroll, contractor, and inventory flows before Tina trusts the nearest category."
      : "",
    signals.some((signal) => signal.id === "treatment-novelty-cluster")
      ? "Reviewer should memo the leading treatment hypothesis and authority basis before Tina lets a novel item behave like a settled category."
      : "",
    ...unique(
      treatmentJudgment.items
        .filter(
          (item) =>
            item.taxPositionBucket !== "use" ||
            item.cleanupDependency !== "return_prep_ready"
        )
        .flatMap((item) =>
          item.requiredProof.map((proof) => `${item.title}: ${proof}.`)
        )
    ).slice(0, 8),
    stateSensitiveTreatmentItems.length > 0
      ? "Confirm whether state-law or nexus facts change the leading treatment posture before Tina finalizes those items."
      : "",
    ...documentIntelligence.missingCriticalRoles.map(
      (role) => `Upload or identify Tina's ${role} so the paper trail is more than a surface clue.`
    ),
    ...documentIntelligence.continuityQuestions.map(
      (question) => `Resolve entity continuity question: ${question}`
    ),
    distinctEinValues.length > 1
      ? `Confirm which EIN belongs to the current filing entity and explain the relationship among ${distinctEinValues.join(", ")} before Tina trusts any one filing posture.`
      : "",
    distinctEntityNameValues.length > 1
      ? `Confirm which legal entity name belongs to the current-year return and explain why the paper trail names ${distinctEntityNameValues.join(", ")}.`
      : "",
    extractedElectionSignals.length > 0 && distinctEinValues.length > 1
      ? "Upload the signed election effective-date proof tied to the correct EIN so Tina can separate current treatment from legacy or related-entity paperwork."
      : "",
  ]);

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    recommendedHandling,
    summary:
      overallStatus === "known_pattern"
        ? "Tina sees a known pattern and does not currently need hypothesis-mode escalation."
        : overallStatus === "ambiguous_pattern"
          ? "Tina sees an ambiguous pattern and is keeping multiple plausible explanations alive under reviewer control."
          : "Tina sees a novel or unstable pattern and should block the nearest bucket until better proof arrives.",
    nextStep:
      overallStatus === "known_pattern"
        ? "Keep the leading lane, but preserve this engine so novelty can surface as facts change."
        : overallStatus === "ambiguous_pattern"
          ? "Use the competing hypotheses and proof requests to narrow the file before Tina behaves like the category is settled."
          : "Resolve the blocking signals and custom proof requests before Tina trusts any one modeled category.",
    leadingHypothesisId: hypotheses.find((hypothesis) => hypothesis.status === "leading")?.id ?? null,
    signals,
    hypotheses,
    customProofRequests,
  };
}
