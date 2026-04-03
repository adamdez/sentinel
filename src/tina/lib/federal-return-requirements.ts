import { buildTinaEntityJudgment } from "@/tina/lib/entity-judgment";
import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type {
  TinaFederalReturnRequirementItem,
  TinaFederalReturnRequirementsSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildItem(
  args: TinaFederalReturnRequirementItem
): TinaFederalReturnRequirementItem {
  return {
    ...args,
    requiredForms: unique(args.requiredForms),
    requiredRecords: unique(args.requiredRecords),
    reviewerQuestions: unique(args.reviewerQuestions),
  };
}

function describeReturnFamily(laneId: TinaFederalReturnRequirementsSnapshot["laneId"]): string {
  switch (laneId) {
    case "schedule_c_single_member_llc":
      return "Form 1040 Schedule C";
    case "1065":
      return "Partnership return";
    case "1120_s":
      return "S-corporation return";
    case "1120":
      return "C-corporation return";
    default:
      return "Unresolved federal return family";
  }
}

export function buildTinaFederalReturnRequirements(
  draft: TinaWorkspaceDraft
): TinaFederalReturnRequirementsSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const entityJudgment = buildTinaEntityJudgment(draft);
  const ownershipTimeline = buildTinaOwnershipTimeline(draft);
  const laneId = startPath.recommendation.laneId;
  const items: TinaFederalReturnRequirementItem[] = [];
  const blockingQuestions = entityJudgment.questions.filter(
    (question) => question.severity === "blocking"
  );
  const attentionQuestions = entityJudgment.questions.filter(
    (question) => question.severity === "needs_attention"
  );
  const ownershipProofQuestions = ownershipTimeline.events
    .filter((event) => event.status === "needs_proof")
    .map((event) => event.title);
  const routeQuestions = [
    ...startPath.blockingReasons,
    ...startPath.reviewReasons,
    ...startPath.proofRequirements
      .filter((requirement) => requirement.status === "needed")
      .map((requirement) => requirement.label),
    ...ownershipProofQuestions,
  ];

  if (laneId === "schedule_c_single_member_llc") {
    items.push(
      buildItem({
        id: "schedule-c-core",
        title: "Schedule C core filing set",
        status:
          startPath.route === "blocked"
            ? "blocked"
            : startPath.route === "review_only"
              ? "needs_attention"
              : "ready",
        summary:
          startPath.route === "supported"
            ? "Tina can build the supported Schedule C core when the facts stay clean and reviewer judgment does not reopen the lane."
            : "Tina sees a Schedule C-shaped lane, but she should not trust it until the remaining lane questions are resolved.",
        requiredForms: ["Form 1040", "Schedule C", "Schedule SE"],
        requiredRecords: [
          "Prior-year return",
          "Primary books or profit-and-loss report",
          "Bank and card support",
          draft.profile.hasFixedAssets ? "Fixed asset and depreciation schedule" : "",
          draft.profile.hasPayroll ? "Payroll reports" : "",
        ],
        reviewerQuestions: routeQuestions,
      })
    );
  } else if (laneId === "1065") {
    items.push(
      buildItem({
        id: "partnership-core",
        title: "Partnership return core",
        status: startPath.route === "blocked" ? "blocked" : "needs_attention",
        summary:
          "Tina sees a partnership-style file. She should preserve the likely 1065 path and gather the exact records needed for partnership prep instead of forcing Schedule C.",
        requiredForms: ["Form 1065", "Schedule K", "Schedule K-1"],
        requiredRecords: [
          "Operating agreement or ownership breakdown",
          "Partner percentages and allocation terms",
          "Trial balance or books by entity",
          "Prior-year partnership return",
          "Year-end balance sheet",
        ],
        reviewerQuestions: routeQuestions,
      })
    );
    items.push(
      buildItem({
        id: "partnership-capital",
        title: "Partner capital, transfers, and redemption analysis",
        status:
          ownershipProofQuestions.length > 0 || draft.profile.hasOwnerBuyoutOrRedemption
            ? "blocked"
            : "needs_attention",
        summary:
          "Multi-owner LLCs need capital-account and ownership-change analysis before partner economics can be trusted.",
        requiredForms: ["Partner capital rollforward", "K-1 allocation support"],
        requiredRecords: [
          "Capital account history",
          "Buyout or redemption papers",
          "Former-owner payment support",
          "Transfer effective dates",
        ],
        reviewerQuestions: [
          ...ownershipProofQuestions,
          ...attentionQuestions.map((question) => question.title),
          ...blockingQuestions.map((question) => question.title),
        ],
      })
    );
  } else if (laneId === "1120_s") {
    items.push(
      buildItem({
        id: "s-corp-core",
        title: "S-corporation return core",
        status: startPath.route === "blocked" ? "blocked" : "needs_attention",
        summary:
          "Tina sees an S-corp path. She should hold the likely 1120-S lane and gather the shareholder records needed for a reviewer-grade return package.",
        requiredForms: ["Form 1120-S", "Schedule K", "Schedule K-1"],
        requiredRecords: [
          "Entity election proof",
          "Shareholder ownership breakdown",
          "Officer compensation records",
          "Distribution history",
          "Balance sheet and books",
        ],
        reviewerQuestions: routeQuestions,
      })
    );
    items.push(
      buildItem({
        id: "s-corp-shareholder",
        title: "Shareholder compensation and distribution review",
        status:
          startPath.proofRequirements.some(
            (requirement) =>
              requirement.id === "entity-election" && requirement.status === "needed"
          )
            ? "blocked"
            : "needs_attention",
        summary:
          "S-corp files need compensation, distribution, and shareholder ownership treatment checked before the return can be trusted.",
        requiredForms: ["Shareholder K-1 support"],
        requiredRecords: [
          "Payroll reports",
          "Owner payroll vs distribution support",
          "Shareholder ledger activity",
        ],
        reviewerQuestions: [
          ...attentionQuestions.map((question) => question.title),
          ...blockingQuestions.map((question) => question.title),
        ],
      })
    );
  } else if (laneId === "1120") {
    items.push(
      buildItem({
        id: "c-corp-core",
        title: "C-corporation return core",
        status: startPath.route === "blocked" ? "blocked" : "needs_attention",
        summary:
          "Tina sees a C-corp path. She should preserve the 1120 lane and gather the corporate records needed before reviewer-grade prep can begin.",
        requiredForms: ["Form 1120", "Schedule L", "Schedule M-1", "Schedule M-2"],
        requiredRecords: [
          "Entity election or formation proof",
          "Corporate books and balance sheet",
          "Officer compensation support",
          "Retained earnings history",
        ],
        reviewerQuestions: routeQuestions,
      })
    );
    items.push(
      buildItem({
        id: "c-corp-equity",
        title: "Corporate equity and retained earnings review",
        status:
          startPath.proofRequirements.some(
            (requirement) =>
              requirement.id === "entity-election" && requirement.status === "needed"
          )
            ? "blocked"
            : "needs_attention",
        summary:
          "C-corp files need equity, retained earnings, and owner-payment characterization reviewed before the return can be trusted.",
        requiredForms: ["Book-to-tax reconciliation support"],
        requiredRecords: [
          "Prior-year corporate return",
          "Retained earnings rollforward",
          "Owner/officer payment support",
        ],
        reviewerQuestions: [
          ...attentionQuestions.map((question) => question.title),
          ...blockingQuestions.map((question) => question.title),
        ],
      })
    );
  } else {
    items.push(
      buildItem({
        id: "federal-family-confirmation",
        title: "Federal return family confirmation",
        status: "blocked",
        summary:
          "Tina still needs enough entity, election, and ownership proof to name the right federal return family.",
        requiredForms: [],
        requiredRecords: [
          "Formation papers",
          "Election papers",
          "Ownership breakdown",
          "Prior-year return",
        ],
        reviewerQuestions: routeQuestions,
      })
    );
  }

  const blockingCount = items.filter((item) => item.status === "blocked").length;
  const attentionCount = items.filter((item) => item.status === "needs_attention").length;
  const canTinaFinishLane =
    laneId === "schedule_c_single_member_llc" &&
    startPath.route === "supported" &&
    blockingCount === 0 &&
    attentionCount === 0;

  let summary =
    "Tina has not yet translated the lane decision into a concrete federal return requirement map.";
  let nextStep =
    "Lock the federal return family and collect the records that lane requires before return production.";

  if (canTinaFinishLane) {
    summary =
      "Tina sees a clean supported federal return family and can keep building the Schedule C core toward reviewer-grade output.";
    nextStep =
      "Keep building the supported Schedule C lane, preserving traceability and reviewer-grade support.";
  } else if (blockingCount > 0) {
    summary = `Tina sees ${blockingCount} blocking federal return requirement${
      blockingCount === 1 ? "" : "s"
    } and should not pretend the return family is fully settled yet.`;
    nextStep =
      "Clear the blocking federal return requirements first so Tina does not build the wrong entity-return path.";
  } else {
    summary = `Tina sees the likely federal return family, but ${attentionCount} requirement${
      attentionCount === 1 ? "" : "s"
    } still need reviewer-grade follow-through before the lane is truly production-ready.`;
    nextStep =
      "Carry the likely return family forward, but keep the required forms, records, and reviewer questions visible.";
  }

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId,
    returnFamily: describeReturnFamily(laneId),
    canTinaFinishLane,
    summary,
    nextStep,
    items,
  };
}
