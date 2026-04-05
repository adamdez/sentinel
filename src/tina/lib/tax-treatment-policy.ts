import { buildTinaTreatmentJudgment } from "@/tina/lib/treatment-judgment";
import type {
  TinaMaterialityLevel,
  TinaTaxTreatmentPolicyDecision,
  TinaTaxTreatmentPolicySnapshot,
  TinaTreatmentJudgmentItem,
  TinaWorkspaceDraft,
} from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function inferMateriality(judgment: TinaTreatmentJudgmentItem): TinaMaterialityLevel {
  if (
    judgment.commercialPriority === "immediate" ||
    judgment.cleanupDependency === "cleanup_first" ||
    judgment.taxPositionBucket === "reject"
  ) {
    return "high";
  }

  if (
    judgment.commercialPriority === "next" ||
    judgment.federalStateSensitivity !== "federal_only"
  ) {
    return "medium";
  }

  return "low";
}

function buildDecision(judgment: TinaTreatmentJudgmentItem): TinaTaxTreatmentPolicyDecision {
  const status: TinaTaxTreatmentPolicyDecision["status"] =
    judgment.taxPositionBucket === "use"
      ? "cleared"
      : judgment.taxPositionBucket === "reject"
        ? "blocked"
        : "review_required";

  return {
    id: judgment.id,
    title: judgment.title,
    policyArea: judgment.policyArea,
    status,
    materiality: inferMateriality(judgment),
    summary: judgment.summary,
    recommendedBucket: judgment.taxPositionBucket,
    nextStep: judgment.nextStep,
    requiredProof: unique(judgment.requiredProof),
    alternativeTreatments: unique(judgment.alternativeTreatments),
    cleanupDependency: judgment.cleanupDependency,
    federalStateSensitivity: judgment.federalStateSensitivity,
    commercialPriority: judgment.commercialPriority,
    authorityWorkIdeaIds: unique(judgment.authorityWorkIdeaIds),
    relatedJudgmentIds: [judgment.id],
    relatedFactIds: unique(judgment.relatedFactIds),
    relatedDocumentIds: unique(judgment.relatedDocumentIds),
  };
}

export function buildTinaTaxTreatmentPolicy(
  draft: TinaWorkspaceDraft
): TinaTaxTreatmentPolicySnapshot {
  const treatmentJudgment = buildTinaTreatmentJudgment(draft);
  const decisions = treatmentJudgment.items.map(buildDecision);
  const blockedCount = decisions.filter((decision) => decision.status === "blocked").length;
  const reviewCount = decisions.filter((decision) => decision.status === "review_required").length;
  const cleanupFirstCount = decisions.filter(
    (decision) => decision.cleanupDependency === "cleanup_first"
  ).length;
  const overallStatus: TinaTaxTreatmentPolicySnapshot["overallStatus"] =
    blockedCount > 0 ? "blocked" : reviewCount > 0 ? "review_required" : "cleared";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      decisions.length === 0
        ? "Tina does not currently see special tax-treatment policies that need separate routing."
        : overallStatus === "blocked"
          ? `Tina has ${blockedCount} blocked tax-treatment policy call${blockedCount === 1 ? "" : "s"} that should not reach final output.`
          : overallStatus === "review_required"
            ? `Tina has ${reviewCount} treatment policy decision${reviewCount === 1 ? "" : "s"} still under reviewer control, including ${cleanupFirstCount} cleanup-first call${cleanupFirstCount === 1 ? "" : "s"}.`
            : "Tina's current tax-treatment policy decisions are clear enough to carry forward.",
    nextStep:
      decisions.length === 0
        ? "Keep watching for messy tax facts that need explicit policy handling."
        : overallStatus === "blocked"
          ? "Clear the blocked policy decisions before Tina trusts the treatment layer."
          : overallStatus === "review_required"
            ? "Resolve the cleanup-first and reviewer-control policy decisions before calling the package final."
            : "Carry the cleared treatment policies through final reviewer packaging and form output.",
    decisions,
  };
}
