import { buildTinaChecklist } from "@/tina/lib/checklist";
import { buildTinaClientIntakeReviewReport } from "@/tina/lib/client-intake-review";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import type {
  TinaChecklistItem,
  TinaFilingLaneId,
  TinaFilingLaneSupport,
  TinaStoredDocumentCategory,
  TinaWorkspaceDraft,
} from "@/tina/types";

export type TinaEntityReturnIntakeContractStatus =
  | "blocked"
  | "needs_review"
  | "ready_for_cpa_review";

export interface TinaEntityReturnIntakeContractDocument {
  documentId: string;
  name: string;
  requestId: string | null;
  requestLabel: string | null;
  category: TinaStoredDocumentCategory;
  readingStatus: "complete" | "pending";
}

export interface TinaEntityReturnIntakeContract {
  contractVersion: "tina.entity_return_intake_review.v1";
  status: TinaEntityReturnIntakeContractStatus;
  summary: string;
  nextStep: string;
  laneId: "1120_s" | "1065";
  laneTitle: string;
  finishSupport: TinaFilingLaneSupport;
  taxYear: string;
  businessName: string;
  requiredCoverage: TinaChecklistItem[];
  recommendedCoverage: TinaChecklistItem[];
  blockerTitles: string[];
  messySignalTitles: string[];
  documents: TinaEntityReturnIntakeContractDocument[];
}

function isEntityReturnLane(
  laneId: TinaFilingLaneId | "mixed" | "unknown"
): laneId is "1120_s" | "1065" {
  return laneId === "1120_s" || laneId === "1065";
}

function readingComplete(draft: TinaWorkspaceDraft, documentId: string): boolean {
  return draft.documentReadings.some(
    (reading) => reading.documentId === documentId && reading.status === "complete"
  );
}

function chooseEntityLane(draft: TinaWorkspaceDraft): {
  laneId: "1120_s" | "1065" | null;
  laneTitle: string;
  finishSupport: TinaFilingLaneSupport;
} {
  const recommendation = recommendTinaFilingLane(draft.profile);
  const intakeReview = buildTinaClientIntakeReviewReport(draft);
  const documentLane = intakeReview.likelyLaneByDocuments;

  if (isEntityReturnLane(documentLane)) {
    return {
      laneId: documentLane,
      laneTitle: documentLane === "1120_s" ? "1120-S / S-Corp" : "1065 / Partnership",
      finishSupport: recommendation.support,
    };
  }

  if (isEntityReturnLane(recommendation.laneId)) {
    return {
      laneId: recommendation.laneId,
      laneTitle: recommendation.title,
      finishSupport: recommendation.support,
    };
  }

  return {
    laneId: null,
    laneTitle: recommendation.title,
    finishSupport: recommendation.support,
  };
}

export function buildTinaEntityReturnIntakeContract(
  draft: TinaWorkspaceDraft
): TinaEntityReturnIntakeContract {
  const recommendation = recommendTinaFilingLane(draft.profile);
  const intakeReview = buildTinaClientIntakeReviewReport(draft);
  const checklist = buildTinaChecklist(draft, recommendation);
  const lane = chooseEntityLane(draft);
  const requiredCoverage = checklist.filter((item) => item.priority === "required");
  const recommendedCoverage = checklist.filter((item) => item.priority === "recommended");
  const missingRequired = requiredCoverage.filter((item) => item.status === "needed");
  const missingRecommended = recommendedCoverage.filter((item) => item.status === "needed");
  const incompleteReadings = draft.documents.filter(
    (document) => !readingComplete(draft, document.id)
  );
  const hardBlockers = intakeReview.blockers.filter(
    (item) => item.id !== "intake-lane-support"
  );

  let status: TinaEntityReturnIntakeContractStatus = "ready_for_cpa_review";
  if (!lane.laneId || hardBlockers.length > 0 || missingRequired.length > 0) {
    status = "blocked";
  } else if (
    missingRecommended.length > 0 ||
    intakeReview.messySignals.length > 0 ||
    incompleteReadings.length > 0
  ) {
    status = "needs_review";
  }

  let summary =
    "Tina organized this entity-return packet into a CPA review intake contract without pretending the return is prepared.";
  let nextStep =
    "Hand this organized intake packet to the CPA together with the saved source papers and entity-return notes.";

  if (status === "blocked") {
    summary =
      "Tina recognizes an entity-return packet here, but a few intake blockers still make the CPA handoff incomplete.";
    nextStep =
      hardBlockers[0]?.title ??
      (missingRequired[0]
        ? `Add ${missingRequired[0].label.toLowerCase()} first.`
        : "Clear the intake blockers first.");
  } else if (status === "needs_review") {
    summary =
      "Tina organized the entity-return packet, but a reviewer should confirm a few missing supports or messy signals before treating it as a clean first CPA handoff.";
    nextStep =
      missingRecommended[0]
        ? `Add ${missingRecommended[0].label.toLowerCase()} if available, then send the packet.`
        : incompleteReadings[0]
          ? `Read ${incompleteReadings[0].name} so the packet has fuller machine support.`
          : intakeReview.messySignals[0]?.summary ?? nextStep;
  }

  return {
    contractVersion: "tina.entity_return_intake_review.v1",
    status,
    summary,
    nextStep,
    laneId: lane.laneId ?? "1120_s",
    laneTitle: lane.laneTitle,
    finishSupport: lane.finishSupport,
    taxYear: draft.profile.taxYear,
    businessName: draft.profile.businessName,
    requiredCoverage,
    recommendedCoverage,
    blockerTitles: hardBlockers.map((item) => item.title),
    messySignalTitles: intakeReview.messySignals.map((item) => item.title),
    documents: draft.documents.map((document) => ({
      documentId: document.id,
      name: document.name,
      requestId: document.requestId ?? null,
      requestLabel: document.requestLabel ?? null,
      category: document.category,
      readingStatus: readingComplete(draft, document.id) ? "complete" : "pending",
    })),
  };
}
