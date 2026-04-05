import type {
  TinaDocumentIntelligenceExtractKind,
  TinaDocumentIntelligenceRole,
  TinaEntityRecordMatrixSnapshot,
  TinaEntityRecordRequirement,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaDocumentIntelligence } from "@/tina/lib/document-intelligence";
import { buildTinaFederalReturnRequirements } from "@/tina/lib/federal-return-requirements";
import type { TinaFilingLaneId, TinaSourceFact, TinaStoredDocument, TinaWorkspaceDraft } from "@/tina/types";

interface TinaEntityRecordBlueprint {
  id: string;
  title: string;
  criticality: TinaEntityRecordRequirement["criticality"];
  requiredForms: string[];
  matchTerms: string[];
  matchRoles?: TinaDocumentIntelligenceRole[];
  matchExtractKinds?: TinaDocumentIntelligenceExtractKind[];
  enabled?: (draft: TinaWorkspaceDraft) => boolean;
}

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "that",
  "this",
  "support",
  "records",
  "history",
  "proof",
]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function matchDocuments(
  terms: string[],
  documents: TinaStoredDocument[]
): TinaStoredDocument[] {
  const normalizedTerms = unique(terms.flatMap(tokenize));
  return documents.filter((document) => {
    const haystack = normalize(
      `${document.name} ${document.requestLabel ?? ""} ${document.requestId ?? ""}`
    );
    return normalizedTerms.some((term) => haystack.includes(term));
  });
}

function matchFacts(
  terms: string[],
  sourceFacts: TinaSourceFact[]
): TinaSourceFact[] {
  const normalizedTerms = unique(terms.flatMap(tokenize));
  return sourceFacts.filter((fact) => {
    const haystack = normalize(`${fact.label} ${fact.value}`);
    return normalizedTerms.some((term) => haystack.includes(term));
  });
}

function buildBlueprints(
  draft: TinaWorkspaceDraft,
  laneId: TinaFilingLaneId
): TinaEntityRecordBlueprint[] {
  if (laneId === "schedule_c_single_member_llc") {
    return [
      {
        id: "schedule-c-prior-return",
        title: "Prior return package",
        criticality: "important",
        requiredForms: ["Form 1040", "Schedule C"],
        matchTerms: ["prior return", "schedule c", "form 1040", "return package"],
        matchRoles: ["prior_return_package"],
        matchExtractKinds: ["prior_filing_signal"],
      },
      {
        id: "schedule-c-books",
        title: "Books or profit-and-loss support",
        criticality: "critical",
        requiredForms: ["Schedule C"],
        matchTerms: ["profit loss", "p l", "quickbooks", "ledger", "books", "income statement"],
      },
      {
        id: "schedule-c-bank-card",
        title: "Bank and card support",
        criticality: "critical",
        requiredForms: ["Schedule C"],
        matchTerms: ["bank statement", "card statement", "credit card", "bank support"],
      },
      {
        id: "schedule-c-fixed-assets",
        title: "Fixed-asset and depreciation support",
        criticality: "important",
        requiredForms: ["Schedule C", "Form 4562"],
        matchTerms: ["asset schedule", "depreciation", "fixed asset", "placed in service"],
        enabled: (currentDraft) => currentDraft.profile.hasFixedAssets,
      },
      {
        id: "schedule-c-payroll",
        title: "Payroll support",
        criticality: "important",
        requiredForms: ["Schedule C"],
        matchTerms: ["payroll", "w2", "w 2", "941", "wage report"],
        enabled: (currentDraft) => currentDraft.profile.hasPayroll,
      },
      {
        id: "schedule-c-inventory",
        title: "Inventory and COGS support",
        criticality: "important",
        requiredForms: ["Schedule C"],
        matchTerms: ["inventory", "cogs", "cost of goods", "stock", "sku"],
        enabled: (currentDraft) => currentDraft.profile.hasInventory,
      },
    ];
  }

  if (laneId === "1065") {
    return [
      {
        id: "partnership-ownership",
        title: "Operating agreement and partner ownership breakdown",
        criticality: "critical",
        requiredForms: ["Form 1065", "Schedule K-1"],
        matchTerms: ["operating agreement", "ownership breakdown", "partner percentages", "member split"],
        matchRoles: ["operating_agreement", "cap_table", "ownership_schedule"],
        matchExtractKinds: ["ownership_signal", "ownership_timeline_signal"],
      },
      {
        id: "partnership-prior-return",
        title: "Prior partnership return and K-1 package",
        criticality: "important",
        requiredForms: ["Form 1065", "Schedule K-1"],
        matchTerms: ["form 1065", "schedule k 1", "partnership return", "k 1"],
        matchRoles: ["prior_return_package"],
        matchExtractKinds: ["prior_filing_signal"],
      },
      {
        id: "partnership-capital",
        title: "Partner capital account rollforward",
        criticality: "critical",
        requiredForms: ["Form 1065", "Schedule K-1"],
        matchTerms: ["capital account", "capital rollforward", "partner basis", "capital statement"],
      },
      {
        id: "partnership-payments",
        title: "Guaranteed payments and partner distributions support",
        criticality: "critical",
        requiredForms: ["Form 1065", "Schedule K-1"],
        matchTerms: ["guaranteed payment", "partner distribution", "partner draw", "distribution ledger"],
      },
      {
        id: "partnership-books",
        title: "Partnership books, trial balance, and balance sheet",
        criticality: "critical",
        requiredForms: ["Form 1065", "Schedule L"],
        matchTerms: ["trial balance", "balance sheet", "books", "partnership ledger", "schedule l"],
      },
      {
        id: "partnership-transfer",
        title: "Buyout, redemption, or transfer papers",
        criticality: "important",
        requiredForms: ["Form 1065", "Schedule K-1"],
        matchTerms: ["buyout", "redemption", "transfer agreement", "former owner payment"],
        matchRoles: ["buyout_agreement", "ownership_schedule"],
        matchExtractKinds: ["ownership_timeline_signal"],
        enabled: (currentDraft) =>
          currentDraft.profile.ownershipChangedDuringYear ||
          currentDraft.profile.hasOwnerBuyoutOrRedemption ||
          currentDraft.profile.hasFormerOwnerPayments,
      },
    ];
  }

  if (laneId === "1120_s") {
    return [
      {
        id: "s-corp-election",
        title: "S-corp election proof",
        criticality: "critical",
        requiredForms: ["Form 1120-S"],
        matchTerms: ["2553", "s corp election", "1120 s", "s corporation election"],
        matchRoles: ["entity_election", "formation_document"],
        matchExtractKinds: ["election_signal", "election_timeline_signal"],
      },
      {
        id: "s-corp-shareholders",
        title: "Shareholder roster and ownership percentages",
        criticality: "critical",
        requiredForms: ["Form 1120-S", "Schedule K-1"],
        matchTerms: ["shareholder roster", "ownership breakdown", "stock ledger", "share split"],
        matchRoles: ["ownership_schedule", "cap_table", "operating_agreement"],
        matchExtractKinds: ["ownership_signal", "ownership_timeline_signal"],
      },
      {
        id: "s-corp-payroll",
        title: "Officer compensation and payroll support",
        criticality: "critical",
        requiredForms: ["Form 1120-S"],
        matchTerms: ["payroll", "officer compensation", "w2", "941", "reasonable compensation"],
      },
      {
        id: "s-corp-distributions",
        title: "Shareholder distributions and loan activity",
        criticality: "critical",
        requiredForms: ["Form 1120-S", "Schedule K-1"],
        matchTerms: ["shareholder distribution", "loan to shareholder", "shareholder loan", "distribution ledger"],
      },
      {
        id: "s-corp-books",
        title: "S-corp books, trial balance, and balance sheet",
        criticality: "critical",
        requiredForms: ["Form 1120-S", "Schedule L"],
        matchTerms: ["trial balance", "balance sheet", "books", "schedule l", "general ledger"],
      },
      {
        id: "s-corp-prior-return",
        title: "Prior 1120-S return and K-1 package",
        criticality: "important",
        requiredForms: ["Form 1120-S", "Schedule K-1"],
        matchTerms: ["form 1120 s", "schedule k 1", "1120-s return", "k 1"],
        matchRoles: ["prior_return_package"],
        matchExtractKinds: ["prior_filing_signal"],
      },
    ];
  }

  if (laneId === "1120") {
    return [
      {
        id: "c-corp-classification",
        title: "Corporate formation or classification proof",
        criticality: "critical",
        requiredForms: ["Form 1120"],
        matchTerms: ["articles of incorporation", "form 1120", "c corp", "corporate election"],
        matchRoles: ["formation_document", "entity_election"],
        matchExtractKinds: ["election_signal", "election_timeline_signal"],
      },
      {
        id: "c-corp-books",
        title: "Corporate books, trial balance, and balance sheet",
        criticality: "critical",
        requiredForms: ["Form 1120", "Schedule L"],
        matchTerms: ["trial balance", "balance sheet", "books", "schedule l", "general ledger"],
      },
      {
        id: "c-corp-equity",
        title: "Retained earnings and equity rollforward",
        criticality: "critical",
        requiredForms: ["Form 1120", "Schedule M-2"],
        matchTerms: ["retained earnings", "equity rollforward", "schedule m 2", "equity statement"],
      },
      {
        id: "c-corp-compensation",
        title: "Officer compensation support",
        criticality: "important",
        requiredForms: ["Form 1120"],
        matchTerms: ["officer compensation", "payroll", "w2", "w 2", "941"],
      },
      {
        id: "c-corp-shareholder-flows",
        title: "Dividends and shareholder loan support",
        criticality: "important",
        requiredForms: ["Form 1120"],
        matchTerms: ["dividend", "shareholder loan", "loan to shareholder", "distribution ledger"],
      },
      {
        id: "c-corp-prior-return",
        title: "Prior 1120 return package",
        criticality: "important",
        requiredForms: ["Form 1120"],
        matchTerms: ["form 1120", "corporate return", "prior return"],
        matchRoles: ["prior_return_package"],
        matchExtractKinds: ["prior_filing_signal"],
      },
    ];
  }

  return [
    {
      id: "unresolved-classification",
      title: "Formation, election, and prior-return package",
      criticality: "critical",
      requiredForms: [],
      matchTerms: ["formation papers", "election", "prior return", "ownership breakdown"],
      matchRoles: [
        "formation_document",
        "entity_election",
        "prior_return_package",
        "ownership_schedule",
        "state_registration",
      ],
      matchExtractKinds: [
        "prior_filing_signal",
        "election_timeline_signal",
        "state_registration_signal",
      ],
    },
  ];
}

function buildRequirement(args: {
  draft: TinaWorkspaceDraft;
  laneId: TinaFilingLaneId;
  returnFamily: string;
  blueprint: TinaEntityRecordBlueprint;
  documentIntelligence: ReturnType<typeof buildTinaDocumentIntelligence>;
}): TinaEntityRecordRequirement {
  const textMatchedDocs = matchDocuments(args.blueprint.matchTerms, args.draft.documents);
  const textMatchedFacts = matchFacts(args.blueprint.matchTerms, args.draft.sourceFacts);
  const structuredMatches = args.documentIntelligence.items.filter((item) => {
    const roleMatch =
      args.blueprint.matchRoles?.some((role) => item.roles.includes(role)) ?? false;
    const extractKindMatch =
      args.blueprint.matchExtractKinds?.some((kind) =>
        item.extractedFacts.some((fact) => fact.kind === kind)
      ) ?? false;

    return roleMatch || extractKindMatch;
  });
  const docs = unique([
    ...textMatchedDocs.map((document) => document.id),
    ...structuredMatches.map((item) => item.documentId),
  ]);
  const facts = unique([
    ...textMatchedFacts.map((fact) => fact.id),
    ...structuredMatches.flatMap((item) => item.relatedFactIds),
  ]);
  const hasStructuredCoverage = structuredMatches.length > 0;
  const status =
    hasStructuredCoverage || (docs.length > 0 && facts.length > 0)
      ? "covered"
      : docs.length > 0 || facts.length > 0
        ? "partial"
        : "missing";

  return {
    id: args.blueprint.id,
    laneId: args.laneId,
    returnFamily: args.returnFamily,
    title: args.blueprint.title,
    summary:
      status === "covered"
        ? hasStructuredCoverage
          ? "Tina found structured paper-truth support for this return-family record."
          : "Tina found both document and fact support for this return-family record."
        : status === "partial"
          ? "Tina found some signal for this return-family record, but the file is still thin."
          : "Tina does not yet have visible support for this return-family record.",
    status,
    criticality: args.blueprint.criticality,
    requiredForms: unique(args.blueprint.requiredForms),
    matchedDocumentIds: docs,
    matchedFactIds: facts,
  };
}

export function buildTinaEntityRecordMatrix(
  draft: TinaWorkspaceDraft
): TinaEntityRecordMatrixSnapshot {
  const federalReturnRequirements = buildTinaFederalReturnRequirements(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const laneId = federalReturnRequirements.laneId;
  const blueprints = buildBlueprints(draft, laneId).filter(
    (blueprint) => !blueprint.enabled || blueprint.enabled(draft)
  );
  const items = blueprints.map((blueprint) =>
    buildRequirement({
      draft,
      laneId,
      returnFamily: federalReturnRequirements.returnFamily,
      blueprint,
      documentIntelligence,
    })
  );
  const missingCriticalCount = items.filter(
    (item) => item.criticality === "critical" && item.status === "missing"
  ).length;
  const missingCount = items.filter((item) => item.status === "missing").length;
  const partialCount = items.filter((item) => item.status === "partial").length;
  const overallStatus =
    missingCriticalCount > 0 || missingCount > 0
      ? "missing"
      : partialCount > 0
        ? "partial"
        : "covered";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    laneId,
    returnFamily: federalReturnRequirements.returnFamily,
    overallStatus,
    missingCriticalCount,
    summary:
      items.length === 0
        ? "Tina does not yet have an entity-return record matrix for this lane."
        : overallStatus === "covered"
          ? "Tina has visible coverage for the current lane's key entity-return records."
          : overallStatus === "partial"
            ? `Tina has partial entity-record coverage on ${partialCount} item${
                partialCount === 1 ? "" : "s"
              }.`
            : `Tina is still missing ${missingCount} entity-return record${
                missingCount === 1 ? "" : "s"
              }, including ${missingCriticalCount} critical item${
                missingCriticalCount === 1 ? "" : "s"
              }.`,
    nextStep:
      overallStatus === "covered"
        ? "Carry this record coverage into reviewer prep and entity-return execution planning."
        : "Use the missing entity-return records to drive owner requests and reviewer control before pretending the lane is execution-ready.",
    items,
  };
}
