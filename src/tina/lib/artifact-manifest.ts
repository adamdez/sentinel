import { getTinaOfficialFormPdfFileName } from "@/tina/lib/official-form-pdf";
import {
  buildTinaPacketIdentity,
  getTinaPacketFileTag,
  type TinaPacketIdentity,
} from "@/tina/lib/packet-identity";
import type { TinaWorkspaceDraft } from "@/tina/types";

export type TinaArtifactManifestStatus = "ready" | "waiting" | "blocked";
export type TinaArtifactDelivery = "bundle_only" | "direct" | "bundle_and_direct";

export interface TinaArtifactManifestItem {
  id: string;
  title: string;
  fileName: string;
  format: "Markdown" | "HTML" | "PDF" | "JSON";
  status: TinaArtifactManifestStatus;
  delivery: TinaArtifactDelivery;
  summary: string;
  nextStep: string;
}

export interface TinaArtifactManifest {
  packetIdentity: TinaPacketIdentity;
  summary: string;
  nextStep: string;
  readyCount: number;
  waitingCount: number;
  blockedCount: number;
  items: TinaArtifactManifestItem[];
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function createBaseFileNames(draft: TinaWorkspaceDraft) {
  const businessName = draft.profile.businessName || "Unnamed business";
  const taxYear = draft.profile.taxYear || "tax-year";
  const slug = toSlug(businessName) || "tina-business";
  const packetTag = getTinaPacketFileTag(draft);

  return {
    ownerSummary: `tina-owner-summary-${slug}-${taxYear}-${packetTag}.md`,
    cpaPacket: `tina-cpa-packet-${slug}-${taxYear}-${packetTag}.md`,
    reviewPacket: `tina-review-packet-${slug}-${taxYear}-${packetTag}.html`,
    fullReviewPacket: `tina-full-handoff-packet-${slug}-${taxYear}-${packetTag}.html`,
    officialFormHtml: `tina-official-form-packet-${slug}-${taxYear}-${packetTag}.html`,
    officialFormPdf: getTinaOfficialFormPdfFileName(draft),
    openItems: `tina-open-items-${slug}-${taxYear}-${packetTag}.md`,
    sourceIndex: `tina-source-index-${slug}-${taxYear}-${packetTag}.md`,
    signoff: `tina-signoff-${slug}-${taxYear}-${packetTag}.md`,
    bundle: `tina-review-bundle-${slug}-${taxYear}-${packetTag}.json`,
    manifest: `tina-artifact-manifest-${slug}-${taxYear}-${packetTag}.md`,
  };
}

function getCpaArtifactStatus(
  draft: TinaWorkspaceDraft,
  artifactId: string
): TinaArtifactManifestStatus {
  if (draft.cpaHandoff.status !== "complete") return "waiting";
  const artifact = draft.cpaHandoff.artifacts.find((candidate) => candidate.id === artifactId);
  return artifact?.status ?? "waiting";
}

function getPacketOutputStatus(draft: TinaWorkspaceDraft): TinaArtifactManifestStatus {
  if (draft.cpaHandoff.status !== "complete" || draft.cpaHandoff.artifacts.length === 0) {
    return "waiting";
  }

  if (draft.cpaHandoff.artifacts.some((artifact) => artifact.status === "blocked")) {
    return "blocked";
  }

  if (draft.cpaHandoff.artifacts.some((artifact) => artifact.status === "waiting")) {
    return "waiting";
  }

  return "ready";
}

function getOfficialFormOutputStatus(draft: TinaWorkspaceDraft): TinaArtifactManifestStatus {
  if (draft.officialFormPacket.status !== "complete" || draft.officialFormPacket.forms.length === 0) {
    return "waiting";
  }

  if (draft.officialFormPacket.forms.some((form) => form.status === "blocked")) {
    return "blocked";
  }

  if (draft.officialFormPacket.forms.some((form) => form.status === "needs_review")) {
    return "waiting";
  }

  return "ready";
}

function getBundleStatus(draft: TinaWorkspaceDraft): TinaArtifactManifestStatus {
  if (draft.finalSignoff.status !== "complete") return "waiting";
  if (draft.finalSignoff.level === "blocked") return "blocked";
  if (draft.finalSignoff.level === "waiting") return "waiting";
  return "ready";
}

function buildSummary(
  readyCount: number,
  waitingCount: number,
  blockedCount: number
): { summary: string; nextStep: string } {
  if (blockedCount === 0 && waitingCount === 0) {
    return {
      summary:
        "Tina has every current packet file in a ready state. You can hand over the bundle or the single files with less guesswork.",
      nextStep: "Pick the file or bundle you want to share first, then let the reviewer stay inside Tina's paper trail.",
    };
  }

  if (blockedCount > 0) {
    return {
      summary: `Tina sees ${blockedCount} blocked packet file${blockedCount === 1 ? "" : "s"} that should not be trusted as final handoff pieces yet.`,
      nextStep: "Clear the blocked packet pieces first. Tina should not lean on those files until the blockers are gone.",
    };
  }

  return {
    summary: `Tina has ${readyCount} ready packet file${readyCount === 1 ? "" : "s"} and ${waitingCount} waiting file${waitingCount === 1 ? "" : "s"} right now.`,
    nextStep: "The waiting files are close, but Tina still wants a fresh build or one more review step before they feel steady.",
  };
}

export function buildTinaArtifactManifest(draft: TinaWorkspaceDraft): TinaArtifactManifest {
  const packetIdentity = buildTinaPacketIdentity(draft);
  const fileNames = createBaseFileNames(draft);
  const packetOutputStatus = getPacketOutputStatus(draft);
  const officialFormStatus = getOfficialFormOutputStatus(draft);
  const bundleStatus = getBundleStatus(draft);
  const fullReviewPacketStatus: TinaArtifactManifestStatus =
    packetOutputStatus === "blocked" || officialFormStatus === "blocked" || bundleStatus === "blocked"
      ? "blocked"
      : packetOutputStatus === "waiting" ||
          officialFormStatus === "waiting" ||
          bundleStatus === "waiting"
        ? "waiting"
        : "ready";
  const sourceIndexStatus = getCpaArtifactStatus(draft, "source-paper-index");
  const openItemsStatus = getCpaArtifactStatus(draft, "open-items-list");
  const signoffStatus =
    draft.finalSignoff.status !== "complete"
      ? "waiting"
      : draft.finalSignoff.level === "blocked"
        ? "blocked"
        : draft.finalSignoff.level === "waiting"
          ? "waiting"
          : "ready";
  const ownerSummaryStatus =
    draft.packageReadiness.status !== "complete"
      ? "waiting"
      : draft.packageReadiness.level === "blocked"
        ? "blocked"
        : draft.packageReadiness.level === "needs_review"
          ? "waiting"
          : "ready";

  const items: TinaArtifactManifestItem[] = [
    {
      id: "owner-summary",
      title: "Owner summary",
      fileName: fileNames.ownerSummary,
      format: "Markdown",
      status: ownerSummaryStatus,
      delivery: "bundle_only",
      summary:
        ownerSummaryStatus === "ready"
          ? "Tina can explain the packet in plain language for the business owner."
          : "Tina can still write the owner summary, but it should travel with the current review warnings.",
      nextStep: draft.packageReadiness.nextStep,
    },
    {
      id: "cpa-packet-notes",
      title: "CPA packet notes",
      fileName: fileNames.cpaPacket,
      format: "Markdown",
      status: packetOutputStatus,
      delivery: "bundle_and_direct",
      summary:
        packetOutputStatus === "ready"
          ? "Tina has a steady plain-language note packet for a reviewer."
          : packetOutputStatus === "waiting"
            ? "The CPA notes can be downloaded, but Tina still wants more review before they feel complete."
            : "The CPA notes still carry blockers that should be fixed before handoff.",
      nextStep: draft.cpaHandoff.nextStep,
    },
    {
      id: "review-packet-html",
      title: "Review packet",
      fileName: fileNames.reviewPacket,
      format: "HTML",
      status: packetOutputStatus,
      delivery: "bundle_and_direct",
      summary:
        packetOutputStatus === "ready"
          ? "Tina has a cleaner single-file review packet ready."
          : packetOutputStatus === "waiting"
            ? "The review packet is close, but Tina still wants a fresher or calmer packet state first."
            : "The review packet still reflects blocked packet pieces.",
      nextStep: draft.cpaHandoff.nextStep,
    },
    {
      id: "full-handoff-packet",
      title: "Full handoff packet",
      fileName: fileNames.fullReviewPacket,
      format: "HTML",
      status: fullReviewPacketStatus,
      delivery: "bundle_and_direct",
      summary:
        fullReviewPacketStatus === "ready"
          ? "Tina can assemble the review story and official-form layer into one calmer handoff file."
          : fullReviewPacketStatus === "waiting"
            ? "The full handoff packet is close, but Tina still wants the packet pieces to settle first."
            : "The full handoff packet would still carry blocked packet pieces right now.",
      nextStep:
        fullReviewPacketStatus === "ready"
          ? "Download the full handoff packet if you want one printable file."
          : bundleStatus === "blocked"
            ? draft.finalSignoff.nextStep
            : officialFormStatus === "waiting"
              ? draft.officialFormPacket.nextStep
              : draft.cpaHandoff.nextStep,
    },
    {
      id: "official-form-html",
      title: "Federal business form packet",
      fileName: fileNames.officialFormHtml,
      format: "HTML",
      status: officialFormStatus,
      delivery: "bundle_and_direct",
      summary:
        officialFormStatus === "ready"
          ? "Tina has the year-specific federal business form packet laid out in a readable file."
          : officialFormStatus === "waiting"
            ? "The federal business form packet still needs a fresh build or more review."
            : "The federal business form packet still has blocked form lines or missing companion forms.",
      nextStep: draft.officialFormPacket.nextStep,
    },
    {
      id: "official-form-pdf",
      title: "Federal business form packet PDF",
      fileName: fileNames.officialFormPdf,
      format: "PDF",
      status: officialFormStatus,
      delivery: "direct",
      summary:
        officialFormStatus === "ready"
          ? "Tina can turn the current federal business form packet into a printable PDF."
          : officialFormStatus === "waiting"
            ? "Tina should steady the federal business form packet before printing it to PDF."
            : "Tina should not print this federal business form packet to PDF while blocked lines or missing companion forms remain.",
      nextStep: draft.officialFormPacket.nextStep,
    },
    {
      id: "open-items",
      title: "Open items list",
      fileName: fileNames.openItems,
      format: "Markdown",
      status: openItemsStatus,
      delivery: "bundle_only",
      summary:
        openItemsStatus === "ready"
          ? "Tina's open-items list is clean right now."
          : openItemsStatus === "waiting"
            ? "Tina still has review items the open-items file should keep front and center."
            : "Tina still has blockers, and they belong at the top of the packet.",
      nextStep: draft.packageReadiness.nextStep,
    },
    {
      id: "source-index",
      title: "Source index",
      fileName: fileNames.sourceIndex,
      format: "Markdown",
      status: sourceIndexStatus,
      delivery: "bundle_only",
      summary:
        sourceIndexStatus === "ready"
          ? "Tina can hand over a cleaner source-paper list."
          : sourceIndexStatus === "waiting"
            ? "Tina still wants more paper coverage before this source list feels done."
            : "The source-paper list should not be treated as stable yet.",
      nextStep: draft.cpaHandoff.nextStep,
    },
    {
      id: "signoff-note",
      title: "Signoff note",
      fileName: fileNames.signoff,
      format: "Markdown",
      status: signoffStatus,
      delivery: "bundle_only",
      summary:
        signoffStatus === "ready"
          ? "Tina has a clear final signoff note ready to travel with the packet."
          : signoffStatus === "waiting"
            ? "Tina still wants a final review pass before the signoff note feels complete."
            : "Tina should not present the signoff note as settled while blockers remain.",
      nextStep: draft.finalSignoff.nextStep,
    },
    {
      id: "review-bundle-package",
      title: "Review bundle package",
      fileName: fileNames.bundle,
      format: "JSON",
      status: bundleStatus,
      delivery: "direct",
      summary:
        bundleStatus === "ready"
          ? "Tina can pack the whole first review set into one downloadable bundle."
          : bundleStatus === "waiting"
            ? "The bundle can be packed, but Tina still wants a final review step before it feels handoff-ready."
            : "The bundle still reflects blocked packet pieces and should not be treated like a final handoff set.",
      nextStep: draft.finalSignoff.nextStep,
    },
  ];

  const readyCount = items.filter((item) => item.status === "ready").length;
  const waitingCount = items.filter((item) => item.status === "waiting").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const { summary, nextStep } = buildSummary(readyCount, waitingCount, blockedCount);

  return {
    packetIdentity,
    summary,
    nextStep,
    readyCount,
    waitingCount,
    blockedCount,
    items,
  };
}

export function getTinaArtifactManifestFileName(draft: TinaWorkspaceDraft): string {
  return createBaseFileNames(draft).manifest;
}

export function buildTinaArtifactManifestMarkdown(manifest: TinaArtifactManifest): string {
  const deliveryLabel = (delivery: TinaArtifactDelivery) => {
    switch (delivery) {
      case "bundle_only":
        return "inside bundle only";
      case "bundle_and_direct":
        return "bundle + own download";
      default:
        return "own download";
    }
  };

  return [
    "# Tina Artifact Manifest",
    "",
    `Packet ID: ${manifest.packetIdentity.packetId}`,
    `Packet version: ${manifest.packetIdentity.packetVersion}`,
    `Packet fingerprint: ${manifest.packetIdentity.fingerprint}`,
    "",
    manifest.summary,
    "",
    `Next step: ${manifest.nextStep}`,
    "",
    `Ready: ${manifest.readyCount}`,
    `Waiting: ${manifest.waitingCount}`,
    `Blocked: ${manifest.blockedCount}`,
    "",
    "## Packet files",
    ...manifest.items.flatMap((item) => [
      `- ${item.title} [${item.status}]`,
      `  - File: ${item.fileName}`,
      `  - Format: ${item.format}`,
      `  - Delivery: ${deliveryLabel(item.delivery)}`,
      `  - ${item.summary}`,
      `  - Next step: ${item.nextStep}`,
    ]),
  ].join("\n");
}
