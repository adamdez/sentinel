import { buildTinaArtifactManifest } from "@/tina/lib/artifact-manifest";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { buildTinaPacketIdentity, getTinaPacketFileTag } from "@/tina/lib/packet-identity";
import { formatTinaPacketReviewDecision } from "@/tina/lib/packet-review-export";
import type { TinaStoredPacketReviewState } from "@/tina/lib/packet-versions";
import { buildTinaReviewBundleExport } from "@/tina/lib/review-bundle-export";
import type { TinaWorkspaceDraft } from "@/tina/types";

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export interface TinaReviewBundlePackageExport {
  fileName: string;
  mimeType: string;
  contents: string;
}

export function buildTinaReviewBundlePackage(
  draft: TinaWorkspaceDraft,
  options?: { packetReview?: TinaStoredPacketReviewState | null }
): TinaReviewBundlePackageExport {
  const businessName = draft.profile.businessName || "Unnamed business";
  const taxYear = draft.profile.taxYear || "tax-year";
  const slug = toSlug(businessName) || "tina-business";
  const lane = recommendTinaFilingLane(draft.profile, draft.sourceFacts);
  const manifest = buildTinaArtifactManifest(draft);
  const packetReview = options?.packetReview ?? null;
  const bundle = buildTinaReviewBundleExport(draft, { packetReview });
  const packetIdentity = buildTinaPacketIdentity(draft);
  const packetTag = getTinaPacketFileTag(draft);

  const contents = JSON.stringify(
    {
      bundleVersion: 1,
      generatedAt: new Date().toISOString(),
      packetIdentity,
      businessName,
      taxYear,
      filingLane: lane.title,
      packetReview: packetReview
        ? {
            decision: packetReview.decision,
            decisionLabel: formatTinaPacketReviewDecision(packetReview.decision),
            reviewerName: packetReview.reviewerName,
            reviewerNote: packetReview.reviewerNote,
            reviewedAt: packetReview.reviewedAt,
          }
        : null,
      manifest,
      files: bundle.files,
    },
    null,
    2
  );

  return {
    fileName: `tina-review-bundle-${slug}-${taxYear}-${packetTag}.json`,
    mimeType: "application/json; charset=utf-8",
    contents,
  };
}
