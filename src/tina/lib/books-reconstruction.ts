import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import {
  buildTinaDocumentIntelligence,
  listTinaDocumentIntelligenceFactsByKind,
} from "@/tina/lib/document-intelligence";
import { buildTinaPayrollComplianceReconstruction } from "@/tina/lib/payroll-compliance-reconstruction";
import type {
  TinaBooksReconstructionArea,
  TinaBooksReconstructionSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildArea(args: TinaBooksReconstructionArea): TinaBooksReconstructionArea {
  return {
    ...args,
    relatedIssueIds: unique(args.relatedIssueIds),
    relatedFactIds: unique(args.relatedFactIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

function findIssueIds(
  snapshot: ReturnType<typeof buildTinaBooksNormalization>,
  ids: string[]
) {
  return snapshot.issues.filter((issue) => ids.includes(issue.id));
}

function buildSourceMode(
  draft: TinaWorkspaceDraft
): TinaBooksReconstructionSnapshot["sourceMode"] {
  const hasQuickBooksLive =
    draft.quickBooksConnection.status === "connected" ||
    draft.quickBooksConnection.status === "syncing";
  const hasUploadedBooks = draft.documents.some(
    (document) =>
      document.requestId === "quickbooks" ||
      document.mimeType.includes("csv") ||
      document.mimeType.includes("sheet") ||
      document.name.toLowerCase().includes("quickbooks") ||
      document.name.toLowerCase().includes("profit-and-loss")
  );

  return hasQuickBooksLive ? "quickbooks_live" : hasUploadedBooks ? "uploaded_books" : "thin_records";
}

function documentText(draft: TinaWorkspaceDraft, documentId: string): string {
  const document = draft.documents.find((item) => item.id === documentId);
  const reading = draft.documentReadings.find((item) => item.documentId === documentId);
  const facts = draft.sourceFacts.filter((fact) => fact.sourceDocumentId === documentId);

  return [
    document?.name ?? "",
    document?.requestId ?? "",
    document?.requestLabel ?? "",
    document?.mimeType ?? "",
    reading?.summary ?? "",
    reading?.detailLines.join(" ") ?? "",
    facts.map((fact) => `${fact.label} ${fact.value}`).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function linkedUsageCount(draft: TinaWorkspaceDraft, documentIds: string[]): number {
  const idSet = new Set(unique(documentIds));
  if (idSet.size === 0) return 0;

  const reviewerLineCount = draft.reviewerFinal.lines.filter((line) =>
    line.sourceDocumentIds.some((documentId) => idSet.has(documentId))
  ).length;
  const scheduleFieldCount = draft.scheduleCDraft.fields.filter((field) =>
    field.sourceDocumentIds.some((documentId) => idSet.has(documentId))
  ).length;

  return reviewerLineCount + scheduleFieldCount;
}

function artifactStatus(args: {
  draft: TinaWorkspaceDraft;
  patterns: RegExp[];
  importedDocumentIds?: string[];
  liveSupport?: boolean;
}): "covered" | "partial" | "missing" {
  const documentIds = unique([
    ...args.draft.documents
      .filter((document) => matchesAny(documentText(args.draft, document.id), args.patterns))
      .map((document) => document.id),
    ...(args.importedDocumentIds ?? []),
  ]);
  const factIds = unique(
    args.draft.sourceFacts
      .filter((fact) => matchesAny(`${fact.label} ${fact.value}`.toLowerCase(), args.patterns))
      .map((fact) => fact.id)
  );
  const usageCount = linkedUsageCount(args.draft, documentIds);

  if (
    (documentIds.length >= 1 && (factIds.length >= 1 || usageCount > 0)) ||
    (documentIds.length >= 2 && (args.liveSupport || usageCount > 0))
  ) {
    return "covered";
  }

  if (documentIds.length >= 1 || factIds.length >= 1 || usageCount > 0 || args.liveSupport) {
    return "partial";
  }

  return "missing";
}

function anyCovered(statuses: Array<"covered" | "partial" | "missing">): boolean {
  return statuses.some((status) => status !== "missing");
}

export function buildTinaBooksReconstruction(
  draft: TinaWorkspaceDraft
): TinaBooksReconstructionSnapshot {
  const booksNormalization = buildTinaBooksNormalization(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const payrollCompliance = buildTinaPayrollComplianceReconstruction(draft);
  const sourceMode = buildSourceMode(draft);
  const liveSupport =
    draft.quickBooksConnection.status === "connected" ||
    draft.quickBooksConnection.status === "syncing";
  const importedDocumentIds = draft.quickBooksConnection.importedDocumentIds;

  const ownerIssues = findIssueIds(booksNormalization, ["owner-flow-normalization", "ownership-transition-normalization"]);
  const workerIssues = findIssueIds(booksNormalization, ["worker-classification-normalization"]);
  const assetIssues = findIssueIds(booksNormalization, ["fixed-asset-normalization"]);
  const boundaryIssues = findIssueIds(booksNormalization, [
    "intercompany-normalization",
    "related-party-normalization",
    "multi-entity-normalization",
  ]);
  const assetFacts = listTinaDocumentIntelligenceFactsByKind({
    snapshot: documentIntelligence,
    kind: "asset_signal",
  });
  const inventoryFacts = listTinaDocumentIntelligenceFactsByKind({
    snapshot: documentIntelligence,
    kind: "inventory_signal",
  });
  const inventoryDocumentIds = documentIntelligence.items
    .filter((item) => item.extractedFacts.some((fact) => fact.kind === "inventory_signal"))
    .map((item) => item.documentId);
  const bankCoverage = artifactStatus({
    draft,
    patterns: [/bank/i, /statement/i, /checking/i, /savings/i],
  });
  const cardCoverage = artifactStatus({
    draft,
    patterns: [/credit/i, /card/i, /amex/i, /\bvisa\b/i, /mastercard/i],
  });
  const profitAndLossCoverage = artifactStatus({
    draft,
    patterns: [/profit and loss/i, /\bp&l\b/i, /\bpnl\b/i, /quickbooks/i],
    importedDocumentIds,
    liveSupport,
  });
  const generalLedgerCoverage = artifactStatus({
    draft,
    patterns: [/\bgeneral ledger\b/i, /\bledger\b/i, /\btrial balance\b/i, /\bjournal\b/i],
    importedDocumentIds,
    liveSupport,
  });
  const assetCoverage = artifactStatus({
    draft,
    patterns: [/fixed asset/i, /asset register/i, /depreciation/i, /4562/i],
  });
  const inventoryCoverage = artifactStatus({
    draft,
    patterns: [/inventory/i, /cogs/i, /stock/i, /sku/i, /purchases/i],
  });
  const bankSupportPresent = anyCovered([bankCoverage]);
  const expenseSupportPresent = anyCovered([
    bankCoverage,
    cardCoverage,
    profitAndLossCoverage,
    generalLedgerCoverage,
  ]);
  const hasPlacedInServiceSupport = assetFacts.some(
    (fact) => fact.label === "Placed-in-service support"
  );
  const hasPriorDepreciationSupport = assetFacts.some(
    (fact) => fact.label === "Prior depreciation support"
  );
  const hasInventoryCountSupport = inventoryFacts.some(
    (fact) => fact.label === "Inventory count support"
  );
  const hasInventoryRollforwardSupport = inventoryFacts.some(
    (fact) => fact.label === "COGS rollforward support"
  );
  const hasStrongAssetContinuity =
    assetCoverage === "covered" &&
    hasPlacedInServiceSupport &&
    hasPriorDepreciationSupport;
  const hasAssetTrail = assetCoverage !== "missing" || assetFacts.length > 0;
  const hasStrongInventoryContinuity =
    inventoryCoverage === "covered" &&
    hasInventoryCountSupport &&
    hasInventoryRollforwardSupport;
  const hasInventoryTrail =
    inventoryCoverage !== "missing" ||
    hasInventoryCountSupport ||
    hasInventoryRollforwardSupport;

  const incomeLineCount = draft.reviewerFinal.lines.filter((line) => line.kind === "income").length;
  const expenseLineCount = draft.reviewerFinal.lines.filter((line) => line.kind === "expense").length;

  const areas: TinaBooksReconstructionArea[] = [
    buildArea({
      id: "income",
      title: "Income reconstruction",
      status: incomeLineCount === 0 || !bankSupportPresent ? "needs_review" : "ready",
      summary:
        incomeLineCount === 0
          ? "Tina still needs cleaner income support before claiming reconstructed books."
          : !bankSupportPresent
            ? "Income lines exist, but Tina still needs bank-linked cash support before calling the income story clean."
          : "Tina has reviewer-final income lines to carry the books-to-tax income picture.",
      relatedIssueIds: [],
      relatedFactIds: [],
      relatedDocumentIds: draft.reviewerFinal.lines
        .filter((line) => line.kind === "income")
        .flatMap((line) => line.sourceDocumentIds),
    }),
    buildArea({
      id: "core_expenses",
      title: "Core expense reconstruction",
      status:
        expenseLineCount === 0
          ? "needs_review"
          : booksNormalization.issues.some((issue) => issue.id === "mixed-use-normalization" && issue.severity === "blocking")
            ? "blocked"
            : !expenseSupportPresent
              ? "needs_review"
            : "ready",
      summary:
        expenseLineCount === 0
          ? "Tina still needs stronger expense-line reconstruction before the books feel tax-safe."
          : booksNormalization.issues.some((issue) => issue.id === "mixed-use-normalization" && issue.severity === "blocking")
            ? "Mixed-use contamination still blocks clean expense reconstruction."
            : !expenseSupportPresent
              ? "Expense lines exist, but Tina still needs stronger books-facing support before calling the expense picture clean."
            : "Tina has a core expense reconstruction path from the reviewer-final layer.",
      relatedIssueIds: booksNormalization.issues
        .filter((issue) => issue.id === "mixed-use-normalization")
        .map((issue) => issue.id),
      relatedFactIds: booksNormalization.issues
        .filter((issue) => issue.id === "mixed-use-normalization")
        .flatMap((issue) => issue.factIds),
      relatedDocumentIds: booksNormalization.issues
        .filter((issue) => issue.id === "mixed-use-normalization")
        .flatMap((issue) => issue.documentIds),
    }),
    buildArea({
      id: "owner_flows",
      title: "Owner-flow reconstruction",
      status: ownerIssues.some((issue) => issue.severity === "blocking")
        ? "blocked"
        : ownerIssues.length > 0
          ? "needs_review"
          : "ready",
      summary:
        ownerIssues.some((issue) => issue.severity === "blocking")
          ? "Owner draws, ownership changes, or former-owner payments still distort the books-to-tax picture."
          : ownerIssues.length > 0
            ? "Owner-flow signals still need reviewer normalization."
            : "Tina does not currently see owner-flow distortion in the books-to-tax picture.",
      relatedIssueIds: ownerIssues.map((issue) => issue.id),
      relatedFactIds: ownerIssues.flatMap((issue) => issue.factIds),
      relatedDocumentIds: ownerIssues.flatMap((issue) => issue.documentIds),
    }),
    buildArea({
      id: "worker_payments",
      title: "Worker-payment reconstruction",
      status: workerIssues.some((issue) => issue.severity === "blocking") ||
        payrollCompliance.overallStatus === "blocked"
        ? "blocked"
        : payrollCompliance.overallStatus === "supported" ||
            payrollCompliance.posture === "contractor_likely" ||
            payrollCompliance.overallStatus === "not_applicable"
          ? "ready"
          : "needs_review",
      summary:
        payrollCompliance.overallStatus === "not_applicable"
          ? payrollCompliance.posture === "contractor_likely"
            ? "Tina sees contractor-only labor more strongly than a true payroll compliance story."
            : "Tina does not currently see a worker-payment reconstruction problem in the books picture."
          : payrollCompliance.overallStatus === "blocked"
            ? "Payroll happened, but the filing, deposit, or owner-comp trail is too broken to trust labor treatment."
            : payrollCompliance.overallStatus === "supported"
              ? "Payroll operations, filings, and wage-form support are strong enough to carry worker-payment treatment."
              : "Worker-payment treatment is visible, but payroll classification or compliance still needs reviewer normalization.",
      relatedIssueIds: workerIssues.map((issue) => issue.id),
      relatedFactIds: unique([
        ...workerIssues.flatMap((issue) => issue.factIds),
        ...payrollCompliance.relatedFactIds,
      ]),
      relatedDocumentIds: unique([
        ...workerIssues.flatMap((issue) => issue.documentIds),
        ...payrollCompliance.relatedDocumentIds,
      ]),
    }),
    buildArea({
      id: "fixed_assets",
      title: "Fixed-asset reconstruction",
      status: !draft.profile.hasFixedAssets
        ? "ready"
        : assetIssues.some((issue) => issue.severity === "blocking") && !hasAssetTrail
          ? "blocked"
          : hasStrongAssetContinuity
            ? "ready"
            : hasAssetTrail
              ? "needs_review"
              : "blocked",
      summary:
        !draft.profile.hasFixedAssets
          ? "Tina does not currently see a fixed-asset reconstruction problem."
          : assetIssues.some((issue) => issue.severity === "blocking") && !hasAssetTrail
            ? "Fixed-asset history and depreciation support still block clean reconstruction."
            : hasStrongAssetContinuity
              ? "Fixed-asset support includes enough placed-in-service and prior-depreciation truth to carry the current depreciation story."
              : "Fixed assets exist, and Tina has some asset-history support, but the fixed-asset trail still needs reviewer confirmation.",
      relatedIssueIds: assetIssues.map((issue) => issue.id),
      relatedFactIds: assetIssues.flatMap((issue) => issue.factIds),
      relatedDocumentIds: assetIssues.flatMap((issue) => issue.documentIds),
    }),
    buildArea({
      id: "inventory_cogs",
      title: "Inventory and COGS reconstruction",
      status: !draft.profile.hasInventory
        ? "ready"
        : hasStrongInventoryContinuity
          ? "ready"
          : hasInventoryTrail
            ? "needs_review"
            : "blocked",
      summary:
        !draft.profile.hasInventory
          ? "Tina does not currently see inventory reconstruction needs in the books picture."
          : hasStrongInventoryContinuity
            ? "Inventory count and COGS rollforward support are strong enough to carry the books-to-tax inventory story."
            : hasInventoryTrail
              ? "Inventory support is visible, but Tina still needs reviewer confirmation before calling COGS reconstruction clean."
              : "Inventory or COGS signals still block clean books-to-tax reconstruction.",
      relatedIssueIds: [],
      relatedFactIds: inventoryFacts.map((fact) => fact.id),
      relatedDocumentIds: inventoryDocumentIds,
    }),
    buildArea({
      id: "entity_boundary",
      title: "Entity-boundary reconstruction",
      status: boundaryIssues.some((issue) => issue.severity === "blocking")
        ? "blocked"
        : boundaryIssues.length > 0
          ? "needs_review"
          : "ready",
      summary:
        boundaryIssues.some((issue) => issue.severity === "blocking")
          ? "Intercompany, related-party, or multi-entity signals still block clean entity-boundary reconstruction."
          : boundaryIssues.length > 0
            ? "Entity-boundary signals still need reviewer separation."
            : "Tina does not currently see entity-boundary leakage in the books picture.",
      relatedIssueIds: boundaryIssues.map((issue) => issue.id),
      relatedFactIds: boundaryIssues.flatMap((issue) => issue.factIds),
      relatedDocumentIds: boundaryIssues.flatMap((issue) => issue.documentIds),
    }),
  ];

  const blockedCount = areas.filter((area) => area.status === "blocked").length;
  const reviewCount = areas.filter((area) => area.status === "needs_review").length;
  const overallStatus: TinaBooksReconstructionSnapshot["overallStatus"] =
    blockedCount > 0 ? "blocked" : reviewCount > 0 ? "partial" : "reconstructed";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    overallStatus,
    sourceMode,
    summary:
      overallStatus === "reconstructed"
        ? "Tina has a coherent books-to-tax reconstruction across the core areas of the file."
        : overallStatus === "partial"
          ? `Tina has a partial books-to-tax reconstruction, but ${reviewCount} area${reviewCount === 1 ? "" : "s"} still need reviewer normalization.`
          : `Tina still sees ${blockedCount} blocked books-to-tax reconstruction area${blockedCount === 1 ? "" : "s"}.`,
    nextStep:
      overallStatus === "reconstructed"
        ? "Use this reconstruction as the accounting-fluency backbone for treatment and form work."
        : overallStatus === "partial"
          ? "Normalize the remaining review areas before calling the books picture clean."
          : "Clear the blocked reconstruction areas before Tina trusts the books as return-facing evidence.",
    areas,
  };
}
