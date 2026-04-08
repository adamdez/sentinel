import { buildTinaBenchmarkDashboardReport } from "@/tina/lib/benchmark-dashboard";
import { buildTinaBenchmarkRescoreReport } from "@/tina/lib/benchmark-rescore";
import { buildTinaCpaHandoff } from "@/tina/lib/cpa-handoff";
import { buildTinaCurrentFileReviewerReality } from "@/tina/lib/current-file-reviewer-reality";
import { buildTinaFinalPackageQualityReport } from "@/tina/lib/final-package-quality";
import { buildTinaFilingApprovalReport } from "@/tina/lib/filing-approval";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { buildTinaLiveAcceptanceReport } from "@/tina/lib/live-acceptance";
import { buildTinaMefReadinessReport } from "@/tina/lib/mef-readiness";
import { buildTinaNumericProofRows } from "@/tina/lib/numeric-proof";
import { buildTinaPlanningReport } from "@/tina/lib/planning-report";
import { buildTinaReviewDeliveryReport } from "@/tina/lib/review-delivery";
import { buildTinaReviewTraceRows } from "@/tina/lib/review-trace";
import { buildTinaScheduleCExportContract } from "@/tina/lib/schedule-c-export-contract";
import { buildTinaTransactionReconciliationReport } from "@/tina/lib/transaction-reconciliation";
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
  const mefReadiness = buildTinaMefReadinessReport(draft);
  const filingApproval = buildTinaFilingApprovalReport(draft);
  const reviewDelivery = buildTinaReviewDeliveryReport(draft);
  const exportContract = buildTinaScheduleCExportContract(draft);
  const currentFileReality = buildTinaCurrentFileReviewerReality(draft);
  const packageQuality = buildTinaFinalPackageQualityReport(draft);
  const reviewTraceRows = buildTinaReviewTraceRows(draft);
  const numericProofRows = buildTinaNumericProofRows(draft);
  const reconciliation = buildTinaTransactionReconciliationReport(draft);
  const planningReport = buildTinaPlanningReport(draft);
  const benchmarkRescore = buildTinaBenchmarkRescoreReport(draft);
  const benchmarkDashboard = buildTinaBenchmarkDashboardReport(draft);
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

  lines.push("", "## Return trace");
  if (reviewTraceRows.length > 0) {
    reviewTraceRows.forEach((row) => {
      lines.push(
        `- ${row.lineNumber} ${row.label}: ${formatMoney(row.amount)} [${row.fieldStatus}]`
      );
      lines.push(`  - ${row.summary}`);
      if (row.reconciliationStatus !== "unknown") {
        lines.push(
          `  - Reconciliation: ${row.reconciliationStatus.replace(/_/g, " ")}; lineage clusters ${row.lineageCount}`
        );
      }
    });
  } else {
    lines.push("- Tina does not have any return-trace rows yet.");
  }

  lines.push("", "## Numeric proof");
  if (numericProofRows.length > 0) {
    numericProofRows.forEach((row) => {
      lines.push(
        `- ${row.lineNumber} ${row.label}: ${formatMoney(row.amount)} [support: ${row.supportLevel}]`
      );
      lines.push(`  - ${row.summary}`);
      row.bookEntries.forEach((entry) => {
        lines.push(
          `  - ${entry.label}: in ${formatMoney(entry.moneyIn)}, out ${formatMoney(entry.moneyOut)}, net ${formatMoney(entry.net)}, coverage ${entry.dateCoverage ?? "unknown"}`
        );
      });
      row.transactionGroups.forEach((group) => {
        lines.push(`  - Transaction group: ${group}`);
      });
      row.transactionAnchors.forEach((anchor) => {
        lines.push(`  - Anchor: ${anchor}`);
      });
    });
  } else {
    lines.push("- Tina does not have numeric proof rows for the current return draft yet.");
  }

  lines.push("", "## Transaction reconciliation");
  lines.push(`- ${reconciliation.summary}`);
  lines.push(`- Next step: ${reconciliation.nextStep}`);
  if (reconciliation.groups.length > 0) {
    reconciliation.groups.forEach((group) => {
      lines.push(`- ${group.label} [${group.status}]`);
      lines.push(
        `  - ${group.summary} Lineage clusters: ${group.lineageCount}; grouped flows: ${group.transactionGroupCount}; ledger buckets: ${group.bucketCount}; mismatches: ${group.mismatchCount}.`
      );
    });
  } else {
    lines.push("- Tina does not have transaction-group reconciliation rows yet.");
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

  lines.push("", "## Benchmark rescore");
  lines.push(`- ${benchmarkRescore.summary}`);
  lines.push(`- Next step: ${benchmarkRescore.nextStep}`);
  const cohortProposalLines =
    benchmarkRescore.cohortProposals.length > 0
      ? benchmarkRescore.cohortProposals.slice(0, 8)
      : [];
  if (cohortProposalLines.length > 0) {
    lines.push("- Cohort-specific proposals:");
    cohortProposalLines.forEach((proposal) => {
      lines.push(
        `  - ${proposal.cohortLabel}: ${proposal.skillId.replace(/_/g, " ")} [${proposal.recommendation}]`
      );
      lines.push(`  - ${proposal.summary}`);
    });
  }

  lines.push("", "## Internal benchmark dashboard");
  lines.push(`- ${benchmarkDashboard.summary}`);
  lines.push(`- Next step: ${benchmarkDashboard.nextStep}`);
  benchmarkDashboard.cards.forEach((card) => {
    lines.push(`- ${card.title} [${card.status}]`);
    lines.push(`  - ${card.summary}`);
    card.lines.forEach((line) => {
      lines.push(`  - ${line}`);
    });
  });

  lines.push("", "## Current-file reviewer reality");
  lines.push(`- ${currentFileReality.summary}`);
  lines.push(`- Next step: ${currentFileReality.nextStep}`);
  currentFileReality.lessons.forEach((lesson) => {
    lines.push(`  - Lesson: ${lesson}`);
  });
  currentFileReality.patterns.forEach((pattern) => {
    lines.push(
      `  - ${pattern.title}: ${pattern.verdict} via ${pattern.matchType === "cohort" ? "cohort match" : "direct file match"}${pattern.matchedCaseTags.length > 0 ? ` [${pattern.matchedCaseTags.join(", ")}]` : ""}`
    );
  });

  lines.push("", "## Final package quality");
  lines.push(`- ${packageQuality.summary}`);
  lines.push(`- Next step: ${packageQuality.nextStep}`);
  packageQuality.checks.forEach((check) => {
    lines.push(`- ${check.title} [${check.status}]`);
    lines.push(`  - ${check.summary}`);
  });

  lines.push("", "## Filing approval");
  lines.push(`- Status: ${filingApproval.status.replace(/_/g, " ")}`);
  lines.push(`- ${filingApproval.summary}`);
  lines.push(`- Next step: ${filingApproval.nextStep}`);
  filingApproval.checks.forEach((check) => {
    lines.push(`- ${check.title} [${check.status}]`);
    lines.push(`  - ${check.summary}`);
  });

  lines.push("", "## MeF readiness");
  lines.push(`- Status: ${mefReadiness.status.replace(/_/g, " ")}`);
  lines.push(`- Return type: ${mefReadiness.returnType}`);
  lines.push(`- Schedules: ${mefReadiness.schedules.join(", ")}`);
  lines.push(`- ${mefReadiness.summary}`);
  lines.push(`- Next step: ${mefReadiness.nextStep}`);
  mefReadiness.checks.forEach((check) => {
    lines.push(`- ${check.title} [${check.status}]`);
    lines.push(`  - ${check.summary}`);
  });
  if (mefReadiness.attachments.length > 0) {
    lines.push("- Attachment manifest:");
    mefReadiness.attachments.forEach((attachment) => {
      lines.push(
        `  - ${attachment.sourceName}: ${attachment.disposition.replace(/_/g, " ")}`
      );
      if (attachment.mefFileName) {
        lines.push(`  - MeF file name: ${attachment.mefFileName}`);
      }
      if (attachment.description) {
        lines.push(`  - Description: ${attachment.description}`);
      }
      lines.push(`  - ${attachment.summary}`);
    });
  }

  lines.push("", "## 1040/Schedule C export contract");
  lines.push(`- Status: ${exportContract.status.replace(/_/g, " ")}`);
  lines.push(`- ${exportContract.summary}`);
  lines.push(`- Next step: ${exportContract.nextStep}`);
  lines.push(`- Contract version: ${exportContract.contractVersion}`);
  lines.push(`- Return type: ${exportContract.returnType}`);
  lines.push(`- Schedules: ${exportContract.schedules.join(", ")}`);
  if (exportContract.fields.length > 0) {
    exportContract.fields.forEach((field) => {
      lines.push(
        `- ${field.lineNumber} ${field.label}: ${formatMoney(field.amount)} [${field.status}; support ${field.supportLevel}]`
      );
      lines.push(`  - ${field.summary}`);
    });
  } else {
    lines.push("- Tina does not have any export-contract fields yet.");
  }
  if (exportContract.unresolvedIssues.length > 0) {
    lines.push("- Unresolved export issues:");
    exportContract.unresolvedIssues.forEach((issue) => {
      lines.push(`  - ${issue.title} [${issue.severity}]`);
      lines.push(`  - ${issue.summary}`);
    });
  }

  lines.push("", "## Review delivery");
  lines.push(`- Status: ${reviewDelivery.status.replace(/_/g, " ")}`);
  lines.push(`- ${reviewDelivery.summary}`);
  lines.push(`- Next step: ${reviewDelivery.nextStep}`);
  reviewDelivery.checks.forEach((check) => {
    lines.push(`- ${check.title} [${check.status}]`);
    lines.push(`  - ${check.summary}`);
  });

  lines.push("", "## Planning and tradeoffs");
  lines.push(`- ${planningReport.summary}`);
  lines.push(`- Next step: ${planningReport.nextStep}`);
  if (planningReport.scenarios.length > 0) {
    planningReport.scenarios.forEach((scenario) => {
      lines.push(
        `- ${scenario.title} [support: ${scenario.supportLevel} | payoff: ${scenario.payoffWindow.replace(/_/g, " ")}]`
      );
      lines.push(`  - Tradeoff: ${scenario.tradeoff}`);
      lines.push(`  - Next step: ${scenario.nextStep}`);
    });
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
