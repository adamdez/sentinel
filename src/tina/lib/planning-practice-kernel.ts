import type {
  TinaPlanningActionBoardPriority,
} from "@/tina/lib/acceleration-contracts";
import type {
  TinaMaterialityLevel,
  TinaMaterialityPriorityItem,
  TinaTaxPlanningMemoPriority,
} from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function tokenizePlanningText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 3);
}

export function planningTextOverlap(left: string, right: string): number {
  const leftTokens = new Set(tokenizePlanningText(left));
  const rightTokens = new Set(tokenizePlanningText(right));
  let score = 0;

  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) score += 1;
  });

  return score;
}

export function findBestPlanningTitleMatch<T extends { title: string }>(
  title: string,
  candidates: T[]
): T | null {
  let best: T | null = null;
  let bestScore = 0;

  candidates.forEach((candidate) => {
    const score = planningTextOverlap(title, candidate.title);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });

  return bestScore > 0 ? best : null;
}

function materialityRank(materiality: TinaMaterialityLevel): number {
  return { high: 0, medium: 1, low: 2 }[materiality];
}

function materialityPriorityRank(
  priority: TinaMaterialityPriorityItem["priority"]
): number {
  return { immediate: 0, next: 1, monitor: 2 }[priority];
}

function boardPriorityRank(
  priority: TinaPlanningActionBoardPriority | TinaTaxPlanningMemoPriority
): number {
  return { immediate: 0, now: 0, next: 1, soon: 1, later: 2, monitor: 2 }[priority];
}

function themeForTitle(
  title: string,
  source: TinaMaterialityPriorityItem["source"]
): string {
  const normalized = title.toLowerCase();

  if (/bootstrap review|issue queue|snapshot|signoff|stale/.test(normalized)) {
    return "workflow_governance";
  }

  if (/mixed|personal|owner flow|owner draw|reimbursement/.test(normalized)) {
    return "owner_and_mixed_use";
  }

  if (/payroll|contractor|1099|worker/.test(normalized)) {
    return "worker_payments";
  }

  if (/intercompany|related-party|multi-entity|ein|filing-path|entity boundary/.test(normalized)) {
    return "entity_boundary";
  }

  if (/inventory|cogs/.test(normalized)) {
    return "inventory";
  }

  if (/depreciation|asset|fixed-asset/.test(normalized)) {
    return "fixed_assets";
  }

  if (/sales tax|washington business-tax|wa state|gross receipts/.test(normalized)) {
    return "sales_tax";
  }

  if (/carryover|election/.test(normalized)) {
    return "carryovers";
  }

  if (/evidence|support|credibility/.test(normalized)) {
    return "evidence_support";
  }

  return `${source}:${tokenizePlanningText(title).slice(0, 2).join("_") || "general"}`;
}

function mergeDuplicateMaterialityItems(
  items: TinaMaterialityPriorityItem[]
): TinaMaterialityPriorityItem[] {
  const grouped = new Map<string, TinaMaterialityPriorityItem[]>();

  items.forEach((item) => {
    const key = item.title.trim().toLowerCase();
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  });

  return Array.from(grouped.values()).map((group) => {
    const sorted = [...group].sort((left, right) => {
      return (
        materialityPriorityRank(left.priority) - materialityPriorityRank(right.priority) ||
        materialityRank(left.materiality) - materialityRank(right.materiality) ||
        left.title.localeCompare(right.title)
      );
    });
    const representative = sorted[0];
    const sourceList = unique(sorted.map((item) => item.source));

    return {
      ...representative,
      summary:
        sourceList.length > 1
          ? `${representative.summary} Also flagged by ${sourceList
              .filter((source) => source !== representative.source)
              .join(", ")}.`
          : representative.summary,
      relatedFactIds: unique(sorted.flatMap((item) => item.relatedFactIds)),
      relatedDocumentIds: unique(sorted.flatMap((item) => item.relatedDocumentIds)),
    };
  });
}

export function collapseMaterialityPriorityItems(
  items: TinaMaterialityPriorityItem[],
  maxImmediateItems = 4
): TinaMaterialityPriorityItem[] {
  const deduped = mergeDuplicateMaterialityItems(items);
  const immediateItems = deduped.filter((item) => item.priority === "immediate");

  if (immediateItems.length <= maxImmediateItems) {
    return [...deduped].sort((left, right) => {
      return (
        materialityPriorityRank(left.priority) - materialityPriorityRank(right.priority) ||
        materialityRank(left.materiality) - materialityRank(right.materiality) ||
        left.title.localeCompare(right.title)
      );
    });
  }

  const groupedByTheme = new Map<string, TinaMaterialityPriorityItem[]>();
  immediateItems.forEach((item) => {
    const theme = themeForTitle(item.title, item.source);
    groupedByTheme.set(theme, [...(groupedByTheme.get(theme) ?? []), item]);
  });

  const themeRepresentatives = Array.from(groupedByTheme.values())
    .map((group) =>
      [...group].sort((left, right) => {
        return (
          materialityRank(left.materiality) - materialityRank(right.materiality) ||
          materialityPriorityRank(left.priority) - materialityPriorityRank(right.priority) ||
          left.title.localeCompare(right.title)
        );
      })[0]
    )
    .sort((left, right) => {
      return (
        materialityRank(left.materiality) - materialityRank(right.materiality) ||
        left.title.localeCompare(right.title)
      );
    });

  const keepImmediate = new Set(
    themeRepresentatives.slice(0, maxImmediateItems).map((item) => item.id)
  );

  return deduped
    .map((item) =>
      item.priority === "immediate" && !keepImmediate.has(item.id)
        ? {
            ...item,
            priority: "next" as const,
            summary: `${item.summary} This stays in the next queue because Tina already surfaced a more urgent immediate item in the same problem family.`,
          }
        : item
    )
    .sort((left, right) => {
      return (
        materialityPriorityRank(left.priority) - materialityPriorityRank(right.priority) ||
        materialityRank(left.materiality) - materialityRank(right.materiality) ||
        left.title.localeCompare(right.title)
      );
    });
}

export function isImmediatePlanningPriority(
  priority: TinaPlanningActionBoardPriority | TinaTaxPlanningMemoPriority
): boolean {
  return boardPriorityRank(priority) === 0;
}
