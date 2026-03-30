import {
  buildTinaArtifactManifest,
  buildTinaArtifactManifestMarkdown,
  getTinaArtifactManifestFileName,
} from "@/tina/lib/artifact-manifest";
import { buildTinaCpaPacketExport } from "@/tina/lib/cpa-packet-export";
import { canConfirmTinaFinalSignoff } from "@/tina/lib/final-signoff";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { canExportTinaOfficialFormPacket } from "@/tina/lib/official-form-coverage";
import { buildTinaOfficialFormExport } from "@/tina/lib/official-form-export";
import {
  buildTinaPacketReviewMarkdownLines,
  formatTinaPacketReviewDecision,
} from "@/tina/lib/packet-review-export";
import type { TinaStoredPacketReviewState } from "@/tina/lib/packet-versions";
import { buildTinaReviewBookExport } from "@/tina/lib/review-book-export";
import { buildTinaReviewPacketHtmlExport } from "@/tina/lib/review-packet-html";
import type { TinaWorkspaceDraft } from "@/tina/types";

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function formatMoney(value: number | null): string {
  if (value === null) return "No dollar amount yet";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export interface TinaReviewBundleFile {
  fileName: string;
  mimeType: string;
  contents: string;
}

export interface TinaReviewBundleExport {
  files: TinaReviewBundleFile[];
}

export function buildTinaReviewBundleExport(
  draft: TinaWorkspaceDraft,
  options?: { packetReview?: TinaStoredPacketReviewState | null }
): TinaReviewBundleExport {
  const businessName = draft.profile.businessName || "Unnamed business";
  const taxYear = draft.profile.taxYear || "tax-year";
  const slug = toSlug(businessName) || "tina-business";
  const lane = recommendTinaFilingLane(draft.profile, draft.sourceFacts);
  const manifest = buildTinaArtifactManifest(draft);
  const packetTag = manifest.packetIdentity.packetId.toLowerCase();
  const handoff = draft.cpaHandoff;
  const signoff = draft.finalSignoff;
  const packetReview = options?.packetReview ?? null;
  const cpaPacket = buildTinaCpaPacketExport(draft, { packetReview });
  const htmlPacket = buildTinaReviewPacketHtmlExport(draft, { packetReview });
  const fullHandoffPacketReady =
    draft.cpaHandoff.status === "complete" &&
    draft.cpaHandoff.artifacts.length > 0 &&
    canExportTinaOfficialFormPacket(draft) &&
    draft.finalSignoff.status === "complete";
  const officialFormPacketReady = canExportTinaOfficialFormPacket(draft);
  const fullHandoffPacket = fullHandoffPacketReady
    ? buildTinaReviewBookExport(draft, { packetReview })
    : null;
  const officialFormPacket = officialFormPacketReady ? buildTinaOfficialFormExport(draft) : null;

  const artifactManifest: TinaReviewBundleFile = {
    fileName: getTinaArtifactManifestFileName(draft),
    mimeType: "text/markdown; charset=utf-8",
    contents: buildTinaArtifactManifestMarkdown(manifest),
  };

  const ownerSummary: TinaReviewBundleFile = {
    fileName: `tina-owner-summary-${slug}-${taxYear}-${packetTag}.md`,
    mimeType: "text/markdown; charset=utf-8",
    contents: [
      "# Tina Owner Summary",
      "",
      `- Business: ${businessName}`,
      `- Tax year: ${taxYear}`,
      `- Filing lane: ${lane.title}`,
      `- Package state: ${draft.packageReadiness.summary}`,
      `- Tina says next: ${draft.packageReadiness.nextStep}`,
      `- Saved packet review: ${formatTinaPacketReviewDecision(packetReview?.decision ?? "unreviewed")}`,
      "",
      "## What Tina has ready",
      ...handoff.artifacts
        .filter((artifact) => artifact.status === "ready")
        .map((artifact) => `- ${artifact.title}: ${artifact.summary}`),
      "",
      "## What still needs care",
      ...(draft.packageReadiness.items.length > 0
        ? draft.packageReadiness.items.map(
            (item) => `- ${item.title} [${item.severity}]: ${item.summary}`
          )
        : ["- Tina does not see any open filing-package items right now."]),
      "",
      "## Saved packet review",
      ...buildTinaPacketReviewMarkdownLines(packetReview),
      "",
      "## First form preview",
      ...(draft.scheduleCDraft.fields.length > 0
        ? draft.scheduleCDraft.fields.map(
            (field) => `- ${field.lineNumber} ${field.label}: ${formatMoney(field.amount)}`
          )
        : ["- Tina has not built a Schedule C preview yet."]),
    ].join("\n"),
  };

  const openItems: TinaReviewBundleFile = {
    fileName: `tina-open-items-${slug}-${taxYear}-${packetTag}.md`,
    mimeType: "text/markdown; charset=utf-8",
    contents: [
      "# Tina Open Items",
      "",
      ...(draft.packageReadiness.items.length > 0
        ? draft.packageReadiness.items.flatMap((item) => [
            `- ${item.title} [${item.severity}]`,
            `  - ${item.summary}`,
          ])
        : ["- Tina does not see any open filing-package items right now."]),
    ].join("\n"),
  };

  const sourceIndex: TinaReviewBundleFile = {
    fileName: `tina-source-index-${slug}-${taxYear}-${packetTag}.md`,
    mimeType: "text/markdown; charset=utf-8",
    contents: [
      "# Tina Source Index",
      "",
      ...(draft.documents.length > 0
        ? draft.documents.flatMap((document) => [
            `- ${document.name}`,
            `  - Type: ${document.category.replace(/_/g, " ")}`,
            `  - Request: ${document.requestLabel ?? "General support"}`,
          ])
        : ["- No saved papers yet."]),
    ].join("\n"),
  };

  const signoffNote: TinaReviewBundleFile = {
    fileName: `tina-signoff-${slug}-${taxYear}-${packetTag}.md`,
    mimeType: "text/markdown; charset=utf-8",
    contents: [
      "# Tina Final Signoff",
      "",
      `- Signoff state: ${signoff.level}`,
      `- Tina says: ${signoff.summary}`,
      `- Next step: ${signoff.nextStep}`,
      `- Reviewer: ${signoff.reviewerName || "Not added yet"}`,
      `- Confirmed at: ${signoff.confirmedAt ?? "Not confirmed yet"}`,
      `- Confirmed packet: ${
        signoff.confirmedPacketId && signoff.confirmedPacketVersion
          ? `${signoff.confirmedPacketId} (${signoff.confirmedPacketVersion})`
          : "Not pinned yet"
      }`,
      `- Saved packet review: ${formatTinaPacketReviewDecision(packetReview?.decision ?? "unreviewed")}`,
      "",
      "## Checks",
      ...signoff.checks.map(
        (check) => `- [${check.checked ? "x" : " "}] ${check.label} - ${check.helpText}`
      ),
      "",
      "## Note",
      signoff.reviewerNote || "No reviewer note yet.",
      "",
      canConfirmTinaFinalSignoff(signoff) || signoff.confirmedAt
        ? "This packet can be treated as confirmed for reviewer handoff."
        : "This packet is not fully confirmed yet.",
    ].join("\n"),
  };

  const packetReviewFile: TinaReviewBundleFile = {
    fileName: `tina-packet-review-${slug}-${taxYear}-${packetTag}.md`,
    mimeType: "text/markdown; charset=utf-8",
    contents: ["# Tina Saved Packet Review", "", ...buildTinaPacketReviewMarkdownLines(packetReview)].join(
      "\n"
    ),
  };

  return {
    files: [
      artifactManifest,
      ownerSummary,
      cpaPacket,
      htmlPacket,
      ...(fullHandoffPacket ? [fullHandoffPacket] : []),
      ...(officialFormPacket ? [officialFormPacket] : []),
      packetReviewFile,
      openItems,
      sourceIndex,
      signoffNote,
    ],
  };
}
