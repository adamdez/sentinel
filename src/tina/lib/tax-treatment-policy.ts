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

function inferPolicyArea(judgment: TinaTreatmentJudgmentItem): string {
  if (judgment.id.includes("mixed-use")) return "mixed_use";
  if (judgment.id.includes("depreciation")) return "fixed_assets";
  if (judgment.id.includes("inventory")) return "inventory_cogs";
  if (judgment.id.includes("worker") || judgment.id.includes("payroll") || judgment.id.includes("contractor")) {
    return "worker_payments";
  }
  if (judgment.id.includes("owner-flow")) return "owner_flows";
  if (judgment.id.includes("entity-boundary")) return "entity_boundary";
  if (judgment.id.includes("sales-tax")) return "sales_tax";
  return "general";
}

function inferMateriality(judgment: TinaTreatmentJudgmentItem): TinaMaterialityLevel {
  if (
    judgment.id.includes("mixed-use") ||
    judgment.id.includes("inventory") ||
    judgment.id.includes("depreciation") ||
    judgment.id.includes("owner-flow") ||
    judgment.id.includes("entity-boundary")
  ) {
    return "high";
  }

  if (judgment.id.includes("worker") || judgment.id.includes("sales-tax")) {
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
    policyArea: inferPolicyArea(judgment),
    status,
    materiality: inferMateriality(judgment),
    summary: judgment.summary,
    recommendedBucket: judgment.taxPositionBucket,
    nextStep: judgment.nextStep,
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
            ? `Tina has ${reviewCount} tax-treatment policy decision${reviewCount === 1 ? "" : "s"} still under reviewer control.`
            : "Tina's current tax-treatment policy decisions are clear enough to carry forward.",
    nextStep:
      decisions.length === 0
        ? "Keep watching for messy tax facts that need explicit policy handling."
        : overallStatus === "blocked"
          ? "Clear the blocked policy decisions before Tina trusts the treatment layer."
          : overallStatus === "review_required"
            ? "Resolve the reviewer-control policy decisions before calling the package final."
            : "Carry the cleared treatment policies through final reviewer packaging and form output.",
    decisions,
  };
}
