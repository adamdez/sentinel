import { buildTinaClientUploadRequirements } from "@/tina/data/client-upload-schema";
import type { TinaChecklistItem, TinaFilingLaneRecommendation, TinaWorkspaceDraft } from "@/tina/types";

export function buildTinaChecklist(
  draft: TinaWorkspaceDraft,
  recommendation: TinaFilingLaneRecommendation
): TinaChecklistItem[] {
  return buildTinaClientUploadRequirements(draft, recommendation).map((requirement) => ({
    id: requirement.id,
    label: requirement.label,
    reason: requirement.reason,
    priority: requirement.priority,
    status: requirement.status,
  }));
}
