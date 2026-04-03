import type {
  TinaAuthorityPositionAuthorityStrength,
  TinaAuthorityPositionDisclosureReadiness,
  TinaAuthorityPositionFactStrength,
  TinaAuthorityPositionMatrixItem,
  TinaAuthorityPositionMatrixSnapshot,
  TinaAuthorityPositionRecommendation,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAuthorityTrails } from "@/tina/lib/authority-trails";
import { buildTinaEvidenceSufficiency } from "@/tina/lib/evidence-sufficiency";
import { buildTinaTaxOpportunityEngine } from "@/tina/lib/tax-opportunity-engine";
import { buildTinaTreatmentJudgment } from "@/tina/lib/treatment-judgment";
import type { TinaTaxPositionBucket, TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildItem(item: TinaAuthorityPositionMatrixItem): TinaAuthorityPositionMatrixItem {
  return {
    ...item,
    relatedFactIds: unique(item.relatedFactIds),
    relatedDocumentIds: unique(item.relatedDocumentIds),
    relatedAuthorityWorkIdeaIds: unique(item.relatedAuthorityWorkIdeaIds),
  };
}

function factStrengthForLinks(args: {
  relatedFactIds: string[];
  relatedDocumentIds: string[];
  evidence: ReturnType<typeof buildTinaEvidenceSufficiency>;
}): TinaAuthorityPositionFactStrength {
  const { relatedFactIds, relatedDocumentIds, evidence } = args;
  const documentCount = unique(relatedDocumentIds).length;
  const factCount = unique(relatedFactIds).length;

  if (
    (documentCount >= 2 && factCount >= 1) ||
    (documentCount >= 1 && factCount >= 2 && evidence.overallStatus !== "blocked")
  ) {
    return "strong";
  }

  if (documentCount >= 1 && factCount >= 1) return "moderate";
  if (documentCount >= 1 || factCount >= 2) return "moderate";
  if (factCount >= 1) return "thin";
  return "missing";
}

function disclosureReadinessForFlag(
  value: string | null | undefined
): TinaAuthorityPositionDisclosureReadiness {
  switch ((value ?? "").toLowerCase()) {
    case "required":
    case "likely_needed":
      return "required";
    case "needs_review":
    case "review_if_supported":
    case "unknown":
      return "needs_review";
    case "not_needed":
    case "not_needed_yet":
      return "clear";
    case "not_applicable":
      return "not_applicable";
    default:
      return "needs_review";
  }
}

function authorityStrengthForWork(args: {
  draft: TinaWorkspaceDraft;
  ideaIds: string[];
  fallbackTrailId?: string | null;
  appendixAuthoritySummary?: string | null;
}): TinaAuthorityPositionAuthorityStrength {
  const trails = buildTinaAuthorityTrails(args.draft);
  const trailMap = new Map(trails.map((trail) => [trail.id, trail]));
  const workItems = args.ideaIds
    .map((ideaId) => args.draft.authorityWork.find((item) => item.ideaId === ideaId))
    .filter(Boolean);
  const trailIds = unique([
    ...args.ideaIds,
    ...(args.fallbackTrailId ? [args.fallbackTrailId] : []),
  ]);
  const linkedTrails = trailIds.map((id) => trailMap.get(id)).filter(Boolean);

  if (workItems.some((item) => item?.reviewerDecision === "use_it" && item.status !== "rejected")) {
    return "reviewer_backed";
  }

  if (
    linkedTrails.some(
      (trail) => trail?.reviewerState === "can_consider" || trail?.reviewerState === "review_needed"
    )
  ) {
    return "trail_supported";
  }

  if (args.appendixAuthoritySummary?.trim() || args.ideaIds.length > 0 || linkedTrails.length > 0) {
    return "thin";
  }

  return "missing";
}

function priorityForPosition(args: {
  title: string;
  recommendation: TinaAuthorityPositionRecommendation;
}): "immediate" | "next" | "later" {
  if (args.recommendation === "reject") return "immediate";
  if (
    args.recommendation === "hold_for_authority" ||
    args.recommendation === "hold_for_facts" ||
    args.recommendation === "review_first"
  ) {
    const normalizedTitle = args.title.toLowerCase();
    if (
      normalizedTitle.includes("owner") ||
      normalizedTitle.includes("mixed") ||
      normalizedTitle.includes("sales tax") ||
      normalizedTitle.includes("inventory") ||
      normalizedTitle.includes("depreciation")
    ) {
      return "immediate";
    }
    return "next";
  }
  return "later";
}

function recommendationForOpportunity(args: {
  status: ReturnType<typeof buildTinaTaxOpportunityEngine>["items"][number]["status"];
  authorityStrength: TinaAuthorityPositionAuthorityStrength;
  factStrength: TinaAuthorityPositionFactStrength;
  disclosureReadiness: TinaAuthorityPositionDisclosureReadiness;
}): TinaAuthorityPositionRecommendation {
  if (args.status === "reject") return "reject";
  if (args.status === "needs_authority") return "hold_for_authority";
  if (args.status === "needs_facts") return "hold_for_facts";
  if (args.status === "review_only") return "review_first";

  if (
    args.authorityStrength === "reviewer_backed" &&
    (args.factStrength === "strong" || args.factStrength === "moderate") &&
    (args.disclosureReadiness === "clear" || args.disclosureReadiness === "not_applicable")
  ) {
    return "use_now";
  }

  return "review_first";
}

function recommendationForTreatment(args: {
  bucket: TinaTaxPositionBucket;
  factStrength: TinaAuthorityPositionFactStrength;
  disclosureReadiness: TinaAuthorityPositionDisclosureReadiness;
}): TinaAuthorityPositionRecommendation {
  if (args.bucket === "reject") return "reject";
  if (args.bucket === "appendix") return "appendix_only";
  if (args.bucket === "review") return "review_first";

  if (
    args.factStrength === "strong" &&
    (args.disclosureReadiness === "clear" || args.disclosureReadiness === "not_applicable")
  ) {
    return "use_now";
  }

  return "review_first";
}

function recommendationForAppendix(args: {
  authorityStrength: TinaAuthorityPositionAuthorityStrength;
  factStrength: TinaAuthorityPositionFactStrength;
}): TinaAuthorityPositionRecommendation {
  if (args.authorityStrength === "missing" && args.factStrength === "missing") {
    return "hold_for_facts";
  }

  return "appendix_only";
}

function reviewerActionForRecommendation(
  recommendation: TinaAuthorityPositionRecommendation
): string {
  switch (recommendation) {
    case "use_now":
      return "Lock the treatment into the reviewer package and preserve the support trail.";
    case "review_first":
      return "Keep this in reviewer control until authority, facts, and disclosure posture are confirmed.";
    case "appendix_only":
      return "Preserve this in appendix without letting it silently affect the return.";
    case "hold_for_authority":
      return "Build authority support before Tina treats this as reviewer-usable.";
    case "hold_for_facts":
      return "Gather stronger records and fact support before Tina treats this as real.";
    case "reject":
      return "Keep this out unless the facts or law change materially.";
    default:
      return "Keep reviewer control on this position.";
  }
}

function ownerActionForRecommendation(
  recommendation: TinaAuthorityPositionRecommendation
): string {
  switch (recommendation) {
    case "hold_for_facts":
      return "Upload the missing records or answer the fact questions Tina still needs.";
    case "use_now":
      return "Be ready to confirm the business facts and documentation behind this position.";
    case "review_first":
      return "No owner move yet unless Tina asks for additional support.";
    case "appendix_only":
      return "No owner action yet unless the reviewer wants more support.";
    case "hold_for_authority":
      return "No owner action yet unless Tina asks for source documents tied to authority support.";
    case "reject":
      return "No owner action. Tina should keep this out for now.";
    default:
      return "No owner action yet.";
  }
}

export function buildTinaAuthorityPositionMatrix(
  draft: TinaWorkspaceDraft
): TinaAuthorityPositionMatrixSnapshot {
  const evidence = buildTinaEvidenceSufficiency(draft);
  const opportunityEngine = buildTinaTaxOpportunityEngine(draft);
  const treatmentJudgment = buildTinaTreatmentJudgment(draft);
  const items: TinaAuthorityPositionMatrixItem[] = [];

  opportunityEngine.items.forEach((item) => {
    const authorityStrength = authorityStrengthForWork({
      draft,
      ideaIds: [item.id],
    });
    let factStrength = factStrengthForLinks({
      relatedFactIds: item.relatedFactIds,
      relatedDocumentIds: item.relatedDocumentIds,
      evidence,
    });
    if (
      factStrength === "missing" &&
      item.status === "ready_to_pursue" &&
      (authorityStrength === "reviewer_backed" || authorityStrength === "trail_supported") &&
      evidence.overallStatus !== "blocked"
    ) {
      factStrength = "moderate";
    }
    const disclosureReadiness = disclosureReadinessForFlag(item.disclosureFlag);
    const recommendation = recommendationForOpportunity({
      status: item.status,
      authorityStrength,
      factStrength,
      disclosureReadiness,
    });

    items.push(
      buildItem({
        id: `opportunity-${item.id}`,
        sourceType: "tax_opportunity",
        title: item.title,
        recommendedBucket:
          item.status === "reject"
            ? "reject"
            : item.status === "ready_to_pursue"
              ? "use"
              : "review",
        recommendation,
        authorityStrength,
        factStrength,
        disclosureReadiness,
        priority: priorityForPosition({
          title: item.title,
          recommendation,
        }),
        summary: item.summary,
        whyItMatters: item.whyItMatters,
        reviewerAction: reviewerActionForRecommendation(recommendation),
        ownerAction: ownerActionForRecommendation(recommendation),
        relatedFactIds: item.relatedFactIds,
        relatedDocumentIds: item.relatedDocumentIds,
        relatedAuthorityWorkIdeaIds: [item.id],
      })
    );
  });

  treatmentJudgment.items.forEach((item) => {
    const authorityStrength = authorityStrengthForWork({
      draft,
      ideaIds: item.authorityWorkIdeaIds,
    });
    const factStrength = factStrengthForLinks({
      relatedFactIds: item.relatedFactIds,
      relatedDocumentIds: item.relatedDocumentIds,
      evidence,
    });
    const disclosureReadiness =
      item.taxPositionBucket === "use" ? "clear" : "not_applicable";
    const recommendation = recommendationForTreatment({
      bucket: item.taxPositionBucket,
      factStrength,
      disclosureReadiness,
    });

    items.push(
      buildItem({
        id: `treatment-${item.id}`,
        sourceType: "treatment_judgment",
        title: item.title,
        recommendedBucket: item.taxPositionBucket,
        recommendation,
        authorityStrength,
        factStrength,
        disclosureReadiness,
        priority: priorityForPosition({
          title: item.title,
          recommendation,
        }),
        summary: item.summary,
        whyItMatters: item.suggestedTreatment,
        reviewerAction: reviewerActionForRecommendation(recommendation),
        ownerAction: ownerActionForRecommendation(recommendation),
        relatedFactIds: item.relatedFactIds,
        relatedDocumentIds: item.relatedDocumentIds,
        relatedAuthorityWorkIdeaIds: item.authorityWorkIdeaIds,
      })
    );
  });

  draft.appendix.items.forEach((item) => {
    const authorityStrength = authorityStrengthForWork({
      draft,
      ideaIds: [],
      appendixAuthoritySummary: item.authoritySummary,
    });
    const factStrength = factStrengthForLinks({
      relatedFactIds: item.factIds,
      relatedDocumentIds: item.documentIds,
      evidence,
    });
    const disclosureReadiness = disclosureReadinessForFlag(item.disclosureFlag);
    const recommendation = recommendationForAppendix({
      authorityStrength,
      factStrength,
    });

    items.push(
      buildItem({
        id: `appendix-${item.id}`,
        sourceType: "appendix_item",
        title: item.title,
        recommendedBucket: "appendix",
        recommendation,
        authorityStrength,
        factStrength,
        disclosureReadiness,
        priority: priorityForPosition({
          title: item.title,
          recommendation,
        }),
        summary: item.summary,
        whyItMatters: item.whyItMatters,
        reviewerAction: reviewerActionForRecommendation(recommendation),
        ownerAction: ownerActionForRecommendation(recommendation),
        relatedFactIds: item.factIds,
        relatedDocumentIds: item.documentIds,
        relatedAuthorityWorkIdeaIds: [],
      })
    );
  });

  const dedupedItems = items.filter(
    (item, index) => items.findIndex((candidate) => candidate.id === item.id) === index
  );
  const useNowCount = dedupedItems.filter((item) => item.recommendation === "use_now").length;
  const holdCount = dedupedItems.filter(
    (item) =>
      item.recommendation === "hold_for_authority" || item.recommendation === "hold_for_facts"
  ).length;
  const overallStatus =
    useNowCount >= 2
      ? "actionable"
      : dedupedItems.length > 0 && holdCount < dedupedItems.length
        ? "mixed"
        : "thin";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "actionable"
        ? `Tina sees ${useNowCount} authority-backed position${useNowCount === 1 ? "" : "s"} that are close to reviewer-usable now.`
        : overallStatus === "mixed"
          ? "Tina has a mixed authority-backed position matrix with some usable moves and some that still need facts, authority, or reviewer gating."
          : "Tina's authority-backed position matrix is still thin because most positions still need stronger law or facts.",
    nextStep:
      overallStatus === "actionable"
        ? "Move the strongest positions into reviewer-facing planning and keep weaker ones contained."
        : "Use this matrix to decide which positions need more law, more facts, or stronger reviewer control.",
    items: dedupedItems,
  };
}
