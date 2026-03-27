import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import {
  evaluateTinaTaxIdea,
  type TinaResearchDecisionBucket,
  type TinaResearchSourceClass,
} from "@/tina/lib/research-policy";
import type { TinaSourceFact, TinaWorkspaceDraft } from "@/tina/types";

export type TinaTaxIdeaCategory = "deduction" | "state" | "compliance" | "continuity";

export interface TinaTaxIdeaLead {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
  category: TinaTaxIdeaCategory;
  decisionBucket: TinaResearchDecisionBucket;
  sourceClasses: TinaResearchSourceClass[];
  sourceLabels: string[];
  factIds: string[];
  documentIds: string[];
  searchPrompt: string;
  nextStep: string;
}

interface TinaTaxIdeaSeed {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
  category: TinaTaxIdeaCategory;
  sourceLabels: string[];
  factIds?: string[];
  documentIds?: string[];
  searchPrompt: string;
}

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findFactsByLabel(sourceFacts: TinaSourceFact[], label: string): TinaSourceFact[] {
  return sourceFacts.filter(
    (fact) => normalizeForComparison(fact.label) === normalizeForComparison(label)
  );
}

function buildLead(seed: TinaTaxIdeaSeed): TinaTaxIdeaLead {
  const decision = evaluateTinaTaxIdea({
    sourceClasses: ["internal_signal"],
    hasPrimaryAuthority: false,
    hasSubstantialAuthority: false,
    hasReasonableBasis: false,
    needsDisclosure: false,
    isTaxShelterLike: false,
    isFrivolous: false,
  });

  return {
    id: seed.id,
    title: seed.title,
    summary: seed.summary,
    whyItMatters: seed.whyItMatters,
    category: seed.category,
    decisionBucket: decision.bucket,
    sourceClasses: ["internal_signal"],
    sourceLabels: seed.sourceLabels,
    factIds: seed.factIds ?? [],
    documentIds: seed.documentIds ?? [],
    searchPrompt: seed.searchPrompt,
    nextStep: decision.nextStep,
  };
}

function collectLinkedIds(sourceFacts: TinaSourceFact[]): Pick<TinaTaxIdeaLead, "factIds" | "documentIds"> {
  return {
    factIds: sourceFacts.map((fact) => fact.id),
    documentIds: Array.from(new Set(sourceFacts.map((fact) => fact.sourceDocumentId))),
  };
}

export function buildTinaResearchIdeas(draft: TinaWorkspaceDraft): TinaTaxIdeaLead[] {
  const recommendation = recommendTinaFilingLane(draft.profile);
  const ideas: TinaTaxIdeaLead[] = [];

  const priorReturnSourceLabel =
    draft.priorReturnDocumentId || draft.priorReturn
      ? "Tina has a prior-year return or continuity paper."
      : null;
  if (priorReturnSourceLabel) {
    ideas.push(
      buildLead({
        id: "prior-year-carryovers",
        title: "Check last year for carryovers and elections",
        summary:
          "Tina should inspect last year's return for anything that carries into this year, like depreciation, overpayments, or tax elections.",
        whyItMatters:
          "Carryovers and prior elections are easy to miss, and missing them can either cost money or create filing errors.",
        category: "continuity",
        sourceLabels: [priorReturnSourceLabel],
        documentIds: draft.priorReturnDocumentId ? [draft.priorReturnDocumentId] : [],
        searchPrompt:
          "Review the prior-year return for carryovers, depreciation history, overpayments, elections, and continuity items that may affect the current-year business return.",
      })
    );
  }

  if (recommendation.laneId === "schedule_c_single_member_llc") {
    ideas.push(
      buildLead({
        id: "qbi-review",
        title: "Check the QBI deduction",
        summary:
          "Tina should test whether this business can use the qualified business income deduction and whether any limits apply.",
        whyItMatters:
          "This can be a meaningful tax saver for eligible businesses, but Tina should verify the facts carefully before relying on it.",
        category: "deduction",
        sourceLabels: [
          "The current filing lane points to a Schedule C or single-member LLC path.",
        ],
        searchPrompt:
          "Research whether this Schedule C or disregarded single-member LLC business qualifies for the qualified business income deduction, including any SSTB or income-limit issues.",
      })
    );
  }

  if (draft.profile.hasFixedAssets) {
    ideas.push(
      buildLead({
        id: "fixed-assets-review",
        title: "Check big purchases for depreciation options",
        summary:
          "Tina should review equipment and other big purchases for depreciation choices such as expensing vs spreading the cost over time.",
        whyItMatters:
          "This is one of the most common places where a business can legally save money or accidentally report the timing wrong.",
        category: "deduction",
        sourceLabels: ["The organizer says this business has equipment or other big purchases."],
        searchPrompt:
          "Review fixed assets for depreciation treatment, placed-in-service dates, Section 179, bonus depreciation, and any disposal history that affects the current-year return.",
      })
    );
  }

  const inventoryFacts = findFactsByLabel(draft.sourceFacts, "Inventory clue");
  if (draft.profile.hasInventory || inventoryFacts.length > 0) {
    const linkedIds = collectLinkedIds(inventoryFacts);
    ideas.push(
      buildLead({
        id: "inventory-review",
        title: "Check inventory and cost of goods setup",
        summary:
          "Tina should review how inventory is tracked and whether the cost-of-goods setup matches the business facts.",
        whyItMatters:
          "Inventory treatment can change taxable income a lot, and small setup mistakes can flow through the whole return.",
        category: "deduction",
        sourceLabels:
          inventoryFacts.length > 0
            ? ["Tina found an inventory clue in the uploaded papers."]
            : ["The organizer says this business has inventory."],
        factIds: linkedIds.factIds,
        documentIds: linkedIds.documentIds,
        searchPrompt:
          "Research the correct inventory and cost-of-goods treatment for this business, including any small-business simplifications that may apply.",
      })
    );
  }

  const contractorFacts = findFactsByLabel(draft.sourceFacts, "Contractor clue");
  if (draft.profile.paysContractors || contractorFacts.length > 0) {
    const linkedIds = collectLinkedIds(contractorFacts);
    ideas.push(
      buildLead({
        id: "contractor-review",
        title: "Check contractor costs and 1099 support",
        summary:
          "Tina should review contractor payments for deduction support and make sure the filing side stays clean too.",
        whyItMatters:
          "Contractor costs can be deductible, but missing support or compliance gaps can create filing risk.",
        category: "compliance",
        sourceLabels:
          contractorFacts.length > 0
            ? ["Tina found a contractor clue in the uploaded papers."]
            : ["The organizer says this business paid contractors."],
        factIds: linkedIds.factIds,
        documentIds: linkedIds.documentIds,
        searchPrompt:
          "Review contractor expense support, 1099-related compliance questions, and whether any contractor costs need special treatment on the return.",
      })
    );
  }

  const payrollFacts = findFactsByLabel(draft.sourceFacts, "Payroll clue");
  if (draft.profile.hasPayroll || payrollFacts.length > 0) {
    const linkedIds = collectLinkedIds(payrollFacts);
    ideas.push(
      buildLead({
        id: "payroll-review",
        title: "Check payroll costs and payroll records",
        summary:
          "Tina should make sure payroll costs line up with the records and see whether payroll creates any extra tax handling needs.",
        whyItMatters:
          "Payroll often affects both deductions and compliance, so it is worth a deeper review instead of a quick guess.",
        category: "compliance",
        sourceLabels:
          payrollFacts.length > 0
            ? ["Tina found a payroll clue in the uploaded papers."]
            : ["The organizer says this business had payroll."],
        factIds: linkedIds.factIds,
        documentIds: linkedIds.documentIds,
        searchPrompt:
          "Review payroll expense support, payroll record completeness, and any payroll-driven tax handling issues that affect the business return.",
      })
    );
  }

  const salesTaxFacts = findFactsByLabel(draft.sourceFacts, "Sales tax clue");
  if (draft.profile.collectsSalesTax || salesTaxFacts.length > 0 || draft.profile.formationState === "WA") {
    const linkedIds = collectLinkedIds(salesTaxFacts);
    ideas.push(
      buildLead({
        id: "wa-state-review",
        title: "Check Washington business-tax treatment",
        summary:
          "Tina should review Washington business-tax treatment, including B&O classification, sales tax handling, and any deductions or exemptions that fit the facts.",
        whyItMatters:
          "Washington rules are separate from the federal return, and the right classification or deduction can matter a lot.",
        category: "state",
        sourceLabels:
          salesTaxFacts.length > 0
            ? ["Tina found a sales tax clue in the uploaded papers."]
            : ["This business is being prepared in Washington."],
        factIds: linkedIds.factIds,
        documentIds: linkedIds.documentIds,
        searchPrompt:
          "Research Washington business-tax treatment for this business, including B&O classification, sales tax scope, relevant deductions, exemptions, and filing consequences.",
      })
    );
  }

  const stateFacts = findFactsByLabel(draft.sourceFacts, "State clue");
  if (draft.profile.hasIdahoActivity || stateFacts.length > 0) {
    const linkedIds = collectLinkedIds(stateFacts);
    ideas.push(
      buildLead({
        id: "multistate-review",
        title: "Check multistate filing scope",
        summary:
          "Tina should review whether another state may have filing rights here and how that changes the return package.",
        whyItMatters:
          "A multistate clue can change what has to be filed and where, so Tina should not stay Washington-only without checking.",
        category: "state",
        sourceLabels:
          stateFacts.length > 0
            ? ["Tina found a state clue in the uploaded papers."]
            : ["The organizer says this business had Idaho activity."],
        factIds: linkedIds.factIds,
        documentIds: linkedIds.documentIds,
        searchPrompt:
          "Research multistate filing scope for this business, including Idaho or other state nexus clues, and determine whether additional state filings or allocations may be required.",
      })
    );
  }

  const uniqueIdeas = ideas.filter(
    (idea, index) => ideas.findIndex((candidate) => candidate.id === idea.id) === index
  );

  return uniqueIdeas;
}
