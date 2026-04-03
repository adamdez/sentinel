import type {
  TinaIndustryPlaybookId,
  TinaIndustryPlaybookItem,
  TinaIndustryPlaybookSnapshot,
  TinaSourceFact,
  TinaWorkspaceDraft,
} from "@/tina/types";

interface TinaIndustryPlaybookDefinition {
  id: TinaIndustryPlaybookId;
  title: string;
  keywords: RegExp[];
  naicsPrefixes: string[];
  requiresInventory?: boolean;
  characteristicSignals: string[];
  keyRisks: string[];
  likelyOpportunities: string[];
  requiredRecords: string[];
}

interface TinaIndustryPlaybookMatch {
  definition: TinaIndustryPlaybookDefinition;
  score: number;
  reasons: string[];
  facts: TinaSourceFact[];
}

const INDUSTRY_PLAYBOOKS: TinaIndustryPlaybookDefinition[] = [
  {
    id: "professional_services",
    title: "Professional services",
    keywords: [
      /\bconsult(ing|ant)?\b/,
      /\bagency\b/,
      /\bmarketing\b/,
      /\bdesign\b/,
      /\baccount(ing|ant)?\b/,
      /\blaw\b/,
      /\badvis(or|ory)\b/,
      /\bcoach(ing)?\b/,
    ],
    naicsPrefixes: ["541"],
    characteristicSignals: [
      "Owner-driven service revenue with limited direct cost of goods.",
      "Project, retainer, or hourly billing patterns.",
      "Contractor-heavy support is common in growing firms.",
    ],
    keyRisks: [
      "Mixed personal/business tech, travel, and meals deductions.",
      "Worker-classification drift between payroll and contractors.",
      "Weak home-office and accountable-plan documentation.",
    ],
    likelyOpportunities: [
      "QBI review.",
      "Self-employed retirement review.",
      "Self-employed health insurance review.",
    ],
    requiredRecords: [
      "Invoice or receivable support.",
      "Business-only tech and travel support.",
      "Worker agreements and payment support.",
    ],
  },
  {
    id: "skilled_trades",
    title: "Skilled trades",
    keywords: [
      /\bcontract(or|ing)?\b/,
      /\bconstruction\b/,
      /\bplumb(ing|er)?\b/,
      /\belectric(ian|al)?\b/,
      /\bhvac\b/,
      /\broof(ing|er)?\b/,
      /\blandscap(e|ing)\b/,
      /\bhandyman\b/,
      /\bremodel(ing)?\b/,
    ],
    naicsPrefixes: ["23", "238"],
    characteristicSignals: [
      "Vehicle, tools, subcontractors, and job-material costs matter.",
      "Project-based revenue with irregular timing and deposits.",
      "Books often blur owner draws, reimbursements, and true job costs.",
    ],
    keyRisks: [
      "Mileage or vehicle deductions without a defensible method.",
      "Owner draws and materials mixed into expense accounts.",
      "Subcontractor, payroll, and 1099 support gaps.",
    ],
    likelyOpportunities: [
      "Vehicle and accountable-plan cleanup.",
      "Fixed-asset and de minimis safe-harbor review.",
      "Retirement contribution review for owner-operators.",
    ],
    requiredRecords: [
      "Vehicle logs or accountable-plan support.",
      "Subcontractor and payroll support.",
      "Tool and equipment purchase support.",
    ],
  },
  {
    id: "e_commerce_retail",
    title: "E-commerce and retail",
    keywords: [
      /\becommerce\b/,
      /\bshopify\b/,
      /\bamazon\b/,
      /\betsy\b/,
      /\bonline store\b/,
      /\bsku\b/,
      /\bretail\b/,
      /\bmerch\b/,
    ],
    naicsPrefixes: ["44", "45"],
    requiresInventory: true,
    characteristicSignals: [
      "Inventory, marketplace fees, and payment processors drive the books.",
      "Gross receipts often need reconciliation across platforms and payouts.",
      "Sales-tax collection and inventory method choices matter.",
    ],
    keyRisks: [
      "Processor deposits treated as gross income without fee normalization.",
      "Inventory/COGS and ending inventory unsupported.",
      "Sales-tax pass-through amounts leaking into income.",
    ],
    likelyOpportunities: [
      "Inventory simplification review.",
      "Sales-tax exclusion review.",
      "Fixed-asset review for equipment and shipping assets.",
    ],
    requiredRecords: [
      "Marketplace payout statements.",
      "Inventory rollforward or year-end counts.",
      "Sales-tax collection/remittance support.",
    ],
  },
  {
    id: "real_estate",
    title: "Real estate and property activity",
    keywords: [
      /\breal estate\b/,
      /\brental\b/,
      /\bproperty\b/,
      /\bhouse\b/,
      /\bhomes\b/,
      /\bwholesale\b/,
      /\bflip(per|ping)?\b/,
      /\binvest(or|ing)\b/,
    ],
    naicsPrefixes: ["531"],
    characteristicSignals: [
      "Property acquisition, rehab, hold, or disposition economics drive tax treatment.",
      "Repair-vs-improvement and dealer-vs-investor characterization matter.",
      "Owner loans, capital flows, and installment structures are common.",
    ],
    keyRisks: [
      "Repairs misclassified instead of capitalization.",
      "Dealer-vs-investor treatment not analyzed.",
      "Installment and imputed-interest issues missed.",
    ],
    likelyOpportunities: [
      "Repair-regulation review.",
      "Installment-method review.",
      "Fixed-asset and depreciation review.",
    ],
    requiredRecords: [
      "Settlement statements and rehab invoices.",
      "Property-level income/expense support.",
      "Loan, note, and seller-finance documents.",
    ],
  },
  {
    id: "food_service",
    title: "Food service",
    keywords: [
      /\brestaurant\b/,
      /\bcafe\b/,
      /\bcoffee\b/,
      /\bfood truck\b/,
      /\bcatering\b/,
      /\bbar\b/,
      /\bkitchen\b/,
    ],
    naicsPrefixes: ["722"],
    requiresInventory: true,
    characteristicSignals: [
      "Inventory, spoilage, and payroll are central.",
      "Tips, meals, and sales-tax handling are often messy.",
      "Cash controls and POS reconciliation matter.",
    ],
    keyRisks: [
      "Inventory and COGS unsupported.",
      "Sales-tax and gross-receipts treatment blurred.",
      "Payroll, tip, and meals treatment gaps.",
    ],
    likelyOpportunities: [
      "Inventory method review.",
      "Sales-tax exclusion review.",
      "Equipment depreciation review.",
    ],
    requiredRecords: [
      "POS and merchant statements.",
      "Payroll and tip support.",
      "Inventory counts or purchasing support.",
    ],
  },
  {
    id: "creator_media",
    title: "Creator and media business",
    keywords: [
      /\bcreator\b/,
      /\bcontent\b/,
      /\byoutube\b/,
      /\bpodcast\b/,
      /\binfluencer\b/,
      /\bmedia\b/,
      /\baffiliate\b/,
      /\bsponsor(ship)?\b/,
      /\bcourse\b/,
    ],
    naicsPrefixes: ["512", "711"],
    characteristicSignals: [
      "Revenue often comes from multiple platforms, affiliates, and sponsorships.",
      "Mixed-use equipment, travel, and home-office claims are common.",
      "Brand and media expenses need stronger business-purpose support.",
    ],
    keyRisks: [
      "Mixed personal/business deductions.",
      "Platform payouts not reconciled to books.",
      "Travel, meals, and equipment support too thin.",
    ],
    likelyOpportunities: [
      "Home-office review.",
      "Equipment and de minimis safe-harbor review.",
      "Retirement and health-insurance review.",
    ],
    requiredRecords: [
      "Platform payout statements.",
      "Business-purpose support for travel and equipment.",
      "Sponsorship and affiliate agreements.",
    ],
  },
];

function normalize(value: string): string {
  return value.toLowerCase();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildHaystack(draft: TinaWorkspaceDraft): string {
  return normalize(
    [
      draft.profile.businessName,
      draft.profile.principalBusinessActivity,
      draft.profile.notes,
      draft.profile.naicsCode,
      ...draft.documents.map((document) => document.name),
      ...draft.sourceFacts.map((fact) => `${fact.label} ${fact.value}`),
    ].join(" ")
  );
}

function matchesNaics(draft: TinaWorkspaceDraft, prefixes: string[]): string[] {
  return prefixes.filter((prefix) => draft.profile.naicsCode.startsWith(prefix));
}

function matchingFacts(draft: TinaWorkspaceDraft, keywords: RegExp[]): TinaSourceFact[] {
  return draft.sourceFacts.filter((fact) =>
    keywords.some((keyword) => keyword.test(`${fact.label} ${fact.value}`.toLowerCase()))
  );
}

function matchPlaybook(
  definition: TinaIndustryPlaybookDefinition,
  draft: TinaWorkspaceDraft,
  haystack: string
): TinaIndustryPlaybookMatch | null {
  const keywordMatches = definition.keywords.filter((keyword) => keyword.test(haystack));
  const naicsMatches = matchesNaics(draft, definition.naicsPrefixes);
  const facts = matchingFacts(draft, definition.keywords);
  const reasons: string[] = [];

  keywordMatches.forEach((keyword) => {
    reasons.push(`Matched business/activity wording for ${definition.title.toLowerCase()}.`);
  });
  naicsMatches.forEach((prefix) => {
    reasons.push(`NAICS code aligns with ${definition.title.toLowerCase()} (${prefix}).`);
  });
  if (definition.requiresInventory && draft.profile.hasInventory) {
    reasons.push("Inventory profile fits this industry playbook.");
  }

  const score =
    keywordMatches.length * 2 +
    naicsMatches.length * 3 +
    facts.length * 2 +
    (definition.requiresInventory && draft.profile.hasInventory ? 1 : 0);

  if (score === 0) return null;

  return {
    definition,
    score,
    reasons: unique(reasons),
    facts,
  };
}

function buildItem(
  match: TinaIndustryPlaybookMatch,
  fit: TinaIndustryPlaybookItem["fit"]
): TinaIndustryPlaybookItem {
  return {
    id: match.definition.id,
    title: match.definition.title,
    fit,
    summary:
      fit === "primary"
        ? `This looks most like a ${match.definition.title.toLowerCase()} file, so Tina should lean on this playbook first.`
        : `This file still shows signals that fit the ${match.definition.title.toLowerCase()} playbook.`,
    characteristicSignals: unique([...match.reasons, ...match.definition.characteristicSignals]),
    keyRisks: [...match.definition.keyRisks],
    likelyOpportunities: [...match.definition.likelyOpportunities],
    requiredRecords: [...match.definition.requiredRecords],
    relatedFactIds: unique(match.facts.map((fact) => fact.id)),
    relatedDocumentIds: unique(match.facts.map((fact) => fact.sourceDocumentId)),
  };
}

function buildFallbackPlaybook(draft: TinaWorkspaceDraft): TinaIndustryPlaybookItem {
  return {
    id: "general_small_business",
    title: "General small business",
    fit: "primary",
    summary:
      "Tina does not see a sharper industry fingerprint yet, so she should use the general small-business playbook until the file becomes more specific.",
    characteristicSignals: [
      "Owner-operated small-business pattern.",
      "General income, expense, and owner-flow review still matters.",
    ],
    keyRisks: [
      "Thin bookkeeping support.",
      "Mixed personal/business costs.",
      "Wrong-lane starts from incomplete ownership facts.",
    ],
    likelyOpportunities: [
      "QBI review.",
      "Retirement review.",
      "Health-insurance review.",
    ],
    requiredRecords: [
      "Prior return and organizer facts.",
      "Books or bank support.",
      "Ownership and election support.",
    ],
    relatedFactIds: [],
    relatedDocumentIds: [],
  };
}

export function buildTinaIndustryPlaybooks(
  draft: TinaWorkspaceDraft
): TinaIndustryPlaybookSnapshot {
  const haystack = buildHaystack(draft);
  const matches = INDUSTRY_PLAYBOOKS.map((definition) => matchPlaybook(definition, draft, haystack))
    .filter((match): match is TinaIndustryPlaybookMatch => Boolean(match))
    .sort((left, right) => right.score - left.score);

  const items =
    matches.length > 0
      ? matches.map((match, index) =>
          buildItem(match, index === 0 ? "primary" : index === 1 ? "secondary" : "possible")
        )
      : [buildFallbackPlaybook(draft)];

  const primary = items.find((item) => item.fit === "primary") ?? null;

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    primaryIndustryId: primary?.id ?? null,
    summary: primary
      ? `Tina identified ${primary.title.toLowerCase()} as the primary industry playbook for this file.`
      : "Tina has not identified an industry playbook yet.",
    nextStep: primary
      ? "Use the primary playbook to shape opportunity review, treatment choices, and companion-form planning."
      : "Keep collecting business-detail facts until Tina can identify a stronger industry playbook.",
    items,
  };
}
