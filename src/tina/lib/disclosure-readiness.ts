import type {
  TinaDisclosureReadinessItem,
  TinaDisclosureReadinessSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAuthorityPositionMatrix } from "@/tina/lib/authority-position-matrix";
import type { TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildItem(item: TinaDisclosureReadinessItem): TinaDisclosureReadinessItem {
  return {
    ...item,
    relatedPositionIds: unique(item.relatedPositionIds),
    relatedDocumentIds: unique(item.relatedDocumentIds),
  };
}

export function buildTinaDisclosureReadiness(
  draft: TinaWorkspaceDraft
): TinaDisclosureReadinessSnapshot {
  const positionMatrix = buildTinaAuthorityPositionMatrix(draft);
  const items: TinaDisclosureReadinessItem[] = positionMatrix.items
    .filter(
      (item) =>
        item.disclosureReadiness === "needs_review" || item.disclosureReadiness === "required"
    )
    .map((item) =>
      buildItem({
        id: `disclosure-${item.id}`,
        title: item.title,
        status: item.disclosureReadiness,
        summary:
          item.disclosureReadiness === "required"
            ? "Tina sees a position that may require disclosure handling before it should move forward."
            : "Tina sees a position whose disclosure posture still needs reviewer judgment.",
        whyItMatters:
          item.disclosureReadiness === "required"
            ? "Disclosure-sensitive positions can be legally usable, but Tina should not let them travel quietly."
            : "A reviewer should decide whether this position needs disclosure or more explicit caution before it affects the package.",
        requiredAction:
          item.disclosureReadiness === "required"
            ? "Reviewer should decide disclosure language and whether the position should stay out until that is locked."
            : "Reviewer should decide whether disclosure or extra caution is needed before use.",
        relatedPositionIds: [item.id],
        relatedDocumentIds: item.relatedDocumentIds,
      })
    );

  const requiredCount = items.filter((item) => item.status === "required").length;
  const overallStatus =
    requiredCount > 0 ? "required" : items.length > 0 ? "needs_review" : "clear";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    summary:
      overallStatus === "required"
        ? `Tina sees ${requiredCount} position${requiredCount === 1 ? "" : "s"} with likely disclosure handling requirements.`
        : overallStatus === "needs_review"
          ? "Tina sees disclosure-sensitive positions that still need reviewer judgment."
          : "Tina does not currently see disclosure-sensitive positions that need separate handling.",
    nextStep:
      overallStatus === "clear"
        ? "Keep disclosure quiet unless stronger authority or risk pushes a position into disclosure review."
        : "Resolve disclosure handling before Tina treats these positions as routine reviewer-ready work.",
    items,
  };
}
