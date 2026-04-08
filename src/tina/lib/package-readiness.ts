import { buildTinaChecklist } from "@/tina/lib/checklist";
import { buildTinaCurrentFileReviewerReality } from "@/tina/lib/current-file-reviewer-reality";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { buildTinaFinalPackageQualityReport } from "@/tina/lib/final-package-quality";
import { buildTinaLiveAcceptanceReport } from "@/tina/lib/live-acceptance";
import { buildTinaPlanningReport } from "@/tina/lib/planning-report";
import { buildTinaProfileFingerprint } from "@/tina/lib/profile-fingerprint";
import { buildTinaTransactionReconciliationReport } from "@/tina/lib/transaction-reconciliation";
import type {
  TinaPackageReadinessItem,
  TinaPackageReadinessLevel,
  TinaPackageReadinessSnapshot,
  TinaScheduleCDraftField,
  TinaScheduleCDraftNote,
  TinaWorkspaceDraft,
} from "@/tina/types";

function createEmptySnapshot(): TinaPackageReadinessSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    level: "blocked",
    summary: "Tina has not checked filing-package readiness yet.",
    nextStep: "Build the Schedule C draft first, then let Tina check what still blocks the package.",
    items: [],
  };
}

export function createDefaultTinaPackageReadiness(): TinaPackageReadinessSnapshot {
  return createEmptySnapshot();
}

export function markTinaPackageReadinessStale(
  snapshot: TinaPackageReadinessSnapshot
): TinaPackageReadinessSnapshot {
  if (snapshot.status === "idle" || snapshot.status === "stale") return snapshot;

  return {
    ...snapshot,
    status: "stale",
    summary: "Your draft, review state, or source papers changed, so Tina should check package readiness again.",
    nextStep: "Run the package check again so Tina does not lean on old filing-readiness answers.",
  };
}

function createItem(args: {
  id: string;
  title: string;
  summary: string;
  severity: "blocking" | "needs_attention";
  relatedFieldIds?: string[];
  relatedNoteIds?: string[];
  relatedReviewItemIds?: string[];
  sourceDocumentIds?: string[];
}): TinaPackageReadinessItem {
  return {
    id: args.id,
    title: args.title,
    summary: args.summary,
    severity: args.severity,
    relatedFieldIds: args.relatedFieldIds ?? [],
    relatedNoteIds: args.relatedNoteIds ?? [],
    relatedReviewItemIds: args.relatedReviewItemIds ?? [],
    sourceDocumentIds: args.sourceDocumentIds ?? [],
  };
}

function fieldNeedsBlockingReview(field: TinaScheduleCDraftField): boolean {
  return field.status === "waiting";
}

function fieldNeedsAttention(field: TinaScheduleCDraftField): boolean {
  return field.status === "needs_attention";
}

function noteNeedsAttention(note: TinaScheduleCDraftNote): boolean {
  return note.severity === "needs_attention";
}

function collectSourceFactValues(
  draft: TinaWorkspaceDraft,
  labels: string[]
): string[] {
  const allowed = new Set(labels);
  return draft.sourceFacts
    .filter((fact) => allowed.has(fact.label))
    .map((fact) => fact.value);
}

function hasAdjustmentKind(
  draft: TinaWorkspaceDraft,
  kind: TinaWorkspaceDraft["taxAdjustments"]["adjustments"][number]["kind"]
): boolean {
  return draft.taxAdjustments.adjustments.some((adjustment) => adjustment.kind === kind);
}

function planningScenarioNeedsWorkflowAttention(args: {
  id: string;
  supportLevel: "strong" | "developing" | "thin";
  payoffWindow: "current_return" | "next_cycle" | "needs_reviewer_call";
}): boolean {
  if (args.payoffWindow === "needs_reviewer_call") return true;
  return args.id === "continuity" && args.supportLevel !== "strong";
}

function parseTimestamp(value: string | null): number {
  if (!value || value.trim().length === 0) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

interface EvidenceTimestampRollup {
  latest: number;
  hasInvalid: boolean;
}

function collectTimestamp(value: string | null): { parsed: number; invalid: boolean } {
  if (!value || value.trim().length === 0) {
    return { parsed: 0, invalid: false };
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return { parsed: 0, invalid: true };
  }

  return { parsed, invalid: false };
}

function latestEvidenceTimestamp(draft: TinaWorkspaceDraft): EvidenceTimestampRollup {
  const candidates = [
    ...draft.documents.map((document) => collectTimestamp(document.uploadedAt)),
    ...draft.sourceFacts.map((fact) => collectTimestamp(fact.capturedAt)),
    ...draft.documentReadings.map((reading) => collectTimestamp(reading.lastReadAt)),
    collectTimestamp(draft.priorReturn?.capturedAt ?? null),
  ];

  const latest = Math.max(0, ...candidates.map((candidate) => candidate.parsed));
  const hasInvalid = candidates.some((candidate) => candidate.invalid);

  return { latest, hasInvalid };
}

function hasCurrentReviewRun(
  status: string,
  lastRunAt: string | null,
  runProfileFingerprint: string | null | undefined,
  currentProfileFingerprint: string,
  evidence: EvidenceTimestampRollup
): boolean {
  if (status !== "complete" || typeof lastRunAt !== "string" || lastRunAt.trim().length === 0) {
    return false;
  }

  if (
    typeof runProfileFingerprint !== "string" ||
    runProfileFingerprint.trim().length === 0 ||
    runProfileFingerprint !== currentProfileFingerprint
  ) {
    return false;
  }

  const runAt = parseTimestamp(lastRunAt);
  if (runAt <= 0) return false;
  if (evidence.hasInvalid) return false;
  if (evidence.latest > 0 && runAt < evidence.latest) return false;
  return true;
}

export function buildTinaPackageReadiness(
  draft: TinaWorkspaceDraft
): TinaPackageReadinessSnapshot {
  const now = new Date().toISOString();
  const lane = recommendTinaFilingLane(draft.profile);
  const checklist = buildTinaChecklist(draft, lane);
  const planningReport = buildTinaPlanningReport(draft);
  const packageQuality = buildTinaFinalPackageQualityReport(draft);
  const reconciliation = buildTinaTransactionReconciliationReport(draft);
  const currentFileReality = buildTinaCurrentFileReviewerReality(draft);
  const liveAcceptance = buildTinaLiveAcceptanceReport(draft);
  const items: TinaPackageReadinessItem[] = [];
  const ledgerBucketClues = collectSourceFactValues(draft, ["Ledger bucket clue"]);
  const payrollClues = collectSourceFactValues(draft, ["Payroll clue", "Payroll filing period clue"]);
  const contractorClues = collectSourceFactValues(draft, ["Contractor clue"]);
  const salesTaxClues = collectSourceFactValues(draft, ["Sales tax clue"]);
  const inventoryClues = collectSourceFactValues(draft, ["Inventory clue"]);
  const ownerFlowClues = collectSourceFactValues(draft, [
    "Owner draw clue",
    "Intercompany transfer clue",
    "Related-party clue",
  ]);
  const carryoverAmounts = collectSourceFactValues(draft, ["Carryover amount clue"]);
  const assetPlacedInServiceDates = collectSourceFactValues(draft, [
    "Asset placed-in-service clue",
  ]);
  const evidence = latestEvidenceTimestamp(draft);
  const currentProfileFingerprint = buildTinaProfileFingerprint(draft.profile);

  if (lane.support !== "supported" || lane.laneId !== "schedule_c_single_member_llc") {
    items.push(
      createItem({
        id: "lane-not-supported",
        title: "Tina is not on a supported filing lane yet",
        summary:
          "This first filing package check only works for Tina's supported Schedule C path. Tina should stop here instead of pretending the package is ready.",
        severity: "blocking",
      })
    );
  }

  if (
    !hasCurrentReviewRun(
      draft.bootstrapReview.status,
      draft.bootstrapReview.lastRunAt,
      draft.bootstrapReview.profileFingerprint,
      currentProfileFingerprint,
      evidence
    )
  ) {
    items.push(
      createItem({
        id: "bootstrap-review-not-current",
        title: "Bootstrap review is not current",
        summary:
          evidence.hasInvalid
            ? "Tina found invalid evidence timestamps, so bootstrap review freshness cannot be trusted yet."
            : "Tina needs a current bootstrap review run before claiming package readiness. This keeps setup conflicts from slipping past the filing check.",
        severity: "blocking",
      })
    );
  }

  if (
    !hasCurrentReviewRun(
      draft.issueQueue.status,
      draft.issueQueue.lastRunAt,
      draft.issueQueue.profileFingerprint,
      currentProfileFingerprint,
      evidence
    )
  ) {
    items.push(
      createItem({
        id: "issue-queue-not-current",
        title: "Issue queue is not current",
        summary:
          evidence.hasInvalid
            ? "Tina found invalid evidence timestamps, so issue-queue freshness cannot be trusted yet."
            : "Tina needs a current issue-queue run before claiming package readiness. This keeps paper conflicts from slipping past the filing check.",
        severity: "blocking",
      })
    );
  }

  if (draft.reviewerFinal.status !== "complete") {
    items.push(
      createItem({
        id: "reviewer-final-missing",
        title: "Tina still needs the return-facing review layer",
        summary:
          "Tina cannot call the package filing-ready until the return-facing review layer is built from approved tax moves.",
        severity: "blocking",
      })
    );
  }

  if (draft.scheduleCDraft.status !== "complete") {
    items.push(
      createItem({
        id: "schedule-c-missing",
        title: "Tina still needs the Schedule C draft",
        summary:
          "Tina cannot check the filing package until the first supported form draft is built.",
        severity: "blocking",
      })
    );
  }

  checklist
    .filter((item) => item.priority === "required" && item.status === "needed")
    .forEach((item) => {
      items.push(
        createItem({
          id: `required-${item.id}`,
          title: item.label,
          summary: `${item.reason} Tina should get this before calling the package ready.`,
          severity: "blocking",
        })
      );
    });

  draft.bootstrapReview.items
    .filter((item) => item.status === "open")
    .forEach((item) => {
      items.push(
        createItem({
          id: `bootstrap-${item.id}`,
          title: item.title,
          summary: item.summary,
          severity: item.severity === "blocking" ? "blocking" : "needs_attention",
          relatedReviewItemIds: [item.id],
          sourceDocumentIds: item.documentId ? [item.documentId] : [],
        })
      );
    });

  draft.issueQueue.items
    .filter((item) => item.status === "open")
    .forEach((item) => {
      if (item.severity === "watch") {
        return;
      }
      items.push(
        createItem({
          id: `issue-${item.id}`,
          title: item.title,
          summary: item.summary,
          severity: item.severity === "blocking" ? "blocking" : "needs_attention",
          relatedReviewItemIds: [item.id],
          sourceDocumentIds: item.documentId ? [item.documentId] : [],
        })
      );
    });

  draft.taxAdjustments.adjustments
    .filter((adjustment) => adjustment.status === "needs_authority")
    .forEach((adjustment) => {
      items.push(
        createItem({
          id: `adjustment-authority-${adjustment.id}`,
          title: adjustment.title,
          summary:
            "Tina still needs authority proof or reviewer approval before this tax move can safely reach the filing package.",
          severity: "blocking",
          sourceDocumentIds: adjustment.sourceDocumentIds,
        })
      );
    });

  draft.taxAdjustments.adjustments
    .filter((adjustment) => adjustment.status === "ready_for_review")
    .forEach((adjustment) => {
      items.push(
        createItem({
          id: `adjustment-review-${adjustment.id}`,
          title: adjustment.title,
          summary:
            "This tax move is waiting for a human review call before Tina can treat the package as filing-ready.",
          severity: "blocking",
          sourceDocumentIds: adjustment.sourceDocumentIds,
        })
      );
    });

  if (draft.taxAdjustments.status === "complete" && draft.taxPositionMemory.status !== "complete") {
    items.push(
      createItem({
        id: "tax-position-memory-not-current",
        title: "Tax-position memory is not current",
        summary:
          "Tina should not call this package ready until each tax move is tied to a current position record with reviewer and authority context.",
        severity: "blocking",
        sourceDocumentIds: draft.taxAdjustments.adjustments.flatMap(
          (adjustment) => adjustment.sourceDocumentIds
        ),
      })
    );
  }

  draft.taxPositionMemory.records
    .filter((record) => record.status === "blocked")
    .forEach((record) => {
      items.push(
        createItem({
          id: `tax-position-blocked-${record.id}`,
          title: record.title,
          summary:
            "This tax position is still blocked, so Tina should not treat the package as CPA-ready yet.",
          severity: "blocking",
          sourceDocumentIds: record.sourceDocumentIds,
        })
      );
    });

  draft.taxPositionMemory.records
    .filter((record) => record.status === "needs_review")
    .forEach((record) => {
      items.push(
        createItem({
          id: `tax-position-review-${record.id}`,
          title: record.title,
          summary:
            "This tax position still needs reviewer anchoring before Tina can honestly say the package is ready.",
          severity: "blocking",
          sourceDocumentIds: record.sourceDocumentIds,
        })
      );
    });

  draft.scheduleCDraft.fields
    .filter((field) => fieldNeedsBlockingReview(field))
    .forEach((field) => {
      items.push(
        createItem({
          id: `field-waiting-${field.id}`,
          title: `${field.lineNumber}: ${field.label}`,
          summary: field.summary,
          severity: "blocking",
          relatedFieldIds: [field.id],
          sourceDocumentIds: field.sourceDocumentIds,
        })
      );
    });

  draft.scheduleCDraft.fields
    .filter((field) => fieldNeedsAttention(field))
    .forEach((field) => {
      items.push(
        createItem({
          id: `field-review-${field.id}`,
          title: `${field.lineNumber}: ${field.label}`,
          summary: field.summary,
          severity: "needs_attention",
          relatedFieldIds: [field.id],
          sourceDocumentIds: field.sourceDocumentIds,
        })
      );
    });

  draft.scheduleCDraft.notes
    .filter((note) => noteNeedsAttention(note))
    .forEach((note) => {
      items.push(
        createItem({
          id: `note-${note.id}`,
          title: note.title,
          summary: note.summary,
          severity: "needs_attention",
          relatedNoteIds: [note.id],
          sourceDocumentIds: note.sourceDocumentIds,
        })
      );
    });

  const hiddenSpecializedBucket =
    ledgerBucketClues.length > 0 &&
    draft.taxAdjustments.adjustments.every(
      (adjustment) =>
        adjustment.kind === "carryforward_line" || adjustment.kind === "timing_review"
    );
  if (hiddenSpecializedBucket) {
    items.push(
      createItem({
        id: "ledger-bucket-specialization-missing",
        title: "Ledger buckets still look more specialized than the tax treatment layer",
        summary: `Tina found ledger-bucket proof like ${ledgerBucketClues
          .slice(0, 2)
          .join(" and ")}, but the downstream tax layer still looks generic. Tina should not call this package ready until that treatment is classified explicitly.`,
        severity: "blocking",
      })
    );
  }

  if (payrollClues.length > 0 && !hasAdjustmentKind(draft, "payroll_classification")) {
    items.push(
      createItem({
        id: "payroll-treatment-path-missing",
        title: "Payroll clues are present without a governed payroll treatment path",
        summary: `Tina found payroll support (${payrollClues.slice(0, 2).join(" and ")}), but no payroll-classification adjustment is governing that activity yet.`,
        severity: "blocking",
      })
    );
  }

  if (contractorClues.length > 0 && !hasAdjustmentKind(draft, "contractor_classification")) {
    items.push(
      createItem({
        id: "contractor-treatment-path-missing",
        title: "Contractor clues are present without a governed contractor treatment path",
        summary: `Tina found contractor support (${contractorClues
          .slice(0, 2)
          .join(" and ")}), but no contractor-classification adjustment is governing that activity yet.`,
        severity: "blocking",
      })
    );
  }

  if (salesTaxClues.length > 0 && !hasAdjustmentKind(draft, "sales_tax_exclusion")) {
    items.push(
      createItem({
        id: "sales-tax-treatment-path-missing",
        title: "Sales-tax clues are present without a governed exclusion path",
        summary: `Tina found sales-tax support (${salesTaxClues
          .slice(0, 2)
          .join(" and ")}), but no sales-tax exclusion adjustment is governing that activity yet.`,
        severity: "blocking",
      })
    );
  }

  if (inventoryClues.length > 0 && !hasAdjustmentKind(draft, "inventory_treatment")) {
    items.push(
      createItem({
        id: "inventory-treatment-path-missing",
        title: "Inventory clues are present without a governed inventory treatment path",
        summary: `Tina found inventory support (${inventoryClues
          .slice(0, 2)
          .join(" and ")}), but no inventory-treatment adjustment is governing that activity yet.`,
        severity: "blocking",
      })
    );
  }

  if (
    ownerFlowClues.length > 0 &&
    !draft.taxAdjustments.adjustments.some(
      (adjustment) => adjustment.kind === "timing_review" && adjustment.risk === "high"
    )
  ) {
    items.push(
      createItem({
        id: "owner-flow-treatment-path-missing",
        title: "Owner-flow clues are present without a governed separation path",
        summary: `Tina found owner-flow, transfer, or related-party support (${ownerFlowClues
          .slice(0, 2)
          .join(" and ")}), but no high-risk timing review is holding that activity out of ordinary business treatment yet.`,
        severity: "blocking",
      })
    );
  }

  reconciliation.groups
    .filter((group) => group.status !== "ready")
    .forEach((group) => {
      items.push(
        createItem({
          id: `transaction-group-${group.id}`,
          title:
            group.lineageCount > 0
              ? "Transaction lineage still needs governed treatment"
              : "Transaction-group reconciliation still needs governed treatment",
          summary:
            group.lineageCount > 0
              ? `${group.label}. ${group.summary} Tina has row-cluster lineage behind this document, so hidden specialized activity should block readiness until those clusters and their treatment paths line up.`
              : `${group.label}. ${group.summary}`,
          severity: group.status === "blocked" ? "blocking" : "needs_attention",
          relatedFieldIds: group.fieldIds,
          sourceDocumentIds: group.sourceDocumentIds,
        })
      );
    });

  packageQuality.checks
    .filter((check) => check.status !== "ready")
    .forEach((check) => {
      items.push(
        createItem({
          id: `package-quality-${check.id}`,
          title: check.title,
          summary: check.summary,
          severity: check.status === "blocked" ? "blocking" : "needs_attention",
        })
      );
    });

  if (currentFileReality.status === "fragile") {
    items.push(
      createItem({
        id: "current-file-reviewer-reality-fragile",
        title: "Current-file reviewer reality is still fragile",
        summary: `${currentFileReality.summary} Tina should not call this package ready until those repeated correction patterns are reflected in the file in front of her.`,
        severity: "blocking",
      })
    );
  } else if (currentFileReality.status === "mixed" && currentFileReality.patterns.length > 0) {
    items.push(
      createItem({
        id: "current-file-reviewer-reality-mixed",
        title: "Current-file reviewer reality still needs human caution",
        summary: `${currentFileReality.summary} Keep the lessons visible while a reviewer checks whether Tina already absorbed them cleanly in this packet.`,
        severity: "needs_attention",
      })
    );
  }

  const thinCurrentFileCohorts = liveAcceptance.currentFileCohorts.filter(
    (cohort) => cohort.trustLevel === "insufficient_history"
  );
  if (thinCurrentFileCohorts.length > 0 && draft.reviewerOutcomeMemory.outcomes.length > 0) {
    items.push(
      createItem({
        id: "current-file-cohort-history-thin",
        title: "Current-file reviewer history is still thin",
        summary: `Tina still has thin reviewer history for ${thinCurrentFileCohorts
          .map((cohort) => cohort.label)
          .join(", ")} files, so this package should stay conservative even if no hard blocker remains.`,
        severity: "needs_attention",
      })
    );
  }

  if (
    carryoverAmounts.length > 0 &&
    !draft.scheduleCDraft.notes.some((note) => note.id === "schedule-c-carryover-note")
  ) {
    items.push(
      createItem({
        id: "continuity-review-missing",
        title: "Carryover continuity is still not governed in the package",
        summary: `Tina found carryover support (${carryoverAmounts
          .slice(0, 2)
          .join(" and ")}), but the package still needs an explicit continuity review step before a CPA should trust the downstream numbers.`,
        severity: "needs_attention",
      })
    );
  }

  if (
    assetPlacedInServiceDates.length > 0 &&
    !draft.scheduleCDraft.notes.some((note) => note.id === "schedule-c-assets-note")
  ) {
    items.push(
      createItem({
        id: "depreciation-review-missing",
        title: "Depreciation timing review is still not governed in the package",
        summary: `Tina found asset timing support (${assetPlacedInServiceDates
          .slice(0, 2)
          .join(" and ")}), but the package still needs an explicit depreciation review step before expense totals should look settled.`,
        severity: "needs_attention",
      })
    );
  }

  planningReport.scenarios
    .filter((scenario) => planningScenarioNeedsWorkflowAttention(scenario))
    .forEach((scenario) => {
      items.push(
        createItem({
          id: `planning-${scenario.id}`,
          title: scenario.title,
          summary: `Planning tradeoff still needs reviewer handling. ${scenario.tradeoff}`,
          severity: "needs_attention",
        })
      );
    });

  const blockingCount = items.filter((item) => item.severity === "blocking").length;
  const attentionCount = items.filter((item) => item.severity === "needs_attention").length;

  let level: TinaPackageReadinessLevel = "ready_for_cpa";
  if (blockingCount > 0) level = "blocked";
  else if (attentionCount > 0) level = "needs_review";

  let summary = "Tina does not see anything blocking a CPA-ready package right now.";
  if (level === "blocked") {
    summary = `Tina found ${blockingCount} blocking item${blockingCount === 1 ? "" : "s"} before this package can be called filing-ready.`;
    if (attentionCount > 0) {
      summary += ` ${attentionCount} more ${attentionCount === 1 ? "item needs" : "items need"} review after that.`;
    }
  } else if (level === "needs_review") {
    summary = `Tina does not see a hard stop, but ${attentionCount} item${attentionCount === 1 ? " still needs" : "s still need"} review before a CPA should trust the package.`;
  }

  let nextStep =
    "Tina can hand this package to a CPA review flow next, but it is still worth doing a final human scan.";
  if (level === "blocked") {
    nextStep =
      "Work through the blocking items first. Tina should not call this package filing-ready until those are cleared.";
  } else if (level === "needs_review") {
    nextStep =
      "Clear the review items next so Tina can say the package is ready for CPA handoff with confidence.";
  }

  const priorityScenario = planningReport.scenarios.find(
    (scenario) => planningScenarioNeedsWorkflowAttention(scenario)
  );
  if (priorityScenario) {
    nextStep =
      level === "blocked"
        ? `${nextStep} After the blockers, prioritize this reviewer call: ${priorityScenario.nextStep}`
        : `Prioritize this reviewer call next: ${priorityScenario.nextStep}`;
  }

  return {
    lastRunAt: now,
    status: "complete",
    level,
    summary,
    nextStep,
    items,
  };
}
