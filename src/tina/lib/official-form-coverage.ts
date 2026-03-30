import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { getTinaIrsAuthorityRegistryStatus } from "@/tina/lib/irs-authority-registry";
import { hasTinaFixedAssetSignal } from "@/tina/lib/source-fact-signals";
import type { TinaIrsAuthorityWatchStatus, TinaWorkspaceDraft } from "@/tina/types";

export interface TinaOfficialFormCoverageGap {
  id: string;
  formNumber: string;
  title: string;
  summary: string;
}

export interface TinaOfficialFormPacketExportReadiness {
  ready: boolean;
  reason: string | null;
}

function findScheduleCDraftAmount(draft: TinaWorkspaceDraft, fieldId: string): number | null {
  return draft.scheduleCDraft.fields.find((field) => field.id === fieldId)?.amount ?? null;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function buildTinaOfficialFormCoverageGaps(
  draft: TinaWorkspaceDraft
): TinaOfficialFormCoverageGap[] {
  const lane = recommendTinaFilingLane(draft.profile, draft.sourceFacts);

  if (lane.laneId !== "schedule_c_single_member_llc" || lane.support !== "supported") {
    return [];
  }

  const gaps: TinaOfficialFormCoverageGap[] = [];
  const tentativeNet = findScheduleCDraftAmount(draft, "line-31-tentative-net");
  const qbiWork = draft.authorityWork.find((item) => item.ideaId === "qbi-review");

  if (tentativeNet !== null && tentativeNet >= 434) {
    gaps.push({
      id: "schedule-se",
      formNumber: "Schedule SE (Form 1040)",
      title: "Self-Employment Tax",
      summary: `Tina's tentative Schedule C net is ${formatMoney(
        tentativeNet
      )}. That usually pushes self-employment tax into the federal filing set, and Tina does not build Schedule SE yet.`,
    });
  }

  if (hasTinaFixedAssetSignal(draft.profile, draft.sourceFacts)) {
    gaps.push({
      id: "form-4562",
      formNumber: "Form 4562",
      title: "Depreciation and Amortization",
      summary: draft.profile.hasFixedAssets
        ? "The organizer says this business has equipment or other big purchases. IRS depreciation, Section 179, and listed-property reporting usually runs through Form 4562, and Tina does not build that form yet."
        : "Saved papers suggest this business has equipment, repairs, or small-equipment spending that can push depreciation or capitalization treatment into the federal package. Tina does not build Form 4562 yet.",
    });
  }

  if (qbiWork?.reviewerDecision === "use_it") {
    gaps.push({
      id: "qbi-form",
      formNumber: "Form 8995 or 8995-A",
      title: "Qualified Business Income Deduction",
      summary:
        "A reviewer marked QBI as usable. If the deduction is taken, the federal filing set usually needs Form 8995 or 8995-A, and Tina does not build those forms yet.",
    });
  }

  return gaps;
}

export function canExportTinaOfficialFormPacket(
  draft: TinaWorkspaceDraft,
  options?: {
    irsAuthorityWatchStatus?: TinaIrsAuthorityWatchStatus | null;
  }
): boolean {
  return getTinaOfficialFormPacketExportReadiness(draft, options).ready;
}

export function getTinaOfficialFormPacketExportReadiness(
  draft: TinaWorkspaceDraft,
  options?: {
    irsAuthorityWatchStatus?: TinaIrsAuthorityWatchStatus | null;
  }
): TinaOfficialFormPacketExportReadiness {
  const lane = recommendTinaFilingLane(draft.profile, draft.sourceFacts);
  const irsAuthorityStatus = getTinaIrsAuthorityRegistryStatus(lane.laneId, draft.profile.taxYear);
  const irsAuthorityWatchStatus = options?.irsAuthorityWatchStatus ?? null;

  if (irsAuthorityStatus.level === "blocked") {
    return {
      ready: false,
      reason: `${irsAuthorityStatus.summary} ${irsAuthorityStatus.nextStep}`,
    };
  }

  if (irsAuthorityWatchStatus?.level === "needs_review") {
    return {
      ready: false,
      reason: `${irsAuthorityWatchStatus.summary} ${irsAuthorityWatchStatus.nextStep}`,
    };
  }

  if (draft.officialFormPacket.status !== "complete") {
    return {
      ready: false,
      reason: "Federal business form packet is not built yet. Tina needs to build it again before export.",
    };
  }

  if (draft.officialFormPacket.forms.length === 0) {
    return {
      ready: false,
      reason: `${draft.officialFormPacket.summary} ${draft.officialFormPacket.nextStep}`,
    };
  }

  if (!draft.officialFormPacket.forms.every((form) => form.status === "ready")) {
    return {
      ready: false,
      reason: `${draft.officialFormPacket.summary} ${draft.officialFormPacket.nextStep}`,
    };
  }

  return {
    ready: true,
    reason: null,
  };
}
