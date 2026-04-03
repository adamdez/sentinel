import { buildTinaAuthorityTrails } from "@/tina/lib/authority-trails";
import { buildTinaResearchIdeas } from "@/tina/lib/research-ideas";
import type { TinaAppendixItem, TinaAppendixSnapshot, TinaTaxPositionBucket, TinaWorkspaceDraft } from "@/tina/types";

function mapIdeaToBucket(
  idea: ReturnType<typeof buildTinaResearchIdeas>[number]
): TinaTaxPositionBucket {
  switch (idea.decisionBucket) {
    case "authoritative_and_usable":
      return "use";
    case "usable_with_disclosure":
      return "review";
    case "reject":
      return "reject";
    default:
      return idea.id === "fringe-opportunities-scan" ? "reject" : "appendix";
  }
}

export function createDefaultTinaAppendix(): TinaAppendixSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not built the reviewer appendix lane yet.",
    nextStep: "Run Tina's appendix builder once research ideas are available.",
    items: [],
  };
}

export function buildTinaAppendix(draft: TinaWorkspaceDraft): TinaAppendixSnapshot {
  const ideas = buildTinaResearchIdeas(draft);
  const trails = buildTinaAuthorityTrails(draft);
  const trailMap = new Map(trails.map((trail) => [trail.id, trail]));

  const items: TinaAppendixItem[] = ideas
    .map((idea) => {
      const taxPositionBucket = mapIdeaToBucket(idea);
      const trail = trailMap.get(idea.id);
      return {
        id: idea.id,
        title: idea.title,
        summary: idea.summary,
        whyItMatters: idea.whyItMatters,
        taxPositionBucket,
        category: idea.category,
        nextStep: idea.nextStep,
        authoritySummary: trail?.summary ?? "Tina has not built authority notes for this idea yet.",
        reviewerQuestion:
          trail?.reviewerQuestion ?? "What stronger authority or facts would make this usable?",
        disclosureFlag: trail?.disclosureFlag ?? "unknown",
        authorityTargets: trail?.authorityTargets ?? [],
        sourceLabels: idea.sourceLabels,
        factIds: idea.factIds,
        documentIds: idea.documentIds,
      };
    })
    .filter((item) => item.taxPositionBucket === "appendix");

  return {
    lastRunAt: new Date().toISOString(),
    status: "complete",
    summary:
      items.length > 0
        ? `Tina preserved ${items.length} unusual but plausible idea${items.length === 1 ? "" : "s"} for reviewer appendix review.`
        : "Tina does not see any appendix-worthy opportunities right now.",
    nextStep:
      items.length > 0
        ? "Inspect the appendix items and decide which ones deserve deeper authority work."
        : "Keep building the return package and research queue.",
    items,
  };
}
