import type {
  TinaEntityEconomicsCheck,
  TinaEntityEconomicsReadinessSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaEntityRecordMatrix } from "@/tina/lib/entity-record-matrix";
import { buildTinaFederalReturnRequirements } from "@/tina/lib/federal-return-requirements";
import { buildTinaOwnershipCapitalEvents } from "@/tina/lib/ownership-capital-events";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import type { TinaFilingLaneId, TinaWorkspaceDraft } from "@/tina/types";

interface TinaEconomicsBlueprint {
  id: string;
  title: string;
  whyItMatters: string;
  recordIds: string[];
  enabled?: (draft: TinaWorkspaceDraft) => boolean;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildCheck(args: TinaEntityEconomicsCheck): TinaEntityEconomicsCheck {
  return {
    ...args,
    relatedRecordIds: unique(args.relatedRecordIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
    relatedFactIds: unique(args.relatedFactIds),
  };
}

function blueprintsForLane(
  draft: TinaWorkspaceDraft,
  laneId: TinaFilingLaneId
): TinaEconomicsBlueprint[] {
  if (laneId === "schedule_c_single_member_llc") {
    return [
      {
        id: "owner-boundary",
        title: "Owner boundary and sole-owner posture",
        whyItMatters:
          "Schedule C only holds if Tina can keep owner boundary and single-owner posture clean.",
        recordIds: ["schedule-c-prior-return", "schedule-c-books", "schedule-c-bank-card"],
      },
    ];
  }

  if (laneId === "1065") {
    return [
      {
        id: "partner-roster",
        title: "Partner roster and ownership economics",
        whyItMatters:
          "Partnership prep needs partner percentages and allocation economics before K-1 logic is trustworthy.",
        recordIds: ["partnership-ownership"],
      },
      {
        id: "partner-capital",
        title: "Partner capital accounts",
        whyItMatters:
          "Capital-account movement, contributions, and basis change the partnership story materially.",
        recordIds: ["partnership-capital"],
      },
      {
        id: "partner-payments",
        title: "Guaranteed payments and partner distributions",
        whyItMatters:
          "Guaranteed payments and distributions can change allocations, deductions, and review posture.",
        recordIds: ["partnership-payments"],
      },
      {
        id: "partner-transfers",
        title: "Transfers, buyouts, and redemption economics",
        whyItMatters:
          "Year-of-change partnership files need the transition economics clear before the return family can be trusted.",
        recordIds: ["partnership-transfer"],
        enabled: (currentDraft) =>
          currentDraft.profile.ownershipChangedDuringYear ||
          currentDraft.profile.hasOwnerBuyoutOrRedemption ||
          currentDraft.profile.hasFormerOwnerPayments,
      },
      {
        id: "partnership-balance-sheet",
        title: "Partnership balance-sheet and book-to-tax footing",
        whyItMatters:
          "A 1065 file is not reviewer-grade if balance-sheet and trial-balance footing are still weak.",
        recordIds: ["partnership-books"],
      },
    ];
  }

  if (laneId === "1120_s") {
    return [
      {
        id: "shareholder-roster",
        title: "Shareholder roster and ownership percentages",
        whyItMatters:
          "S-corp returns need the shareholder picture settled before distributions and K-1s are believable.",
        recordIds: ["s-corp-shareholders"],
      },
      {
        id: "s-election",
        title: "S-election proof",
        whyItMatters:
          "Without clean 2553-style proof, Tina should not trust the S-corp posture.",
        recordIds: ["s-corp-election"],
      },
      {
        id: "officer-compensation",
        title: "Officer compensation economics",
        whyItMatters:
          "Officer payroll and reasonable-comp treatment are central S-corp reviewer questions.",
        recordIds: ["s-corp-payroll"],
      },
      {
        id: "shareholder-flows",
        title: "Shareholder distributions and loan flows",
        whyItMatters:
          "Distribution and shareholder-loan economics can change tax treatment materially.",
        recordIds: ["s-corp-distributions"],
      },
      {
        id: "s-corp-balance-sheet",
        title: "S-corp books and balance-sheet footing",
        whyItMatters:
          "A clean 1120-S path still needs books and balance-sheet support before reviewer trust is earned.",
        recordIds: ["s-corp-books"],
      },
    ];
  }

  if (laneId === "1120") {
    return [
      {
        id: "corporate-classification",
        title: "Corporate classification proof",
        whyItMatters:
          "C-corp prep depends on a clean corporate posture before equity and retained earnings are interpreted.",
        recordIds: ["c-corp-classification"],
      },
      {
        id: "corporate-equity",
        title: "Retained earnings and equity rollforward",
        whyItMatters:
          "Corporate equity movement is one of the first things a reviewer will challenge on an 1120 lane.",
        recordIds: ["c-corp-equity"],
      },
      {
        id: "corporate-compensation",
        title: "Officer compensation flows",
        whyItMatters:
          "Officer compensation needs to be separated from dividends or loans before a C-corp package is believable.",
        recordIds: ["c-corp-compensation"],
      },
      {
        id: "shareholder-flows",
        title: "Dividends and shareholder loan flows",
        whyItMatters:
          "Shareholder-value extraction changes tax treatment and reviewer posture on C-corp files.",
        recordIds: ["c-corp-shareholder-flows"],
      },
      {
        id: "c-corp-balance-sheet",
        title: "Corporate books and balance-sheet footing",
        whyItMatters:
          "A credible 1120 path still needs schedule-L-grade footing and book-to-tax support.",
        recordIds: ["c-corp-books"],
      },
    ];
  }

  return [
    {
      id: "classification-gap",
      title: "Entity classification still unresolved",
      whyItMatters:
        "Tina cannot reason about economics cleanly until she knows which return family she is really in.",
      recordIds: ["unresolved-classification"],
    },
  ];
}

export function buildTinaEntityEconomicsReadiness(
  draft: TinaWorkspaceDraft
): TinaEntityEconomicsReadinessSnapshot {
  const startPath = buildTinaStartPathAssessment(draft);
  const federalReturnRequirements = buildTinaFederalReturnRequirements(draft);
  const entityRecordMatrix = buildTinaEntityRecordMatrix(draft);
  const ownershipCapitalEvents = buildTinaOwnershipCapitalEvents(draft);
  const laneId = federalReturnRequirements.laneId;
  const checks = blueprintsForLane(draft, laneId)
    .filter((blueprint) => !blueprint.enabled || blueprint.enabled(draft))
    .map((blueprint) => {
      const relatedRecords = entityRecordMatrix.items.filter((item) =>
        blueprint.recordIds.includes(item.id)
      );
      const relatedEvents = ownershipCapitalEvents.events.filter((event) =>
        blueprint.id.includes("transfer") || blueprint.id.includes("owner")
          ? event.status !== "known"
          : false
      );
      const hasMissingCriticalRecord = relatedRecords.some(
        (record) => record.criticality === "critical" && record.status === "missing"
      );
      const hasMissingRecord = relatedRecords.some((record) => record.status === "missing");
      const hasPartialRecord = relatedRecords.some((record) => record.status === "partial");
      const hasBlockedEvent = relatedEvents.some((event) => event.status === "blocked");
      const hasReviewEvent = relatedEvents.some((event) => event.status === "needs_review");

      const status =
        startPath.route === "blocked" ||
        hasBlockedEvent ||
        hasMissingCriticalRecord ||
        (laneId !== "schedule_c_single_member_llc" && hasMissingRecord)
          ? "blocked"
          : hasReviewEvent || hasPartialRecord || hasMissingRecord
            ? "needs_review"
            : "clear";

      return buildCheck({
        id: blueprint.id,
        title: blueprint.title,
        status,
        summary:
          status === "clear"
            ? "Tina has enough current support to keep this economics area coherent."
            : status === "needs_review"
              ? "Tina sees this economics area, but a reviewer still needs to confirm or tighten it."
              : "Tina still lacks the support needed to trust this economics area.",
        whyItMatters: blueprint.whyItMatters,
        relatedRecordIds: relatedRecords.map((record) => record.id),
        relatedDocumentIds: [
          ...relatedRecords.flatMap((record) => record.matchedDocumentIds),
          ...relatedEvents.flatMap((event) => event.relatedDocumentIds),
        ],
        relatedFactIds: [
          ...relatedRecords.flatMap((record) => record.matchedFactIds),
          ...relatedEvents.flatMap((event) => event.relatedFactIds),
        ],
      });
    });

  const blockedCount = checks.filter((check) => check.status === "blocked").length;
  const reviewCount = checks.filter((check) => check.status === "needs_review").length;
  const overallStatus =
    blockedCount > 0 ? "blocked" : reviewCount > 0 ? "review_required" : "clear";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId,
    returnFamily: federalReturnRequirements.returnFamily,
    overallStatus,
    summary:
      overallStatus === "clear"
        ? "Tina has a coherent entity-economics story for the current lane."
        : overallStatus === "review_required"
          ? `Tina still has ${reviewCount} entity-economics area${
              reviewCount === 1 ? "" : "s"
            } under reviewer control.`
          : `Tina still has ${blockedCount} blocked entity-economics area${
              blockedCount === 1 ? "" : "s"
            } that can change the return posture materially.`,
    nextStep:
      overallStatus === "clear"
        ? "Carry this economics picture into return execution and reviewer packaging."
        : overallStatus === "review_required"
          ? "Keep these economics questions visible for the reviewer before treating the lane as settled."
          : "Clear the blocked economics areas before Tina trusts entity-specific prep work.",
    checks,
  };
}
