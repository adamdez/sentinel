import type {
  TinaAuthorityWorkItem,
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

function buildRecord(draft: TinaWorkspaceDraft, adjustment: TinaTaxAdjustment): TinaTaxPositionRecord {
  const authorityWork = draft.authorityWork.filter((item) =>
    adjustment.authorityWorkIdeaIds.includes(item.ideaId)
  );
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
  const hasReviewerAnchor =
    adjustment.status === "approved" ||
    adjustment.status === "rejected" ||
    adjustment.reviewerNotes.trim().length > 0 ||
    reviewerOutcomes.length > 0 ||
    reviewerOverrides.length > 0;
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

  if (draft.taxAdjustments.adjustments.length === 0) {
    return {
      ...createDefaultTinaTaxPositionMemorySnapshot(),
      lastRunAt: now,
      status: "idle",
      summary: "Tina has no tax adjustments to turn into tracked positions yet.",
      nextStep: "Carry cleanup lines into tax adjustments first.",
    };
  }

  const records = draft.taxAdjustments.adjustments.map((adjustment) => buildRecord(draft, adjustment));
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
