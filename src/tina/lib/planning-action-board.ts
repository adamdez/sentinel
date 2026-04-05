import type {
  TinaPlanningActionBoardItem,
  TinaPlanningActionBoardSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import { buildTinaMaterialityPriority } from "@/tina/lib/materiality-priority";
import { findBestPlanningTitleMatch } from "@/tina/lib/planning-practice-kernel";
import { buildTinaReviewerAcceptanceForecast } from "@/tina/lib/reviewer-acceptance-forecast";
import { buildTinaTaxPlanningMemo } from "@/tina/lib/tax-planning-memo";
import type { TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildItem(item: TinaPlanningActionBoardItem): TinaPlanningActionBoardItem {
  return {
    ...item,
    relatedPositionIds: unique(item.relatedPositionIds),
    relatedDocumentIds: unique(item.relatedDocumentIds),
  };
}

function shouldAdvancePosition(args: {
  recommendation: ReturnType<typeof buildTinaAuthorityPositionMatrix>["items"][number]["recommendation"];
  planningItem: ReturnType<typeof buildTinaTaxPlanningMemo>["items"][number] | null;
  acceptanceStatus: ReturnType<typeof buildTinaReviewerAcceptanceForecast>["items"][number]["status"] | "unknown";
  immediatePressureCount: number;
  factStrength: ReturnType<typeof buildTinaAuthorityPositionMatrix>["items"][number]["factStrength"];
  authorityStrength: ReturnType<typeof buildTinaAuthorityPositionMatrix>["items"][number]["authorityStrength"];
  disclosureReadiness: ReturnType<typeof buildTinaAuthorityPositionMatrix>["items"][number]["disclosureReadiness"];
}): boolean {
  const {
    recommendation,
    planningItem,
    acceptanceStatus,
    immediatePressureCount,
    factStrength,
    authorityStrength,
    disclosureReadiness,
  } = args;

  if (recommendation === "reject") return false;

  if (
    recommendation === "use_now" &&
    disclosureReadiness !== "required" &&
    acceptanceStatus !== "likely_reject"
  ) {
    return true;
  }

  if (!planningItem) return false;

  if (
    recommendation === "hold_for_authority" &&
    immediatePressureCount === 0 &&
    planningItem.priority !== "later" &&
    factStrength !== "missing" &&
    authorityStrength !== "missing"
  ) {
    return true;
  }

  if (
    recommendation === "hold_for_facts" &&
    planningItem.priority === "now" &&
    immediatePressureCount <= 1 &&
    (authorityStrength === "reviewer_backed" || authorityStrength === "trail_supported")
  ) {
    return true;
  }

  if (
    recommendation === "review_first" &&
    planningItem.priority === "now" &&
    acceptanceStatus === "likely_accept" &&
    disclosureReadiness !== "required"
  ) {
    return true;
  }

  return false;
}

export function buildTinaPlanningActionBoard(
  draft: TinaWorkspaceDraft
): TinaPlanningActionBoardSnapshot {
  const authorityMatrix = buildTinaAuthorityPositionMatrix(draft);
  const planningMemo = buildTinaTaxPlanningMemo(draft);
  const acceptanceForecast = buildTinaReviewerAcceptanceForecast(draft);
  const materialityPriority = buildTinaMaterialityPriority(draft);
  const immediatePressureCount = materialityPriority.items.filter(
    (item) => item.priority === "immediate"
  ).length;

  const items: TinaPlanningActionBoardItem[] = authorityMatrix.items.map((position) => {
    const planningItem = findBestPlanningTitleMatch(position.title, planningMemo.items);
    const acceptanceItem = findBestPlanningTitleMatch(position.title, acceptanceForecast.items);
    const materialityItem = findBestPlanningTitleMatch(position.title, materialityPriority.items);

    const shouldAdvance = shouldAdvancePosition({
      recommendation: position.recommendation,
      planningItem,
      acceptanceStatus: acceptanceItem?.status ?? "unknown",
      immediatePressureCount,
      factStrength: position.factStrength,
      authorityStrength: position.authorityStrength,
      disclosureReadiness: position.disclosureReadiness,
    });

    let status: TinaPlanningActionBoardItem["status"] = "review";
    if (position.recommendation === "reject") {
      status = "reject";
    } else if (shouldAdvance) {
      status = "advance";
    } else if (
      position.recommendation === "hold_for_authority" ||
      position.recommendation === "hold_for_facts" ||
      position.recommendation === "appendix_only"
    ) {
      status = "hold";
    } else if (
      position.recommendation === "review_first" &&
      acceptanceItem?.status === "likely_reject"
    ) {
      status = "hold";
    } else if (
      position.recommendation === "use_now" &&
      acceptanceItem?.status === "likely_reject"
    ) {
      status = "review";
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
    actionableCount >= 1 ? "actionable" : actionableCount > 0 || mixedCount > 0 ? "mixed" : "thin";

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
