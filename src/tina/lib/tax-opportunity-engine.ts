import {
  buildTinaAuthorityTrails,
  type TinaAuthorityTrail,
} from "@/tina/lib/authority-trails";
import { buildTinaEvidenceSufficiency } from "@/tina/lib/evidence-sufficiency";
import { buildTinaIndustryPlaybooks } from "@/tina/lib/industry-playbooks";
import { buildTinaResearchIdeas } from "@/tina/lib/research-ideas";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type {
  TinaIndustryPlaybookId,
  TinaTaxOpportunityImpact,
  TinaTaxOpportunityItem,
  TinaTaxOpportunitySnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function impactForIdea(ideaId: string): TinaTaxOpportunityImpact {
  switch (ideaId) {
    case "qbi-review":
    case "self-employed-retirement-review":
    case "fixed-assets-review":
    case "inventory-review":
    case "real-estate-characterization-review":
    case "startup-costs-review":
      return "high";
    case "self-employed-health-insurance-review":
    case "de-minimis-safe-harbor-review":
    case "installment-and-imputed-interest-review":
    case "multistate-review":
    case "wa-state-review":
      return "medium";
    default:
      return "low";
  }
}

function reviewerBurdenForIdea(ideaId: string): TinaTaxOpportunityItem["reviewerBurden"] {
  switch (ideaId) {
    case "multistate-review":
    case "real-estate-characterization-review":
    case "installment-and-imputed-interest-review":
    case "entity-and-filing-path-review":
    case "ownership-transition-review":
    case "former-owner-payment-review":
      return "heavy";
    case "fixed-assets-review":
    case "inventory-review":
    case "worker-classification-review":
    case "owner-flow-characterization-review":
      return "moderate";
    default:
      return "light";
  }
}

function statusForIdea(args: {
  idea: ReturnType<typeof buildTinaResearchIdeas>[number];
  authorityTrail: TinaAuthorityTrail | undefined;
  authorityWork:
    | TinaWorkspaceDraft["authorityWork"][number]
    | undefined;
  evidence: ReturnType<typeof buildTinaEvidenceSufficiency>;
  startPath: ReturnType<typeof buildTinaStartPathAssessment>;
}): TinaTaxOpportunityItem["status"] {
  const { idea, authorityTrail, authorityWork, evidence, startPath } = args;

  if (idea.decisionBucket === "reject" || authorityTrail?.reviewerState === "do_not_use") {
    return "reject";
  }

  if (
    authorityWork?.reviewerDecision === "use_it" &&
    authorityWork.status !== "rejected"
  ) {
    return evidence.overallStatus === "blocked" && idea.category === "deduction"
      ? "needs_facts"
      : "ready_to_pursue";
  }

  if (authorityTrail?.reviewerState === "can_consider") {
    return evidence.overallStatus === "blocked" && idea.category === "deduction"
      ? "needs_facts"
      : "ready_to_pursue";
  }

  if (authorityTrail?.reviewerState === "review_needed") {
    return "review_only";
  }

  if (startPath.route !== "supported" && idea.category !== "continuity") {
    return "review_only";
  }

  if (idea.factIds.length === 0 && idea.documentIds.length === 0) {
    return "needs_facts";
  }

  return "needs_authority";
}

function actionForStatus(
  status: TinaTaxOpportunityItem["status"],
  fallback: string
): string {
  switch (status) {
    case "ready_to_pursue":
      return "Move this into reviewer-facing planning and attach the authority trail.";
    case "needs_authority":
      return "Build authority support before letting this affect the package.";
    case "needs_facts":
      return "Gather stronger facts and support before treating this as actionable.";
    case "review_only":
      return "Keep this visible for reviewer judgment without letting it silently affect the return.";
    case "reject":
      return "Keep this out unless the facts or authority picture changes materially.";
    default:
      return fallback;
  }
}

function industriesForIdea(
  primaryIndustryId: TinaIndustryPlaybookId | null,
  idea: ReturnType<typeof buildTinaResearchIdeas>[number]
): TinaIndustryPlaybookId[] {
  const directMap: Record<string, TinaIndustryPlaybookId[]> = {
    "inventory-review": ["e_commerce_retail", "food_service"],
    "real-estate-characterization-review": ["real_estate"],
    "installment-and-imputed-interest-review": ["real_estate"],
    "fixed-assets-review": ["skilled_trades", "real_estate", "creator_media"],
    "de-minimis-safe-harbor-review": ["skilled_trades", "creator_media", "professional_services"],
    "worker-classification-review": ["professional_services", "skilled_trades", "food_service"],
    "payroll-review": ["food_service", "skilled_trades", "professional_services"],
    "contractor-review": ["professional_services", "skilled_trades", "creator_media"],
  };

  return unique([...(primaryIndustryId ? [primaryIndustryId] : []), ...(directMap[idea.id] ?? [])]);
}

export function buildTinaTaxOpportunityEngine(
  draft: TinaWorkspaceDraft
): TinaTaxOpportunitySnapshot {
  const ideas = buildTinaResearchIdeas(draft);
  const trails = buildTinaAuthorityTrails(draft);
  const trailMap = new Map(trails.map((trail) => [trail.id, trail]));
  const evidence = buildTinaEvidenceSufficiency(draft);
  const startPath = buildTinaStartPathAssessment(draft);
  const industryPlaybooks = buildTinaIndustryPlaybooks(draft);

  const items: TinaTaxOpportunityItem[] = ideas.map((idea) => {
    const authorityTrail = trailMap.get(idea.id);
    const authorityWork = draft.authorityWork.find((item) => item.ideaId === idea.id);
    const status = statusForIdea({
      idea,
      authorityTrail,
      authorityWork,
      evidence,
      startPath,
    });

    return {
      id: idea.id,
      title: idea.title,
      status,
      impact: impactForIdea(idea.id),
      reviewerBurden: reviewerBurdenForIdea(idea.id),
      summary: idea.summary,
      whyItMatters: idea.whyItMatters,
      recommendedAction: actionForStatus(status, idea.nextStep),
      authorityState:
        authorityWork?.reviewerDecision === "use_it"
          ? "can_consider"
          : authorityWork?.reviewerDecision === "do_not_use"
            ? "do_not_use"
            : authorityTrail?.reviewerState ?? "not_ready",
      disclosureFlag:
        authorityWork?.disclosureDecision ?? authorityTrail?.disclosureFlag ?? "not_needed_yet",
      relatedIndustryIds: industriesForIdea(industryPlaybooks.primaryIndustryId, idea),
      sourceLabels: [...idea.sourceLabels],
      relatedFactIds: [...idea.factIds],
      relatedDocumentIds: [...idea.documentIds],
    };
  });

  const readyCount = items.filter((item) => item.status === "ready_to_pursue").length;
  const blockedCount = items.filter((item) => item.status === "reject").length;
  const overallStatus =
    readyCount >= 3
      ? "strong_queue"
      : readyCount > 0 || blockedCount < items.length
        ? "mixed_queue"
        : "thin_queue";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "strong_queue"
        ? `Tina sees ${readyCount} tax opportunities that are close to reviewer-ready pursuit.`
        : overallStatus === "mixed_queue"
          ? "Tina sees a mixed tax-opportunity queue with some usable ideas and some that still need facts or authority."
          : "Tina sees only a thin tax-opportunity queue right now because facts or authority are still too weak.",
    nextStep:
      overallStatus === "strong_queue"
        ? "Move the ready opportunities into reviewer planning and keep weaker ideas visible but contained."
        : "Strengthen facts and authority support so the tax-opportunity queue turns from interesting to usable.",
    items,
  };
}
