import type {
  TinaEntityReturnSupportArtifact,
  TinaEntityReturnSupportArtifactKind,
  TinaEntityReturnSupportArtifactsSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaEntityReturnCalculations } from "@/tina/lib/entity-return-calculations";
import { buildTinaEntityReturnPackagePlan } from "@/tina/lib/entity-return-package-plan";
import type { TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "entity-support"
  );
}

function inferKind(title: string): TinaEntityReturnSupportArtifactKind {
  const normalized = title.toLowerCase();

  if (/schedule k-1/.test(normalized) || /\bk-1\b/.test(normalized)) {
    return "k1_package";
  }

  if (/schedule k\b/.test(normalized)) {
    return "schedule_support";
  }

  if (/capital/.test(normalized)) {
    return "capital_workpaper";
  }

  if (/balance-sheet|schedule l/.test(normalized)) {
    return "balance_sheet_package";
  }

  if (/m-1|m-2|equity|retained earnings/.test(normalized)) {
    return "equity_workpaper";
  }

  if (/compensation|guaranteed payment|distribution|shareholder-flow|shareholder flow|payment/.test(normalized)) {
    return "compensation_workpaper";
  }

  return "supporting_workpaper";
}

function buildArtifact(
  artifact: TinaEntityReturnSupportArtifact
): TinaEntityReturnSupportArtifact {
  return {
    ...artifact,
    reviewerQuestions: unique(artifact.reviewerQuestions),
    relatedPackageItemIds: unique(artifact.relatedPackageItemIds),
    relatedDocumentIds: unique(artifact.relatedDocumentIds),
  };
}

export function buildTinaEntityReturnSupportArtifacts(
  draft: TinaWorkspaceDraft
): TinaEntityReturnSupportArtifactsSnapshot {
  const calculations = buildTinaEntityReturnCalculations(draft);
  const packagePlan = buildTinaEntityReturnPackagePlan(draft);
  const taxYear = draft.profile.taxYear || "tax-year";
  const slug = slugify(draft.profile.businessName || calculations.returnFamily);
  const packageItemsById = new Map(packagePlan.items.map((item) => [item.id, item]));

  const items = calculations.items
    .filter((item) => item.formId === null)
    .map((item) => {
      const linkedPackageItems = item.relatedPackageItemIds
        .map((packageItemId) => packageItemsById.get(packageItemId) ?? null)
        .filter((value): value is NonNullable<typeof value> => value !== null);
      const supportedFieldCount = item.fields.filter((field) => field.supportLevel === "supported").length;
      const derivedFieldCount = item.fields.filter((field) => field.supportLevel === "derived").length;
      const missingFieldCount = item.fields.filter((field) => field.supportLevel === "missing").length;
      const kind = inferKind(item.title);

      return buildArtifact({
        id: `entity-support-${item.id}`,
        laneId: calculations.laneId,
        returnFamily: calculations.returnFamily,
        sourceCalculationItemId: item.id,
        title: item.title,
        kind,
        status: item.status,
        fileName: `${slugify(item.id)}-${slug}-${taxYear}.json`,
        mimeType: "application/json; charset=utf-8",
        deliverable:
          linkedPackageItems[0]?.deliverable ??
          `${item.title} structured support artifact`,
        summary:
          item.status === "ready"
            ? `${item.title} now exists as a structured support artifact Tina can carry with the return family.`
            : item.status === "needs_review"
              ? `${item.title} exists as a structured support artifact, but reviewer-controlled completion still matters.`
              : `${item.title} still has blocked support gaps and should hold back the return family from looking filing-grade.`,
        fieldCount: item.fields.length,
        supportedFieldCount,
        derivedFieldCount,
        missingFieldCount,
        fields: item.fields,
        reviewerQuestions: item.reviewerQuestions,
        relatedPackageItemIds: item.relatedPackageItemIds,
        relatedDocumentIds: unique([
          ...item.relatedDocumentIds,
          ...linkedPackageItems.flatMap((packageItem) => packageItem.relatedDocumentIds),
        ]),
      });
    });

  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const reviewCount = items.filter((item) => item.status === "needs_review").length;
  const overallStatus =
    blockedCount > 0 ? "blocked" : reviewCount > 0 ? "needs_review" : "ready";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId: calculations.laneId,
    returnFamily: calculations.returnFamily,
    overallStatus,
    summary:
      items.length === 0
        ? "This lane does not currently need separate non-form entity support artifacts."
        : overallStatus === "ready"
          ? "Tina has structured non-form support artifacts for the current entity return family."
          : overallStatus === "needs_review"
            ? `Tina has structured non-form support artifacts, but ${reviewCount} still need reviewer-controlled completion.`
            : `Tina still has ${blockedCount} blocked non-form support artifact${blockedCount === 1 ? "" : "s"} in the entity return family.`,
    nextStep:
      items.length === 0
        ? "Keep using the primary rendered form artifacts for the current lane."
        : overallStatus === "ready"
          ? "Carry these support artifacts with the rendered form family so K-1, balance-sheet, and workpaper truth stays explicit."
          : overallStatus === "needs_review"
            ? "Keep these support artifacts visible while the reviewer completes the remaining return-family work."
            : "Clear the blocked support artifacts before calling the entity return family filing-grade.",
    items,
  };
}
