import type {
  TinaPlanningActionBoardItem,
  TinaPlanningActionBoardSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import { buildTinaMaterialityPriority } from "@/tina/lib/materiality-priority";
import { buildTinaReviewerAcceptanceForecast } from "@/tina/lib/reviewer-acceptance-forecast";
import { buildTinaTaxPlanningMemo } from "@/tina/lib/tax-planning-memo";
import type { TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length >= 4);
}

function overlapScore(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  let score = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) score += 1;
  });
  return score;
}

function findBestMatch<T extends { title: string }>(title: string, candidates: T[]): T | null {
  let best: T | null = null;
  let bestScore = 0;

  candidates.forEach((candidate) => {
    const score = overlapScore(title, candidate.title);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  });

  return bestScore > 0 ? best : null;
}

function buildItem(item: TinaPlanningActionBoardItem): TinaPlanningActionBoardItem {
  return {
    ...item,
    relatedPositionIds: unique(item.relatedPositionIds),
    relatedDocumentIds: unique(item.relatedDocumentIds),
  };
}

export function buildTinaPlanningActionBoard(
  draft: TinaWorkspaceDraft
): TinaPlanningActionBoardSnapshot {
  const authorityMatrix = buildTinaAuthorityPositionMatrix(draft);
  const planningMemo = buildTinaTaxPlanningMemo(draft);
  const acceptanceForecast = buildTinaReviewerAcceptanceForecast(draft);
  const materialityPriority = buildTinaMaterialityPriority(draft);

  const items: TinaPlanningActionBoardItem[] = authorityMatrix.items.map((position) => {
    const planningItem = findBestMatch(position.title, planningMemo.items);
    const acceptanceItem = findBestMatch(position.title, acceptanceForecast.items);
    const materialityItem = findBestMatch(position.title, materialityPriority.items);

    let status: TinaPlanningActionBoardItem["status"] = "review";
    if (position.recommendation === "reject" || acceptanceItem?.status === "likely_reject") {
      status = "reject";
    } else if (
      position.recommendation === "hold_for_authority" ||
      position.recommendation === "hold_for_facts"
    ) {
      status = "hold";
    } else if (
      position.recommendation === "use_now" &&
      (acceptanceItem?.status === "likely_accept" || !acceptanceItem) &&
      (position.disclosureReadiness === "clear" || position.disclosureReadiness === "not_applicable")
    ) {
      status = "advance";
    }

    const priority: TinaPlanningActionBoardItem["priority"] =
      planningItem?.priority === "now" || materialityItem?.priority === "immediate"
        ? "immediate"
        : planningItem?.priority === "soon" || materialityItem?.priority === "next"
          ? "next"
          : "later";

    return buildItem({
      id: position.id,
      title: position.title,
      status,
      priority,
      summary: planningItem?.summary ?? position.summary,
      whyNow: planningItem?.whyNow ?? materialityItem?.summary ?? position.whyItMatters,
      authorityStrength: position.authorityStrength,
      factStrength: position.factStrength,
      disclosureReadiness: position.disclosureReadiness,
      reviewerAcceptance: acceptanceItem?.status ?? "unknown",
      reviewerAction: planningItem?.reviewerAction ?? position.reviewerAction,
      ownerAction: planningItem?.ownerAction ?? position.ownerAction,
      relatedPositionIds: [position.id],
      relatedDocumentIds: unique([
        ...position.relatedDocumentIds,
        ...(planningItem?.relatedDocumentIds ?? []),
        ...(acceptanceItem?.relatedDocumentIds ?? []),
      ]),
    });
  });

  const dedupedItems = items.filter(
    (item, index) => items.findIndex((candidate) => candidate.title === item.title) === index
  );
  dedupedItems.sort((left, right) => {
    const priorityScore = { immediate: 0, next: 1, later: 2 };
    const statusScore = { advance: 0, review: 1, hold: 2, reject: 3 };
    return (
      priorityScore[left.priority] - priorityScore[right.priority] ||
      statusScore[left.status] - statusScore[right.status] ||
      left.title.localeCompare(right.title)
    );
  });

  const actionableCount = dedupedItems.filter((item) => item.status === "advance").length;
  const mixedCount = dedupedItems.filter(
    (item) => item.status === "review" || item.status === "hold"
  ).length;
  const overallStatus =
    actionableCount >= 2 ? "actionable" : actionableCount > 0 || mixedCount > 0 ? "mixed" : "thin";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "actionable"
        ? `Tina has ${actionableCount} planning move${actionableCount === 1 ? "" : "s"} that are close to reviewer-ready now.`
        : overallStatus === "mixed"
          ? "Tina has a ranked planning board, but most moves still need review or stronger support."
          : "Tina's planning board is still thin because too few positions are ready to advance.",
    nextStep:
      overallStatus === "actionable"
        ? "Push the highest-ranked moves into reviewer conversation before the package freezes."
        : "Use the board to decide which moves to advance, which to hold, and which to keep out.",
    items: dedupedItems,
  };
}
