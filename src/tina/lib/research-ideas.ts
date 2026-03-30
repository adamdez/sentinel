import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import {
  evaluateTinaTaxIdea,
  type TinaResearchDecisionBucket,
  type TinaResearchSourceClass,
} from "@/tina/lib/research-policy";
import {
  findTinaFixedAssetSourceFacts,
  hasTinaFixedAssetSignal,
} from "@/tina/lib/source-fact-signals";
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

function findFactsByLabels(sourceFacts: TinaSourceFact[], labels: string[]): TinaSourceFact[] {
  const seen = new Set<string>();
  const facts: TinaSourceFact[] = [];

  labels.forEach((label) => {
    findFactsByLabel(sourceFacts, label).forEach((fact) => {
      if (seen.has(fact.id)) return;
      seen.add(fact.id);
      facts.push(fact);
    });
  });

  return facts;
}

function pickIdeaSourceFacts(args: {
  sourceFacts: TinaSourceFact[];
  preferredLabels: string[];
  fallbackLabels?: string[];
}): TinaSourceFact[] {
  const preferredFacts = findFactsByLabels(args.sourceFacts, args.preferredLabels);
  if (preferredFacts.length > 0) return preferredFacts;

  if (args.fallbackLabels && args.fallbackLabels.length > 0) {
    const fallbackFacts = findFactsByLabels(args.sourceFacts, args.fallbackLabels);
    if (fallbackFacts.length > 0) return fallbackFacts;
  }

  return args.sourceFacts;
}

function extractQuotedExamples(value: string): string[] {
  return Array.from(value.matchAll(/"([^"]+)"/g))
    .map((match) => match[1]?.trim() ?? "")
    .filter((example, index, values) => example.length > 0 && values.indexOf(example) === index);
}

function appendFactExamplesToPrompt(prompt: string, sourceFacts: TinaSourceFact[]): string {
  const examples = sourceFacts
    .flatMap((fact) => extractQuotedExamples(fact.value))
    .filter((example, index, values) => values.indexOf(example) === index)
    .slice(0, 2);

  if (examples.length === 0) return prompt;
  if (examples.length === 1) {
    return `${prompt} Focus on the saved-paper example "${examples[0]}".`;
  }

  const [firstExample, secondExample] = examples;
  return `${prompt} Focus on the saved-paper examples "${firstExample}" and "${secondExample}".`;
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
  const recommendation = recommendTinaFilingLane(draft.profile, draft.sourceFacts);
  const ideas: TinaTaxIdeaLead[] = [];
  const formedThisTaxYear =
    draft.profile.formationDate.trim().length > 0 &&
    draft.profile.taxYear.trim().length > 0 &&
    draft.profile.formationDate.startsWith(draft.profile.taxYear);

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

    ideas.push(
      buildLead({
        id: "self-employed-benefits-review",
        title: "Check owner health insurance and retirement options",
        summary:
          "Tina should look for self-employed owner deductions tied to health insurance and retirement savings, then confirm how the business facts affect them.",
        whyItMatters:
          "These can be meaningful legal tax savers that owners often miss because they sit partly outside the basic books.",
        category: "deduction",
        sourceLabels: [
          "The current filing lane points to a Schedule C or single-member LLC path.",
        ],
        searchPrompt:
          "Research self-employed health insurance and retirement-related deduction opportunities for this Schedule C or disregarded single-member LLC taxpayer, including fact limits and coordination issues.",
      })
    );
  }

  if (draft.profile.naicsCode.trim().length > 0) {
    ideas.push(
      buildLead({
        id: "industry-edge-review",
        title: "Check industry-specific tax edges",
        summary:
          "Tina should look for deductions, safe harbors, reporting quirks, and classification edges that are common in this line of business but easy to miss in a generic return review.",
        whyItMatters:
          "Some of the best legal savings ideas are industry-specific, so Tina should not rely only on a general small-business checklist.",
        category: "deduction",
        sourceLabels: [`The organizer includes NAICS code ${draft.profile.naicsCode}.`],
        searchPrompt:
          `Research industry-specific deductions, safe harbors, reporting quirks, and compliance edges for NAICS ${draft.profile.naicsCode}, focusing on legal but commonly missed opportunities and the primary authority needed to support them.`,
      })
    );
  }

  if (!priorReturnSourceLabel && formedThisTaxYear) {
    ideas.push(
      buildLead({
        id: "startup-costs-review",
        title: "Check startup and first-year costs",
        summary:
          "Tina should review early business costs to see whether some belong in startup treatment, organizational treatment, or current deductions.",
        whyItMatters:
          "New-business costs are easy to blur together, and the right treatment can change both savings and timing.",
        category: "continuity",
        sourceLabels: ["The organizer shows this business started during the current tax year."],
        searchPrompt:
          "Research startup-cost, first-year, and organizational-cost treatment for this new business, including what may be deducted now versus spread over time.",
      })
    );
  }

  const fixedAssetFacts = findTinaFixedAssetSourceFacts(draft.sourceFacts);
  if (hasTinaFixedAssetSignal(draft.profile, draft.sourceFacts)) {
    const fixedAssetIdeaFacts = pickIdeaSourceFacts({
      sourceFacts: fixedAssetFacts,
      preferredLabels: ["Fixed asset clue"],
      fallbackLabels: ["Small equipment clue", "Repair clue"],
    });
    const fixedAssetIdeaLinkedIds = collectLinkedIds(fixedAssetIdeaFacts);
    const repairIdeaFacts = pickIdeaSourceFacts({
      sourceFacts: fixedAssetFacts,
      preferredLabels: ["Repair clue"],
      fallbackLabels: ["Fixed asset clue"],
    });
    const repairIdeaLinkedIds = collectLinkedIds(repairIdeaFacts);
    const deMinimisIdeaFacts = pickIdeaSourceFacts({
      sourceFacts: fixedAssetFacts,
      preferredLabels: ["Small equipment clue"],
      fallbackLabels: ["Fixed asset clue"],
    });
    const deMinimisIdeaLinkedIds = collectLinkedIds(deMinimisIdeaFacts);

    ideas.push(
      buildLead({
        id: "fixed-assets-review",
        title: "Check big purchases for depreciation options",
        summary:
          "Tina should review equipment and other big purchases for depreciation choices such as expensing vs spreading the cost over time.",
        whyItMatters:
          "This is one of the most common places where a business can legally save money or accidentally report the timing wrong.",
        category: "deduction",
        sourceLabels:
          fixedAssetFacts.length > 0
            ? ["Tina found equipment, repair, or small-tool clues in the uploaded papers."]
            : ["The organizer says this business has equipment or other big purchases."],
        factIds: fixedAssetIdeaLinkedIds.factIds,
        documentIds: fixedAssetIdeaLinkedIds.documentIds,
        searchPrompt: appendFactExamplesToPrompt(
          "Review fixed assets for depreciation treatment, placed-in-service dates, Section 179, bonus depreciation, and any disposal history that affects the current-year return.",
          findFactsByLabels(fixedAssetIdeaFacts, ["Fixed asset clue"])
        ),
      })
    );

    ideas.push(
      buildLead({
        id: "repair-safe-harbor-review",
        title: "Check repair safe harbors before capitalizing everything",
        summary:
          "Tina should test whether some equipment or property-related spending belongs in repairs, maintenance, or safe-harbor treatment instead of being capitalized by default.",
        whyItMatters:
          "This is a quieter place to save money legally because small businesses often capitalize too much or miss repair-safe-harbor treatment.",
        category: "deduction",
        sourceLabels:
          fixedAssetFacts.length > 0
            ? ["Tina found equipment, repair, or small-tool clues in the uploaded papers."]
            : ["The organizer says this business has equipment or other big purchases."],
        factIds: repairIdeaLinkedIds.factIds,
        documentIds: repairIdeaLinkedIds.documentIds,
        searchPrompt: appendFactExamplesToPrompt(
          "Research repair vs capitalization treatment, de minimis safe harbor, routine maintenance safe harbor, and related small-business write-off options for this business's property and equipment spending.",
          findFactsByLabels(repairIdeaFacts, ["Repair clue"])
        ),
      })
    );

    ideas.push(
      buildLead({
        id: "de-minimis-writeoff-review",
        title: "Check small-equipment write-offs and safe harbors",
        summary:
          "Tina should look for lower-dollar equipment, tools, and similar purchases that may qualify for simpler write-off treatment instead of slower capitalization.",
        whyItMatters:
          "Some of the best legal savings come from correctly spotting what can be written off now without forcing it through a heavier asset schedule.",
        category: "deduction",
        sourceLabels:
          fixedAssetFacts.length > 0
            ? ["Tina found equipment, repair, or small-tool clues in the uploaded papers."]
            : ["The organizer says this business has equipment or other big purchases."],
        factIds: deMinimisIdeaLinkedIds.factIds,
        documentIds: deMinimisIdeaLinkedIds.documentIds,
        searchPrompt: appendFactExamplesToPrompt(
          "Research de minimis safe harbor, materials-and-supplies treatment, and other current-year write-off options for smaller business equipment and tool purchases in this fact pattern.",
          findFactsByLabels(deMinimisIdeaFacts, ["Small equipment clue"])
        ),
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
          "Tina should review Washington business-tax treatment only to see whether it changes the federal filing package, makes a current fact unsafe, or needs a separate reviewer note.",
        whyItMatters:
          "The federal return stays first, but Washington classification, state-tax handling, and separate filing obligations can still change what belongs in the package or what Tina must flag for review.",
        category: "state",
        sourceLabels:
          salesTaxFacts.length > 0
            ? ["Tina found a sales tax clue in the uploaded papers."]
            : ["This business is being prepared in Washington."],
        factIds: linkedIds.factIds,
        documentIds: linkedIds.documentIds,
        searchPrompt:
          "Research Washington business-tax treatment for this business only to the extent it changes the federal filing package, makes a federal-package fact unsafe, creates deductible state-tax consequences, or requires a separate Washington reviewer note. Keep the main focus on the federal business return package rather than building a standalone Washington return.",
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
          "Tina should review whether another state may have filing rights here and whether that changes the federal filing package or needs a separate state note for the reviewer.",
        whyItMatters:
          "State nexus can change apportionment, deductions, and reviewer notes, but Tina should only let it affect the federal package when the facts and primary authority really support that move.",
        category: "state",
        sourceLabels:
          stateFacts.length > 0
            ? ["Tina found a state clue in the uploaded papers."]
            : ["The organizer says this business had Idaho activity."],
        factIds: linkedIds.factIds,
        documentIds: linkedIds.documentIds,
        searchPrompt:
          "Research multistate filing scope for this business, including Idaho or other state nexus clues, and determine whether another state's rules change the federal filing package, create deductible state-tax consequences, or require a separate state reviewer note. Keep the main focus on what belongs in the federal package.",
      })
    );
  }

  const uniqueIdeas = ideas.filter(
    (idea, index) => ideas.findIndex((candidate) => candidate.id === idea.id) === index
  );

  return uniqueIdeas;
}
