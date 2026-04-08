import type {
  TinaTaxAdjustment,
  TinaTaxAdjustmentKind,
  TinaTaxAdjustmentRisk,
  TinaTaxAdjustmentSnapshot,
  TinaWorkpaperLine,
  TinaWorkspaceDraft,
} from "@/tina/types";
import { findTinaReviewerPatternScore } from "@/tina/lib/reviewer-outcomes";
import {
  collectTinaAnalyzedTransactionGroups,
  summarizeTinaTransactionGroups,
} from "@/tina/lib/transaction-group-analysis";

interface TinaAdjustmentSeed {
  kind: TinaTaxAdjustmentKind;
  risk: TinaTaxAdjustmentRisk;
  requiresAuthority: boolean;
  title: string;
  summary: string;
  suggestedTreatment: string;
  whyItMatters: string;
  authorityWorkIdeaIds: string[];
}

const SIGNAL_ADJUSTMENT_MAP: Record<string, TinaAdjustmentSeed> = {
  "Sales tax clue": {
    kind: "sales_tax_exclusion",
    risk: "medium",
    requiresAuthority: true,
    title: "Keep collected sales tax out of taxable income",
    summary:
      "Tina sees a sales-tax signal in the cleanup layer, so she should test whether some money should stay out of income.",
    suggestedTreatment:
      "Do not let collected sales tax flow into taxable income if the facts show it was collected for the state.",
    whyItMatters:
      "Sales tax collected for the state should not be treated like ordinary business income when the facts support a pass-through treatment.",
    authorityWorkIdeaIds: ["wa-state-review"],
  },
  "Payroll clue": {
    kind: "payroll_classification",
    risk: "medium",
    requiresAuthority: true,
    title: "Separate payroll costs from ordinary spending",
    summary:
      "Tina sees a payroll signal in the cleanup layer, so payroll treatment should be reviewed before it reaches the return.",
    suggestedTreatment:
      "Keep payroll-related amounts in payroll buckets instead of treating them as generic expenses.",
    whyItMatters:
      "Payroll can change both deduction handling and compliance follow-up, so it should not be flattened into ordinary spending.",
    authorityWorkIdeaIds: ["payroll-review"],
  },
  "Contractor clue": {
    kind: "contractor_classification",
    risk: "medium",
    requiresAuthority: true,
    title: "Separate contractor costs for tax handling",
    summary:
      "Tina sees a contractor signal in the cleanup layer, so those costs should stay distinct while tax handling is reviewed.",
    suggestedTreatment:
      "Keep contractor-related amounts in their own tax bucket instead of treating them as generic expenses.",
    whyItMatters:
      "Contractor costs often need separate review for both deduction support and filing compliance.",
    authorityWorkIdeaIds: ["contractor-review"],
  },
  "Inventory clue": {
    kind: "inventory_treatment",
    risk: "high",
    requiresAuthority: true,
    title: "Review inventory treatment before tax totals",
    summary:
      "Tina sees an inventory signal in the cleanup layer, so she should review whether these costs belong in inventory or cost of goods sold treatment.",
    suggestedTreatment:
      "Do not push inventory-like amounts straight into ordinary expense totals until inventory treatment is reviewed.",
    whyItMatters:
      "Inventory treatment can materially change taxable income and is easy to get wrong if cleanup lines go straight into expenses.",
    authorityWorkIdeaIds: ["inventory-review"],
  },
  "State clue": {
    kind: "multistate_scope",
    risk: "high",
    requiresAuthority: true,
    title: "Pause for multistate scope review",
    summary:
      "Tina sees a state-scope signal in the cleanup layer, so she should confirm whether another state affects the return package.",
    suggestedTreatment:
      "Keep this item in review until multistate filing scope is confirmed.",
    whyItMatters:
      "State scope can change where and how the business has to file, so Tina should not assume a Washington-only return.",
    authorityWorkIdeaIds: ["multistate-review"],
  },
};

function createEmptySnapshot(): TinaTaxAdjustmentSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not built tax adjustments yet.",
    nextStep: "Build the AI cleanup layer first, then let Tina propose tax adjustments.",
    adjustments: [],
  };
}

export function createDefaultTinaTaxAdjustmentSnapshot(): TinaTaxAdjustmentSnapshot {
  return createEmptySnapshot();
}

export function markTinaTaxAdjustmentsStale(
  snapshot: TinaTaxAdjustmentSnapshot
): TinaTaxAdjustmentSnapshot {
  if (snapshot.status === "idle" || snapshot.status === "stale") return snapshot;

  return {
    ...snapshot,
    status: "stale",
    summary: "Your cleanup lines, authority work, or review state changed, so Tina should rebuild tax adjustments.",
    nextStep: "Build tax adjustments again so Tina does not lean on old tax-treatment ideas.",
  };
}

function authorityAllowsAdjustment(draft: TinaWorkspaceDraft, ideaIds: string[]): boolean {
  if (ideaIds.length === 0) return true;

  return ideaIds.every((ideaId) => {
    const workItem = draft.authorityWork.find((item) => item.ideaId === ideaId);
    return Boolean(workItem && workItem.reviewerDecision === "use_it" && workItem.status !== "rejected");
  });
}

function mergeAdjustment(
  existing: TinaTaxAdjustment | undefined,
  generated: TinaTaxAdjustment
): TinaTaxAdjustment {
  if (!existing) return generated;

  const status =
    generated.status === "needs_authority"
      ? "needs_authority"
      : existing.status === "approved" || existing.status === "rejected"
        ? existing.status
        : generated.status;

  return {
    ...generated,
    status,
    reviewerNotes: existing.reviewerNotes,
  };
}

function buildCarryforwardSeed(line: TinaWorkpaperLine): TinaAdjustmentSeed {
  if (line.kind === "coverage") {
    return {
      kind: "timing_review",
      risk: "low",
      requiresAuthority: false,
      title: `Check the timing for ${line.label.toLowerCase()}`,
      summary:
        "Tina wants to keep this cleanup timing note visible before the line reaches tax totals.",
      suggestedTreatment:
        "Review whether the dates and timing still match the tax year before the line flows into tax totals.",
      whyItMatters:
        "Timing errors can shift income or expenses into the wrong year even when the cleanup itself looks tidy.",
      authorityWorkIdeaIds: [],
    };
  }

  return {
    kind: "carryforward_line",
    risk: "low",
    requiresAuthority: false,
    title: `Carry ${line.label.toLowerCase()} into tax review`,
    summary:
      "This cleaned line can move into Tina's tax-adjustment review layer, but it still needs a human review before it can affect a return.",
    suggestedTreatment:
      "Carry this cleaned amount into tax review as a candidate line for tax totals.",
    whyItMatters:
      "Tina should only consider tax totals from reviewed cleanup lines, never from the raw money story.",
    authorityWorkIdeaIds: [],
  };
}

function collectSourceFactValues(
  draft: TinaWorkspaceDraft,
  sourceDocumentIds: string[],
  labels: string[]
): string[] {
  const allowed = new Set(labels);
  return draft.sourceFacts
    .filter(
      (fact) => sourceDocumentIds.includes(fact.sourceDocumentId) && allowed.has(fact.label)
    )
    .map((fact) => fact.value);
}

function hasSourceFact(
  draft: TinaWorkspaceDraft,
  sourceDocumentIds: string[],
  labels: string[]
): boolean {
  return collectSourceFactValues(draft, sourceDocumentIds, labels).length > 0;
}

function inferSourceFactDrivenSeed(
  line: TinaWorkpaperLine,
  draft: TinaWorkspaceDraft
): TinaAdjustmentSeed | null {
  const sourceDocumentIds = line.sourceDocumentIds;

  if (hasSourceFact(draft, sourceDocumentIds, ["Payroll clue", "Payroll filing period clue"])) {
    return {
      ...SIGNAL_ADJUSTMENT_MAP["Payroll clue"],
      summary:
        "Tina found direct payroll clues behind this line, so she should not leave it as a generic carryforward amount.",
    };
  }

  if (hasSourceFact(draft, sourceDocumentIds, ["Contractor clue"])) {
    return {
      ...SIGNAL_ADJUSTMENT_MAP["Contractor clue"],
      summary:
        "Tina found direct contractor clues behind this line, so she should keep the treatment separate from generic expenses.",
    };
  }

  if (hasSourceFact(draft, sourceDocumentIds, ["Sales tax clue"])) {
    return {
      ...SIGNAL_ADJUSTMENT_MAP["Sales tax clue"],
      summary:
        "Tina found direct sales-tax clues behind this line, so she should test exclusion treatment before carrying it forward.",
    };
  }

  if (hasSourceFact(draft, sourceDocumentIds, ["Inventory clue"])) {
    return {
      ...SIGNAL_ADJUSTMENT_MAP["Inventory clue"],
      summary:
        "Tina found direct inventory clues behind this line, so she should pause for inventory treatment instead of using generic expense handling.",
    };
  }

  const ownerFlowClues = collectSourceFactValues(draft, sourceDocumentIds, [
    "Owner draw clue",
    "Intercompany transfer clue",
    "Related-party clue",
  ]);
  if (ownerFlowClues.length > 0) {
    return {
      kind: "timing_review",
      risk: "high",
      requiresAuthority: false,
      title: `Do not auto-carry ${line.label.toLowerCase()} until owner-flow facts are resolved`,
      summary:
        "Tina found direct owner-flow, transfer, or related-party clues behind this line, so she should keep it in explicit review instead of treating it as ordinary business activity.",
      suggestedTreatment:
        "Hold this line in reviewer review until owner-flow, transfer, or related-party facts are classified out of ordinary business treatment.",
      whyItMatters:
        "Owner-flow contamination and related-party activity can make a clean-looking line numerically wrong for tax treatment.",
      authorityWorkIdeaIds: [],
    };
  }

  if (hasSourceFact(draft, sourceDocumentIds, ["Carryover amount clue"])) {
    return {
      kind: "timing_review",
      risk: "medium",
      requiresAuthority: false,
      title: `Keep continuity visible for ${line.label.toLowerCase()}`,
      summary:
        "Tina found direct carryover support behind this line, so she should keep continuity review visible instead of treating the amount as fully settled.",
      suggestedTreatment:
        "Hold this line in reviewer review until the carryover and current-year treatment are reconciled together.",
      whyItMatters:
        "Carryover amounts can make a clean-looking current-year line incomplete if continuity is not governed.",
      authorityWorkIdeaIds: [],
    };
  }

  if (hasSourceFact(draft, sourceDocumentIds, ["Asset placed-in-service clue"])) {
    return {
      kind: "timing_review",
      risk: "high",
      requiresAuthority: false,
      title: `Hold ${line.label.toLowerCase()} until depreciation timing is reviewed`,
      summary:
        "Tina found asset timing support behind this line, so she should not let a depreciation-sensitive amount look fully settled yet.",
      suggestedTreatment:
        "Keep this line in reviewer review until the asset timing and depreciation path are confirmed.",
      whyItMatters:
        "Placed-in-service timing can materially change how much belongs in the current-year expense picture.",
      authorityWorkIdeaIds: [],
    };
  }

  return null;
}

function inferBucketDrivenSeed(
  line: TinaWorkpaperLine,
  bucketClues: string[]
): TinaAdjustmentSeed | null {
  const haystack = bucketClues.join(" ").toLowerCase();

  if (/\bpayroll|wages|941|w-2\b/.test(haystack)) {
    return {
      ...SIGNAL_ADJUSTMENT_MAP["Payroll clue"],
      summary:
        "Tina found payroll-shaped ledger buckets behind this line, so she should not leave it as a generic carryforward amount.",
    };
  }

  if (/\bcontractor|1099|subcontractor\b/.test(haystack)) {
    return {
      ...SIGNAL_ADJUSTMENT_MAP["Contractor clue"],
      summary:
        "Tina found contractor-shaped ledger buckets behind this line, so she should keep the treatment separate from generic expenses.",
    };
  }

  if (/\bsales tax\b/.test(haystack)) {
    return {
      ...SIGNAL_ADJUSTMENT_MAP["Sales tax clue"],
      summary:
        "Tina found sales-tax-shaped ledger buckets behind this line, so she should test exclusion treatment before carrying it forward.",
    };
  }

  if (/\binventory|cogs|cost of goods\b/.test(haystack)) {
    return {
      ...SIGNAL_ADJUSTMENT_MAP["Inventory clue"],
      summary:
        "Tina found inventory-shaped ledger buckets behind this line, so she should pause for inventory treatment instead of using generic expense handling.",
    };
  }

  if (/\bowner\b|\bdraw\b|\bdistribution\b|\bdue from\b|\bdue to\b|\btransfer\b/.test(haystack)) {
    return {
      kind: "timing_review",
      risk: "high",
      requiresAuthority: false,
      title: `Do not auto-carry ${line.label.toLowerCase()} until owner-flow buckets are resolved`,
      summary:
        "Tina found owner-flow or transfer-style ledger buckets behind this line, so she should keep it in explicit review instead of treating it as ordinary tax activity.",
      suggestedTreatment:
        "Hold this line in reviewer review until the owner-flow or transfer buckets are classified out of ordinary business treatment.",
      whyItMatters:
        "Owner-flow contamination and transfer activity can make a clean-looking line numerically wrong for tax treatment.",
      authorityWorkIdeaIds: [],
    };
  }

  return null;
}

function inferTransactionGroupDrivenSeed(
  line: TinaWorkpaperLine,
  draft: TinaWorkspaceDraft
): TinaAdjustmentSeed | null {
  const groups = collectTinaAnalyzedTransactionGroups(draft, line.sourceDocumentIds);
  if (groups.length === 0) return null;

  const classifications = Array.from(new Set(groups.map((group) => group.classification))).filter(
    (classification) => classification !== "gross_receipts" && classification !== "unknown"
  );

  if (classifications.includes("payroll")) {
    return {
      ...SIGNAL_ADJUSTMENT_MAP["Payroll clue"],
      summary:
        "Tina found payroll-shaped transaction groups behind this line, so she should not leave it as a generic carryforward amount.",
    };
  }

  if (classifications.includes("contractor")) {
    return {
      ...SIGNAL_ADJUSTMENT_MAP["Contractor clue"],
      summary:
        "Tina found contractor-shaped transaction groups behind this line, so she should keep the treatment separate from generic expenses.",
    };
  }

  if (classifications.includes("sales_tax")) {
    return {
      ...SIGNAL_ADJUSTMENT_MAP["Sales tax clue"],
      summary:
        "Tina found sales-tax-shaped transaction groups behind this line, so she should test exclusion treatment before carrying it forward.",
    };
  }

  if (classifications.includes("inventory")) {
    return {
      ...SIGNAL_ADJUSTMENT_MAP["Inventory clue"],
      summary:
        "Tina found inventory-shaped transaction groups behind this line, so she should pause for inventory treatment instead of using generic expense handling.",
    };
  }

  if (
    classifications.includes("owner_flow") ||
    classifications.includes("transfer") ||
    classifications.includes("related_party")
  ) {
    return {
      kind: "timing_review",
      risk: "high",
      requiresAuthority: false,
      title: `Do not auto-carry ${line.label.toLowerCase()} until transaction groups are separated`,
      summary:
        "Tina found owner-flow, transfer, or related-party transaction groups behind this line, so she should keep it in explicit review instead of treating it as ordinary business activity.",
      suggestedTreatment:
        "Hold this line in reviewer review until owner-flow, transfer, or related-party groups are classified out of ordinary business treatment.",
      whyItMatters:
        "Mixed transaction-group evidence can make a clean-looking line numerically wrong for tax treatment.",
      authorityWorkIdeaIds: [],
    };
  }

  return null;
}

function raiseRisk(risk: TinaTaxAdjustmentRisk): TinaTaxAdjustmentRisk {
  if (risk === "low") return "medium";
  if (risk === "medium") return "high";
  return "high";
}

function applyReviewerLearningToSeed(
  draft: TinaWorkspaceDraft,
  seed: TinaAdjustmentSeed
): TinaAdjustmentSeed {
  const patternScore = findTinaReviewerPatternScore(draft.reviewerOutcomeMemory, {
    targetType: "tax_adjustment",
    phase: "tax_review",
  });

  if (!patternScore || patternScore.confidenceImpact !== "lower") return seed;

  const lessonText =
    patternScore.lessons.length > 0 ? ` Lessons: ${patternScore.lessons.join(" ")}` : "";

  return {
    ...seed,
    risk: raiseRisk(seed.risk),
    summary: `${seed.summary} Reviewer history for tax adjustments is fragile (${patternScore.acceptanceScore}/100), so Tina should slow this treatment down.${lessonText}`.trim(),
    suggestedTreatment: `${seed.suggestedTreatment} Keep this in explicit reviewer review until Tina proves it matches the repeated correction pattern.`,
    whyItMatters: `${seed.whyItMatters} Reviewer history shows this kind of treatment still drifts when Tina moves too quickly.`,
  };
}

function buildAdjustmentFromLine(
  draft: TinaWorkspaceDraft,
  line: TinaWorkpaperLine
): TinaTaxAdjustment {
  const ledgerBucketClues = collectSourceFactValues(draft, line.sourceDocumentIds, [
    "Ledger bucket clue",
  ]);
  const directScenarioFacts = collectSourceFactValues(draft, line.sourceDocumentIds, [
    "Payroll clue",
    "Payroll filing period clue",
    "Contractor clue",
    "Sales tax clue",
    "Inventory clue",
    "Owner draw clue",
    "Intercompany transfer clue",
    "Related-party clue",
    "Carryover amount clue",
    "Asset placed-in-service clue",
  ]);
  const transactionGroups = collectTinaAnalyzedTransactionGroups(draft, line.sourceDocumentIds);
  const rawSeed =
    line.kind === "signal"
      ? SIGNAL_ADJUSTMENT_MAP[line.label] ?? {
          kind: "carryforward_line",
          risk: "medium",
          requiresAuthority: false,
          title: `Review ${line.label.toLowerCase()} before tax totals`,
          summary:
            "Tina wants a human to look at this cleanup signal before it becomes a tax adjustment.",
          suggestedTreatment:
            "Keep this signal visible in tax review instead of letting it disappear inside ordinary totals.",
          whyItMatters:
            "Signals often reveal special treatment that should not be hidden during tax prep.",
          authorityWorkIdeaIds: [],
        }
      : inferTransactionGroupDrivenSeed(line, draft) ??
        inferBucketDrivenSeed(line, ledgerBucketClues) ??
        inferSourceFactDrivenSeed(line, draft) ??
        buildCarryforwardSeed(line);
  const seed = applyReviewerLearningToSeed(draft, rawSeed);

  const authorityReady = authorityAllowsAdjustment(draft, seed.authorityWorkIdeaIds);
  const bucketSummary =
    ledgerBucketClues.length > 0
      ? ` Bucket proof: ${ledgerBucketClues.slice(0, 2).join("; ")}.`
      : "";
  const directFactSummary =
    directScenarioFacts.length > 0
      ? ` Source-fact proof: ${directScenarioFacts.slice(0, 2).join("; ")}.`
      : "";
  const transactionGroupSummary =
    transactionGroups.length > 0
      ? ` Transaction-group proof: ${summarizeTinaTransactionGroups(transactionGroups)}.`
      : "";

  return {
    id: `tax-adjustment-${line.id}`,
    kind: seed.kind,
    status:
      seed.requiresAuthority && !authorityReady ? "needs_authority" : "ready_for_review",
    risk: seed.risk,
    requiresAuthority: seed.requiresAuthority,
    title: seed.title,
    summary: `${seed.summary}${directFactSummary}${bucketSummary}${transactionGroupSummary}`,
    suggestedTreatment:
      ledgerBucketClues.length > 0 || transactionGroups.length > 0 || directScenarioFacts.length > 0
        ? `${seed.suggestedTreatment} Keep the source facts, ledger buckets, and transaction groups visible during review.`
        : seed.suggestedTreatment,
    whyItMatters: `${seed.whyItMatters}${directFactSummary}${bucketSummary}${transactionGroupSummary}`,
    amount: line.amount,
    authorityWorkIdeaIds: seed.authorityWorkIdeaIds,
    aiCleanupLineIds: [line.id],
    sourceDocumentIds: line.sourceDocumentIds,
    sourceFactIds: Array.from(
      new Set([...line.sourceFactIds, ...transactionGroups.map((group) => group.factId)])
    ),
    reviewerNotes: "",
  };
}

export function buildTinaTaxAdjustmentSnapshot(
  draft: TinaWorkspaceDraft
): TinaTaxAdjustmentSnapshot {
  const now = new Date().toISOString();
  const existingMap = new Map(
    draft.taxAdjustments.adjustments.map((adjustment) => [adjustment.id, adjustment])
  );

  if (draft.aiCleanup.status !== "complete") {
    return {
      ...createDefaultTinaTaxAdjustmentSnapshot(),
      lastRunAt: now,
      status: draft.aiCleanup.status === "stale" ? "stale" : "idle",
      summary: "Tina needs a complete AI cleanup layer before she can propose tax adjustments.",
      nextStep: "Build the AI cleanup layer first.",
    };
  }

  if (draft.aiCleanup.lines.length === 0) {
    return {
      ...createDefaultTinaTaxAdjustmentSnapshot(),
      lastRunAt: now,
      summary: "Tina does not have any AI cleanup lines ready for tax-adjustment review yet.",
      nextStep: "Approve cleanup ideas and carry them into the AI cleanup layer first.",
    };
  }

  const adjustments = draft.aiCleanup.lines.map((line) =>
    mergeAdjustment(existingMap.get(`tax-adjustment-${line.id}`), buildAdjustmentFromLine(draft, line))
  );

  const authorityBlockedCount = adjustments.filter(
    (adjustment) => adjustment.status === "needs_authority"
  ).length;
  const readyCount = adjustments.filter(
    (adjustment) => adjustment.status === "ready_for_review"
  ).length;

  let summary = `Tina built ${adjustments.length} tax adjustment candidate${adjustments.length === 1 ? "" : "s"} from ${draft.aiCleanup.lines.length} AI cleanup line${draft.aiCleanup.lines.length === 1 ? "" : "s"}.`;
  if (authorityBlockedCount > 0) {
    summary += ` ${authorityBlockedCount} still ${authorityBlockedCount === 1 ? "needs" : "need"} authority signoff first.`;
  }

  let nextStep =
    "Review the tax adjustments Tina proposed before anything flows into a filing package.";
  if (authorityBlockedCount > 0) {
    nextStep =
      "Finish the linked authority work first, then review the tax adjustments that remain.";
  } else if (readyCount > 0) {
    nextStep =
      "A human can now review and approve the tax adjustments that are ready.";
  }

  const fragilePattern = findTinaReviewerPatternScore(draft.reviewerOutcomeMemory, {
    targetType: "tax_adjustment",
    phase: "tax_review",
  });
  if (fragilePattern?.confidenceImpact === "lower") {
    nextStep =
      "Start with the repeated reviewer correction pattern before approving these tax adjustments. Tina is treating tax-adjustment trust as fragile right now.";
  }

  return {
    lastRunAt: now,
    status: "complete",
    summary,
    nextStep,
    adjustments,
  };
}
