import { buildTinaChecklist } from "@/tina/lib/checklist";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { buildTinaScheduleCScenarioProfile } from "@/tina/lib/schedule-c-scenario-profile";
import type {
  TinaChecklistItem,
  TinaFilingLaneId,
  TinaFilingLaneSupport,
  TinaWorkspaceDraft,
} from "@/tina/types";

export type TinaClientIntakeReviewStatus = "blocked" | "needs_input" | "ready";

export interface TinaClientIntakeReviewItem {
  id: string;
  title: string;
  summary: string;
}

export interface TinaClientIntakeReviewReport {
  status: TinaClientIntakeReviewStatus;
  summary: string;
  nextStep: string;
  laneTitle: string;
  laneSupport: TinaFilingLaneSupport;
  likelyLaneByDocuments: TinaFilingLaneId | "mixed" | "unknown";
  safeForCurrentLane: boolean;
  blockers: TinaClientIntakeReviewItem[];
  missingRequired: TinaChecklistItem[];
  missingRecommended: TinaChecklistItem[];
  messySignals: TinaClientIntakeReviewItem[];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function inferHintLane(value: string): TinaFilingLaneId | null {
  const normalized = normalize(value);
  if (
    normalized.includes("1120") ||
    normalized.includes("s corp") ||
    normalized.includes("s corp")
  ) {
    return "1120_s";
  }
  if (
    normalized.includes("1065") ||
    normalized.includes("partnership") ||
    normalized.includes("multi member")
  ) {
    return "1065";
  }
  if (
    normalized.includes("schedule c") ||
    normalized.includes("1040") ||
    normalized.includes("sole prop") ||
    normalized.includes("single member") ||
    normalized.includes("disregarded")
  ) {
    return "schedule_c_single_member_llc";
  }
  return null;
}

function describeLane(lane: TinaFilingLaneId | "mixed" | "unknown"): string {
  switch (lane) {
    case "schedule_c_single_member_llc":
      return "Schedule C / single-member LLC";
    case "1120_s":
      return "1120-S / S-corp";
    case "1065":
      return "1065 / partnership";
    case "mixed":
      return "Mixed lane clues";
    default:
      return "Needs lane confirmation";
  }
}

function inferLikelyLaneByDocuments(draft: TinaWorkspaceDraft): TinaFilingLaneId | "mixed" | "unknown" {
  const hinted = Array.from(
    new Set(
      draft.sourceFacts
        .filter((fact) => normalize(fact.label) === "return type hint")
        .map((fact) => inferHintLane(fact.value))
        .filter((lane): lane is TinaFilingLaneId => lane !== null)
    )
  );

  if (hinted.length === 0) return "unknown";
  if (hinted.length === 1) return hinted[0];
  return "mixed";
}

function toIssueItem(id: string, title: string, summary: string): TinaClientIntakeReviewItem {
  return { id, title, summary };
}

export function buildTinaClientIntakeReviewReport(
  draft: TinaWorkspaceDraft
): TinaClientIntakeReviewReport {
  const laneRecommendation = recommendTinaFilingLane(draft.profile);
  const checklist = buildTinaChecklist(draft, laneRecommendation);
  const likelyLaneByDocuments = inferLikelyLaneByDocuments(draft);
  const scenarioProfile = buildTinaScheduleCScenarioProfile(draft);

  const missingRequired = checklist.filter(
    (item) => item.priority === "required" && item.status === "needed"
  );
  const missingRecommended = checklist.filter(
    (item) => item.priority === "recommended" && item.status === "needed"
  );

  const blockers: TinaClientIntakeReviewItem[] = [];

  if (laneRecommendation.support !== "supported") {
    blockers.push(
      toIssueItem(
        "intake-lane-support",
        "Current packet points outside Tina's supported lane",
        `${describeLane(
          likelyLaneByDocuments === "unknown" ? laneRecommendation.laneId : likelyLaneByDocuments
        )} is not a fully supported finish lane in this branch yet. Tina can organize the packet, but a human should confirm the lane before relying on Schedule C outputs.`
      )
    );
  }

  if (
    likelyLaneByDocuments !== "unknown" &&
    likelyLaneByDocuments !== "mixed" &&
    laneRecommendation.laneId !== "unknown" &&
    likelyLaneByDocuments !== laneRecommendation.laneId
  ) {
    blockers.push(
      toIssueItem(
        "intake-lane-conflict",
        "Organizer lane and document lane do not match",
        `The saved papers look like ${describeLane(
          likelyLaneByDocuments
        )}, but the current profile points to ${describeLane(laneRecommendation.laneId)}.`
      )
    );
  }

  missingRequired.slice(0, 4).forEach((item) => {
    blockers.push(
      toIssueItem(
        `missing-${item.id}`,
        `Missing required intake: ${item.label}`,
        item.reason
      )
    );
  });

  const openConflictItems = [...draft.bootstrapReview.items, ...draft.issueQueue.items]
    .filter((item) => item.status === "open")
    .filter((item) => item.severity === "blocking" || item.severity === "needs_attention")
    .slice(0, 4)
    .map((item) => toIssueItem(item.id, item.title, item.summary));

  blockers.push(...openConflictItems);

  const messySignals = scenarioProfile.signals.slice(0, 5).map((signal) =>
    toIssueItem(signal.tag, signal.title, signal.summary)
  );

  const status: TinaClientIntakeReviewStatus =
    blockers.length > 0 ? "blocked" : missingRecommended.length > 0 || messySignals.length > 0 ? "needs_input" : "ready";

  const summary =
    status === "blocked"
      ? "Tina sees intake blockers before this packet should move deeper into prep."
      : status === "needs_input"
        ? "Tina can keep moving, but this intake packet still has missing support or messy areas to confirm."
        : "This intake packet looks complete enough for Tina's current lane.";

  const nextStep =
    blockers[0]?.title ??
    (missingRecommended[0] ? `Add ${missingRecommended[0].label.toLowerCase()}` : null) ??
    (messySignals[0]?.title ?? "Run the next Tina prep step.");

  return {
    status,
    summary,
    nextStep,
    laneTitle: laneRecommendation.title,
    laneSupport: laneRecommendation.support,
    likelyLaneByDocuments,
    safeForCurrentLane: status === "ready" && laneRecommendation.support === "supported",
    blockers,
    missingRequired,
    missingRecommended,
    messySignals,
  };
}
