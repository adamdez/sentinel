import type {
  TinaBooksNormalizationIssue,
  TinaBooksNormalizationSnapshot,
  TinaSourceFact,
  TinaWorkspaceDraft,
} from "@/tina/types";

function createEmptySnapshot(): TinaBooksNormalizationSnapshot {
  return {
    lastBuiltAt: null,
    status: "idle",
    summary: "Tina has not evaluated books normalization risks yet.",
    nextStep: "Load bookkeeping clues and source facts, then let Tina classify messy-books risks.",
    issues: [],
  };
}

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findFactsByLabel(sourceFacts: TinaSourceFact[], label: string): TinaSourceFact[] {
  return sourceFacts.filter(
    (fact) => normalizeForComparison(fact.label) === normalizeForComparison(label)
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildIssue(args: {
  id: string;
  title: string;
  summary: string;
  severity: TinaBooksNormalizationIssue["severity"];
  sourceLabels: string[];
  facts: TinaSourceFact[];
}): TinaBooksNormalizationIssue {
  return {
    id: args.id,
    title: args.title,
    summary: args.summary,
    severity: args.severity,
    sourceLabels: args.sourceLabels,
    factIds: args.facts.map((fact) => fact.id),
    documentIds: unique(args.facts.map((fact) => fact.sourceDocumentId)),
  };
}

export function buildTinaBooksNormalization(
  draft: TinaWorkspaceDraft
): TinaBooksNormalizationSnapshot {
  const ownerFlowFacts = findFactsByLabel(draft.sourceFacts, "Owner draw clue");
  const mixedUseFacts = findFactsByLabel(draft.sourceFacts, "Mixed personal/business clue");
  const contractorFacts = findFactsByLabel(draft.sourceFacts, "Contractor clue");
  const payrollFacts = findFactsByLabel(draft.sourceFacts, "Payroll clue");
  const intercompanyFacts = findFactsByLabel(draft.sourceFacts, "Intercompany transfer clue");
  const relatedPartyFacts = findFactsByLabel(draft.sourceFacts, "Related-party clue");
  const depreciationFacts = findFactsByLabel(draft.sourceFacts, "Depreciation clue");
  const ownershipChangeFacts = findFactsByLabel(draft.sourceFacts, "Ownership change clue");
  const formerOwnerPaymentFacts = findFactsByLabel(draft.sourceFacts, "Former owner payment clue");
  const einFacts = findFactsByLabel(draft.sourceFacts, "EIN clue");
  const uniqueEinMatches = new Set(
    einFacts.flatMap((fact) => fact.value.match(/\b\d{2}-\d{7}\b/g) ?? [])
  );

  const issues: TinaBooksNormalizationIssue[] = [];

  if (ownerFlowFacts.length > 0) {
    issues.push(
      buildIssue({
        id: "owner-flow-normalization",
        title: "Owner flows still need normalization",
        summary:
          "Tina found owner-draw or owner-distribution signals and should normalize those flows before trusting any expense or compensation classification.",
        severity: "blocking",
        sourceLabels: ["Owner draws, distributions, compensation, or loan-like owner flows appear in the books."],
        facts: ownerFlowFacts,
      })
    );
  }

  if (mixedUseFacts.length > 0) {
    issues.push(
      buildIssue({
        id: "mixed-use-normalization",
        title: "Mixed personal and business activity still needs allocation",
        summary:
          "Tina found mixed-use spending signals, so deduction lines should stay fail-closed until business-only allocation support is clear.",
        severity: "blocking",
        sourceLabels: ["Books or papers show mixed personal and business activity."],
        facts: mixedUseFacts,
      })
    );
  }

  if (contractorFacts.length > 0 && payrollFacts.length > 0) {
    issues.push(
      buildIssue({
        id: "worker-classification-normalization",
        title: "Worker payment flows need normalization",
        summary:
          "Tina found both payroll and contractor signals in the same file set, so worker classification and duplicate expense risk need reviewer attention.",
        severity: "needs_attention",
        sourceLabels: ["Books show both payroll and contractor flows that may overlap."],
        facts: [...contractorFacts, ...payrollFacts],
      })
    );
  }

  if (intercompanyFacts.length > 0) {
    issues.push(
      buildIssue({
        id: "intercompany-normalization",
        title: "Intercompany activity still needs separation",
        summary:
          "Tina found intercompany transfer clues and should keep those flows out of return-facing income and expense totals until they are reconciled cleanly.",
        severity: "blocking",
        sourceLabels: ["Intercompany or due-to/due-from flows appear in the books."],
        facts: intercompanyFacts,
      })
    );
  }

  if (relatedPartyFacts.length > 0) {
    issues.push(
      buildIssue({
        id: "related-party-normalization",
        title: "Related-party activity still needs characterization",
        summary:
          "Tina found related-party transaction clues and should not trust book labels alone for characterization, deductibility, or disclosure.",
        severity: "needs_attention",
        sourceLabels: ["Related-party balances or transactions appear in the books or papers."],
        facts: relatedPartyFacts,
      })
    );
  }

  if (depreciationFacts.length > 0 || draft.profile.hasFixedAssets) {
    issues.push(
      buildIssue({
        id: "fixed-asset-normalization",
        title: "Fixed-asset support still needs normalization",
        summary:
          "Tina should reconcile fixed-asset history, placed-in-service timing, and depreciation support before those deductions are trusted.",
        severity: depreciationFacts.length > 0 ? "blocking" : "watch",
        sourceLabels: ["Fixed-asset or depreciation activity needs asset-history support."],
        facts: depreciationFacts,
      })
    );
  }

  if (ownershipChangeFacts.length > 0 || formerOwnerPaymentFacts.length > 0) {
    issues.push(
      buildIssue({
        id: "ownership-transition-normalization",
        title: "Ownership-transition books still need review",
        summary:
          "Tina found ownership-change or former-owner-payment signals and should normalize those flows before trusting ledger-based return classifications.",
        severity: "blocking",
        sourceLabels: ["Ownership changes or former-owner payouts appear in the books or papers."],
        facts: [...ownershipChangeFacts, ...formerOwnerPaymentFacts],
      })
    );
  }

  if (uniqueEinMatches.size > 1) {
    issues.push(
      buildIssue({
        id: "multi-entity-normalization",
        title: "Multiple entity identifiers appear in the file set",
        summary:
          "Tina found multiple EINs and should isolate the correct filing entity before using the books as return-facing evidence.",
        severity: "blocking",
        sourceLabels: ["Multiple EINs appear across the current source papers."],
        facts: einFacts,
      })
    );
  }

  if (issues.length === 0) {
    return {
      lastBuiltAt: new Date().toISOString(),
      status: "complete",
      summary: "Tina does not currently see books-normalization risks in the saved facts.",
      nextStep: "Keep ingestion and reviewer checks current as new papers or ledger facts arrive.",
      issues: [],
    };
  }

  const blockingCount = issues.filter((issue) => issue.severity === "blocking").length;
  const attentionCount = issues.filter((issue) => issue.severity === "needs_attention").length;

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    summary: `Tina found ${issues.length} books-normalization issue${
      issues.length === 1 ? "" : "s"
    }, including ${blockingCount} blocker${blockingCount === 1 ? "" : "s"} and ${attentionCount} review item${
      attentionCount === 1 ? "" : "s"
    }.`,
    nextStep:
      blockingCount > 0
        ? "Normalize the blocking ledger and ownership issues before trusting downstream return output."
        : "Review the remaining bookkeeping classification issues before signoff.",
    issues,
  };
}
