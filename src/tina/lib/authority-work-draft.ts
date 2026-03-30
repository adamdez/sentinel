import type { TinaAuthorityWorkItem, TinaWorkspaceDraft } from "@/tina/types";
import { markTinaCpaHandoffStale } from "@/tina/lib/cpa-handoff";
import { markTinaFinalSignoffStale } from "@/tina/lib/final-signoff";
import { markTinaOfficialFormPacketStale } from "@/tina/lib/official-form-packet";
import { markTinaPackageReadinessStale } from "@/tina/lib/package-readiness";
import { markTinaReviewerFinalStale } from "@/tina/lib/reviewer-final";
import { markTinaScheduleCDraftStale } from "@/tina/lib/schedule-c-draft";
import { markTinaTaxAdjustmentsStale } from "@/tina/lib/tax-adjustments";
import { upsertTinaAuthorityWorkItem } from "@/tina/lib/authority-work";

export function applyTinaAuthorityWorkItemToDraft(
  draft: TinaWorkspaceDraft,
  workItem: TinaAuthorityWorkItem
): TinaWorkspaceDraft {
  return {
    ...draft,
    authorityWork: upsertTinaAuthorityWorkItem(draft.authorityWork, workItem),
    taxAdjustments: markTinaTaxAdjustmentsStale(draft.taxAdjustments),
    reviewerFinal: markTinaReviewerFinalStale(draft.reviewerFinal),
    scheduleCDraft: markTinaScheduleCDraftStale(draft.scheduleCDraft),
    officialFormPacket: markTinaOfficialFormPacketStale(draft.officialFormPacket),
    packageReadiness: markTinaPackageReadinessStale(draft.packageReadiness),
    cpaHandoff: markTinaCpaHandoffStale(draft.cpaHandoff),
    finalSignoff: markTinaFinalSignoffStale(draft.finalSignoff),
  };
}

