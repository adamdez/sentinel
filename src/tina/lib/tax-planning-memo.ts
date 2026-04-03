import { buildTinaIndustryPlaybooks } from "@/tina/lib/industry-playbooks";
import { buildTinaMaterialityPriority } from "@/tina/lib/materiality-priority";
import { buildTinaTaxOpportunityEngine } from "@/tina/lib/tax-opportunity-engine";
import type {
  TinaIndustryPlaybookId,
  TinaTaxPlanningMemoItem,
  TinaTaxPlanningMemoPriority,
  TinaTaxPlanningMemoSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function priorityForItem(item: ReturnType<typeof buildTinaTaxOpportunityEngine>["items"][number]): TinaTaxPlanningMemoPriority {
  if (item.status === "ready_to_pursue" && item.impact === "high") return "now";
  if (item.status === "ready_to_pursue" || item.impact === "high") return "soon";
  return "later";
}

function buildDocumentationNeeds(
  primaryIndustryId: TinaIndustryPlaybookId | null,
  item: ReturnType<typeof buildTinaTaxOpportunityEngine>["items"][number],
  playbookMap: Map<TinaIndustryPlaybookId, ReturnType<typeof buildTinaIndustryPlaybooks>["items"][number]>
): string[] {
  const ids = item.relatedIndustryIds.length > 0 ? item.relatedIndustryIds : primaryIndustryId ? [primaryIndustryId] : [];
  const playbookNeeds = ids.flatMap((id) => playbookMap.get(id)?.requiredRecords.slice(0, 2) ?? []);
  const statusNeeds =
    item.status === "needs_authority"
      ? ["Primary or high-quality authority support for the position."]
      : item.status === "needs_facts"
        ? ["Stronger fact support tied directly to the client file."]
        : item.status === "review_only"
          ? ["Reviewer judgment memo explaining why this should stay out of the return by default."]
          : [];
  return unique([...playbookNeeds, ...statusNeeds]).slice(0, 4);
}

function sortItems(left: TinaTaxPlanningMemoItem, right: TinaTaxPlanningMemoItem): number {
  const priorityScore: Record<TinaTaxPlanningMemoPriority, number> = { now: 0, soon: 1, later: 2 };
  const impactScore = { high: 0, medium: 1, low: 2 };
  return (
    priorityScore[left.priority] - priorityScore[right.priority] ||
    impactScore[left.impact] - impactScore[right.impact] ||
    left.title.localeCompare(right.title)
  );
}

export function buildTinaTaxPlanningMemo(
  draft: TinaWorkspaceDraft
): TinaTaxPlanningMemoSnapshot {
  const opportunityEngine = buildTinaTaxOpportunityEngine(draft);
  const materialityPriority = buildTinaMaterialityPriority(draft);
  const industryPlaybooks = buildTinaIndustryPlaybooks(draft);
  const playbookMap = new Map(industryPlaybooks.items.map((item) => [item.id, item]));

  const items: TinaTaxPlanningMemoItem[] = opportunityEngine.items
    .filter((item) => item.status !== "reject")
    .map((item) => {
      const priority = priorityForItem(item);
      const matchingMateriality = materialityPriority.items.find((priorityItem) =>
        priorityItem.title.toLowerCase().includes(item.title.toLowerCase().split(" ")[0])
      );

      return {
        id: item.id,
        title: item.title,
        priority,
        status: item.status,
        impact: item.impact,
        summary: item.summary,
        whyNow:
          matchingMateriality?.summary ??
          (priority === "now"
            ? "This looks material enough to move now if Tina can support it."
            : priority === "soon"
              ? "This can matter meaningfully, but it still needs support before Tina should push it."
              : "This is worth keeping visible, but it is not the first move in the file."),
        reviewerAction:
          item.status === "ready_to_pursue"
            ? "Review support, decide if it belongs in use, and lock the treatment into the package."
            : item.status === "needs_authority"
              ? "Strengthen authority before allowing this to affect the return."
              : item.status === "needs_facts"
                ? "Gather the missing fact support before reviewer use."
                : "Keep this visible for reviewer discussion without moving it into the return by default.",
        ownerAction:
          item.status === "needs_facts"
            ? "Upload the missing records or answer the open fact questions."
            : item.status === "ready_to_pursue"
              ? "Be ready to confirm the business facts behind this tax-saving move."
              : "No owner action yet unless Tina asks for more support.",
        documentationNeeds: buildDocumentationNeeds(
          industryPlaybooks.primaryIndustryId,
          item,
          playbookMap
        ),
        relatedIndustryIds: [...item.relatedIndustryIds],
        relatedDocumentIds: [...item.relatedDocumentIds],
      };
    })
    .sort(sortItems);

  const actionableCount = items.filter((item) => item.priority === "now").length;
  const overallStatus =
    actionableCount >= 2
      ? "actionable"
      : items.length > 0
        ? "mixed"
        : "thin";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "actionable"
        ? `Tina has ${actionableCount} tax-planning move${actionableCount === 1 ? "" : "s"} that are ready to prioritize now.`
        : overallStatus === "mixed"
          ? "Tina has a planning queue, but some of the highest-value moves still need facts or authority."
          : "Tina does not yet have a strong planning memo because the opportunity queue is still thin.",
    nextStep:
      overallStatus === "actionable"
        ? "Move the highest-priority planning items into reviewer discussion before the final package is frozen."
        : "Strengthen facts and authority so the planning memo shifts from interesting to actionable.",
    items,
  };
}
