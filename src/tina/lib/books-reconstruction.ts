import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
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

export function buildTinaBooksReconstruction(
  draft: TinaWorkspaceDraft
): TinaBooksReconstructionSnapshot {
  const booksNormalization = buildTinaBooksNormalization(draft);
  const hasQuickBooksLive = draft.quickBooksConnection.status === "connected" || draft.quickBooksConnection.status === "syncing";
  const hasUploadedBooks = draft.documents.some(
    (document) =>
      document.requestId === "quickbooks" ||
      document.mimeType.includes("csv") ||
      document.mimeType.includes("sheet") ||
      document.name.toLowerCase().includes("quickbooks") ||
      document.name.toLowerCase().includes("profit-and-loss")
  );
  const sourceMode: TinaBooksReconstructionSnapshot["sourceMode"] =
    hasQuickBooksLive ? "quickbooks_live" : hasUploadedBooks ? "uploaded_books" : "thin_records";

  const ownerIssues = findIssueIds(booksNormalization, ["owner-flow-normalization", "ownership-transition-normalization"]);
  const workerIssues = findIssueIds(booksNormalization, ["worker-classification-normalization"]);
  const assetIssues = findIssueIds(booksNormalization, ["fixed-asset-normalization"]);
  const inventoryIssues = draft.profile.hasInventory
    ? [
        {
          id: "inventory-cogs-reconstruction",
          title: "Inventory and COGS still need reconstruction",
          severity: "blocking" as const,
          factIds: [],
          documentIds: [],
        },
      ]
    : [];
  const boundaryIssues = findIssueIds(booksNormalization, [
    "intercompany-normalization",
    "related-party-normalization",
    "multi-entity-normalization",
  ]);

  const incomeLineCount = draft.reviewerFinal.lines.filter((line) => line.kind === "income").length;
  const expenseLineCount = draft.reviewerFinal.lines.filter((line) => line.kind === "expense").length;

  const areas: TinaBooksReconstructionArea[] = [
    buildArea({
      id: "income",
      title: "Income reconstruction",
      status:
        incomeLineCount === 0 ? "needs_review" : "ready",
      summary:
        incomeLineCount === 0
          ? "Tina still needs cleaner income support before claiming reconstructed books."
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
            : "ready",
      summary:
        expenseLineCount === 0
          ? "Tina still needs stronger expense-line reconstruction before the books feel tax-safe."
          : booksNormalization.issues.some((issue) => issue.id === "mixed-use-normalization" && issue.severity === "blocking")
            ? "Mixed-use contamination still blocks clean expense reconstruction."
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
      status: workerIssues.some((issue) => issue.severity === "blocking")
        ? "blocked"
        : workerIssues.length > 0 || (draft.profile.hasPayroll && draft.profile.paysContractors)
          ? "needs_review"
          : "ready",
      summary:
        workerIssues.length > 0 || (draft.profile.hasPayroll && draft.profile.paysContractors)
          ? "Payroll and contractor flows still need normalization before Tina treats the books as clean."
          : "Tina does not currently see worker-payment overlap in the books-to-tax picture.",
      relatedIssueIds: workerIssues.map((issue) => issue.id),
      relatedFactIds: workerIssues.flatMap((issue) => issue.factIds),
      relatedDocumentIds: workerIssues.flatMap((issue) => issue.documentIds),
    }),
    buildArea({
      id: "fixed_assets",
      title: "Fixed-asset reconstruction",
      status: assetIssues.some((issue) => issue.severity === "blocking")
        ? "blocked"
        : draft.profile.hasFixedAssets
          ? "needs_review"
          : "ready",
      summary:
        assetIssues.some((issue) => issue.severity === "blocking")
          ? "Fixed-asset history and depreciation support still block clean reconstruction."
          : draft.profile.hasFixedAssets
            ? "Fixed assets exist, but Tina still needs fuller asset-history support."
            : "Tina does not currently see a fixed-asset reconstruction problem.",
      relatedIssueIds: assetIssues.map((issue) => issue.id),
      relatedFactIds: assetIssues.flatMap((issue) => issue.factIds),
      relatedDocumentIds: assetIssues.flatMap((issue) => issue.documentIds),
    }),
    buildArea({
      id: "inventory_cogs",
      title: "Inventory and COGS reconstruction",
      status: inventoryIssues.length > 0 ? "blocked" : "ready",
      summary:
        inventoryIssues.length > 0
          ? "Inventory or COGS signals still block clean books-to-tax reconstruction."
          : "Tina does not currently see inventory reconstruction needs in the books picture.",
      relatedIssueIds: inventoryIssues.map((issue) => issue.id),
      relatedFactIds: [],
      relatedDocumentIds: [],
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
