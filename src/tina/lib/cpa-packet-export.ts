import { buildTinaCpaHandoff } from "@/tina/lib/cpa-handoff";
import { buildTinaFilingApprovalReport } from "@/tina/lib/filing-approval";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { buildTinaLiveAcceptanceReport } from "@/tina/lib/live-acceptance";
import { buildTinaReviewDeliveryReport } from "@/tina/lib/review-delivery";
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

export function buildTinaCpaPacketExport(draft: TinaWorkspaceDraft): TinaCpaPacketExport {
  const handoff = buildTinaCpaHandoff(draft);
  const lane = recommendTinaFilingLane(draft.profile);
  const liveAcceptance = buildTinaLiveAcceptanceReport(draft);
  const filingApproval = buildTinaFilingApprovalReport(draft);
  const reviewDelivery = buildTinaReviewDeliveryReport(draft);
  const businessName = draft.profile.businessName || "Unnamed business";
  const taxYear = draft.profile.taxYear || "tax-year";
  const slug = toSlug(businessName) || "tina-business";

  const lines: string[] = [
    "# Tina CPA Review Packet",
    "",
    `- Business: ${businessName}`,
    `- Tax year: ${taxYear}`,
    `- Filing lane: ${lane.title}`,
    `- Packet status: ${handoff.summary}`,
    `- Next step: ${handoff.nextStep}`,
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
      if (item.reviewerNotes) lines.push(`  - Reviewer note: ${item.reviewerNotes}`);
      lines.push(`  - Citations saved: ${item.citations.length}`);
    });
  } else {
    lines.push("- No saved authority work items yet.");
  }

  lines.push("", "## Tax position register");
  if (draft.taxPositionMemory.records.length > 0) {
    draft.taxPositionMemory.records.forEach((record) => {
      lines.push(`- ${record.title} [${record.status} | confidence: ${record.confidence}]`);
      lines.push(`  - ${record.summary}`);
      lines.push(`  - Treatment: ${record.treatmentSummary}`);
      lines.push(`  - Reviewer guidance: ${record.reviewerGuidance}`);
    });
  } else {
    lines.push("- No saved tax position records yet.");
  }

  lines.push("", "## Live acceptance benchmark");
  lines.push(`- ${liveAcceptance.summary}`);
  lines.push(`- Next step: ${liveAcceptance.nextStep}`);
  lines.push(`- Benchmark movement: ${liveAcceptance.benchmarkMovement.summary}`);
  liveAcceptance.windows.forEach((window) => {
    lines.push(
      `- ${window.label}: ${window.totalOutcomes} outcome${window.totalOutcomes === 1 ? "" : "s"}, acceptance score ${window.acceptanceScore ?? 0}/100, trust ${window.trustLevel.replace(/_/g, " ")}`
    );
  });
  if (liveAcceptance.cohorts.length > 0) {
    lines.push("  - Cohorts:");
    liveAcceptance.cohorts.forEach((cohort) => {
      lines.push(
        `  - ${cohort.label}: ${cohort.totalOutcomes} outcome${cohort.totalOutcomes === 1 ? "" : "s"}, acceptance score ${cohort.acceptanceScore ?? 0}/100, trust ${cohort.trustLevel.replace(/_/g, " ")}`
      );
    });
  }
  if (liveAcceptance.currentFileCohorts.length > 0) {
    lines.push("  - Current file cohorts:");
    liveAcceptance.currentFileCohorts.forEach((cohort) => {
      lines.push(
        `  - ${cohort.label}: acceptance score ${cohort.acceptanceScore ?? 0}/100, trust ${cohort.trustLevel.replace(/_/g, " ")}, next step: ${cohort.nextStep}`
      );
    });
  }
  if (liveAcceptance.unstablePatterns.length > 0) {
    lines.push("  - Unstable patterns:");
    liveAcceptance.unstablePatterns.forEach((pattern) => {
      lines.push(
        `  - ${pattern.label}: ${pattern.acceptanceScore}/100, next step: ${pattern.nextStep}`
      );
    });
  }

  lines.push("", "## Filing approval");
  lines.push(`- Status: ${filingApproval.status.replace(/_/g, " ")}`);
  lines.push(`- ${filingApproval.summary}`);
  lines.push(`- Next step: ${filingApproval.nextStep}`);
  filingApproval.checks.forEach((check) => {
    lines.push(`- ${check.title} [${check.status}]`);
    lines.push(`  - ${check.summary}`);
  });

  lines.push("", "## Review delivery");
  lines.push(`- Status: ${reviewDelivery.status.replace(/_/g, " ")}`);
  lines.push(`- ${reviewDelivery.summary}`);
  lines.push(`- Next step: ${reviewDelivery.nextStep}`);
  reviewDelivery.checks.forEach((check) => {
    lines.push(`- ${check.title} [${check.status}]`);
    lines.push(`  - ${check.summary}`);
  });

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
