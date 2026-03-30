import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { buildTinaPacketIdentity, getTinaPacketFileTag } from "@/tina/lib/packet-identity";
import { buildTinaPacketReviewMarkdownLines } from "@/tina/lib/packet-review-export";
import type { TinaStoredPacketReviewState } from "@/tina/lib/packet-versions";
import type { TinaWorkspaceDraft } from "@/tina/types";

function formatMoney(value: number | null): string {
  if (value === null) return "No dollar amount yet";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export interface TinaCpaPacketExport {
  fileName: string;
  mimeType: string;
  contents: string;
}

export function buildTinaCpaPacketExport(
  draft: TinaWorkspaceDraft,
  options?: { packetReview?: TinaStoredPacketReviewState | null }
): TinaCpaPacketExport {
  const handoff = draft.cpaHandoff;
  const lane = recommendTinaFilingLane(draft.profile, draft.sourceFacts);
  const businessName = draft.profile.businessName || "Unnamed business";
  const taxYear = draft.profile.taxYear || "tax-year";
  const slug = toSlug(businessName) || "tina-business";
  const packetIdentity = buildTinaPacketIdentity(draft);
  const packetTag = getTinaPacketFileTag(draft);

  const lines: string[] = [
    "# Tina CPA Review Packet",
    "",
    `- Business: ${businessName}`,
    `- Tax year: ${taxYear}`,
    `- Filing lane: ${lane.title}`,
    `- Packet ID: ${packetIdentity.packetId}`,
    `- Packet version: ${packetIdentity.packetVersion}`,
    `- Packet status: ${handoff.summary}`,
    `- Next step: ${handoff.nextStep}`,
    "",
    "## Saved packet review",
    ...buildTinaPacketReviewMarkdownLines(options?.packetReview),
    "",
    "## Packet sections",
  ];

  handoff.artifacts.forEach((artifact) => {
    lines.push(`- ${artifact.title} [${artifact.status}]`);
    lines.push(`  - ${artifact.summary}`);
    artifact.includes.forEach((item) => {
      lines.push(`  - ${item}`);
    });
  });

  lines.push("", "## Schedule C draft");
  if (draft.scheduleCDraft.fields.length > 0) {
    draft.scheduleCDraft.fields.forEach((field) => {
      lines.push(
        `- ${field.lineNumber} ${field.label}: ${formatMoney(field.amount)} [${field.status}]`
      );
      lines.push(`  - ${field.summary}`);
    });
  } else {
    lines.push("- Tina has not built any Schedule C draft boxes yet.");
  }

  if (draft.scheduleCDraft.notes.length > 0) {
    lines.push("", "## Draft notes");
    draft.scheduleCDraft.notes.forEach((note) => {
      lines.push(`- ${note.title} [${note.severity}]`);
      lines.push(`  - ${note.summary}`);
    });
  }

  lines.push("", "## Open items");
  if (draft.packageReadiness.items.length > 0) {
    draft.packageReadiness.items.forEach((item) => {
      lines.push(`- ${item.title} [${item.severity}]`);
      lines.push(`  - ${item.summary}`);
    });
  } else {
    lines.push("- Tina does not see any open filing-package items right now.");
  }

  lines.push("", "## Saved papers");
  if (draft.documents.length > 0) {
    draft.documents.forEach((document) => {
      lines.push(`- ${document.name} (${document.category.replace(/_/g, " ")})`);
    });
  } else {
    lines.push("- No saved papers yet.");
  }

  lines.push("", "## Authority work");
  if (draft.authorityWork.length > 0) {
    draft.authorityWork.forEach((item) => {
      lines.push(`- ${item.ideaId} [${item.status}]`);
      if (item.memo) lines.push(`  - Tina note: ${item.memo}`);
      if (item.challengeVerdict !== "not_run") {
        lines.push(`  - Stress test: ${item.challengeVerdict.replace(/_/g, " ")}`);
      }
      if (item.challengeMemo) lines.push(`  - Stress-test note: ${item.challengeMemo}`);
      if (item.challengeWarnings.length > 0) {
        item.challengeWarnings.forEach((warning) => {
          lines.push(`  - Weak spot: ${warning}`);
        });
      }
      if (item.challengeQuestions.length > 0) {
        item.challengeQuestions.forEach((question) => {
          lines.push(`  - Reviewer question: ${question}`);
        });
      }
      if (item.reviewerNotes) lines.push(`  - Reviewer note: ${item.reviewerNotes}`);
      if (item.lastChallengeRunAt) {
        lines.push(`  - Last stress test: ${item.lastChallengeRunAt}`);
      }
      lines.push(`  - Citations saved: ${item.citations.length}`);
    });
  } else {
    lines.push("- No saved authority work items yet.");
  }

  lines.push("", "## Tina note", "");
  lines.push(
    "This packet is a reviewer-ready brief from Tina. It is not a filed return, and it should travel with the source papers and human review notes."
  );

  return {
    fileName: `tina-cpa-packet-${slug}-${taxYear}-${packetTag}.md`,
    mimeType: "text/markdown; charset=utf-8",
    contents: lines.join("\n"),
  };
}
