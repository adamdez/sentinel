import type {
  TinaAuthorityWorkItem,
  TinaSourceFact,
  TinaTaxAdjustment,
  TinaTaxPositionMemoryConfidence,
  TinaTaxPositionMemorySnapshot,
  TinaTaxPositionRecord,
  TinaTaxPositionRecordStatus,
  TinaWorkspaceDraft,
} from "@/tina/types";
import { findTinaReviewerPatternScore } from "@/tina/lib/reviewer-outcomes";

function createEmptySnapshot(): TinaTaxPositionMemorySnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not built a durable tax-position register yet.",
    nextStep:
      "Build tax adjustments first, then let Tina assemble position memory tied to authority and reviewer outcomes.",
    records: [],
  };
}

export function createDefaultTinaTaxPositionMemorySnapshot(): TinaTaxPositionMemorySnapshot {
  return createEmptySnapshot();
}

export function markTinaTaxPositionMemoryStale(
  snapshot: TinaTaxPositionMemorySnapshot
): TinaTaxPositionMemorySnapshot {
  if (snapshot.status === "idle" || snapshot.status === "stale") return snapshot;

  return {
    ...snapshot,
    status: "stale",
    summary:
      "Tax adjustments, authority work, or reviewer outcomes changed, so Tina should rebuild position memory.",
    nextStep:
      "Rebuild the tax-position register so Tina does not lean on stale treatment history.",
  };
}

function hasAuthoritySupport(workItems: TinaAuthorityWorkItem[]): boolean {
  if (workItems.length === 0) return false;

  return workItems.every(
    (item) =>
      item.reviewerDecision === "use_it" &&
      item.status !== "rejected" &&
      (item.memo.trim().length > 0 || item.citations.length > 0)
  );
}

function buildReviewerGuidance(
  adjustment: TinaTaxAdjustment,
  authorityWork: TinaAuthorityWorkItem[],
  reviewerLessons: string[],
  patternGuidance: string[]
): string {
  const parts: string[] = [];

  if (adjustment.requiresAuthority) {
    const disclosureFlags = authorityWork
      .map((item) => item.disclosureDecision)
      .filter((value, index, all) => all.indexOf(value) === index);

    if (disclosureFlags.length > 0) {
      parts.push(`Disclosure posture: ${disclosureFlags.join(", ").replace(/_/g, " ")}.`);
    }
  }

  if (adjustment.reviewerNotes.trim().length > 0) {
    parts.push(`Reviewer notes: ${adjustment.reviewerNotes.trim()}`);
  }

  if (reviewerLessons.length > 0) {
    parts.push(`Lessons: ${reviewerLessons.join(" ")}`);
  }

  if (patternGuidance.length > 0) {
    parts.push(`Pattern signal: ${patternGuidance.join(" ")}`);
  }

  return parts.join(" ").trim() || "Tina still needs explicit reviewer guidance for this position.";
}

function buildStatus(args: {
  adjustment: TinaTaxAdjustment;
  authoritySupported: boolean;
  hasReviewerAnchor: boolean;
}): TinaTaxPositionRecordStatus {
  if (args.adjustment.requiresAuthority && !args.authoritySupported) return "blocked";
  if (!args.hasReviewerAnchor || args.adjustment.status === "ready_for_review") return "needs_review";
  return "ready";
}

function buildConfidence(args: {
  adjustment: TinaTaxAdjustment;
  authoritySupported: boolean;
  hasReviewerAnchor: boolean;
  hasAcceptedOutcome: boolean;
  hasRejectedOutcome: boolean;
  patternImpact: "raise" | "hold" | "lower" | null;
}): TinaTaxPositionMemoryConfidence {
  if (args.hasRejectedOutcome) return "low";

  if (args.adjustment.requiresAuthority) {
    if (!args.authoritySupported) return "low";
    if (!args.hasReviewerAnchor) return "medium";

    if (args.patternImpact === "lower") return "medium";
    if (args.patternImpact === "raise" && args.hasAcceptedOutcome) return "high";
    return "high";
  }

  if (!args.hasReviewerAnchor) return "medium";
  if (args.patternImpact === "lower") return args.hasAcceptedOutcome ? "medium" : "low";
  if (args.patternImpact === "raise" && args.hasAcceptedOutcome) return "high";
  return "high";
}

function buildPatternGuidance(args: {
  overallNextStep: string;
  patternLabel: string | null;
  patternScore: number | null;
  patternTrust: string | null;
  patternNextStep: string | null;
  patternLessons: string[];
}): string[] {
  const parts: string[] = [];

  if (args.patternLabel && args.patternScore !== null && args.patternTrust) {
    parts.push(
      `${args.patternLabel} is scoring ${args.patternScore}/100 with ${args.patternTrust.replace(
        /_/g,
        " "
      )} reviewer trust.`
    );
  }

  if (args.patternNextStep) {
    parts.push(args.patternNextStep);
  } else if (args.overallNextStep.trim().length > 0) {
    parts.push(args.overallNextStep);
  }

  if (args.patternLessons.length > 0) {
    parts.push(`Pattern lessons: ${args.patternLessons.join(" ")}`);
  }

  return parts;
}

function getAdjustmentAuthorityWork(
  draft: TinaWorkspaceDraft,
  adjustment: TinaTaxAdjustment
): TinaAuthorityWorkItem[] {
  return draft.authorityWork.filter((item) => adjustment.authorityWorkIdeaIds.includes(item.ideaId));
}

function hasAdjustmentReviewerAnchor(
  draft: TinaWorkspaceDraft,
  adjustment: TinaTaxAdjustment
): boolean {
  const reviewerOutcomes = draft.reviewerOutcomeMemory.outcomes.filter(
    (outcome) => outcome.targetType === "tax_adjustment" && outcome.targetId === adjustment.id
  );
  const reviewerOverrides = draft.reviewerOutcomeMemory.overrides.filter(
    (override) => override.targetType === "tax_adjustment" && override.targetId === adjustment.id
  );

  return (
    adjustment.status === "approved" ||
    adjustment.status === "rejected" ||
    adjustment.reviewerNotes.trim().length > 0 ||
    reviewerOutcomes.length > 0 ||
    reviewerOverrides.length > 0
  );
}

function buildRecord(draft: TinaWorkspaceDraft, adjustment: TinaTaxAdjustment): TinaTaxPositionRecord {
  const authorityWork = getAdjustmentAuthorityWork(draft, adjustment);
  const reviewerOutcomes = draft.reviewerOutcomeMemory.outcomes.filter(
    (outcome) => outcome.targetType === "tax_adjustment" && outcome.targetId === adjustment.id
  );
  const reviewerOverrides = draft.reviewerOutcomeMemory.overrides.filter(
    (override) => override.targetType === "tax_adjustment" && override.targetId === adjustment.id
  );
  const reviewerLessons = reviewerOutcomes.flatMap((outcome) => outcome.lessons);
  const hasAcceptedOutcome = reviewerOutcomes.some((outcome) => outcome.verdict === "accepted");
  const hasRejectedOutcome = reviewerOutcomes.some((outcome) => outcome.verdict === "rejected");
  const patternScore = findTinaReviewerPatternScore(draft.reviewerOutcomeMemory, {
    targetType: "tax_adjustment",
    phase: "tax_review",
  });
  const patternGuidance = buildPatternGuidance({
    overallNextStep: draft.reviewerOutcomeMemory.scorecard.nextStep,
    patternLabel: patternScore?.label ?? null,
    patternScore: patternScore?.acceptanceScore ?? null,
    patternTrust: patternScore?.trustLevel ?? null,
    patternNextStep: patternScore?.nextStep ?? null,
    patternLessons: patternScore?.lessons ?? [],
  });
  const authoritySupported = adjustment.requiresAuthority
    ? hasAuthoritySupport(authorityWork)
    : true;
  const hasReviewerAnchor = hasAdjustmentReviewerAnchor(draft, adjustment);
  const status = buildStatus({
    adjustment,
    authoritySupported,
    hasReviewerAnchor,
  });
  const confidence = buildConfidence({
    adjustment,
    authoritySupported,
    hasReviewerAnchor,
    hasAcceptedOutcome,
    hasRejectedOutcome,
    patternImpact: patternScore?.confidenceImpact ?? null,
  });
  const summaryParts = [adjustment.summary];

  if (adjustment.requiresAuthority) {
    summaryParts.push(
      authoritySupported
        ? "Authority support is linked."
        : "Authority support is still missing or not approved."
    );
  }

  if (reviewerOutcomes.length > 0) {
    summaryParts.push(
      `${reviewerOutcomes.length} reviewer outcome${
        reviewerOutcomes.length === 1 ? "" : "s"
      } linked.`
    );
  }

  if (patternScore) {
    summaryParts.push(
      `Reviewer pattern score for tax adjustments is ${patternScore.acceptanceScore}/100.`
    );
  }

  if (reviewerOverrides.length > 0) {
    summaryParts.push(
      `${reviewerOverrides.length} override${
        reviewerOverrides.length === 1 ? "" : "s"
      } linked.`
    );
  }

  const latestAuthorityUpdate = Math.max(
    0,
    ...authorityWork.map((item) => Date.parse(item.updatedAt ?? "") || 0)
  );
  const latestOutcomeUpdate = Math.max(
    0,
    ...reviewerOutcomes.map((item) => Date.parse(item.decidedAt) || 0),
    ...reviewerOverrides.map((item) => Date.parse(item.decidedAt) || 0)
  );
  const updatedAt = Math.max(latestAuthorityUpdate, latestOutcomeUpdate);

  return {
    id: `tax-position-${adjustment.id}`,
    adjustmentId: adjustment.id,
    title: adjustment.title,
    status,
    confidence,
    summary: summaryParts.join(" "),
    treatmentSummary: adjustment.suggestedTreatment,
    reviewerGuidance: buildReviewerGuidance(
      adjustment,
      authorityWork,
      reviewerLessons,
      patternGuidance
    ),
    authorityWorkIdeaIds: adjustment.authorityWorkIdeaIds,
    sourceDocumentIds: adjustment.sourceDocumentIds,
    sourceFactIds: adjustment.sourceFactIds,
    reviewerOutcomeIds: reviewerOutcomes.map((outcome) => outcome.id),
    reviewerOverrideIds: reviewerOverrides.map((override) => override.id),
    updatedAt: updatedAt > 0 ? new Date(updatedAt).toISOString() : null,
  };
}

function buildGovernedPositionGuidance(args: {
  title: string;
  treatmentSummary: string;
  sourceFacts: TinaSourceFact[];
  relatedAdjustments: TinaTaxAdjustment[];
  authoritySupported: boolean;
  reviewerLessons: string[];
  patternGuidance: string[];
}): string {
  const parts: string[] = [
    `${args.title} should stay governed as a tracked reviewer call until Tina can defend ${args.treatmentSummary.toLowerCase()}.`,
  ];

  if (args.sourceFacts.length > 0) {
    parts.push(
      `Evidence: ${args.sourceFacts
        .map((fact) => fact.value)
        .slice(0, 3)
        .join("; ")}.`
    );
  }

  if (args.relatedAdjustments.length > 0) {
    parts.push(
      `Linked treatment paths: ${args.relatedAdjustments
        .map((adjustment) => adjustment.title)
        .slice(0, 2)
        .join("; ")}.`
    );
  } else {
    parts.push("Tina still needs a linked tax treatment path for this position.");
  }

  if (!args.authoritySupported && args.relatedAdjustments.some((adjustment) => adjustment.requiresAuthority)) {
    parts.push("Authority support is still missing for the linked treatment path.");
  }

  if (args.reviewerLessons.length > 0) {
    parts.push(`Lessons: ${args.reviewerLessons.join(" ")}`);
  }

  if (args.patternGuidance.length > 0) {
    parts.push(`Pattern signal: ${args.patternGuidance.join(" ")}`);
  }

  return parts.join(" ").trim();
}

function buildGovernedPositionRecord(args: {
  draft: TinaWorkspaceDraft;
  id: string;
  adjustmentId: string;
  title: string;
  treatmentSummary: string;
  summaryPrefix: string;
  facts: TinaSourceFact[];
  relatedAdjustmentKinds: TinaTaxAdjustment["kind"][];
}): TinaTaxPositionRecord | null {
  const { draft, facts, relatedAdjustmentKinds } = args;
  if (facts.length === 0) return null;

  const factIds = new Set(facts.map((fact) => fact.id));
  const relatedDocumentIds = new Set(facts.map((fact) => fact.sourceDocumentId));
  const relatedAdjustments = draft.taxAdjustments.adjustments.filter(
    (adjustment) =>
      relatedAdjustmentKinds.includes(adjustment.kind) &&
      (adjustment.sourceFactIds.some((factId) => factIds.has(factId)) ||
        adjustment.sourceDocumentIds.some((documentId) => relatedDocumentIds.has(documentId)))
  );
  const reviewerOutcomes = draft.reviewerOutcomeMemory.outcomes.filter(
    (outcome) =>
      outcome.targetType === "tax_adjustment" &&
      relatedAdjustments.some((adjustment) => adjustment.id === outcome.targetId)
  );
  const reviewerOverrides = draft.reviewerOutcomeMemory.overrides.filter(
    (override) =>
      override.targetType === "tax_adjustment" &&
      relatedAdjustments.some((adjustment) => adjustment.id === override.targetId)
  );
  const authorityWork = relatedAdjustments.flatMap((adjustment) => getAdjustmentAuthorityWork(draft, adjustment));
  const reviewerLessons = reviewerOutcomes.flatMap((outcome) => outcome.lessons);
  const patternScore = findTinaReviewerPatternScore(draft.reviewerOutcomeMemory, {
    targetType: "tax_adjustment",
    phase: "tax_review",
  });
  const patternGuidance = buildPatternGuidance({
    overallNextStep: draft.reviewerOutcomeMemory.scorecard.nextStep,
    patternLabel: patternScore?.label ?? null,
    patternScore: patternScore?.acceptanceScore ?? null,
    patternTrust: patternScore?.trustLevel ?? null,
    patternNextStep: patternScore?.nextStep ?? null,
    patternLessons: patternScore?.lessons ?? [],
  });
  const authoritySupported = relatedAdjustments.every((adjustment) =>
    adjustment.requiresAuthority ? hasAuthoritySupport(getAdjustmentAuthorityWork(draft, adjustment)) : true
  );
  const hasReviewerAnchor =
    relatedAdjustments.some((adjustment) => hasAdjustmentReviewerAnchor(draft, adjustment)) ||
    reviewerOutcomes.length > 0 ||
    reviewerOverrides.length > 0;
  const hasAcceptedOutcome = reviewerOutcomes.some((outcome) => outcome.verdict === "accepted");
  const hasRejectedOutcome = reviewerOutcomes.some((outcome) => outcome.verdict === "rejected");
  const status: TinaTaxPositionRecordStatus = relatedAdjustments.some(
    (adjustment) => adjustment.requiresAuthority && !authoritySupported
  )
    ? "blocked"
    : hasReviewerAnchor && relatedAdjustments.some((adjustment) => adjustment.status === "approved")
      ? "ready"
      : "needs_review";
  const confidence = buildConfidence({
    adjustment: relatedAdjustments[0] ?? {
      id: args.adjustmentId,
      kind: relatedAdjustmentKinds[0] ?? "timing_review",
      status: "ready_for_review",
      risk: "medium",
      requiresAuthority: false,
      title: args.title,
      summary: args.summaryPrefix,
      suggestedTreatment: args.treatmentSummary,
      whyItMatters: args.summaryPrefix,
      amount: null,
      authorityWorkIdeaIds: [],
      aiCleanupLineIds: [],
      sourceDocumentIds: Array.from(relatedDocumentIds),
      sourceFactIds: Array.from(factIds),
      reviewerNotes: "",
    },
    authoritySupported,
    hasReviewerAnchor,
    hasAcceptedOutcome,
    hasRejectedOutcome,
    patternImpact: patternScore?.confidenceImpact ?? null,
  });
  const latestFactUpdate = Math.max(
    0,
    ...facts.map((fact) => Date.parse(fact.capturedAt ?? "") || 0)
  );
  const latestAuthorityUpdate = Math.max(
    0,
    ...authorityWork.map((item) => Date.parse(item.updatedAt ?? "") || 0)
  );
  const latestOutcomeUpdate = Math.max(
    0,
    ...reviewerOutcomes.map((item) => Date.parse(item.decidedAt) || 0),
    ...reviewerOverrides.map((item) => Date.parse(item.decidedAt) || 0)
  );
  const relatedSummaries =
    relatedAdjustments.length > 0
      ? ` Linked ${relatedAdjustments.length} treatment path${
          relatedAdjustments.length === 1 ? "" : "s"
        }.`
      : " No linked treatment path yet.";

  return {
    id: args.id,
    adjustmentId: args.adjustmentId,
    title: args.title,
    status,
    confidence,
    summary: `${args.summaryPrefix} Tina found ${facts.length} supporting fact${
      facts.length === 1 ? "" : "s"
    }.${relatedSummaries}`,
    treatmentSummary: args.treatmentSummary,
    reviewerGuidance: buildGovernedPositionGuidance({
      title: args.title,
      treatmentSummary: args.treatmentSummary,
      sourceFacts: facts,
      relatedAdjustments,
      authoritySupported,
      reviewerLessons,
      patternGuidance,
    }),
    authorityWorkIdeaIds: Array.from(
      new Set(relatedAdjustments.flatMap((adjustment) => adjustment.authorityWorkIdeaIds))
    ),
    sourceDocumentIds: Array.from(relatedDocumentIds),
    sourceFactIds: Array.from(factIds),
    reviewerOutcomeIds: reviewerOutcomes.map((outcome) => outcome.id),
    reviewerOverrideIds: reviewerOverrides.map((override) => override.id),
    updatedAt:
      Math.max(latestFactUpdate, latestAuthorityUpdate, latestOutcomeUpdate) > 0
        ? new Date(
            Math.max(latestFactUpdate, latestAuthorityUpdate, latestOutcomeUpdate)
          ).toISOString()
        : null,
  };
}

function buildSyntheticGovernedRecords(draft: TinaWorkspaceDraft): TinaTaxPositionRecord[] {
  const carryoverFacts = draft.sourceFacts.filter((fact) => fact.label === "Carryover amount clue");
  const depreciationFacts = draft.sourceFacts.filter(
    (fact) => fact.label === "Asset placed-in-service clue"
  );
  const payrollFacts = draft.sourceFacts.filter(
    (fact) =>
      fact.label === "Payroll clue" || fact.label === "Payroll filing period clue"
  );
  const contractorFacts = draft.sourceFacts.filter(
    (fact) => fact.label === "Contractor clue"
  );
  const salesTaxFacts = draft.sourceFacts.filter(
    (fact) => fact.label === "Sales tax clue"
  );
  const inventoryFacts = draft.sourceFacts.filter(
    (fact) => fact.label === "Inventory clue"
  );
  const ownerFlowFacts = draft.sourceFacts.filter(
    (fact) =>
      fact.label === "Owner draw clue" ||
      fact.label === "Intercompany transfer clue" ||
      fact.label === "Related-party clue"
  );

  return [
    buildGovernedPositionRecord({
      draft,
      id: "tax-position-continuity-review",
      adjustmentId: "continuity-review",
      title: "Carryover continuity review",
      treatmentSummary: "confirm the carryover bridge before current-year numbers are treated as settled",
      summaryPrefix: "Carryover continuity is now tracked as a governed tax position.",
      facts: carryoverFacts,
      relatedAdjustmentKinds: ["carryforward_line", "timing_review"],
    }),
    buildGovernedPositionRecord({
      draft,
      id: "tax-position-depreciation-review",
      adjustmentId: "depreciation-review",
      title: "Depreciation timing review",
      treatmentSummary: "confirm placed-in-service timing before expense totals are treated as final",
      summaryPrefix: "Depreciation timing is now tracked as a governed tax position.",
      facts: depreciationFacts,
      relatedAdjustmentKinds: ["timing_review", "carryforward_line"],
    }),
    buildGovernedPositionRecord({
      draft,
      id: "tax-position-payroll-classification-review",
      adjustmentId: "payroll-classification-review",
      title: "Payroll classification review",
      treatmentSummary: "keep payroll-shaped activity out of generic expense treatment until payroll handling is explicit",
      summaryPrefix: "Payroll activity is now tracked as a governed tax position.",
      facts: payrollFacts,
      relatedAdjustmentKinds: ["payroll_classification", "carryforward_line", "timing_review"],
    }),
    buildGovernedPositionRecord({
      draft,
      id: "tax-position-contractor-classification-review",
      adjustmentId: "contractor-classification-review",
      title: "Contractor classification review",
      treatmentSummary: "keep contractor-shaped activity out of generic expense treatment until contractor handling is explicit",
      summaryPrefix: "Contractor activity is now tracked as a governed tax position.",
      facts: contractorFacts,
      relatedAdjustmentKinds: ["contractor_classification", "carryforward_line", "timing_review"],
    }),
    buildGovernedPositionRecord({
      draft,
      id: "tax-position-sales-tax-review",
      adjustmentId: "sales-tax-review",
      title: "Sales tax exclusion review",
      treatmentSummary: "keep collected sales tax out of gross receipts when liability facts support it",
      summaryPrefix: "Sales-tax activity is now tracked as a governed tax position.",
      facts: salesTaxFacts,
      relatedAdjustmentKinds: ["sales_tax_exclusion", "carryforward_line", "timing_review"],
    }),
    buildGovernedPositionRecord({
      draft,
      id: "tax-position-inventory-review",
      adjustmentId: "inventory-review",
      title: "Inventory treatment review",
      treatmentSummary: "keep inventory-shaped activity out of ordinary expense treatment until COGS handling is explicit",
      summaryPrefix: "Inventory-shaped activity is now tracked as a governed tax position.",
      facts: inventoryFacts,
      relatedAdjustmentKinds: ["inventory_treatment", "carryforward_line", "timing_review"],
    }),
    buildGovernedPositionRecord({
      draft,
      id: "tax-position-owner-flow-review",
      adjustmentId: "owner-flow-review",
      title: "Owner-flow and related-party contamination review",
      treatmentSummary: "separate owner-flow, transfer, and related-party activity from ordinary Schedule C totals before trust",
      summaryPrefix: "Owner-flow and related-party activity is now tracked as a governed tax position.",
      facts: ownerFlowFacts,
      relatedAdjustmentKinds: ["timing_review", "carryforward_line"],
    }),
  ].filter((record): record is TinaTaxPositionRecord => record !== null);
}

export function buildTinaTaxPositionMemory(
  draft: TinaWorkspaceDraft
): TinaTaxPositionMemorySnapshot {
  const now = new Date().toISOString();

  if (draft.taxAdjustments.status !== "complete") {
    return {
      ...createDefaultTinaTaxPositionMemorySnapshot(),
      lastRunAt: now,
      status: draft.taxAdjustments.status === "stale" ? "stale" : "idle",
      summary: "Tina needs tax adjustments before she can build durable tax-position memory.",
      nextStep: "Build tax adjustments first.",
    };
  }

  const syntheticRecords = buildSyntheticGovernedRecords(draft);

  if (draft.taxAdjustments.adjustments.length === 0 && syntheticRecords.length === 0) {
    return {
      ...createDefaultTinaTaxPositionMemorySnapshot(),
      lastRunAt: now,
      status: "idle",
      summary: "Tina has no tax adjustments to turn into tracked positions yet.",
      nextStep: "Carry cleanup lines into tax adjustments first.",
    };
  }

  const records = [
    ...draft.taxAdjustments.adjustments.map((adjustment) => buildRecord(draft, adjustment)),
    ...syntheticRecords,
  ];
  const blockedCount = records.filter((record) => record.status === "blocked").length;
  const reviewCount = records.filter((record) => record.status === "needs_review").length;

  let summary = `Tina mapped ${records.length} tax position${
    records.length === 1 ? "" : "s"
  } to evidence, authority, and reviewer memory.`;
  let nextStep = "Review the saved position register before Tina carries these treatments deeper.";

  if (blockedCount > 0) {
    summary += ` ${blockedCount} position${blockedCount === 1 ? " is" : "s are"} still blocked.`;
    nextStep = "Finish the blocked authority work before trusting these tax positions.";
  } else if (reviewCount > 0) {
    summary += ` ${reviewCount} position${reviewCount === 1 ? " still needs" : "s still need"} reviewer anchoring.`;
    nextStep = "Record reviewer calls or approvals so these positions stop floating between drafts.";
  }

  return {
    lastRunAt: now,
    status: "complete",
    summary,
    nextStep,
    records,
  };
}
