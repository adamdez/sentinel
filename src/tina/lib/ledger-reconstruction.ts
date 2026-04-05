import type {
  TinaDocumentIntelligenceRole,
  TinaLedgerArtifactNeed,
  TinaLedgerContaminationRisk,
  TinaLedgerIndependenceStatus,
  TinaLedgerReconstructionSnapshot,
  TinaLedgerSupportChannel,
  TinaLedgerSupportChannelKind,
  TinaLedgerTransactionGroup,
  TinaLedgerTransactionGroupCategory,
  TinaLedgerTransactionGroupStatus,
  TinaLedgerTransactionGroupSupportLevel,
} from "@/tina/lib/acceleration-contracts";
import { buildTinaAccountingArtifactCoverage } from "@/tina/lib/accounting-artifact-coverage";
import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { buildTinaBooksReconstruction } from "@/tina/lib/books-reconstruction";
import { buildTinaDocumentIntelligence } from "@/tina/lib/document-intelligence";
import { buildTinaPayrollComplianceReconstruction } from "@/tina/lib/payroll-compliance-reconstruction";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import type { TinaWorkspaceDraft } from "@/tina/types";

type ArtifactNeedDefinition = {
  id: string;
  title: string;
  criticality: "critical" | "important";
};

type TinaLedgerChannelDefinition = {
  kind: TinaLedgerSupportChannelKind;
  label: string;
  roles?: TinaDocumentIntelligenceRole[];
  patterns: RegExp[];
};

interface TinaLedgerSignalSeed {
  id: string;
  title: string;
  category: TinaLedgerTransactionGroupCategory;
  lineNumbers: string[];
  signalWords: string[];
  channelKinds: TinaLedgerSupportChannelKind[];
  requiredArtifacts: ArtifactNeedDefinition[];
  relatedNormalizationIssueIds: string[];
  enabled: (draft: TinaWorkspaceDraft) => boolean;
  amount: (
    draft: TinaWorkspaceDraft,
    scheduleCReturn: ReturnType<typeof buildTinaScheduleCReturn>
  ) => number | null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function amountForKey(
  scheduleCReturn: ReturnType<typeof buildTinaScheduleCReturn>,
  formKey: string
): number | null {
  return scheduleCReturn.fields.find((field) => field.formKey === formKey)?.amount ?? null;
}

function sum(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => typeof value === "number");
  if (numeric.length === 0) return null;
  return Math.round(numeric.reduce((total, value) => total + value, 0) * 100) / 100;
}

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function roundCurrency(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value * 100) / 100;
}

const CHANNEL_DEFINITIONS: Record<TinaLedgerSupportChannelKind, TinaLedgerChannelDefinition> = {
  bank_statements: {
    kind: "bank_statements",
    label: "Bank statements and deposit support",
    roles: ["bank_statement"],
    patterns: [
      /\bbank statement\b/i,
      /\bchecking statement\b/i,
      /\bchecking\b/i,
      /\bdeposit\b/i,
      /\bmerchant deposit\b/i,
    ],
  },
  card_statements: {
    kind: "card_statements",
    label: "Business card statements",
    patterns: [
      /\bcredit card\b/i,
      /\bcard statement\b/i,
      /\bamex\b/i,
      /\bvisa\b/i,
      /\bmastercard\b/i,
    ],
  },
  books_summary: {
    kind: "books_summary",
    label: "Books summary and profit-and-loss support",
    patterns: [/\bprofit and loss\b/i, /\bp&l\b/i, /\bpnl\b/i, /\bquickbooks\b/i],
  },
  general_ledger: {
    kind: "general_ledger",
    label: "General ledger and trial balance detail",
    roles: ["books_ledger"],
    patterns: [/\bgeneral ledger\b/i, /\bledger\b/i, /\btrial balance\b/i, /\bjournal\b/i],
  },
  payroll_reports: {
    kind: "payroll_reports",
    label: "Payroll reports and tax filings",
    roles: ["payroll_report"],
    patterns: [/\bpayroll\b/i, /\bw-2\b/i, /\b941\b/i, /\b940\b/i, /\bpay stub\b/i],
  },
  contractor_support: {
    kind: "contractor_support",
    label: "Contractor payment detail",
    patterns: [/\b1099\b/i, /\bcontractor\b/i, /\bvendor\b/i, /\bsubcontractor\b/i],
  },
  inventory_records: {
    kind: "inventory_records",
    label: "Inventory and COGS records",
    roles: ["inventory_count", "inventory_rollforward"],
    patterns: [
      /\binventory\b/i,
      /\bcogs\b/i,
      /\bcost of goods\b/i,
      /\bstock\b/i,
      /\bsku\b/i,
      /\bjob materials\b/i,
    ],
  },
  asset_records: {
    kind: "asset_records",
    label: "Fixed-asset and depreciation records",
    roles: ["asset_ledger"],
    patterns: [
      /\bfixed asset\b/i,
      /\basset register\b/i,
      /\bdepreciation\b/i,
      /\b4562\b/i,
      /\bplaced-in-service\b/i,
      /\bequipment\b/i,
    ],
  },
  ownership_records: {
    kind: "ownership_records",
    label: "Ownership and related-party records",
    roles: ["operating_agreement", "cap_table", "ownership_schedule", "related_party_agreement"],
    patterns: [
      /\boperating agreement\b/i,
      /\bownership\b/i,
      /\bmember\b/i,
      /\bcapital\b/i,
      /\bbuyout\b/i,
      /\bredemption\b/i,
      /\brelated-party\b/i,
      /\bintercompany\b/i,
    ],
  },
  prior_return: {
    kind: "prior_return",
    label: "Prior-return and filed-form support",
    roles: ["prior_return_package"],
    patterns: [
      /\bprior return\b/i,
      /\bfiled federal return\b/i,
      /\bschedule c\b/i,
      /\b1065\b/i,
      /\b1120-s\b/i,
      /\b1120\b/i,
    ],
  },
  narrative_only: {
    kind: "narrative_only",
    label: "Narrative-only clues",
    patterns: [],
  },
};

const LEDGER_SEEDS: TinaLedgerSignalSeed[] = [
  {
    id: "income",
    title: "Income reconstruction",
    category: "income",
    lineNumbers: ["Line 1", "Line 4", "Line 7"],
    signalWords: ["income", "gross receipts", "deposits", "sales", "revenue", "marketplace payout"],
    channelKinds: ["bank_statements", "books_summary", "general_ledger", "prior_return"],
    requiredArtifacts: [
      { id: "bank-statements", title: "Bank statements", criticality: "critical" },
      { id: "profit-and-loss", title: "Profit and loss support", criticality: "critical" },
      { id: "general-ledger", title: "General ledger detail", criticality: "important" },
    ],
    relatedNormalizationIssueIds: ["multi-entity-normalization"],
    enabled: () => true,
    amount: (_draft, scheduleCReturn) =>
      sum([
        amountForKey(scheduleCReturn, "grossReceipts"),
        amountForKey(scheduleCReturn, "costOfGoodsSold"),
        amountForKey(scheduleCReturn, "grossIncome"),
      ]),
  },
  {
    id: "owner-flow",
    title: "Owner-flow separation",
    category: "owner_flow",
    lineNumbers: [],
    signalWords: ["owner draw", "owner reimbursement", "owner flow", "distribution", "draws"],
    channelKinds: ["ownership_records", "bank_statements", "general_ledger"],
    requiredArtifacts: [
      { id: "ownership-records", title: "Ownership and capital records", criticality: "critical" },
      { id: "general-ledger", title: "General ledger detail", criticality: "important" },
      { id: "bank-statements", title: "Bank statements", criticality: "important" },
    ],
    relatedNormalizationIssueIds: [
      "owner-flow-normalization",
      "ownership-transition-normalization",
      "multi-entity-normalization",
    ],
    enabled: (draft) =>
      /owner draw|owner reimbursement|owner flow|distribution|draws/i.test(draft.profile.notes),
    amount: () => null,
  },
  {
    id: "payroll",
    title: "Payroll separation",
    category: "payroll",
    lineNumbers: ["Line 26"],
    signalWords: ["payroll", "wages", "w-2", "salary"],
    channelKinds: ["payroll_reports", "general_ledger", "books_summary"],
    requiredArtifacts: [
      { id: "payroll-records", title: "Payroll records", criticality: "critical" },
      { id: "general-ledger", title: "General ledger detail", criticality: "important" },
    ],
    relatedNormalizationIssueIds: ["worker-classification-normalization"],
    enabled: (draft) => draft.profile.hasPayroll,
    amount: (_draft, scheduleCReturn) => amountForKey(scheduleCReturn, "wages"),
  },
  {
    id: "contractors",
    title: "Contractor separation",
    category: "contractors",
    lineNumbers: ["Line 11"],
    signalWords: ["contract labor", "contractor", "1099", "subcontractor"],
    channelKinds: ["contractor_support", "general_ledger", "books_summary"],
    requiredArtifacts: [
      {
        id: "contractor-records",
        title: "Contractor and 1099 support",
        criticality: "critical",
      },
      { id: "general-ledger", title: "General ledger detail", criticality: "important" },
    ],
    relatedNormalizationIssueIds: ["worker-classification-normalization"],
    enabled: (draft) => draft.profile.paysContractors,
    amount: (_draft, scheduleCReturn) => amountForKey(scheduleCReturn, "contractLabor"),
  },
  {
    id: "inventory",
    title: "Inventory and COGS reconstruction",
    category: "inventory",
    lineNumbers: ["Line 4"],
    signalWords: ["inventory", "cogs", "cost of goods", "job materials", "materials"],
    channelKinds: ["inventory_records", "general_ledger", "books_summary"],
    requiredArtifacts: [
      { id: "inventory-records", title: "Inventory records", criticality: "critical" },
      { id: "balance-sheet", title: "Balance-sheet support", criticality: "important" },
      { id: "general-ledger", title: "General ledger detail", criticality: "important" },
    ],
    relatedNormalizationIssueIds: [],
    enabled: (draft) => draft.profile.hasInventory,
    amount: (_draft, scheduleCReturn) => amountForKey(scheduleCReturn, "costOfGoodsSold"),
  },
  {
    id: "fixed-assets",
    title: "Fixed-asset and depreciation reconstruction",
    category: "fixed_assets",
    lineNumbers: ["Line 13"],
    signalWords: ["depreciation", "asset", "placed in service", "equipment", "section 179"],
    channelKinds: ["asset_records", "general_ledger", "books_summary", "prior_return"],
    requiredArtifacts: [
      { id: "fixed-asset-register", title: "Fixed-asset register", criticality: "critical" },
      { id: "balance-sheet", title: "Balance-sheet support", criticality: "important" },
      { id: "general-ledger", title: "General ledger detail", criticality: "important" },
    ],
    relatedNormalizationIssueIds: ["fixed-asset-normalization"],
    enabled: (draft) => draft.profile.hasFixedAssets,
    amount: (_draft, scheduleCReturn) => amountForKey(scheduleCReturn, "depreciation"),
  },
  {
    id: "related-party",
    title: "Related-party and intercompany separation",
    category: "related_party",
    lineNumbers: [],
    signalWords: ["related-party", "related party", "intercompany", "family management", "due-to", "due from"],
    channelKinds: ["ownership_records", "general_ledger", "bank_statements"],
    requiredArtifacts: [
      { id: "ownership-records", title: "Ownership and capital records", criticality: "critical" },
      { id: "balance-sheet", title: "Balance-sheet support", criticality: "important" },
      { id: "general-ledger", title: "General ledger detail", criticality: "important" },
    ],
    relatedNormalizationIssueIds: [
      "intercompany-normalization",
      "related-party-normalization",
      "multi-entity-normalization",
    ],
    enabled: (draft) =>
      /related-party|related party|intercompany|family management|due-to|due from/i.test(
        draft.profile.notes
      ),
    amount: () => null,
  },
  {
    id: "taxes",
    title: "Sales tax and tax-line separation",
    category: "taxes",
    lineNumbers: ["Line 23"],
    signalWords: ["sales tax", "remittance", "taxes", "licenses"],
    channelKinds: ["bank_statements", "general_ledger", "books_summary"],
    requiredArtifacts: [
      { id: "bank-statements", title: "Bank statements", criticality: "important" },
      { id: "general-ledger", title: "General ledger detail", criticality: "important" },
      { id: "profit-and-loss", title: "Profit and loss support", criticality: "important" },
    ],
    relatedNormalizationIssueIds: ["multi-entity-normalization"],
    enabled: (draft) => draft.profile.collectsSalesTax,
    amount: (_draft, scheduleCReturn) => amountForKey(scheduleCReturn, "taxesAndLicenses"),
  },
  {
    id: "mixed-use",
    title: "Mixed-use contamination separation",
    category: "mixed_use",
    lineNumbers: ["Line 24a", "Line 24b", "Line 27a"],
    signalWords: ["mixed use", "personal", "meals", "travel", "vehicle", "home office"],
    channelKinds: ["card_statements", "general_ledger", "bank_statements"],
    requiredArtifacts: [
      { id: "credit-card-statements", title: "Credit-card statements", criticality: "critical" },
      { id: "general-ledger", title: "General ledger detail", criticality: "important" },
      { id: "bank-statements", title: "Bank statements", criticality: "important" },
    ],
    relatedNormalizationIssueIds: ["mixed-use-normalization"],
    enabled: (draft) => /mixed use|personal|vehicle|home office|meals|travel/i.test(draft.profile.notes),
    amount: (_draft, scheduleCReturn) =>
      sum([
        amountForKey(scheduleCReturn, "travel"),
        amountForKey(scheduleCReturn, "deductibleMeals"),
        amountForKey(scheduleCReturn, "otherExpenses"),
      ]),
  },
];

function matchesPatternList(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function buildDocumentText(draft: TinaWorkspaceDraft, documentId: string): string {
  const document = draft.documents.find((item) => item.id === documentId);
  const reading = draft.documentReadings.find((item) => item.documentId === documentId);
  const facts = draft.sourceFacts.filter((fact) => fact.sourceDocumentId === documentId);

  return normalizeText(
    [
      document?.name ?? "",
      document?.requestLabel ?? "",
      document?.requestId ?? "",
      reading?.summary ?? "",
      reading?.detailLines.join(" ") ?? "",
      facts.map((fact) => `${fact.label} ${fact.value}`).join(" "),
    ].join(" ")
  );
}

function buildSupportChannel(args: {
  draft: TinaWorkspaceDraft;
  intelligence: ReturnType<typeof buildTinaDocumentIntelligence>;
  definition: TinaLedgerChannelDefinition;
  signalWords: string[];
}): TinaLedgerSupportChannel {
  const signalPattern = new RegExp(args.signalWords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
  const structuredDocumentIds = args.draft.documents
    .filter((document) => {
      const text = buildDocumentText(args.draft, document.id);
      const intelligenceItem = args.intelligence.items.find((item) => item.documentId === document.id);
      const roleMatch =
        args.definition.roles?.some((role) => intelligenceItem?.roles.includes(role)) ?? false;
      return roleMatch || matchesPatternList(text, args.definition.patterns);
    })
    .map((document) => document.id);
  const narrativeFactIds = args.draft.sourceFacts
    .filter((fact) => {
      const factText = normalizeText(`${fact.label} ${fact.value}`);
      return signalPattern.test(factText) && matchesPatternList(factText, args.definition.patterns);
    })
    .map((fact) => fact.id);
  const readingDocumentIds = args.draft.documentReadings
    .filter((reading) => {
      const detailText = normalizeText(
        [reading.summary, reading.detailLines.join(" ")].join(" ")
      );
      return signalPattern.test(detailText) && matchesPatternList(detailText, args.definition.patterns);
    })
    .map((reading) => reading.documentId);
  const relatedDocumentIds = unique([
    ...structuredDocumentIds,
    ...readingDocumentIds,
    ...narrativeFactIds.map(
      (factId) => args.draft.sourceFacts.find((fact) => fact.id === factId)?.sourceDocumentId ?? ""
    ),
  ]);
  const status =
    structuredDocumentIds.length > 0
      ? "structured"
      : narrativeFactIds.length > 0 || readingDocumentIds.length > 0
        ? "narrative_only"
        : "missing";

  return {
    id: args.definition.kind,
    kind: args.definition.kind,
    status,
    summary:
      status === "structured"
        ? `${args.definition.label} are present as structured paper support.`
        : status === "narrative_only"
          ? `${args.definition.label} only appear in narrative clues, not in durable bookkeeping support.`
          : `${args.definition.label} are not currently present for this ledger group.`,
    relatedDocumentIds,
    relatedFactIds: narrativeFactIds,
  };
}

function buildNarrativeFallbackChannel(args: {
  draft: TinaWorkspaceDraft;
  signalWords: string[];
  extraDocumentIds?: string[];
}): TinaLedgerSupportChannel | null {
  const signalPattern = new RegExp(args.signalWords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
  const factIds = args.draft.sourceFacts
    .filter((fact) => signalPattern.test(normalizeText(`${fact.label} ${fact.value}`)))
    .map((fact) => fact.id);
  const readingDocumentIds = args.draft.documentReadings
    .filter((reading) =>
      signalPattern.test(normalizeText([reading.summary, reading.detailLines.join(" ")].join(" ")))
    )
    .map((reading) => reading.documentId);

  if (factIds.length === 0 && readingDocumentIds.length === 0) {
    if ((args.extraDocumentIds ?? []).length === 0) {
      return null;
    }
  }

  if (factIds.length === 0 && readingDocumentIds.length === 0 && (args.extraDocumentIds ?? []).length === 0) {
    return null;
  }

  return {
    id: "narrative-only",
    kind: "narrative_only",
    status: "narrative_only",
    summary: "This group is mostly being inferred from narrative clues instead of structured books support.",
    relatedDocumentIds: unique([
      ...(args.extraDocumentIds ?? []),
      ...readingDocumentIds,
      ...factIds.map(
        (factId) => args.draft.sourceFacts.find((fact) => fact.id === factId)?.sourceDocumentId ?? ""
      ),
    ]),
    relatedFactIds: factIds,
  };
}

function buildRequiredArtifacts(args: {
  accountingArtifactCoverage: ReturnType<typeof buildTinaAccountingArtifactCoverage>;
  definitions: ArtifactNeedDefinition[];
}): TinaLedgerArtifactNeed[] {
  return args.definitions.map((definition) => {
    const matched = args.accountingArtifactCoverage.items.find((item) => item.id === definition.id);
    return {
      id: definition.id,
      title: matched?.title ?? definition.title,
      status: matched?.status ?? "missing",
      criticality: definition.criticality,
    };
  });
}

function supportLevelForGroup(args: {
  channels: TinaLedgerSupportChannel[];
  requiredArtifacts: TinaLedgerArtifactNeed[];
  contradictionCount: number;
}): TinaLedgerTransactionGroupSupportLevel {
  const structuredChannelCount = args.channels.filter((channel) => channel.status === "structured").length;
  const narrativeChannelCount = args.channels.filter((channel) => channel.status === "narrative_only").length;
  const missingCriticalArtifactCount = args.requiredArtifacts.filter(
    (artifact) => artifact.criticality === "critical" && artifact.status === "missing"
  ).length;
  const partialArtifactCount = args.requiredArtifacts.filter(
    (artifact) => artifact.status !== "covered"
  ).length;

  if (missingCriticalArtifactCount > 0 && structuredChannelCount === 0 && narrativeChannelCount === 0) {
    return "missing";
  }
  if (structuredChannelCount >= 2 && missingCriticalArtifactCount === 0 && args.contradictionCount === 0) {
    return "strong";
  }
  if (structuredChannelCount >= 1 && missingCriticalArtifactCount === 0 && args.contradictionCount <= 1) {
    return "moderate";
  }
  if (structuredChannelCount >= 1 || narrativeChannelCount > 0 || partialArtifactCount > 0) {
    return "weak";
  }
  return "missing";
}

function independenceStatusForChannels(
  channels: TinaLedgerSupportChannel[]
): TinaLedgerIndependenceStatus {
  const structuredChannelCount = channels.filter((channel) => channel.status === "structured").length;
  const narrativeChannelCount = channels.filter((channel) => channel.status === "narrative_only").length;

  if (structuredChannelCount >= 2) return "independent";
  if (structuredChannelCount === 1 && narrativeChannelCount > 0) return "mixed";
  return "concentrated";
}

function contaminationRiskForGroup(args: {
  relatedIssues: ReturnType<typeof buildTinaBooksNormalization>["issues"];
  requiredArtifacts: TinaLedgerArtifactNeed[];
  multiEinConflict: boolean;
}): TinaLedgerContaminationRisk {
  if (
    args.relatedIssues.some((issue) => issue.severity === "blocking") ||
    args.multiEinConflict
  ) {
    return "high";
  }

  if (
    args.relatedIssues.some((issue) => issue.severity !== "watch") ||
    args.requiredArtifacts.some((artifact) => artifact.status !== "covered")
  ) {
    return "watch";
  }

  return "low";
}

function multiEinAppliesToCategory(
  category: TinaLedgerTransactionGroupCategory
): boolean {
  return (
    category === "income" ||
    category === "owner_flow" ||
    category === "related_party" ||
    category === "taxes"
  );
}

function statusForGroup(args: {
  supportLevel: TinaLedgerTransactionGroupSupportLevel;
  contaminationRisk: TinaLedgerContaminationRisk;
  independenceStatus: TinaLedgerIndependenceStatus;
  contradictionCount: number;
}): TinaLedgerTransactionGroupStatus {
  if (
    args.supportLevel === "missing" ||
    args.contaminationRisk === "high" ||
    args.contradictionCount >= 2
  ) {
    return "blocked";
  }

  if (
    args.supportLevel === "strong" &&
    args.independenceStatus !== "concentrated" &&
    args.contradictionCount === 0
  ) {
    return "reconstructed";
  }

  if (args.supportLevel === "moderate") {
    return "reconstructed";
  }

  return "partial";
}

function buildGroupSummary(args: {
  title: string;
  status: TinaLedgerTransactionGroupStatus;
  structuredChannelCount: number;
  narrativeChannelCount: number;
  independenceStatus: TinaLedgerIndependenceStatus;
  contaminationRisk: TinaLedgerContaminationRisk;
  requiredArtifacts: TinaLedgerArtifactNeed[];
}): string {
  const missingArtifactTitles = args.requiredArtifacts
    .filter((artifact) => artifact.status !== "covered")
    .map((artifact) => artifact.title);

  if (args.status === "not_applicable") {
    return `${args.title} does not materially apply to the current file.`;
  }

  if (args.status === "reconstructed") {
    return `${args.title} has ${args.structuredChannelCount} structured support channel${
      args.structuredChannelCount === 1 ? "" : "s"
    } with ${args.independenceStatus} support.`;
  }

  if (args.status === "partial") {
    const leadingGap =
      missingArtifactTitles[0] ??
      (args.narrativeChannelCount > 0
        ? "too much narrative-only support"
        : `${args.independenceStatus} support concentration`);

    return `${args.title} is only partially reconstructed because Tina still sees ${leadingGap}.`;
  }

  const blocker =
    args.contaminationRisk === "high"
      ? "high contamination risk in the books picture"
      : missingArtifactTitles[0] ?? "missing structured support";

  return `${args.title} is blocked because Tina still sees ${blocker}.`;
}

function applyPayrollComplianceToGroup(args: {
  group: TinaLedgerTransactionGroup;
  seedId: string;
  payrollCompliance: ReturnType<typeof buildTinaPayrollComplianceReconstruction>;
}): TinaLedgerTransactionGroup {
  if (args.seedId !== "payroll" && args.seedId !== "contractors") {
    return args.group;
  }

  const relatedDocumentIds = unique([
    ...args.group.relatedDocumentIds,
    ...args.payrollCompliance.relatedDocumentIds,
  ]);
  const relatedFactIds = unique([
    ...args.group.relatedFactIds,
    ...args.payrollCompliance.relatedFactIds,
  ]);

  if (args.seedId === "payroll") {
    if (args.payrollCompliance.overallStatus === "not_applicable") {
      return {
        ...args.group,
        status: "not_applicable",
        supportChannels: [],
        requiredArtifacts: [],
        documentCount: 0,
        factCount: 0,
        summary:
          args.payrollCompliance.posture === "contractor_likely"
            ? "Payroll separation does not materially apply because contractor-only labor is the better-supported posture."
            : "Payroll separation does not materially apply to the current file.",
        relatedDocumentIds: [],
        relatedFactIds: [],
      };
    }

    if (args.payrollCompliance.overallStatus === "blocked") {
      return {
        ...args.group,
        status: "blocked",
        supportLevel: args.group.supportLevel === "missing" ? "missing" : "weak",
        contaminationRisk: "high",
        contradictionCount: Math.max(args.group.contradictionCount, 1),
        summary:
          "Payroll separation is blocked because payroll operations exist without a clean filing, deposit, or owner-compensation trail.",
        relatedDocumentIds,
        relatedFactIds,
        documentCount: relatedDocumentIds.length,
        factCount: relatedFactIds.length,
      };
    }

    if (args.payrollCompliance.overallStatus === "needs_review") {
      return {
        ...args.group,
        status: args.group.status === "blocked" ? "blocked" : "partial",
        supportLevel: args.group.supportLevel === "missing" ? "weak" : args.group.supportLevel,
        contaminationRisk: args.group.contaminationRisk === "high" ? "high" : "watch",
        summary:
          "Payroll separation is visible, but Tina still needs reviewer control over payroll compliance or worker classification.",
        relatedDocumentIds,
        relatedFactIds,
        documentCount: relatedDocumentIds.length,
        factCount: relatedFactIds.length,
      };
    }

    return {
      ...args.group,
      supportLevel:
        args.group.supportLevel === "missing" || args.group.supportLevel === "weak"
          ? "moderate"
          : args.group.supportLevel,
      status:
        args.group.contaminationRisk === "high"
          ? args.group.status
          : args.group.status === "blocked"
            ? "partial"
            : args.group.status,
      summary:
        "Payroll separation is backed by a coherent payroll operations and compliance trail.",
      relatedDocumentIds,
      relatedFactIds,
      documentCount: relatedDocumentIds.length,
      factCount: relatedFactIds.length,
    };
  }

  if (args.payrollCompliance.workerClassification === "mixed") {
    return {
      ...args.group,
      status: args.payrollCompliance.blockedIssueCount > 0 ? "blocked" : "partial",
      contaminationRisk: args.payrollCompliance.blockedIssueCount > 0 ? "high" : "watch",
      contradictionCount: Math.max(args.group.contradictionCount, 1),
      summary:
        "Contractor separation still overlaps with payroll flows, so Tina should keep labor classification under reviewer control.",
      relatedDocumentIds,
      relatedFactIds,
      documentCount: relatedDocumentIds.length,
      factCount: relatedFactIds.length,
    };
  }

  if (args.payrollCompliance.posture === "contractor_likely") {
    return {
      ...args.group,
      supportLevel:
        args.group.supportLevel === "missing" || args.group.supportLevel === "weak"
          ? "moderate"
          : args.group.supportLevel,
      status: args.group.status === "blocked" ? "partial" : args.group.status,
      summary:
        "Contractor separation is the better-supported labor posture than payroll on the current file.",
      relatedDocumentIds,
      relatedFactIds,
      documentCount: relatedDocumentIds.length,
      factCount: relatedFactIds.length,
    };
  }

  return {
    ...args.group,
    relatedDocumentIds,
    relatedFactIds,
    documentCount: relatedDocumentIds.length,
    factCount: relatedFactIds.length,
  };
}

function buildGroup(
  draft: TinaWorkspaceDraft,
  seed: TinaLedgerSignalSeed,
  scheduleCReturn: ReturnType<typeof buildTinaScheduleCReturn>,
  booksNormalization: ReturnType<typeof buildTinaBooksNormalization>,
  accountingArtifactCoverage: ReturnType<typeof buildTinaAccountingArtifactCoverage>,
  documentIntelligence: ReturnType<typeof buildTinaDocumentIntelligence>,
  payrollCompliance: ReturnType<typeof buildTinaPayrollComplianceReconstruction>,
  multiEinConflict: boolean
): TinaLedgerTransactionGroup {
  const enabled = seed.enabled(draft);
  const matchingFacts = draft.sourceFacts.filter((fact) =>
    seed.signalWords.some((word) =>
      normalizeText(`${fact.label} ${fact.value}`).includes(word.toLowerCase())
    )
  );
  const matchingDocumentIds = draft.documents
    .filter((document) =>
      seed.signalWords.some((word) =>
        normalizeText(`${document.name} ${document.requestLabel ?? ""}`).includes(word.toLowerCase())
      )
    )
    .map((document) => document.id);
  const readingDocumentIds = draft.documentReadings
    .filter((reading) =>
      seed.signalWords.some((word) =>
        normalizeText(`${reading.summary} ${reading.detailLines.join(" ")}`).includes(word.toLowerCase())
      )
    )
    .map((reading) => reading.documentId);
  const returnLineDocumentIds = unique(
    draft.scheduleCDraft.fields
      .filter((field) => seed.lineNumbers.includes(field.lineNumber))
      .flatMap((field) => field.sourceDocumentIds)
  );
  const appliesToFile =
    enabled ||
    matchingFacts.length > 0 ||
    matchingDocumentIds.length > 0 ||
    readingDocumentIds.length > 0 ||
    returnLineDocumentIds.length > 0;

  if (!appliesToFile) {
    return {
      id: seed.id,
      title: seed.title,
      category: seed.category,
      status: "not_applicable",
      supportLevel: "strong",
      independenceStatus: "independent",
      contaminationRisk: "low",
      contradictionCount: 0,
      estimatedAmount: roundCurrency(seed.amount(draft, scheduleCReturn)),
      documentCount: 0,
      factCount: 0,
      summary: `${seed.title} does not materially apply to the current file.`,
      supportChannels: [],
      requiredArtifacts: [],
      relatedDocumentIds: [],
      relatedFactIds: [],
      relatedLineNumbers: seed.lineNumbers,
    };
  }

  const supportChannels = seed.channelKinds
    .map((kind) =>
      buildSupportChannel({
        draft,
        intelligence: documentIntelligence,
        definition: CHANNEL_DEFINITIONS[kind],
        signalWords: seed.signalWords,
      })
    );
  const narrativeFallback = buildNarrativeFallbackChannel({
    draft,
    signalWords: seed.signalWords,
    extraDocumentIds: returnLineDocumentIds,
  });
  const hasAnyRealChannel = supportChannels.some((channel) => channel.status !== "missing");
  const channels = narrativeFallback && !hasAnyRealChannel
    ? [...supportChannels, narrativeFallback]
    : supportChannels;
  const requiredArtifacts = buildRequiredArtifacts({
    accountingArtifactCoverage,
    definitions: seed.requiredArtifacts,
  });
  const relatedIssues = booksNormalization.issues.filter((issue) =>
    seed.relatedNormalizationIssueIds.includes(issue.id)
  );
  const contradictionCount =
    relatedIssues.filter((issue) => issue.severity === "blocking").length +
    (multiEinConflict && multiEinAppliesToCategory(seed.category) ? 1 : 0);
  const independenceStatus = independenceStatusForChannels(channels);
  const contaminationRisk = contaminationRiskForGroup({
    relatedIssues,
    requiredArtifacts,
    multiEinConflict: multiEinConflict && multiEinAppliesToCategory(seed.category),
  });
  const supportLevel = supportLevelForGroup({
    channels,
    requiredArtifacts,
    contradictionCount,
  });
  const status = statusForGroup({
    supportLevel,
    contaminationRisk,
    independenceStatus,
    contradictionCount,
  });
  const relatedDocumentIds = unique([
    ...matchingDocumentIds,
    ...readingDocumentIds,
    ...channels.flatMap((channel) => channel.relatedDocumentIds),
    ...matchingFacts.map((fact) => fact.sourceDocumentId),
  ]);
  const structuredChannelCount = channels.filter((channel) => channel.status === "structured").length;
  const narrativeChannelCount = channels.filter((channel) => channel.status === "narrative_only").length;

  const group: TinaLedgerTransactionGroup = {
    id: seed.id,
    title: seed.title,
    category: seed.category,
    status,
    supportLevel,
    independenceStatus,
    contaminationRisk,
    contradictionCount,
    estimatedAmount: roundCurrency(seed.amount(draft, scheduleCReturn)),
    documentCount: relatedDocumentIds.length,
    factCount: matchingFacts.length,
    summary: buildGroupSummary({
      title: seed.title,
      status,
      structuredChannelCount,
      narrativeChannelCount,
      independenceStatus,
      contaminationRisk,
      requiredArtifacts,
    }),
    supportChannels: channels,
    requiredArtifacts,
    relatedDocumentIds,
    relatedFactIds: matchingFacts.map((fact) => fact.id),
    relatedLineNumbers: seed.lineNumbers,
  };

  return applyPayrollComplianceToGroup({
    group,
    seedId: seed.id,
    payrollCompliance,
  });
}

export function buildTinaLedgerReconstruction(
  draft: TinaWorkspaceDraft
): TinaLedgerReconstructionSnapshot {
  const booksReconstruction = buildTinaBooksReconstruction(draft);
  const booksNormalization = buildTinaBooksNormalization(draft);
  const accountingArtifactCoverage = buildTinaAccountingArtifactCoverage(draft);
  const documentIntelligence = buildTinaDocumentIntelligence(draft);
  const payrollCompliance = buildTinaPayrollComplianceReconstruction(draft);
  const scheduleCReturn = buildTinaScheduleCReturn(draft);
  const multiEinConflict =
    documentIntelligence.items
      .flatMap((item) =>
        item.extractedFacts
          .filter((fact) => fact.kind === "identity_signal" && fact.label === "Employer identification number")
          .map((fact) => fact.valueText ?? "")
      )
      .filter(Boolean).length > 1;
  const groups = LEDGER_SEEDS.map((seed) =>
    buildGroup(
      draft,
      seed,
      scheduleCReturn,
      booksNormalization,
      accountingArtifactCoverage,
      documentIntelligence,
      payrollCompliance,
      multiEinConflict
    )
  );
  const applicableGroups = groups.filter((group) => group.status !== "not_applicable");
  const blockedGroupCount = applicableGroups.filter((group) => group.status === "blocked").length;
  const partialGroupCount = applicableGroups.filter((group) => group.status === "partial").length;
  const concentratedGroupCount = groups.filter(
    (group) =>
      group.status !== "not_applicable" &&
      group.independenceStatus === "concentrated"
  ).length;
  const highContaminationGroupCount = groups.filter(
    (group) =>
      group.status !== "not_applicable" &&
      group.contaminationRisk === "high"
  ).length;
  const overallStatus =
    applicableGroups.length > 0 && blockedGroupCount === applicableGroups.length
      ? "blocked"
      : blockedGroupCount > 0 ||
          partialGroupCount > 0 ||
          booksReconstruction.overallStatus !== "reconstructed"
        ? "partial"
        : "reconstructed";

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    sourceMode: booksReconstruction.sourceMode,
    overallStatus,
    summary:
      overallStatus === "reconstructed"
        ? "Tina has a ledger-style books story with structured support channels across the core transaction groups."
        : overallStatus === "partial"
          ? "Tina has a partial ledger-style books story, but some groups still rely on concentrated or thin support."
          : "Tina still has blocked ledger groups, contamination risk, or missing artifacts in the books picture.",
    nextStep:
      overallStatus === "reconstructed"
        ? "Use the ledger groups to explain why each material area is trustworthy or reviewer-controlled."
        : "Resolve the concentrated or blocked ledger groups before Tina treats the books story as return-safe.",
    groups,
    blockedGroupCount,
    partialGroupCount,
    concentratedGroupCount,
    highContaminationGroupCount,
  };
}
