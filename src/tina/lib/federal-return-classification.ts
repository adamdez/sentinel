import { buildTinaDocumentIntelligence } from "@/tina/lib/document-intelligence";
import { buildTinaEntityAmbiguityResolver } from "@/tina/lib/entity-ambiguity-resolver";
import { buildTinaEntityFilingRemediation } from "@/tina/lib/entity-filing-remediation";
import { buildTinaEntityJudgment } from "@/tina/lib/entity-judgment";
import { buildTinaFederalReturnRequirements } from "@/tina/lib/federal-return-requirements";
import { buildTinaSingleMemberEntityHistoryProof } from "@/tina/lib/single-member-entity-history-proof";
import { buildTinaSingleOwnerCorporateRouteProof } from "@/tina/lib/single-owner-corporate-route-proof";
import { buildTinaStartPathAssessment, formatTinaLaneList } from "@/tina/lib/start-path";
import type {
  TinaFederalReturnClassificationIssue,
  TinaFederalReturnClassificationSignal,
  TinaFederalReturnClassificationSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildSignal(
  args: TinaFederalReturnClassificationSignal
): TinaFederalReturnClassificationSignal {
  return {
    ...args,
    relatedFactIds: unique(args.relatedFactIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

function buildIssue(args: TinaFederalReturnClassificationIssue): TinaFederalReturnClassificationIssue {
  return {
    ...args,
    relatedFactIds: unique(args.relatedFactIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

export function buildTinaFederalReturnClassification(
  draft: TinaWorkspaceDraft
): TinaFederalReturnClassificationSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const entityAmbiguity = buildTinaEntityAmbiguityResolver(draft);
  const entityFilingRemediation = buildTinaEntityFilingRemediation(draft);
  const entityJudgment = buildTinaEntityJudgment(draft);
  const federalReturnRequirements = buildTinaFederalReturnRequirements(draft);
  const singleMemberEntityHistory = buildTinaSingleMemberEntityHistoryProof(draft);
  const singleOwnerCorporateRoute = buildTinaSingleOwnerCorporateRouteProof(draft);

  const signals: TinaFederalReturnClassificationSignal[] = [
    buildSignal({
      id: "organizer-posture",
      title: "Organizer and profile posture",
      summary:
        draft.profile.ownerCount === null
          ? `Profile currently points toward ${startPath.recommendation.title}, but owner count is still unresolved.`
          : `Profile currently points toward ${startPath.recommendation.title} with ${draft.profile.ownerCount} known owner${draft.profile.ownerCount === 1 ? "" : "s"}.`,
      strength:
        startPath.recommendation.laneId === "unknown" || draft.profile.ownerCount === null
          ? "weak"
          : "moderate",
      relatedFactIds: [],
      relatedDocumentIds: [],
    }),
  ];

  if (startPath.returnTypeHintFacts.length > 0) {
    signals.push(
      buildSignal({
        id: "paper-trail-hints",
        title: "Paper-trail filing hints",
        summary: startPath.hasMixedHintedLanes
          ? `Source papers point to multiple lanes: ${formatTinaLaneList(startPath.hintedLanes)}.`
          : `Source papers point toward ${formatTinaLaneList(startPath.hintedLanes)}.`,
        strength: startPath.hasMixedHintedLanes ? "weak" : "strong",
        relatedFactIds: startPath.returnTypeHintFacts.map((fact) => fact.id),
        relatedDocumentIds: startPath.returnTypeHintFacts.map((fact) => fact.sourceDocumentId),
      })
    );
  }

  if (startPath.proofRequirements.length > 0) {
    signals.push(
      buildSignal({
        id: "route-proof-coverage",
        title: "Route-critical proof coverage",
        summary: `${startPath.proofRequirements.filter((item) => item.status === "covered").length} proof item(s) covered and ${startPath.proofRequirements.filter((item) => item.status === "needed").length} still needed for the current lane.`,
        strength:
          startPath.proofRequirements.some((item) => item.status === "needed") ? "weak" : "moderate",
        relatedFactIds: startPath.proofRequirements.flatMap((item) => item.relatedFactIds),
        relatedDocumentIds: startPath.proofRequirements.flatMap((item) => item.relatedDocumentIds),
      })
    );
  }

  if (entityAmbiguity.overallStatus !== "stable_route") {
    signals.push(
      buildSignal({
        id: "entity-ambiguity",
        title: "Entity route still has ambiguity pressure",
        summary: entityAmbiguity.summary,
        strength:
          entityAmbiguity.overallStatus === "blocked"
            ? "weak"
            : entityAmbiguity.hypotheses.length > 1
              ? "weak"
              : "moderate",
        relatedFactIds: entityAmbiguity.signals.flatMap((signal) => signal.relatedFactIds),
        relatedDocumentIds: entityAmbiguity.signals.flatMap(
          (signal) => signal.relatedDocumentIds
        ),
      })
    );
  }

  if (entityFilingRemediation.overallStatus !== "aligned") {
    signals.push(
      buildSignal({
        id: "entity-filing-remediation",
        title: "Entity filing continuity and remediation posture",
        summary: entityFilingRemediation.summary,
        strength:
          entityFilingRemediation.overallStatus === "blocked" ? "weak" : "moderate",
        relatedFactIds: entityFilingRemediation.relatedFactIds,
        relatedDocumentIds: entityFilingRemediation.relatedDocumentIds,
      })
    );
  }

  if (singleOwnerCorporateRoute.overallStatus !== "not_applicable") {
    signals.push(
      buildSignal({
        id: "single-owner-corporate-route-proof",
        title: "Single-owner corporate route and payroll posture",
        summary: singleOwnerCorporateRoute.summary,
        strength:
          singleOwnerCorporateRoute.overallStatus === "blocked"
            ? "weak"
            : singleOwnerCorporateRoute.overallStatus === "review_required"
              ? "weak"
              : "moderate",
        relatedFactIds: singleOwnerCorporateRoute.relatedFactIds,
        relatedDocumentIds: singleOwnerCorporateRoute.relatedDocumentIds,
      })
    );
  }

  if (singleMemberEntityHistory.overallStatus !== "not_applicable") {
    signals.push(
      buildSignal({
        id: "single-member-entity-history-proof",
        title: "Single-member entity-history and transition proof",
        summary: singleMemberEntityHistory.summary,
        strength:
          singleMemberEntityHistory.overallStatus === "blocked"
            ? "weak"
            : singleMemberEntityHistory.overallStatus === "review_required"
              ? "weak"
              : "moderate",
        relatedFactIds: singleMemberEntityHistory.relatedFactIds,
        relatedDocumentIds: singleMemberEntityHistory.relatedDocumentIds,
      })
    );
  }

  if (
    documentIntelligence.identityConflictCount > 0 ||
    documentIntelligence.continuityConflictCount > 0 ||
    documentIntelligence.priorFilingSignalCount > 0 ||
    documentIntelligence.electionTimelineSignalCount > 0
  ) {
    signals.push(
      buildSignal({
        id: "document-continuity",
        title: "Document continuity and identity posture",
        summary:
          documentIntelligence.identityConflictCount > 0 ||
          documentIntelligence.continuityConflictCount > 0
            ? "Structured papers expose identity or continuity conflicts that can change the return family."
            : "Structured papers carry prior-filing or election-timing clues that should stay visible while Tina classifies the lane.",
        strength:
          documentIntelligence.identityConflictCount > 0 ||
          documentIntelligence.continuityConflictCount > 0
            ? "weak"
            : "moderate",
        relatedFactIds: unique(
          documentIntelligence.items.flatMap((item) => item.relatedFactIds)
        ),
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    );
  }

  const issues: TinaFederalReturnClassificationIssue[] = [
    ...startPath.blockingReasons.map((reason, index) =>
      buildIssue({
        id: `start-path-blocking-${index + 1}`,
        title: "Federal return classification is blocked",
        summary: reason,
        severity: "blocking",
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    ),
    ...startPath.reviewReasons.map((reason, index) =>
      buildIssue({
        id: `start-path-review-${index + 1}`,
        title: "Federal return classification still needs reviewer judgment",
        summary: reason,
        severity: "needs_attention",
        relatedFactIds: startPath.relatedFactIds,
        relatedDocumentIds: startPath.relatedDocumentIds,
      })
    ),
    ...entityJudgment.questions.map((question) =>
      buildIssue({
        id: `entity-${question.id}`,
        title: question.title,
        summary: question.summary,
        severity: question.severity,
        relatedFactIds: question.relatedFactIds,
        relatedDocumentIds: question.relatedDocumentIds,
      })
    ),
    ...entityAmbiguity.priorityQuestions.map((question, index) =>
      buildIssue({
        id: `entity-ambiguity-${index + 1}`,
        title:
          entityAmbiguity.overallStatus === "blocked"
            ? "Entity route still has a blocking proof gap"
            : "Entity route still has a competing-path proof question",
        summary: question,
        severity:
          entityAmbiguity.overallStatus === "blocked"
            ? "blocking"
            : "needs_attention",
        relatedFactIds: entityAmbiguity.signals.flatMap((signal) => signal.relatedFactIds),
        relatedDocumentIds: entityAmbiguity.signals.flatMap(
          (signal) => signal.relatedDocumentIds
        ),
      })
    ),
    ...entityFilingRemediation.issues.map((issue) =>
      buildIssue({
        id: `entity-filing-remediation-${issue.id}`,
        title: issue.title,
        summary: issue.summary,
        severity: issue.severity,
        relatedFactIds: issue.relatedFactIds,
        relatedDocumentIds: issue.relatedDocumentIds,
      })
    ),
    ...singleOwnerCorporateRoute.issues.map((issue) =>
      buildIssue({
        id: `single-owner-corporate-route-${issue.id}`,
        title: issue.title,
        summary: issue.summary,
        severity:
          issue.severity === "blocking" ? "blocking" : "needs_attention",
        relatedFactIds: issue.relatedFactIds,
        relatedDocumentIds: issue.relatedDocumentIds,
      })
    ),
    ...singleMemberEntityHistory.issues.map((issue) =>
      buildIssue({
        id: `single-member-entity-history-${issue.id}`,
        title: issue.title,
        summary: issue.summary,
        severity:
          issue.severity === "blocking" ? "blocking" : "needs_attention",
        relatedFactIds: issue.relatedFactIds,
        relatedDocumentIds: issue.relatedDocumentIds,
      })
    ),
    ...documentIntelligence.continuityQuestions.map((question, index) =>
      buildIssue({
        id: `document-continuity-${index + 1}`,
        title:
          documentIntelligence.identityConflictCount > 0 ||
          documentIntelligence.continuityConflictCount > 0
            ? "Document continuity conflict still changes the route story"
            : "Document continuity question still matters for route confidence",
        summary: question,
        severity:
          documentIntelligence.identityConflictCount > 0 ||
          documentIntelligence.continuityConflictCount > 0
            ? "needs_attention"
            : "needs_attention",
        relatedFactIds: unique(
          documentIntelligence.items.flatMap((item) => item.relatedFactIds)
        ),
        relatedDocumentIds: draft.documents.map((document) => document.id),
      })
    ),
  ];

  const confidence: TinaFederalReturnClassificationSnapshot["confidence"] =
    startPath.route === "blocked" ||
    entityAmbiguity.overallStatus === "blocked" ||
    entityFilingRemediation.overallStatus === "blocked" ||
    singleMemberEntityHistory.overallStatus === "blocked" ||
    singleOwnerCorporateRoute.overallStatus === "blocked"
      ? "blocked"
      : startPath.route === "supported" &&
          entityAmbiguity.overallStatus === "stable_route" &&
          entityFilingRemediation.overallStatus === "aligned" &&
          (singleMemberEntityHistory.overallStatus === "clear" ||
            singleMemberEntityHistory.overallStatus === "not_applicable") &&
          (singleOwnerCorporateRoute.overallStatus === "clear" ||
            singleOwnerCorporateRoute.overallStatus === "not_applicable") &&
          !startPath.hasMixedHintedLanes &&
          startPath.proofRequirements.every((requirement) => requirement.status === "covered") &&
          documentIntelligence.identityConflictCount === 0 &&
          documentIntelligence.continuityConflictCount === 0
        ? "high"
        : startPath.hasMixedHintedLanes ||
            startPath.hasHintVsOrganizerConflict ||
            entityAmbiguity.overallStatus === "competing_routes" ||
            entityFilingRemediation.overallStatus === "review_required" ||
            singleMemberEntityHistory.overallStatus === "review_required" ||
            singleOwnerCorporateRoute.overallStatus === "review_required" ||
            documentIntelligence.identityConflictCount > 0 ||
            documentIntelligence.continuityConflictCount > 0
          ? "low"
          : "medium";

  const blockingCount = issues.filter((issue) => issue.severity === "blocking").length;
  const attentionCount = issues.filter((issue) => issue.severity === "needs_attention").length;
  const hasAmendmentSequencingPressure =
    entityFilingRemediation.amendmentStatus === "sequencing_required";
  const hasLateElectionReliefPressure =
    entityFilingRemediation.electionStatus === "relief_candidate";
  const hasSingleMemberHistoryBlock =
    singleMemberEntityHistory.overallStatus === "blocked";
  const hasSingleOwnerCorporateBlock =
    singleOwnerCorporateRoute.overallStatus === "blocked";
  const summary =
    confidence === "high"
      ? `Tina has a high-confidence federal return classification on ${startPath.recommendation.title}.`
      : confidence === "medium"
        ? `Tina has a likely federal return classification on ${startPath.recommendation.title}, but ${attentionCount} judgment item${attentionCount === 1 ? "" : "s"} still remain.`
        : confidence === "low"
          ? hasAmendmentSequencingPressure
            ? "Tina sees a likely federal return family, but prior-year drift and amended-return sequencing still weaken confidence."
            : hasLateElectionReliefPressure
              ? "Tina sees a likely federal return family, but late-election relief still controls whether the corporate path stands."
              : hasSingleMemberHistoryBlock
                ? "Tina sees a likely federal return family, but single-member history, spouse-exception proof, or transition-year books posture still weakens confidence."
              : hasSingleOwnerCorporateBlock
                ? "Tina sees a likely federal return family, but the single-owner corporate route or no-payroll S-corp posture still blocks confidence."
                : `Tina sees a likely federal return family, but conflicting entity-route signals still weaken confidence.`
          : hasSingleOwnerCorporateBlock
            ? "Tina still sees blockers because the single-owner corporate route or no-payroll S-corp posture is still unsafe."
            : hasSingleMemberHistoryBlock
              ? "Tina still sees blockers because single-member history, spouse-exception proof, or transition-year books posture is still unresolved."
              : hasLateElectionReliefPressure && hasAmendmentSequencingPressure
                ? "Tina still sees blockers because late-election relief and amended-return sequencing both control whether the current corporate route can be trusted."
                : hasLateElectionReliefPressure
                  ? "Tina still sees blockers because late-election relief still controls whether the corporate route stands."
                  : hasAmendmentSequencingPressure
                    ? "Tina still sees blockers because prior-year drift and amended-return sequencing still control the route story."
                    : `Tina still sees ${blockingCount} blocker${blockingCount === 1 ? "" : "s"} before the federal return family can be trusted.`;
  const nextStep =
    confidence === "high"
      ? "Carry this classification through every downstream treatment and form decision."
      : confidence === "blocked"
        ? hasSingleMemberHistoryBlock
          ? "Resolve owner history, spouse-exception proof, prior-return alignment, and books catch-up before Tina treats the single-member route as settled."
          : hasSingleOwnerCorporateBlock
            ? "Resolve the single-owner corporate election trail, payroll proof, and owner-pay treatment before Tina treats the route as settled."
            : hasLateElectionReliefPressure && hasAmendmentSequencingPressure
              ? "Verify the election acceptance or relief path, then separate amended-return and beginning-balance cleanup from current-year prep before Tina treats the route as settled."
              : hasLateElectionReliefPressure
                ? "Verify the election acceptance or relief path before Tina treats the corporate route as settled."
                : hasAmendmentSequencingPressure
                  ? "Separate current-year prep from amended-return and beginning-balance cleanup before Tina locks the route story."
                  : "Resolve the blocking route and proof issues before Tina builds more tax work on this file."
        : hasAmendmentSequencingPressure
          ? "Separate current-year prep from amended-return and beginning-balance cleanup before Tina locks the route story."
          : hasLateElectionReliefPressure
            ? "Verify the election acceptance or relief path before Tina treats the corporate route as settled."
            : singleMemberEntityHistory.overallStatus === "review_required"
              ? "Keep owner history, spouse-exception proof, and books-posture questions visible until the single-member story is actually proved."
            : entityAmbiguity.overallStatus === "competing_routes"
              ? "Keep the leading and alternate return-family paths visible until the ownership and election proofs narrow the route."
              : "Keep the likely return family visible, but hold the file under reviewer control until the remaining judgment questions are resolved.";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId: startPath.recommendation.laneId,
    returnFamily: federalReturnRequirements.returnFamily,
    route: startPath.route,
    confidence,
    summary,
    nextStep,
    signals,
    issues: issues.filter(
      (issue, index) => issues.findIndex((candidate) => candidate.id === issue.id) === index
    ),
  };
}
