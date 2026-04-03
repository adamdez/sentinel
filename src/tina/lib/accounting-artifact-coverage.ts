import type {
  TinaAccountingArtifactCoverageItem,
  TinaAccountingArtifactCoverageSnapshot,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaBooksReconstruction } from "@/tina/lib/books-reconstruction";
import { buildTinaIndustryEvidenceMatrix } from "@/tina/lib/industry-evidence-matrix";
import { buildTinaOwnershipTimeline } from "@/tina/lib/ownership-timeline";
import type { TinaStoredDocument, TinaWorkspaceDraft } from "@/tina/types";

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function documentText(document: TinaStoredDocument): string {
  return [
    document.name,
    document.requestId ?? "",
    document.requestLabel ?? "",
    document.mimeType,
  ]
    .join(" ")
    .toLowerCase();
}

function factText(fact: TinaWorkspaceDraft["sourceFacts"][number]): string {
  return `${fact.label} ${fact.value}`.toLowerCase();
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function matchedDocumentIds(
  draft: TinaWorkspaceDraft,
  patterns: RegExp[],
  importedDocumentIds: string[]
): string[] {
  return unique([
    ...draft.documents
      .filter((document) => matchesAny(documentText(document), patterns))
      .map((document) => document.id),
    ...importedDocumentIds,
  ]);
}

function matchedFactIds(draft: TinaWorkspaceDraft, patterns: RegExp[]): string[] {
  return unique(
    draft.sourceFacts.filter((fact) => matchesAny(factText(fact), patterns)).map((fact) => fact.id)
  );
}

function buildItem(item: TinaAccountingArtifactCoverageItem): TinaAccountingArtifactCoverageItem {
  return {
    ...item,
    matchedDocumentIds: unique(item.matchedDocumentIds),
    matchedFactIds: unique(item.matchedFactIds),
    relatedAreaIds: unique(item.relatedAreaIds),
  };
}

function statusFromMatches(args: {
  documentIds: string[];
  factIds: string[];
  liveSupport?: boolean;
}): "covered" | "partial" | "missing" {
  const documentCount = unique(args.documentIds).length;
  const factCount = unique(args.factIds).length;

  if ((documentCount >= 1 && factCount >= 1) || (documentCount >= 2 && args.liveSupport)) {
    return "covered";
  }

  if (documentCount >= 1 || factCount >= 1 || args.liveSupport) return "partial";
  return "missing";
}

function summaryForStatus(args: {
  title: string;
  status: "covered" | "partial" | "missing";
  criticality: "critical" | "important" | "supporting";
}): string {
  if (args.status === "covered") {
    return `${args.title} are present strongly enough for Tina's current backend review pass.`;
  }

  if (args.status === "partial") {
    return `${args.title} are only partially covered, so Tina should not act like this accounting area is fully locked.`;
  }

  return args.criticality === "critical"
    ? `${args.title} are still missing, which keeps Tina from acting like a veteran accountant here.`
    : `${args.title} are still missing or too thin for strong accounting confidence.`;
}

export function buildTinaAccountingArtifactCoverage(
  draft: TinaWorkspaceDraft
): TinaAccountingArtifactCoverageSnapshot {
  const booksReconstruction = buildTinaBooksReconstruction(draft);
  const industryEvidenceMatrix = buildTinaIndustryEvidenceMatrix(draft);
  const ownershipTimeline = buildTinaOwnershipTimeline(draft);
  const liveSupport =
    draft.quickBooksConnection.status === "connected" ||
    draft.quickBooksConnection.status === "syncing";
  const importedDocumentIds = draft.quickBooksConnection.importedDocumentIds;
  const ownershipHeavy =
    (draft.profile.ownerCount ?? 1) > 1 ||
    draft.profile.ownershipChangedDuringYear ||
    draft.profile.hasOwnerBuyoutOrRedemption ||
    draft.profile.hasFormerOwnerPayments ||
    ownershipTimeline.hasMidYearChange ||
    ownershipTimeline.hasFormerOwnerPayments;
  const items: TinaAccountingArtifactCoverageItem[] = [];

  const definitions: Array<{
    id: string;
    title: string;
    criticality: "critical" | "important" | "supporting";
    relatedAreaIds: string[];
    patterns: RegExp[];
    includeWhen: boolean;
    liveSupport?: boolean;
    request: string;
  }> = [
    {
      id: "bank-statements",
      title: "Bank statements",
      criticality: "critical",
      relatedAreaIds: ["income", "core_expenses"],
      patterns: [/bank/i, /statement/i, /checking/i, /savings/i],
      includeWhen: true,
      request:
        "Upload bank statements or exported transaction history covering the full tax year so Tina can tie cash movement to the return.",
    },
    {
      id: "credit-card-statements",
      title: "Credit-card statements",
      criticality: "important",
      relatedAreaIds: ["core_expenses"],
      patterns: [/credit/i, /card/i, /amex/i, /\bvisa\b/i, /mastercard/i],
      includeWhen: true,
      request:
        "Upload the business card statements or export that supports the expense-side books picture.",
    },
    {
      id: "profit-and-loss",
      title: "Profit and loss support",
      criticality: "critical",
      relatedAreaIds: ["income", "core_expenses"],
      patterns: [/profit and loss/i, /\bp&l\b/i, /\bpnl\b/i, /quickbooks/i],
      includeWhen: true,
      liveSupport: liveSupport,
      request:
        "Upload or sync a year-level profit and loss so Tina has a durable books summary to reconcile against.",
    },
    {
      id: "general-ledger",
      title: "General ledger detail",
      criticality: "important",
      relatedAreaIds: ["income", "core_expenses", "worker_payments"],
      patterns: [/general ledger/i, /\bledger\b/i, /\bgl\b/i, /journal/i],
      includeWhen: true,
      liveSupport: liveSupport,
      request:
        "Upload or sync a general ledger export so Tina can reason through transaction-level categorization instead of only totals.",
    },
    {
      id: "balance-sheet",
      title: "Balance-sheet support",
      criticality:
        ownershipHeavy || draft.profile.hasFixedAssets || draft.profile.hasInventory
          ? "important"
          : "supporting",
      relatedAreaIds: ["fixed_assets", "inventory_cogs", "entity_boundary"],
      patterns: [/balance sheet/i, /\bbs\b/i, /assets/i, /liabilities/i],
      includeWhen: ownershipHeavy || draft.profile.hasFixedAssets || draft.profile.hasInventory,
      liveSupport: liveSupport,
      request:
        "Upload or sync a balance sheet when assets, inventory, or ownership economics matter to the return story.",
    },
    {
      id: "payroll-records",
      title: "Payroll records",
      criticality: "important",
      relatedAreaIds: ["worker_payments"],
      patterns: [/payroll/i, /\bw-2\b/i, /\b941\b/i, /\b940\b/i, /pay stub/i],
      includeWhen: draft.profile.hasPayroll,
      request:
        "Upload payroll summaries, payroll tax reports, or payroll journals so Tina can trust wage treatment.",
    },
    {
      id: "contractor-records",
      title: "Contractor and 1099 support",
      criticality: "important",
      relatedAreaIds: ["worker_payments"],
      patterns: [/1099/i, /contractor/i, /vendor/i],
      includeWhen: draft.profile.paysContractors,
      request:
        "Upload contractor payment detail or 1099 support so Tina can separate contract labor from payroll cleanly.",
    },
    {
      id: "inventory-records",
      title: "Inventory records",
      criticality: "critical",
      relatedAreaIds: ["inventory_cogs"],
      patterns: [/inventory/i, /cogs/i, /stock/i, /sku/i, /purchases/i],
      includeWhen: draft.profile.hasInventory,
      request:
        "Upload beginning inventory, purchases, ending inventory, and method support before Tina treats inventory as return-safe.",
    },
    {
      id: "fixed-asset-register",
      title: "Fixed-asset register",
      criticality: "critical",
      relatedAreaIds: ["fixed_assets"],
      patterns: [/fixed asset/i, /asset register/i, /depreciation/i, /4562/i],
      includeWhen: draft.profile.hasFixedAssets,
      request:
        "Upload an asset list with placed-in-service dates, cost basis, and depreciation method support.",
    },
    {
      id: "ownership-records",
      title: "Ownership and capital records",
      criticality: "critical",
      relatedAreaIds: ["owner_flows", "entity_boundary"],
      patterns: [/operating agreement/i, /ownership/i, /member/i, /capital/i, /\bk-1\b/i, /buyout/i, /redemption/i],
      includeWhen: ownershipHeavy,
      request:
        "Upload the operating agreement, ownership breakdown, capital records, and any buyout or redemption papers.",
    },
  ];

  definitions
    .filter((definition) => definition.includeWhen)
    .forEach((definition) => {
      const documentIds = matchedDocumentIds(
        draft,
        definition.patterns,
        definition.liveSupport ? importedDocumentIds : []
      );
      const factIds = matchedFactIds(draft, definition.patterns);
      const status = statusFromMatches({
        documentIds,
        factIds,
        liveSupport: Boolean(definition.liveSupport),
      });

      items.push(
        buildItem({
          id: definition.id,
          title: definition.title,
          status,
          criticality: definition.criticality,
          summary: summaryForStatus({
            title: definition.title,
            status,
            criticality: definition.criticality,
          }),
          request: definition.request,
          matchedDocumentIds: documentIds,
          matchedFactIds: factIds,
          relatedAreaIds: definition.relatedAreaIds,
        })
      );
    });

  industryEvidenceMatrix.items
    .filter((item) => item.materiality !== "low" && item.status !== "covered")
    .slice(0, 4)
    .forEach((item) => {
      items.push(
        buildItem({
          id: `industry-${item.id}`,
          title: `${item.playbookTitle}: ${item.requirement}`,
          status: item.status === "partial" ? "partial" : "missing",
          criticality: item.materiality === "high" ? "important" : "supporting",
          summary: item.summary,
          request: `Upload the industry-specific support for ${item.requirement.toLowerCase()} so Tina can stop leaning on a generic playbook.`,
          matchedDocumentIds: item.matchedDocumentIds,
          matchedFactIds: item.matchedFactIds,
          relatedAreaIds: [],
        })
      );
    });

  const criticalMissingCount = items.filter(
    (item) => item.criticality === "critical" && item.status === "missing"
  ).length;
  const partialOrMissingCount = items.filter((item) => item.status !== "covered").length;
  const overallStatus =
    criticalMissingCount > 0 ? "missing" : partialOrMissingCount > 0 ? "partial" : "covered";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    sourceMode: booksReconstruction.sourceMode,
    overallStatus,
    summary:
      overallStatus === "covered"
        ? "Tina has the core accounting artifacts she needs for a strong books-facing review pass."
        : overallStatus === "partial"
          ? "Tina has some accounting artifacts, but key bookkeeping support is still partial."
          : "Tina is still missing critical accounting artifacts that keep her from acting like a veteran tax preparer.",
    nextStep:
      overallStatus === "covered"
        ? "Use this artifact coverage layer to keep books reconstruction honest as Tina fills forms and attachments."
        : "Request the missing bookkeeping artifacts before Tina presents the books picture as fully trustworthy.",
    items,
  };
}
