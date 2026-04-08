import { buildTinaChecklist } from "@/tina/lib/checklist";
import { buildTinaFinalPackageQualityReport } from "@/tina/lib/final-package-quality";
import { buildTinaMefReadinessReport } from "@/tina/lib/mef-readiness";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { buildTinaPlanningReport } from "@/tina/lib/planning-report";
import { buildTinaScheduleCExportContract } from "@/tina/lib/schedule-c-export-contract";
import { buildTinaTransactionReconciliationReport } from "@/tina/lib/transaction-reconciliation";
import type {
  TinaCpaHandoffArtifact,
  TinaCpaHandoffArtifactStatus,
  TinaCpaHandoffSnapshot,
  TinaPackageReadinessItem,
  TinaWorkspaceDraft,
} from "@/tina/types";

function createEmptySnapshot(): TinaCpaHandoffSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not built the CPA handoff packet yet.",
    nextStep:
      "Build the package check first, then let Tina lay out what belongs in the review packet.",
    artifacts: [],
  };
}

export function createDefaultTinaCpaHandoff(): TinaCpaHandoffSnapshot {
  return createEmptySnapshot();
}

export function markTinaCpaHandoffStale(
  snapshot: TinaCpaHandoffSnapshot
): TinaCpaHandoffSnapshot {
  if (snapshot.status === "idle" || snapshot.status === "stale") return snapshot;

  return {
    ...snapshot,
    status: "stale",
    summary:
      "Your draft, package check, or review notes changed, so Tina should rebuild the CPA handoff packet.",
    nextStep:
      "Build the CPA handoff packet again so Tina does not lean on old review notes or packet sections.",
  };
}

function uniqueIds(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildArtifact(args: {
  id: string;
  title: string;
  status: TinaCpaHandoffArtifactStatus;
  summary: string;
  includes: string[];
  relatedFieldIds?: string[];
  relatedNoteIds?: string[];
  relatedReadinessItemIds?: string[];
  sourceDocumentIds?: string[];
}): TinaCpaHandoffArtifact {
  return {
    id: args.id,
    title: args.title,
    status: args.status,
    summary: args.summary,
    includes: args.includes,
    relatedFieldIds: args.relatedFieldIds ?? [],
    relatedNoteIds: args.relatedNoteIds ?? [],
    relatedReadinessItemIds: args.relatedReadinessItemIds ?? [],
    sourceDocumentIds: args.sourceDocumentIds ?? [],
  };
}

function isFieldOrNoteItem(item: TinaPackageReadinessItem): boolean {
  return item.relatedFieldIds.length > 0 || item.relatedNoteIds.length > 0;
}

function buildContinuityAndDepreciationIncludes(draft: TinaWorkspaceDraft): string[] {
  const carryoverFacts = draft.sourceFacts
    .filter((fact) => fact.label === "Carryover amount clue")
    .map((fact) => fact.value);
  const assetFacts = draft.sourceFacts
    .filter((fact) => fact.label === "Asset placed-in-service clue")
    .map((fact) => fact.value);
  const includes: string[] = [];

  if (carryoverFacts.length > 0) {
    includes.push(`Carryover support: ${carryoverFacts.slice(0, 2).join(" and ")}`);
  }
  if (assetFacts.length > 0) {
    includes.push(`Asset timing support: ${assetFacts.slice(0, 2).join(" and ")}`);
  }

  return includes;
}

function planningScenarioNeedsWorkflowAttention(args: {
  id: string;
  supportLevel: "strong" | "developing" | "thin";
  payoffWindow: "current_return" | "next_cycle" | "needs_reviewer_call";
}): boolean {
  if (args.payoffWindow === "needs_reviewer_call") return true;
  return args.id === "continuity" && args.supportLevel !== "strong";
}

export function buildTinaCpaHandoff(draft: TinaWorkspaceDraft): TinaCpaHandoffSnapshot {
  const now = new Date().toISOString();
  const lane = recommendTinaFilingLane(draft.profile);
  const checklist = buildTinaChecklist(draft, lane);
  const planningReport = buildTinaPlanningReport(draft);
  const packageQuality = buildTinaFinalPackageQualityReport(draft);
  const reconciliation = buildTinaTransactionReconciliationReport(draft);

  if (draft.reviewerFinal.status !== "complete") {
    return {
      ...createDefaultTinaCpaHandoff(),
      lastRunAt: now,
      status: draft.reviewerFinal.status === "stale" ? "stale" : "idle",
      summary:
        "Tina needs the return-facing review layer before she can lay out a CPA handoff packet.",
      nextStep: "Build the return-facing review layer first.",
    };
  }

  if (draft.scheduleCDraft.status !== "complete") {
    return {
      ...createDefaultTinaCpaHandoff(),
      lastRunAt: now,
      status: draft.scheduleCDraft.status === "stale" ? "stale" : "idle",
      summary:
        "Tina needs the first Schedule C draft before she can lay out a CPA handoff packet.",
      nextStep: "Build the Schedule C draft first.",
    };
  }

  if (draft.packageReadiness.status !== "complete") {
    return {
      ...createDefaultTinaCpaHandoff(),
      lastRunAt: now,
      status: draft.packageReadiness.status === "stale" ? "stale" : "idle",
      summary:
        "Tina needs the filing-package check before she can say which review packet pieces are ready.",
      nextStep: "Run the package check first.",
    };
  }

  const blockingReadinessItems = draft.packageReadiness.items.filter(
    (item) => item.severity === "blocking"
  );
  const attentionReadinessItems = draft.packageReadiness.items.filter(
    (item) => item.severity === "needs_attention"
  );
  const fieldOrNoteBlockingItems = blockingReadinessItems.filter(isFieldOrNoteItem);
  const fieldOrNoteAttentionItems = attentionReadinessItems.filter(isFieldOrNoteItem);
  const requiredChecklistItems = checklist.filter(
    (item) => item.priority === "required" && item.status === "needed"
  );
  const authorityBlockedAdjustments = draft.taxAdjustments.adjustments.filter(
    (adjustment) => adjustment.status === "needs_authority"
  );
  const reviewAdjustments = draft.taxAdjustments.adjustments.filter(
    (adjustment) => adjustment.status === "ready_for_review"
  );
  const blockedTaxPositions = draft.taxPositionMemory.records.filter(
    (record) => record.status === "blocked"
  );
  const reviewTaxPositions = draft.taxPositionMemory.records.filter(
    (record) => record.status === "needs_review"
  );
  const unresolvedAuthorityWork = draft.authorityWork.filter(
    (item) =>
      item.status === "not_started" ||
      item.status === "researching" ||
      item.status === "ready_for_reviewer"
  );
  const citationCount = draft.authorityWork.reduce(
    (total, item) => total + item.citations.length,
    0
  );

  const allDocumentIds = draft.documents.map((document) => document.id);
  const reviewerFinalDocumentIds = uniqueIds(
    draft.reviewerFinal.lines.flatMap((line) => line.sourceDocumentIds)
  );
  const scheduleCDocumentIds = uniqueIds([
    ...draft.scheduleCDraft.fields.flatMap((field) => field.sourceDocumentIds),
    ...draft.scheduleCDraft.notes.flatMap((note) => note.sourceDocumentIds),
  ]);
  const readinessDocumentIds = uniqueIds(
    draft.packageReadiness.items.flatMap((item) => item.sourceDocumentIds)
  );

  const coverNoteStatus: TinaCpaHandoffArtifactStatus =
    draft.packageReadiness.level === "blocked"
      ? "blocked"
      : draft.packageReadiness.level === "needs_review"
        ? "waiting"
        : "ready";

  const sourceIndexStatus: TinaCpaHandoffArtifactStatus =
    draft.documents.length === 0 || requiredChecklistItems.length > 0 ? "waiting" : "ready";

  const workpaperTraceStatus: TinaCpaHandoffArtifactStatus =
    draft.reviewerFinal.lines.length > 0 ? "ready" : "waiting";

  const authorityStatus: TinaCpaHandoffArtifactStatus =
    draft.taxPositionMemory.status !== "complete" ||
    authorityBlockedAdjustments.length > 0 ||
    blockedTaxPositions.length > 0
      ? "blocked"
      : reviewAdjustments.length > 0 ||
          reviewTaxPositions.length > 0 ||
          unresolvedAuthorityWork.length > 0
        ? "waiting"
        : "ready";

  const scheduleDraftStatus: TinaCpaHandoffArtifactStatus =
    draft.scheduleCDraft.fields.length === 0
      ? "waiting"
      : fieldOrNoteBlockingItems.length > 0
        ? "blocked"
        : fieldOrNoteAttentionItems.length > 0
          ? "waiting"
          : "ready";

  const openItemsStatus: TinaCpaHandoffArtifactStatus =
    blockingReadinessItems.length > 0
      ? "blocked"
      : attentionReadinessItems.length > 0
        ? "waiting"
        : "ready";
  const actionablePlanningScenarios = planningReport.scenarios.filter(
    (scenario) => planningScenarioNeedsWorkflowAttention(scenario)
  );
  const planningStatus: TinaCpaHandoffArtifactStatus =
    planningReport.scenarios.length === 0
      ? "ready"
      : actionablePlanningScenarios.length > 0
        ? "waiting"
        : "ready";
  const continuityAndDepreciationIncludes = buildContinuityAndDepreciationIncludes(draft);
  const continuityAndDepreciationStatus: TinaCpaHandoffArtifactStatus =
    continuityAndDepreciationIncludes.length === 0
      ? "ready"
      : draft.packageReadiness.items.some(
            (item) =>
              item.id === "continuity-review-missing" ||
              item.id === "depreciation-review-missing"
          )
        ? "waiting"
        : "ready";
  const reconciliationStatus: TinaCpaHandoffArtifactStatus =
    reconciliation.groups.some((group) => group.status === "blocked")
      ? "blocked"
      : reconciliation.groups.some((group) => group.status === "needs_review")
        ? "waiting"
        : reconciliation.groups.length > 0
          ? "ready"
          : "waiting";
  const packageQualityStatus: TinaCpaHandoffArtifactStatus =
    packageQuality.status === "blocked"
      ? "blocked"
      : packageQuality.status === "needs_review"
        ? "waiting"
        : "ready";
  const mefReadiness = buildTinaMefReadinessReport(draft);
  const exportContract = buildTinaScheduleCExportContract(draft);
  const mefReadinessStatus: TinaCpaHandoffArtifactStatus =
    mefReadiness.status === "blocked"
      ? "blocked"
      : mefReadiness.status === "needs_review"
        ? "waiting"
        : "ready";
  const exportContractStatus: TinaCpaHandoffArtifactStatus =
    exportContract.status === "blocked"
      ? "blocked"
      : exportContract.status === "needs_review"
        ? "waiting"
        : "ready";

  const artifacts: TinaCpaHandoffArtifact[] = [
    buildArtifact({
      id: "cpa-cover-note",
      title: "CPA cover note",
      status: coverNoteStatus,
      summary:
        coverNoteStatus === "ready"
          ? "Tina can frame the packet for a reviewer in plain language."
          : coverNoteStatus === "waiting"
            ? "Tina can draft the cover note, but a few review items still belong at the top."
            : "Tina can explain the packet, but she still has blockers a CPA should see first.",
      includes: [
        `Business: ${draft.profile.businessName || "Still needed"}`,
        `Tax year: ${draft.profile.taxYear || "Still needed"}`,
        `Lane: ${lane.title}`,
        `Package check: ${draft.packageReadiness.level.replace(/_/g, " ")}`,
      ],
      relatedReadinessItemIds: draft.packageReadiness.items.map((item) => item.id),
      sourceDocumentIds: readinessDocumentIds,
    }),
    buildArtifact({
      id: "source-paper-index",
      title: "Source paper index",
      status: sourceIndexStatus,
      summary:
        sourceIndexStatus === "ready"
          ? "Tina has enough saved papers to hand a reviewer a clean starting stack."
          : "Tina still wants more papers before this source list feels complete.",
      includes: [
        formatCount(draft.documents.length, "saved paper"),
        draft.priorReturnDocumentId
          ? "Prior-year return is attached"
          : "Prior-year return is not attached yet",
        `${draft.documentReadings.filter((reading) => reading.status === "complete").length} paper read${draft.documentReadings.filter((reading) => reading.status === "complete").length === 1 ? "" : "s"} complete`,
        requiredChecklistItems.length > 0
          ? `${formatCount(requiredChecklistItems.length, "required ask")} still open`
          : "Required paper asks are covered",
      ],
      sourceDocumentIds: allDocumentIds,
    }),
    buildArtifact({
      id: "workpaper-trace",
      title: "Workpaper trace",
      status: workpaperTraceStatus,
      summary:
        workpaperTraceStatus === "ready"
          ? "Tina can show how the return-facing lines trace back to saved papers."
          : "Tina still needs return-facing lines before the workpaper trace is useful.",
      includes: [
        formatCount(draft.reviewerFinal.lines.length, "review line"),
        formatCount(draft.scheduleCDraft.fields.length, "Schedule C field"),
        formatCount(draft.scheduleCDraft.notes.length, "review note"),
      ],
      relatedFieldIds: draft.scheduleCDraft.fields.map((field) => field.id),
      relatedNoteIds: draft.scheduleCDraft.notes.map((note) => note.id),
      sourceDocumentIds: reviewerFinalDocumentIds,
    }),
    buildArtifact({
      id: "authority-and-risk",
      title: "Authority and risk summary",
      status: authorityStatus,
      summary:
        authorityStatus === "ready"
          ? "Tina does not see authority blockers in the current packet."
          : authorityStatus === "waiting"
            ? "Tina still has authority notes, position reviews, or review calls that should travel with the packet."
            : draft.taxPositionMemory.status !== "complete"
              ? "Tina still needs a current tax-position register before a reviewer should trust this packet."
              : "Tina still has tax moves or positions that need proof before a reviewer should trust them.",
      includes: [
        formatCount(draft.authorityWork.length, "authority work item"),
        formatCount(citationCount, "citation"),
        formatCount(authorityBlockedAdjustments.length, "authority blocker"),
        formatCount(reviewAdjustments.length, "tax move waiting on review"),
        formatCount(blockedTaxPositions.length, "blocked tax position"),
        formatCount(reviewTaxPositions.length, "tax position waiting on review"),
      ],
      relatedReadinessItemIds: draft.packageReadiness.items
        .filter((item) => item.id.startsWith("adjustment-"))
        .map((item) => item.id),
      sourceDocumentIds: uniqueIds(
        draft.taxAdjustments.adjustments.flatMap((adjustment) => adjustment.sourceDocumentIds)
      ),
    }),
    buildArtifact({
      id: "schedule-c-draft",
      title: "Schedule C draft",
      status: scheduleDraftStatus,
      summary:
        scheduleDraftStatus === "ready"
          ? "Tina has a first supported Schedule C draft ready for CPA review."
          : scheduleDraftStatus === "waiting"
            ? "Tina drafted part of Schedule C, but some boxes or notes still need review."
            : "Tina should not hand off the Schedule C draft until its blocking boxes or notes are cleared.",
      includes: [
        formatCount(draft.scheduleCDraft.fields.length, "draft field"),
        formatCount(draft.scheduleCDraft.notes.length, "draft note"),
        formatCount(fieldOrNoteBlockingItems.length, "blocking field or note"),
        formatCount(fieldOrNoteAttentionItems.length, "field or note needing review"),
      ],
      relatedFieldIds: draft.scheduleCDraft.fields.map((field) => field.id),
      relatedNoteIds: draft.scheduleCDraft.notes.map((note) => note.id),
      relatedReadinessItemIds: uniqueIds([
        ...fieldOrNoteBlockingItems.map((item) => item.id),
        ...fieldOrNoteAttentionItems.map((item) => item.id),
      ]),
      sourceDocumentIds: scheduleCDocumentIds,
    }),
    buildArtifact({
      id: "open-items-list",
      title: "Open items list",
      status: openItemsStatus,
      summary:
        openItemsStatus === "ready"
          ? "Tina does not see open blockers in the current packet."
          : openItemsStatus === "waiting"
            ? "Tina can hand over the packet, but the reviewer should see the open review list."
            : "Tina still has blocking items that belong at the front of the packet.",
      includes: [
        formatCount(blockingReadinessItems.length, "blocking item"),
        formatCount(attentionReadinessItems.length, "review item"),
      ],
      relatedReadinessItemIds: draft.packageReadiness.items.map((item) => item.id),
      sourceDocumentIds: readinessDocumentIds,
    }),
    buildArtifact({
      id: "planning-and-tradeoffs",
      title: "Planning and tradeoffs",
      status: planningStatus,
      summary:
        planningReport.scenarios.length === 0
          ? "Tina does not see supported planning paths that belong in the handoff yet."
          : planningStatus === "ready"
            ? "Tina framed the planning tradeoffs clearly enough for a reviewer to scan quickly."
            : "Tina found planning tradeoffs that should be surfaced explicitly in the CPA handoff and reviewer queue.",
      includes:
        planningReport.scenarios.length === 0
          ? ["No supported planning scenarios yet"]
          : planningReport.scenarios.map(
              (scenario) =>
                `${scenario.title} [support: ${scenario.supportLevel}; payoff: ${scenario.payoffWindow.replace(/_/g, " ")}]`
            ),
      sourceDocumentIds: uniqueIds(
        planningReport.scenarios.flatMap((scenario) => {
          const matchingReadinessItem = draft.packageReadiness.items.find(
            (item) => item.id === `planning-${scenario.id}`
          );
          return matchingReadinessItem?.sourceDocumentIds ?? [];
        })
      ),
    }),
    buildArtifact({
      id: "transaction-reconciliation",
      title: "Transaction reconciliation",
      status: reconciliationStatus,
      summary:
        reconciliation.groups.length === 0
          ? "Tina still wants richer imported transaction groups before this packet has a transaction-grade reconciliation section."
          : reconciliation.summary,
      includes:
        reconciliation.groups.length > 0
          ? reconciliation.groups
              .slice(0, 5)
              .map(
                (group) =>
                  `${group.label} [${group.status}; lineage ${group.lineageCount}; mismatches ${group.mismatchCount}]`
              )
          : ["No imported transaction-group reconciliation yet"],
      relatedFieldIds: uniqueIds(reconciliation.groups.flatMap((group) => group.fieldIds)),
      sourceDocumentIds: uniqueIds(
        reconciliation.groups.flatMap((group) => group.sourceDocumentIds)
      ),
    }),
    buildArtifact({
      id: "final-package-quality",
      title: "Final package quality",
      status: packageQualityStatus,
      summary: packageQuality.summary,
      includes: packageQuality.checks.map(
        (check) => `${check.title}: ${check.status.replace(/_/g, " ")}`
      ),
    }),
    buildArtifact({
      id: "mef-readiness",
      title: "MeF-aligned handoff",
      status: mefReadinessStatus,
      summary: mefReadiness.summary,
      includes: [
        `Return type: ${mefReadiness.returnType}`,
        `Schedules: ${mefReadiness.schedules.join(", ")}`,
        ...mefReadiness.checks.map(
          (check) => `${check.title}: ${check.status.replace(/_/g, " ")}`
        ),
      ],
      sourceDocumentIds: mefReadiness.attachments.map((attachment) => attachment.documentId),
    }),
    buildArtifact({
      id: "schedule-c-export-contract",
      title: "1040/Schedule C export contract",
      status: exportContractStatus,
      summary: exportContract.summary,
      includes: [
        `Contract version: ${exportContract.contractVersion}`,
        `Return type: ${exportContract.returnType}`,
        `Schedules: ${exportContract.schedules.join(", ")}`,
        `${exportContract.fields.length} mapped field${exportContract.fields.length === 1 ? "" : "s"}`,
        `${exportContract.unresolvedIssues.length} unresolved issue${exportContract.unresolvedIssues.length === 1 ? "" : "s"}`,
      ],
      relatedFieldIds: exportContract.fields.map((field) => field.fieldId),
      relatedReadinessItemIds: exportContract.unresolvedIssues.map((issue) => issue.id),
      sourceDocumentIds: exportContract.attachmentManifest.map((attachment) => attachment.documentId),
    }),
    buildArtifact({
      id: "continuity-and-depreciation",
      title: "Continuity and depreciation review",
      status: continuityAndDepreciationStatus,
      summary:
        continuityAndDepreciationIncludes.length === 0
          ? "Tina does not see continuity or depreciation-specific review support that needs a separate packet section yet."
          : continuityAndDepreciationStatus === "waiting"
            ? "Tina found continuity or depreciation support that should travel with the packet as an explicit review section."
            : "Tina framed the continuity and depreciation support clearly in the packet.",
      includes:
        continuityAndDepreciationIncludes.length > 0
          ? continuityAndDepreciationIncludes
          : ["No continuity or depreciation-specific support attached"],
      sourceDocumentIds: uniqueIds(
        draft.sourceFacts
          .filter(
            (fact) =>
              fact.label === "Carryover amount clue" ||
              fact.label === "Asset placed-in-service clue"
          )
          .map((fact) => fact.sourceDocumentId)
      ),
    }),
  ];

  const readyCount = artifacts.filter((artifact) => artifact.status === "ready").length;
  const waitingCount = artifacts.filter((artifact) => artifact.status === "waiting").length;
  const blockedCount = artifacts.filter((artifact) => artifact.status === "blocked").length;

  let summary = `Tina prepared ${formatCount(artifacts.length, "packet section")}. ${formatCount(
    readyCount,
    "section"
  )} ready, ${formatCount(waitingCount, "section")} waiting, ${formatCount(
    blockedCount,
    "section"
  )} blocked.`;

  if (blockedCount === 0 && waitingCount === 0) {
    summary =
      "Tina prepared a full first CPA handoff packet. Nothing in the packet is still marked waiting or blocked.";
  }

  let nextStep =
    "Read through the packet once, then hand it to a CPA reviewer with the source papers attached.";
  if (blockedCount > 0) {
    nextStep =
      "Start with the blocked packet sections first. Tina should not hand this packet to a CPA yet.";
  } else if (waitingCount > 0) {
    nextStep =
      "Clear the waiting packet sections next so Tina can hand over a cleaner first review packet.";
  }

  const priorityScenario = actionablePlanningScenarios[0];
  if (priorityScenario) {
    nextStep = `${nextStep} Put this reviewer call near the front of the packet: ${priorityScenario.nextStep}`;
  }

  return {
    lastRunAt: now,
    status: "complete",
    summary,
    nextStep,
    artifacts,
  };
}
