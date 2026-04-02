import { buildTinaCpaHandoff } from "@/tina/lib/cpa-handoff";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import {
  buildTinaStartPathAssessment,
  describeTinaFilingLane,
  describeTinaOwnerCount,
  describeTinaTaxElection,
  formatTinaFilingLaneList,
} from "@/tina/lib/start-path";
import type { TinaPackageSnapshotRecord, TinaWorkspaceDraft } from "@/tina/types";

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
  options?: { packageStateOverride?: string }
): TinaCpaPacketExport {
  const handoff = buildTinaCpaHandoff(draft);
  const lane = recommendTinaFilingLane(draft.profile);
  const startPath = buildTinaStartPathAssessment(draft);
  const businessName = draft.profile.businessName || "Unnamed business";
  const taxYear = draft.profile.taxYear || "tax-year";
  const slug = toSlug(businessName) || "tina-business";
  const packageState =
    typeof options?.packageStateOverride === "string"
      ? options.packageStateOverride
      : draft.reviewerSignoff.packageState;

  const lines: string[] = [
    "# Tina CPA Review Packet",
    "",
    `- Business: ${businessName}`,
    `- Tax year: ${taxYear}`,
    `- Filing lane: ${lane.title}`,
    `- Owner count: ${describeTinaOwnerCount(draft.profile.ownerCount)}`,
    `- Tax election: ${describeTinaTaxElection(draft.profile.taxElection)}`,
    `- Packet status: ${handoff.summary}`,
    `- Next step: ${handoff.nextStep}`,
    `- Package state: ${packageState.replace(/_/g, " ")}`,
    "",
    "## Entity and ownership path",
    `- Ownership changed during year: ${draft.profile.ownershipChangedDuringYear ? "Yes" : "No"}`,
    `- Owner buyout or redemption: ${draft.profile.hasOwnerBuyoutOrRedemption ? "Yes" : "No"}`,
    `- Former owner payments: ${draft.profile.hasFormerOwnerPayments ? "Yes" : "No"}`,
    `- Community-property spouse exception: ${draft.profile.spouseCommunityPropertyTreatment}`,
    "",
    "## Start-path evidence",
  ];

  if (startPath.hasMixedHintedLanes) {
    lines.push(
      `- Saved papers hint at multiple return paths: ${formatTinaFilingLaneList(startPath.hintedLanes)}`
    );
  } else if (startPath.singleHintedLane !== null) {
    lines.push(`- Saved paper hint: ${describeTinaFilingLane(startPath.singleHintedLane)}`);
  } else {
    lines.push("- Tina does not see a conflicting saved-paper return hint right now.");
  }

  if (startPath.ownershipChangeClue) {
    lines.push("- Saved paper hint: ownership changed during the year");
  }

  if (startPath.formerOwnerPaymentClue) {
    lines.push("- Saved paper hint: former-owner payment activity");
  }

  lines.push(
    `- Organizer vs ownership mismatch: ${startPath.ownershipMismatchWithSingleOwnerLane ? "Yes" : "No"}`,
    "",
    "## Start-path rationale"
  );

  if (startPath.recommendation.reasons.length > 0) {
    startPath.recommendation.reasons.forEach((reason) => {
      lines.push(`- ${reason}`);
    });
  } else {
    lines.push("- Tina does not have saved rationale lines yet.");
  }

  if (startPath.recommendation.blockers.length > 0) {
    lines.push("", "## Start-path blockers");
    startPath.recommendation.blockers.forEach((blocker) => {
      lines.push(`- ${blocker}`);
    });
  }

  lines.push("", "## Reviewer state");
  lines.push(`- Signoff summary: ${draft.reviewerSignoff.summary}`);
  lines.push(`- Next signoff step: ${draft.reviewerSignoff.nextStep}`);
  if (draft.reviewerSignoff.hasDriftSinceSignoff) {
    lines.push("- Drift warning: the live package changed after the signed snapshot.");
  }

  lines.push(
    "",
    "## Packet sections",
  );

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
      if (item.reviewerNotes) lines.push(`  - Reviewer note: ${item.reviewerNotes}`);
      lines.push(`  - Citations saved: ${item.citations.length}`);
    });
  } else {
    lines.push("- No saved authority work items yet.");
  }

  lines.push("", "## Reviewer appendix");
  if (draft.appendix.items.length > 0) {
    draft.appendix.items.forEach((item) => {
      lines.push(`- ${item.title} [${item.taxPositionBucket}]`);
      lines.push(`  - ${item.summary}`);
      lines.push(`  - Why it matters: ${item.whyItMatters}`);
      lines.push(`  - Authority posture: ${item.authoritySummary}`);
      lines.push(`  - Reviewer question: ${item.reviewerQuestion}`);
      lines.push(`  - Disclosure flag: ${item.disclosureFlag}`);
      if (item.authorityTargets.length > 0) {
        lines.push(`  - Authority targets: ${item.authorityTargets.join(", ")}`);
      }
    });
  } else {
    lines.push("- No appendix items preserved yet.");
  }

  lines.push("", "## Tina note", "");
  lines.push(
    "This packet is a reviewer-ready brief from Tina. It is not a filed return, and it should travel with the source papers and human review notes."
  );

  return {
    fileName: `tina-cpa-packet-${slug}-${taxYear}.md`,
    mimeType: "text/markdown; charset=utf-8",
    contents: lines.join("\n"),
  };
}

export function buildTinaCpaPacketExportFromSnapshot(
  snapshot: TinaPackageSnapshotRecord
): TinaCpaPacketExport {
  return {
    fileName: snapshot.exportFileName,
    mimeType: "text/markdown; charset=utf-8",
    contents: snapshot.exportContents,
  };
}
