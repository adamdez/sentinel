import { buildTinaResearchIdeas } from "@/tina/lib/research-ideas";
import { buildTinaAuthorityTrails } from "@/tina/lib/authority-trails";
import type {
  TinaAppendixItem,
  TinaAppendixSnapshot,
  TinaTaxPositionBucket,
  TinaWorkspaceDraft,
} from "@/tina/types";

function mapIdeaToTaxPositionBucket(idea: ReturnType<typeof buildTinaResearchIdeas>[number]): TinaTaxPositionBucket {
  switch (idea.decisionBucket) {
    case "authoritative_and_usable":
      return "use";
    case "usable_with_disclosure":
      return "review";
    case "reject":
      return "reject";
    case "interesting_but_unsupported":
    default: {
      const hasFactTie = idea.factIds.length > 0 || idea.documentIds.length > 0;
      const hasGrounding = idea.sourceLabels.some((label) => label.trim().length > 0);
      const isSpecificEnough = idea.id !== "fringe-opportunities-scan";
      return hasGrounding && isSpecificEnough && (hasFactTie || idea.category === "continuity")
        ? "appendix"
        : "reject";
    }
  }
}

function toAppendixItem(
  idea: ReturnType<typeof buildTinaResearchIdeas>[number],
  authorityTrail: ReturnType<typeof buildTinaAuthorityTrails>[number] | null,
  taxPositionBucket: TinaTaxPositionBucket
): TinaAppendixItem {
  return {
    id: idea.id,
    title: idea.title,
    summary: idea.summary,
    whyItMatters: idea.whyItMatters,
    taxPositionBucket,
    category: idea.category,
    nextStep: idea.nextStep,
    authoritySummary: authorityTrail?.summary ?? "Tina has not built an authority summary yet.",
    reviewerQuestion:
      authorityTrail?.reviewerQuestion ?? "What would make this idea safe enough to consider?",
    disclosureFlag: authorityTrail?.disclosureFlag ?? "not_needed_yet",
    authorityTargets: authorityTrail?.authorityTargets ?? [],
    sourceLabels: idea.sourceLabels,
    factIds: idea.factIds,
    documentIds: idea.documentIds,
  };
}

export function createDefaultTinaAppendix(): TinaAppendixSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not built the reviewer appendix lane yet.",
    nextStep: "Run Tina's appendix builder once the research queue is available.",
    items: [],
  };
}

export function buildTinaAppendix(draft: TinaWorkspaceDraft): TinaAppendixSnapshot {
  const ideas = buildTinaResearchIdeas(draft);
  const authorityTrails = buildTinaAuthorityTrails(draft);
  const authorityTrailMap = new Map(authorityTrails.map((trail) => [trail.id, trail]));
  const items = ideas
    .map((idea) => {
      const taxPositionBucket = mapIdeaToTaxPositionBucket(idea);
      return toAppendixItem(idea, authorityTrailMap.get(idea.id) ?? null, taxPositionBucket);
    })
    .filter((item) => item.taxPositionBucket === "appendix");

  const reviewCount = ideas.filter((idea) => mapIdeaToTaxPositionBucket(idea) === "review").length;
  const rejectCount = ideas.filter((idea) => mapIdeaToTaxPositionBucket(idea) === "reject").length;

  let summary = "Tina does not see any appendix-worthy opportunities right now.";
  let nextStep = "Keep building the return package and research queue.";

  if (items.length > 0) {
    summary = `Tina preserved ${items.length} unusual but plausible idea${items.length === 1 ? "" : "s"} for reviewer appendix review.`;
    nextStep =
      reviewCount > 0
        ? "Review the stronger review-bucket ideas first, then inspect the appendix for uncommon but plausible upside."
        : "Inspect the appendix items and decide whether any deserve deeper authority work.";
  } else if (reviewCount > 0) {
    summary =
      "Tina does not have appendix items yet, but she does have review-bucket tax ideas that need stronger support or human judgment.";
    nextStep = "Work the review-bucket ideas first before adding anything to the appendix.";
  } else if (rejectCount > 0) {
    summary =
      "Tina filtered out weak or generic idea leads instead of letting them clutter the reviewer appendix.";
    nextStep = "Keep the appendix clean and wait for better fact-tied opportunities.";
  }

  return {
    lastRunAt: new Date().toISOString(),
    status: "complete",
    summary,
    nextStep,
    items,
  };
}
