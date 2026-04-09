import { buildTinaCpaHandoff } from "@/tina/lib/cpa-handoff";
import { buildTinaClientIntakeReviewReport } from "@/tina/lib/client-intake-review";
import { buildTinaCurrentFileReviewerReality } from "@/tina/lib/current-file-reviewer-reality";
import { buildTinaEntityReturnIntakeContract } from "@/tina/lib/entity-return-intake-contract";
import { buildTinaFinalPackageQualityReport } from "@/tina/lib/final-package-quality";
import { buildTinaFilingApprovalReport } from "@/tina/lib/filing-approval";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { buildTinaLiveAcceptanceReport } from "@/tina/lib/live-acceptance";
import { buildTinaMefReadinessReport } from "@/tina/lib/mef-readiness";
import { buildTinaSCorpReviewReport } from "@/tina/lib/s-corp-review";
import { buildTinaTransactionReconciliationReport } from "@/tina/lib/transaction-reconciliation";
import type { TinaWorkspaceDraft } from "@/tina/types";

function shouldUseEntityReturnDelivery(
  lane: ReturnType<typeof recommendTinaFilingLane>,
  intakeReview: ReturnType<typeof buildTinaClientIntakeReviewReport>
): boolean {
  return (
    lane.laneId === "1120_s" ||
    lane.laneId === "1065" ||
    intakeReview.likelyLaneByDocuments === "1120_s" ||
    intakeReview.likelyLaneByDocuments === "1065"
  );
}

export type TinaReviewDeliveryStatus = "blocked" | "needs_review" | "ready_to_send";

export interface TinaReviewDeliveryCheck {
  id: string;
  title: string;
  status: "ready" | "needs_review" | "blocked";
  summary: string;
}

export interface TinaReviewDeliveryReport {
  status: TinaReviewDeliveryStatus;
  summary: string;
  nextStep: string;
  checks: TinaReviewDeliveryCheck[];
}

function buildCheck(
  id: string,
  title: string,
  status: "ready" | "needs_review" | "blocked",
  summary: string
): TinaReviewDeliveryCheck {
  return { id, title, status, summary };
}

export function buildTinaReviewDeliveryReport(
  draft: TinaWorkspaceDraft
): TinaReviewDeliveryReport {
  const lane = recommendTinaFilingLane(draft.profile);
  const intakeReview = buildTinaClientIntakeReviewReport(draft);
  const handoff = buildTinaCpaHandoff(draft);
  const filingApproval = buildTinaFilingApprovalReport(draft);
  const liveAcceptance = buildTinaLiveAcceptanceReport(draft);
  const currentFileReality = buildTinaCurrentFileReviewerReality(draft);
  const packageQuality = buildTinaFinalPackageQualityReport(draft);
  const reconciliation = buildTinaTransactionReconciliationReport(draft);
  const mefReadiness = buildTinaMefReadinessReport(draft);
  const entityIntakeContract = buildTinaEntityReturnIntakeContract(draft);
  const sCorpReview = buildTinaSCorpReviewReport(draft);

  const currentFileFragile = liveAcceptance.currentFileCohorts.filter(
    (cohort) => cohort.trustLevel === "fragile"
  );
  const currentFileThin = liveAcceptance.currentFileCohorts.filter(
    (cohort) => cohort.trustLevel === "insufficient_history"
  );

  if (shouldUseEntityReturnDelivery(lane, intakeReview)) {
    const checks: TinaReviewDeliveryCheck[] = [
      buildCheck(
        "cpa_packet",
        "CPA intake packet",
        handoff.status !== "complete"
          ? "blocked"
          : handoff.artifacts.some((artifact) => artifact.status === "blocked")
            ? "blocked"
            : "ready",
        handoff.summary
      ),
      buildCheck(
        "entity_return_intake_contract",
        "Entity-return intake contract",
        entityIntakeContract.status === "blocked" ? "blocked" : "ready",
        entityIntakeContract.summary
      ),
      ...(sCorpReview.status === "unsupported"
        ? []
        : [
            buildCheck(
              "s_corp_review_spine",
              "1120-S review spine",
              sCorpReview.status === "blocked" ? "blocked" : "ready",
              sCorpReview.summary
            ),
          ]),
      buildCheck(
        "source_paper_index",
        "Source paper coverage",
        entityIntakeContract.requiredCoverage.some((item) => item.status === "needed")
          ? "blocked"
          : entityIntakeContract.documents.some((document) => document.readingStatus === "pending")
            ? "needs_review"
            : "ready",
        entityIntakeContract.requiredCoverage.some((item) => item.status === "needed")
          ? "Tina still has missing required intake support before this entity-return packet should go out."
          : entityIntakeContract.documents.some((document) => document.readingStatus === "pending")
            ? "Tina has the key papers, but a few saved files still have not been read into the packet."
            : "The saved paper stack is organized enough for a first CPA entity-return review."
      ),
      buildCheck(
        "current_file_reviewer_reality",
        "Current-file reviewer reality",
        currentFileReality.status === "fragile" ? "needs_review" : "ready",
        currentFileReality.summary
      ),
      buildCheck(
        "review_mode",
        "Review-mode delivery",
        "ready",
        "This packet is explicitly organized for CPA intake review, not return filing."
      ),
    ];

    const blockedCount = checks.filter((check) => check.status === "blocked").length;
    const reviewCount = checks.filter((check) => check.status === "needs_review").length;

    if (blockedCount > 0) {
      return {
        status: "blocked",
        summary:
          "Tina should not send this entity-return intake packet yet because at least one CPA handoff gate is still blocked.",
        nextStep:
          "Clear the blocked intake coverage or handoff sections first so the CPA packet starts from a clean packet.",
        checks,
      };
    }

    if (reviewCount > 0) {
      return {
        status: "needs_review",
        summary:
          "Tina has a workable entity-return intake packet, but a few review-delivery checks still deserve a quick human scan before sending.",
        nextStep:
          "Do one final pass on the needs-review checks, then export or email the packet to the CPA reviewer.",
        checks,
      };
    }

    return {
      status: "ready_to_send",
      summary:
        "Tina has a clean entity-return intake packet for CPA review with no blocked send gates left.",
      nextStep:
        "Export, print, or email the packet to the CPA reviewer together with the saved source papers.",
      checks,
    };
  }

  const checks: TinaReviewDeliveryCheck[] = [
    buildCheck(
      "package_readiness",
      "Package readiness",
      draft.packageReadiness.status !== "complete"
        ? "blocked"
        : draft.packageReadiness.level === "blocked"
          ? "blocked"
          : draft.packageReadiness.level === "needs_review"
            ? "needs_review"
            : "ready",
      draft.packageReadiness.status !== "complete"
        ? "Tina still needs a current package-readiness pass before the packet should leave the workspace."
        : draft.packageReadiness.summary
    ),
    buildCheck(
      "cpa_packet",
      "CPA packet",
      handoff.status !== "complete"
        ? "blocked"
        : handoff.artifacts.some((artifact) => artifact.status === "blocked")
          ? "blocked"
          : handoff.artifacts.some((artifact) => artifact.status === "waiting")
            ? "needs_review"
            : "ready",
      handoff.summary
    ),
    buildCheck(
      "tax_positions",
      "Tax-position register",
      draft.taxPositionMemory.status !== "complete"
        ? "blocked"
        : draft.taxPositionMemory.records.some((record) => record.status === "blocked")
          ? "blocked"
          : draft.taxPositionMemory.records.some((record) => record.status === "needs_review")
            ? "needs_review"
            : "ready",
      draft.taxPositionMemory.summary
    ),
    buildCheck(
      "current_file_acceptance",
      "Current-file reviewer trust",
      currentFileFragile.length > 0
        ? "blocked"
        : currentFileThin.length > 0
          ? "needs_review"
          : "ready",
      currentFileFragile.length > 0
        ? `This file matches fragile reviewer cohorts: ${currentFileFragile
            .map((cohort) => cohort.label)
            .join(", ")}.`
        : currentFileThin.length > 0
          ? `Tina still has thin reviewer history for this file type: ${currentFileThin
              .map((cohort) => cohort.label)
              .join(", ")}.`
          : "The current file does not fall into a measured fragile reviewer cohort.",
    ),
    buildCheck(
      "current_file_reviewer_reality",
      "Current-file reviewer reality",
      currentFileReality.status === "fragile"
        ? "blocked"
        : currentFileReality.status === "mixed"
          ? "needs_review"
          : "ready",
      currentFileReality.summary
    ),
    buildCheck(
      "final_package_quality",
      "Final package quality",
      packageQuality.status === "blocked"
        ? "blocked"
        : packageQuality.status === "needs_review"
          ? "needs_review"
          : "ready",
      packageQuality.summary
    ),
    buildCheck(
      "transaction_lineage",
      "Transaction-lineage reconciliation",
      reconciliation.groups.some((group) => group.status === "blocked")
        ? "blocked"
        : reconciliation.groups.some((group) => group.status === "needs_review")
          ? "needs_review"
          : reconciliation.groups.length > 0
            ? "ready"
            : "needs_review",
      reconciliation.groups.some((group) => group.status === "blocked")
        ? `Tina still has blocked transaction lineage or grouped transaction evidence in ${reconciliation.groups
            .filter((group) => group.status === "blocked")
            .map((group) => group.label)
            .join(", ")}.`
        : reconciliation.groups.some((group) => group.status === "needs_review")
          ? `Tina still has transaction lineage or grouped transaction evidence that needs a final review pass in ${reconciliation.groups
              .filter((group) => group.status === "needs_review")
              .map((group) => group.label)
              .join(", ")}.`
          : reconciliation.groups.length > 0
            ? "Transaction lineage and grouped ledger evidence are reconciled into the send-ready packet."
            : "Tina still wants richer imported ledger lineage before this send-ready gate should look fully settled.",
    ),
    buildCheck(
      "review_mode",
      "Review-mode delivery",
      filingApproval.status === "blocked" ? "needs_review" : "ready",
      filingApproval.status === "blocked"
        ? "Tina is still review-only for this file, which is acceptable for CPA delivery but should be stated clearly."
        : "Tina is in a strong review-delivery posture for CPA handoff.",
    ),
    buildCheck(
      "mef_handoff",
      "MeF-aligned handoff",
      mefReadiness.status === "blocked"
        ? "blocked"
        : mefReadiness.status === "needs_review"
          ? "needs_review"
          : "ready",
      mefReadiness.summary
    ),
    buildCheck(
      "continuity_and_depreciation",
      "Continuity and depreciation review",
      handoff.status !== "complete"
        ? "needs_review"
        : handoff.artifacts.some(
              (artifact) =>
                artifact.id === "continuity-and-depreciation" && artifact.status === "waiting"
            )
          ? "needs_review"
          : "ready",
      handoff.status !== "complete"
        ? "Tina still needs a current CPA handoff packet before continuity and depreciation review posture can be trusted."
        : handoff.artifacts.find(
              (artifact) => artifact.id === "continuity-and-depreciation"
            )?.summary ??
          "Tina does not see continuity or depreciation review blockers in the handoff packet.",
    ),
  ];

  const blockedCount = checks.filter((check) => check.status === "blocked").length;
  const reviewCount = checks.filter((check) => check.status === "needs_review").length;

  if (blockedCount > 0) {
    return {
      status: "blocked",
      summary:
        "Tina should not send this packet yet because at least one review-delivery gate is still blocked.",
      nextStep:
        "Clear the blocked review-delivery gates first so the CPA packet is not misleading or incomplete when it leaves Tina.",
      checks,
    };
  }

  if (reviewCount > 0) {
    return {
      status: "needs_review",
      summary:
        "Tina has a workable CPA packet, but a few review-delivery gates still deserve a final human scan before sending.",
      nextStep:
        "Do one final operator pass on the needs-review checks, then export or email the packet to the CPA reviewer.",
      checks,
    };
  }

  return {
    status: "ready_to_send",
    summary:
      "Tina has a clean review-delivery packet for CPA handoff with no blocked or review-only send gates left.",
    nextStep:
      "Export, print, or email the packet to the CPA reviewer together with the saved source papers.",
    checks,
  };
}
