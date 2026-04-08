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

function parseYear(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).getUTCFullYear().toString();
}

function isLikelyRealEstateBusiness(draft: TinaWorkspaceDraft): boolean {
  const haystack = `${draft.profile.businessName} ${draft.profile.notes} ${draft.profile.naicsCode}`
    .toLowerCase()
    .trim();

  if (!haystack) return false;

  const naics = draft.profile.naicsCode.trim();
  if (naics.startsWith("531")) return true;

  return /\b(real estate|wholesale|wholesaler|house|homes|property|rental|flip|flipper|investor)\b/.test(
    haystack
  );
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
  const formationYear = parseYear(draft.profile.formationDate);
  const currentTaxYear = draft.profile.taxYear.trim();
  const likelyRealEstateBusiness = isLikelyRealEstateBusiness(draft);

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

  const priorCarryoverFacts = findFactsByLabel(draft.sourceFacts, "Prior-year carryover clue");
  if (priorCarryoverFacts.length > 0) {
    const linkedIds = collectLinkedIds(priorCarryoverFacts);
    ideas.push(
      buildLead({
        id: "prior-year-carryover-proof-review",
        title: "Check carryover proof from prior-year papers",
        summary:
          "Tina found a carryover clue in uploaded papers and should verify whether that continuity item affects the current return.",
        whyItMatters:
          "Carryovers are easy to miss, and when they are real they can materially change current-year taxable income or continuity schedules.",
        category: "continuity",
        sourceLabels: ["A saved paper explicitly hints at a prior-year carryover."],
        ...linkedIds,
        searchPrompt:
          "Review the uploaded prior-year paper for carryovers, continuity items, and how they should flow into the current business return.",
      })
    );
  }

  const electionFacts = findFactsByLabel(draft.sourceFacts, "Tax election clue");
  if (electionFacts.length > 0) {
    const linkedIds = collectLinkedIds(electionFacts);
    ideas.push(
      buildLead({
        id: "tax-election-continuity-review",
        title: "Check tax election continuity",
        summary:
          "Tina found an election clue in uploaded papers and should confirm whether that election still governs the current file.",
        whyItMatters:
          "Tax elections can change how the return should be prepared, and missing continuity here can create both filing and planning errors.",
        category: "continuity",
        sourceLabels: ["A saved paper explicitly hints at a tax election."],
        ...linkedIds,
        searchPrompt:
          "Review the uploaded paper for tax elections, continuity consequences, revocation limits, and how the election affects the current-year business return.",
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
        id: "self-employed-retirement-review",
        title: "Check owner retirement contribution options",
        summary:
          "Tina should test legal retirement contribution paths for the owner, including limits and timing rules tied to net earnings.",
        whyItMatters:
          "For small owner-operated businesses, retirement deductions are one of the most meaningful legal tax levers when the facts support them.",
        category: "deduction",
        sourceLabels: [
          "The filing lane is Schedule C or single-member LLC, so owner-level retirement options may apply.",
        ],
        searchPrompt:
          "Research self-employed retirement contribution options and deduction treatment for this taxpayer profile, including contribution limits, deadlines, and interaction with net self-employment earnings.",
      })
    );

    ideas.push(
      buildLead({
        id: "self-employed-health-insurance-review",
        title: "Check self-employed health insurance deduction",
        summary:
          "Tina should verify whether owner-paid health coverage qualifies for above-the-line deduction treatment.",
        whyItMatters:
          "This deduction is legal and often missed when records are scattered across personal and business accounts.",
        category: "deduction",
        sourceLabels: [
          "The filing lane is Schedule C or single-member LLC, where self-employed health insurance treatment may apply.",
        ],
        searchPrompt:
          "Research self-employed health insurance deduction eligibility and limits for this taxpayer profile, including interaction with other coverage and earned income constraints.",
      })
    );

    if (formationYear && currentTaxYear && formationYear === currentTaxYear) {
      ideas.push(
        buildLead({
          id: "startup-costs-review",
          title: "Check startup and organizational cost treatment",
          summary:
            "Tina should review first-year startup and organizational costs for potential election and amortization treatment.",
          whyItMatters:
            "New-business costs are often misclassified, and correct treatment can materially affect first-year taxable income.",
          category: "deduction",
          sourceLabels: [
            "The organizer suggests this business formed in the current tax year.",
          ],
          searchPrompt:
            "Research startup and organizational cost treatment for a newly formed business in this tax year, including election mechanics, amortization, and immediate-deduction thresholds.",
        })
      );
    }
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

    ideas.push(
      buildLead({
        id: "de-minimis-safe-harbor-review",
        title: "Check de minimis capitalization safe harbor",
        summary:
          "Tina should test whether smaller fixed-asset purchases can be handled under de minimis safe harbor rules instead of capitalization.",
        whyItMatters:
          "This is legal, often overlooked, and can simplify books while improving current-year deduction timing when properly supported.",
        category: "deduction",
        sourceLabels: ["The organizer says this business has equipment or other big purchases."],
        searchPrompt:
          "Research de minimis capitalization safe harbor eligibility and implementation for this business, including documentation requirements and interaction with existing capitalization policy.",
      })
    );

    if (likelyRealEstateBusiness) {
      ideas.push(
        buildLead({
          id: "real-property-repair-vs-improvement-review",
          title: "Check repair vs improvement treatment for real property",
          summary:
            "Tina should test whether real-property costs belong in current deductions or must be capitalized under repair regulations.",
          whyItMatters:
            "This is a high-impact, often misunderstood area in real-estate-heavy businesses and can materially change taxable income timing.",
          category: "deduction",
          sourceLabels: [
            "This business looks real-estate focused and has fixed-asset activity.",
          ],
          searchPrompt:
            "Research repair-regulation treatment for this real-estate business profile, including deductible repairs vs capital improvements, unit-of-property framing, and documentation needed for defensible treatment.",
        })
      );
    }
  }

  const depreciationFacts = findFactsByLabel(draft.sourceFacts, "Depreciation clue");
  if (depreciationFacts.length > 0) {
    const linkedIds = collectLinkedIds(depreciationFacts);
    ideas.push(
      buildLead({
        id: "depreciation-rollforward-review",
        title: "Check depreciation rollforward and continuity",
        summary:
          "Tina found a depreciation clue in the papers and should confirm whether depreciation history or carryforward schedules affect the current return.",
        whyItMatters:
          "Depreciation continuity is a common place where current-year numbers drift away from the underlying asset history.",
        category: "continuity",
        sourceLabels: ["A saved paper explicitly hints at depreciation history."],
        ...linkedIds,
        searchPrompt:
          "Review depreciation history, prior-year carryforwards, placed-in-service continuity, and how those schedules affect the current-year business return.",
      })
    );
  }

  const ownershipFacts = findFactsByLabel(draft.sourceFacts, "Ownership record clue");
  if (ownershipFacts.length > 0) {
    const linkedIds = collectLinkedIds(ownershipFacts);
    ideas.push(
      buildLead({
        id: "ownership-structure-review",
        title: "Check ownership and filing-structure consequences",
        summary:
          "Tina found an ownership-record clue and should confirm whether the legal ownership story changes filing path, authority posture, or continuity assumptions.",
        whyItMatters:
          "Ownership structure can affect filing lane, continuity, and which treatments or disclosures are even available.",
        category: "compliance",
        sourceLabels: ["A saved paper explicitly hints at ownership structure."],
        ...linkedIds,
        searchPrompt:
          "Review ownership records, entity structure, elections, and continuity consequences for the current business return and reviewer packet.",
      })
    );
  }

  const payrollTaxFormFacts = findFactsByLabel(draft.sourceFacts, "Payroll tax form clue");
  if (payrollTaxFormFacts.length > 0) {
    const linkedIds = collectLinkedIds(payrollTaxFormFacts);
    ideas.push(
      buildLead({
        id: "payroll-tax-form-review",
        title: "Check payroll tax form continuity",
        summary:
          "Tina found payroll tax form clues in the papers and should verify whether payroll support is complete enough for deduction and compliance reliance.",
        whyItMatters:
          "Payroll forms can change both deduction confidence and compliance posture, especially when wages are material.",
        category: "compliance",
        sourceLabels: ["A saved paper explicitly hints at payroll tax forms."],
        ...linkedIds,
        searchPrompt:
          "Review payroll tax forms, payroll support completeness, and whether payroll records support the business return deductions and compliance posture.",
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

  const intercompanyFacts = findFactsByLabel(draft.sourceFacts, "Intercompany transfer clue");
  if (intercompanyFacts.length > 0) {
    const linkedIds = collectLinkedIds(intercompanyFacts);
    ideas.push(
      buildLead({
        id: "intercompany-separation-review",
        title: "Check intercompany transfer separation and support",
        summary:
          "Tina should verify that intercompany transfers and due-to/due-from activity are separated cleanly from return-facing P&L totals.",
        whyItMatters:
          "Commingled intercompany flows can distort taxable income if not classified and reconciled correctly before filing.",
        category: "compliance",
        sourceLabels: ["Tina found intercompany transfer clues in uploaded papers."],
        factIds: linkedIds.factIds,
        documentIds: linkedIds.documentIds,
        searchPrompt:
          "Research defensible treatment, documentation, and reconciliation standards for intercompany transfers and due-to/due-from balances in small-business books used for federal business return prep.",
      })
    );
  }

  const relatedPartyFacts = findFactsByLabel(draft.sourceFacts, "Related-party clue");
  if (relatedPartyFacts.length > 0) {
    const linkedIds = collectLinkedIds(relatedPartyFacts);
    ideas.push(
      buildLead({
        id: "related-party-transaction-review",
        title: "Check related-party transaction treatment",
        summary:
          "Tina should evaluate related-party balances and transactions for correct characterization, documentation, and disclosure risk.",
        whyItMatters:
          "Related-party activity can shift tax outcomes materially and often requires stronger support to stay defensible.",
        category: "compliance",
        sourceLabels: ["Tina found related-party clues in uploaded papers."],
        factIds: linkedIds.factIds,
        documentIds: linkedIds.documentIds,
        searchPrompt:
          "Research federal treatment and documentation expectations for related-party transactions in small-business return prep, including characterization, deductibility limits, and disclosure triggers.",
      })
    );
  }

  const ownerFlowFacts = findFactsByLabel(draft.sourceFacts, "Owner draw clue");
  if (ownerFlowFacts.length > 0) {
    const linkedIds = collectLinkedIds(ownerFlowFacts);
    ideas.push(
      buildLead({
        id: "owner-flow-characterization-review",
        title: "Check owner draws vs compensation vs loan treatment",
        summary:
          "Tina should test owner cash flows for proper characterization rather than letting books labels decide tax treatment automatically.",
        whyItMatters:
          "Owner flow misclassification is common and can create material over- or under-reporting if not normalized before return prep.",
        category: "compliance",
        sourceLabels: ["Tina found owner draw or owner distribution clues in uploaded papers."],
        factIds: linkedIds.factIds,
        documentIds: linkedIds.documentIds,
        searchPrompt:
          "Research how to distinguish owner draws, compensation, and shareholder/member loan activity for this entity profile and tax year, including documentation and reclassification considerations.",
      })
    );
  }

  const einFacts = findFactsByLabel(draft.sourceFacts, "EIN clue");
  const uniqueEinSet = new Set(
    einFacts.flatMap((fact) => fact.value.match(/\b\d{2}-\d{7}\b/g) ?? [])
  );
  if (uniqueEinSet.size > 1) {
    const linkedIds = collectLinkedIds(einFacts);
    ideas.push(
      buildLead({
        id: "multi-entity-boundary-review",
        title: "Check multi-entity boundary before return prep",
        summary:
          "Tina should confirm that books and source papers are scoped to the intended filing entity when multiple EINs are present.",
        whyItMatters:
          "Cross-entity commingling can silently contaminate return numbers and create major filing risk if not resolved first.",
        category: "compliance",
        sourceLabels: ["Tina found multiple EIN references across source papers."],
        factIds: linkedIds.factIds,
        documentIds: linkedIds.documentIds,
        searchPrompt:
          "Research practical controls and reconciliation steps for separating mixed-entity books when multiple EINs appear in intake papers for one business return package.",
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

  if (likelyRealEstateBusiness) {
    ideas.push(
      buildLead({
        id: "real-estate-characterization-review",
        title: "Check dealer vs investor characterization",
        summary:
          "Tina should evaluate whether the business facts point to dealer treatment, investor treatment, or mixed characterization risk.",
        whyItMatters:
          "Characterization can drive ordinary income vs capital treatment and affects multiple downstream tax positions.",
        category: "compliance",
        sourceLabels: ["Business profile and naming patterns suggest real-estate activity."],
        searchPrompt:
          "Research dealer-versus-investor characterization factors for this real-estate business profile and tax year, including indicators that increase recharacterization risk and documentation that supports the intended treatment.",
      })
    );

    ideas.push(
      buildLead({
        id: "installment-and-imputed-interest-review",
        title: "Check installment and imputed-interest treatment",
        summary:
          "Tina should test whether any structured seller-finance or delayed-payment arrangements trigger installment-method or imputed-interest rules.",
        whyItMatters:
          "These rules are legal but frequently missed, and they can materially alter timing and character of taxable income.",
        category: "compliance",
        sourceLabels: ["Real-estate transactions often include structured or delayed payment terms."],
        searchPrompt:
          "Research installment-method eligibility and imputed-interest rules for this real-estate profile, including fact patterns that disqualify installment treatment and conditions that require interest recharacterization.",
      })
    );
  }

  ideas.push(
    buildLead({
      id: "fringe-opportunities-scan",
      title: "Run a legal fringe-opportunities scan",
      summary:
        "Tina should run a focused search for lesser-known but legal tax opportunities that fit this business profile and tax year.",
      whyItMatters:
        "High-value tax savings often hide in unusual but legal positions that are missed in standard prep checklists.",
      category: "deduction",
      sourceLabels: ["Tina has enough organizer and paper context to run a tailored opportunity hunt."],
      searchPrompt:
        "Find lesser-known but legal federal and Washington-state business tax opportunities for this taxpayer profile and tax year. Prioritize high-impact, fact-dependent opportunities; exclude abusive shelters; cite primary authority and clearly mark disclosure or risk conditions.",
    })
  );

  const uniqueIdeas = ideas.filter(
    (idea, index) => ideas.findIndex((candidate) => candidate.id === idea.id) === index
  );

  return uniqueIdeas;
}
