import type {
  TinaEntityType,
  TinaTaxElection,
  TinaTaxPositionBucket,
  TinaTreatmentCleanupDependency,
  TinaTreatmentCommercialPriority,
  TinaTreatmentFederalStateSensitivity,
  TinaWorkspaceDraft,
} from "@/tina/types";

type TinaPattern = string | RegExp;

export interface TinaTreatmentAnalogicalProfile {
  text: string;
  signalIds: string[];
  hasFixedAssets: boolean;
  hasInventory: boolean;
  hasPayroll: boolean;
  paysContractors: boolean;
  collectsSalesTax: boolean;
  hasIdahoActivity: boolean;
  ownerCount: number | null;
  taxElection: TinaTaxElection;
  entityType: TinaEntityType;
  hasAuthoritySalesTaxSupport: boolean;
}

export interface TinaTreatmentAnalogicalResolution {
  id: string;
  title: string;
  policyArea: string;
  summary: string;
  taxPositionBucket: TinaTaxPositionBucket;
  confidence: "high" | "medium" | "low";
  suggestedTreatment: string;
  nextStep: string;
  requiredProof: string[];
  alternativeTreatments: string[];
  cleanupDependency: TinaTreatmentCleanupDependency;
  federalStateSensitivity: TinaTreatmentFederalStateSensitivity;
  commercialPriority: TinaTreatmentCommercialPriority;
  authorityWorkIdeaIds: string[];
  likelyForms: string[];
}

export const TINA_TREATMENT_PATTERN_LIBRARY = {
  mixed_use: [
    "mixed personal/business",
    "mixed personal business",
    "personal and business spending",
    "partially personal and partially business",
    "personal helpers through the business",
    "owner used the business card",
  ],
  vehicle_use: ["vehicle", "mileage", "auto", "truck", "car"],
  home_office: ["home office", "square footage", "exclusive use", "utility allocation"],
  fixed_assets: [
    "depreciation",
    "section 179",
    "bonus depreciation",
    "placed in service",
    "asset schedule",
    "equipment",
    "hvac",
    "build out",
    "build-out",
    "capitalized",
    "repairs versus",
    "fixed asset",
    "disposed asset",
    "abandoned",
    "repo",
    "recapture",
  ],
  inventory: [
    "inventory",
    "cogs",
    "cost of goods sold",
    "ending inventory",
    "inventory count",
    "inventory rollforward",
    "sku",
    "shrinkage",
    "retailer",
    "product business",
  ],
  worker_classification: [
    "contractor versus employee",
    "workers paid as contractors",
    "employee",
    "contractor",
    "behavioral control",
    "financial control",
    "household helper",
    "personal helper",
    "household employment",
  ],
  payroll: ["payroll", "941", "w-2", "w-3", "unemployment", "payroll deposit"],
  info_returns: ["1099", "w-9", "1099-nec", "backup withholding"],
  reasonable_comp: [
    "reasonable compensation",
    "no payroll",
    "owner took distributions but no payroll",
    "owner distributions but no payroll",
  ],
  owner_flow: [
    "owner draw",
    "owner draws",
    "distribution",
    "draw",
    "owner compensation",
    "shareholder loan",
    "partner loan",
    "owner loan",
    "loan from owner",
    "loan to owner",
  ],
  basis_capital: [
    "basis",
    "capital account",
    "contributed",
    "capital contribution",
    "loan",
    "distribution",
    "draw",
    "equity",
    "redemption",
    "buyout",
  ],
  entity_boundary: [
    "related party",
    "related-party",
    "intercompany",
    "due to",
    "due from",
    "owner helper through the business",
    "management fee to owner",
  ],
  sales_tax: [
    "sales tax",
    "sales-tax",
    "reseller permit",
    "marketplace facilitator",
    "collected sales tax",
    "nexus",
  ],
  debt_forgiveness: [
    "debt forgiven",
    "forgiven debt",
    "cancellation of debt",
    "cod income",
    "1099-c",
    "settled with lender",
    "written off by a lender",
  ],
  filing_continuity: [
    "prior return",
    "prior-year return",
    "missed filings",
    "late election",
    "missing election",
    "form 2553",
    "form 8832",
    "changed structure",
    "changed entity",
    "never started correctly",
  ],
} satisfies Record<string, TinaPattern[]>;

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function hasPattern(text: string, patterns: TinaPattern[]): boolean {
  return patterns.some((pattern) => {
    if (typeof pattern !== "string") {
      return pattern.test(text);
    }

    const normalizedPattern = normalizeText(pattern);
    return (
      text === normalizedPattern ||
      text.startsWith(`${normalizedPattern} `) ||
      text.endsWith(` ${normalizedPattern}`) ||
      text.includes(` ${normalizedPattern} `)
    );
  });
}

function hasSignal(profile: TinaTreatmentAnalogicalProfile, signalId: string): boolean {
  return profile.signalIds.includes(signalId);
}

function buildResolution(
  args: TinaTreatmentAnalogicalResolution
): TinaTreatmentAnalogicalResolution {
  return {
    ...args,
    requiredProof: unique(args.requiredProof),
    alternativeTreatments: unique(args.alternativeTreatments),
    authorityWorkIdeaIds: unique(args.authorityWorkIdeaIds),
    likelyForms: unique(args.likelyForms),
  };
}

export function buildTinaTreatmentAnalogicalProfileFromDraft(
  draft: TinaWorkspaceDraft
): TinaTreatmentAnalogicalProfile {
  const text = normalizeText(
    [
      draft.profile.notes,
      draft.profile.principalBusinessActivity,
      draft.profile.businessName,
      ...draft.documents.map((document) => `${document.name} ${document.requestLabel ?? ""}`),
      ...draft.documentReadings.flatMap((reading) => [
        reading.summary,
        reading.nextStep,
        ...reading.detailLines,
        ...reading.facts.map((fact) => `${fact.label} ${fact.value}`),
      ]),
      ...draft.sourceFacts.map((fact) => `${fact.label} ${fact.value}`),
    ].join(" ")
  );

  return {
    text,
    signalIds: unique(
      [
        draft.profile.hasFixedAssets ? "fixed_assets" : "",
        draft.profile.hasInventory ? "inventory" : "",
        draft.profile.hasPayroll ? "payroll" : "",
        draft.profile.paysContractors ? "contractor" : "",
        draft.profile.collectsSalesTax ? "sales_tax" : "",
        draft.profile.hasOwnerBuyoutOrRedemption || draft.profile.hasFormerOwnerPayments
          ? "ownership_change"
          : "",
        draft.profile.ownerCount !== null && draft.profile.ownerCount > 1 ? "multi_owner" : "",
        draft.profile.hasIdahoActivity ? "multi_state" : "",
      ].concat(
        draft.sourceFacts.flatMap((fact) => {
          const haystack = normalizeText(`${fact.label} ${fact.value}`);
          return [
            hasPattern(haystack, TINA_TREATMENT_PATTERN_LIBRARY.mixed_use) ? "mixed_spend" : "",
            hasPattern(haystack, TINA_TREATMENT_PATTERN_LIBRARY.vehicle_use)
              ? "mixed_use_vehicle"
              : "",
            hasPattern(haystack, TINA_TREATMENT_PATTERN_LIBRARY.home_office)
              ? "home_office"
              : "",
            hasPattern(haystack, TINA_TREATMENT_PATTERN_LIBRARY.worker_classification)
              ? "worker_classification"
              : "",
            hasPattern(haystack, TINA_TREATMENT_PATTERN_LIBRARY.info_returns)
              ? "info_returns"
              : "",
            hasPattern(haystack, TINA_TREATMENT_PATTERN_LIBRARY.basis_capital)
              ? "basis_or_capital"
              : "",
            hasPattern(haystack, TINA_TREATMENT_PATTERN_LIBRARY.entity_boundary)
              ? "related_party"
              : "",
            hasPattern(haystack, TINA_TREATMENT_PATTERN_LIBRARY.debt_forgiveness)
              ? "debt_forgiveness"
              : "",
            hasPattern(haystack, TINA_TREATMENT_PATTERN_LIBRARY.filing_continuity)
              ? "prior_return_drift"
              : "",
          ];
        })
      )
    ),
    hasFixedAssets: draft.profile.hasFixedAssets,
    hasInventory: draft.profile.hasInventory,
    hasPayroll: draft.profile.hasPayroll,
    paysContractors: draft.profile.paysContractors,
    collectsSalesTax: draft.profile.collectsSalesTax,
    hasIdahoActivity: draft.profile.hasIdahoActivity,
    ownerCount: draft.profile.ownerCount,
    taxElection: draft.profile.taxElection,
    entityType: draft.profile.entityType,
    hasAuthoritySalesTaxSupport: draft.authorityWork.some(
      (item) =>
        item.ideaId === "wa-state-review" &&
        item.reviewerDecision === "use_it" &&
        item.status !== "rejected"
    ),
  };
}

export function buildTinaTreatmentAnalogicalProfileFromText(args: {
  text: string;
  signalIds?: string[];
  hasFixedAssets?: boolean;
  hasInventory?: boolean;
  hasPayroll?: boolean;
  paysContractors?: boolean;
  collectsSalesTax?: boolean;
  hasIdahoActivity?: boolean;
  ownerCount?: number | null;
  taxElection?: TinaTaxElection;
  entityType?: TinaEntityType;
}): TinaTreatmentAnalogicalProfile {
  return {
    text: normalizeText(args.text),
    signalIds: unique(args.signalIds ?? []),
    hasFixedAssets: Boolean(args.hasFixedAssets),
    hasInventory: Boolean(args.hasInventory),
    hasPayroll: Boolean(args.hasPayroll),
    paysContractors: Boolean(args.paysContractors),
    collectsSalesTax: Boolean(args.collectsSalesTax),
    hasIdahoActivity: Boolean(args.hasIdahoActivity),
    ownerCount: args.ownerCount ?? null,
    taxElection: args.taxElection ?? "unsure",
    entityType: args.entityType ?? "unsure",
    hasAuthoritySalesTaxSupport: false,
  };
}

export function buildTinaTreatmentAnalogicalResolutions(
  profile: TinaTreatmentAnalogicalProfile
): TinaTreatmentAnalogicalResolution[] {
  const resolutions: TinaTreatmentAnalogicalResolution[] = [];
  const text = profile.text;
  const hasMixedUse =
    hasSignal(profile, "mixed_spend") || hasPattern(text, TINA_TREATMENT_PATTERN_LIBRARY.mixed_use);
  const hasVehicleUse =
    hasSignal(profile, "mixed_use_vehicle") ||
    hasPattern(text, TINA_TREATMENT_PATTERN_LIBRARY.vehicle_use);
  const hasHomeOffice =
    hasSignal(profile, "home_office") || hasPattern(text, TINA_TREATMENT_PATTERN_LIBRARY.home_office);
  const hasFixedAssets =
    profile.hasFixedAssets || hasPattern(text, TINA_TREATMENT_PATTERN_LIBRARY.fixed_assets);
  const hasInventory =
    profile.hasInventory ||
    hasSignal(profile, "inventory") ||
    hasPattern(text, TINA_TREATMENT_PATTERN_LIBRARY.inventory);
  const hasWorkerClassification =
    hasSignal(profile, "worker_classification") ||
    hasPattern(text, TINA_TREATMENT_PATTERN_LIBRARY.worker_classification);
  const hasPayroll =
    profile.hasPayroll ||
    hasSignal(profile, "payroll") ||
    hasPattern(text, TINA_TREATMENT_PATTERN_LIBRARY.payroll);
  const hasContractors =
    profile.paysContractors ||
    hasPattern(text, ["contractor", "1099", "vendor"]) ||
    hasSignal(profile, "contractor");
  const hasInfoReturns =
    hasSignal(profile, "info_returns") || hasPattern(text, TINA_TREATMENT_PATTERN_LIBRARY.info_returns);
  const hasReasonableComp =
    (profile.taxElection === "s_corp" ||
      profile.entityType === "s_corp" ||
      hasSignal(profile, "s_election")) &&
    (!profile.hasPayroll || hasPattern(text, TINA_TREATMENT_PATTERN_LIBRARY.reasonable_comp));
  const hasOwnerFlows =
    hasPattern(text, TINA_TREATMENT_PATTERN_LIBRARY.owner_flow) ||
    hasSignal(profile, "basis_or_capital") ||
    (profile.ownerCount !== null && profile.ownerCount > 0 && hasMixedUse);
  const hasBasisCapital =
    hasSignal(profile, "basis_or_capital") ||
    hasPattern(text, TINA_TREATMENT_PATTERN_LIBRARY.basis_capital);
  const hasEntityBoundary =
    hasSignal(profile, "related_party") || hasPattern(text, TINA_TREATMENT_PATTERN_LIBRARY.entity_boundary);
  const hasSalesTax =
    profile.collectsSalesTax ||
    hasSignal(profile, "multi_state") ||
    hasPattern(text, TINA_TREATMENT_PATTERN_LIBRARY.sales_tax);
  const hasDebtForgiveness =
    hasSignal(profile, "debt_forgiveness") ||
    hasPattern(text, TINA_TREATMENT_PATTERN_LIBRARY.debt_forgiveness);
  const hasFilingContinuity =
    hasSignal(profile, "prior_return_drift") ||
    hasSignal(profile, "missed_filings") ||
    hasSignal(profile, "s_election") ||
    hasPattern(text, TINA_TREATMENT_PATTERN_LIBRARY.filing_continuity);

  if (hasMixedUse) {
    resolutions.push(
      buildResolution({
        id: "mixed-use-treatment",
        title: "Reject unallocated mixed personal/business deductions",
        policyArea: "mixed_use",
        summary:
          "Tina should reject ordinary deduction treatment for mixed-use charges until the personal, owner, and business portions are separated with support.",
        taxPositionBucket: "reject",
        confidence: "high",
        suggestedTreatment:
          "Hold mixed-use amounts out of final deductions and route them through owner-flow or reimbursement cleanup first.",
        nextStep: "Separate personal, owner, and business charges before those amounts affect the return.",
        requiredProof: [
          "Source statements showing which mixed charges were personal, owner, or business",
          "Reimbursement support or accountable-plan treatment if the business paid personal costs",
        ],
        alternativeTreatments: [
          "Business deduction after support",
          "Owner draw or distribution",
          "Personal nondeductible expense",
        ],
        cleanupDependency: "cleanup_first",
        federalStateSensitivity: "federal_only",
        commercialPriority: "immediate",
        authorityWorkIdeaIds: [],
        likelyForms: [],
      })
    );
  }

  if (hasVehicleUse) {
    resolutions.push(
      buildResolution({
        id: "vehicle-use-treatment",
        title: "Review vehicle mixed-use treatment",
        policyArea: "vehicle_use",
        summary:
          "Vehicle deductions remain review-sensitive until Tina can prove business-use percentage and prior-method consistency.",
        taxPositionBucket: "review",
        confidence: hasMixedUse ? "high" : "medium",
        suggestedTreatment:
          "Keep vehicle deductions provisional until business-use support and prior method history are coherent.",
        nextStep: "Confirm mileage support, placed-in-service date, and prior-year method before final vehicle treatment.",
        requiredProof: [
          "Mileage logs or substitute business-use records",
          "Purchase and placed-in-service date",
          "Prior-year depreciation or mileage-method history",
        ],
        alternativeTreatments: [
          "Standard mileage method",
          "Actual-expense method with business-use allocation",
          "Partial or no current-year deduction if support fails",
        ],
        cleanupDependency: "proof_first",
        federalStateSensitivity: "federal_only",
        commercialPriority: "next",
        authorityWorkIdeaIds: ["fixed-assets-review"],
        likelyForms: ["Form 4562"],
      })
    );
  }

  if (hasHomeOffice) {
    resolutions.push(
      buildResolution({
        id: "home-office-treatment",
        title: "Review home-office treatment",
        policyArea: "home_office",
        summary:
          "Home-office deductions stay in review until exclusive use, square footage, and allocation support are defensible.",
        taxPositionBucket: "review",
        confidence: "medium",
        suggestedTreatment:
          "Keep home-office deductions provisional until eligibility and allocation support are complete.",
        nextStep: "Confirm exclusive use, square footage, and allocable rent or utility support.",
        requiredProof: [
          "Exclusive-use facts for the claimed space",
          "Home and office square-footage support",
          "Rent, mortgage interest, taxes, insurance, or utility support used in the allocation",
        ],
        alternativeTreatments: [
          "Regular method with full allocation support",
          "Simplified home-office method if facts support it",
          "No home-office deduction if exclusive-use support fails",
        ],
        cleanupDependency: "proof_first",
        federalStateSensitivity: "federal_only",
        commercialPriority: "next",
        authorityWorkIdeaIds: [],
        likelyForms: ["Form 8829"],
      })
    );
  }

  if (hasFixedAssets) {
    resolutions.push(
      buildResolution({
        id: "depreciation-treatment",
        title: "Review depreciation, capitalization, and disposition treatment",
        policyArea: "fixed_assets",
        summary:
          "Tina sees asset pressure that could belong in repairs, capitalization, depreciation, or disposition treatment, so she should not trust one answer too early.",
        taxPositionBucket: "review",
        confidence: "high",
        suggestedTreatment:
          "Keep asset-sensitive amounts under reviewer control until asset history, placed-in-service dates, and disposition facts are coherent.",
        nextStep: "Build or confirm the asset ledger and separate repairs, new assets, and disposals before final treatment.",
        requiredProof: [
          "Asset schedule with placed-in-service dates and cost basis",
          "Prior-year depreciation history",
          "Invoices or disposition records for major equipment, build-outs, or vehicle changes",
        ],
        alternativeTreatments: [
          "Current repair expense",
          "Capitalization with MACRS depreciation",
          "Section 179 or bonus depreciation where support exists",
          "Disposition, abandonment, or recapture treatment for assets that left service",
        ],
        cleanupDependency: "cleanup_first",
        federalStateSensitivity: "federal_with_state_follow_through",
        commercialPriority: "immediate",
        authorityWorkIdeaIds: ["fixed-assets-review"],
        likelyForms: ["Form 4562"],
      })
    );
  }

  if (hasInventory) {
    resolutions.push(
      buildResolution({
        id: "inventory-treatment",
        title: "Review inventory and COGS treatment",
        policyArea: "inventory_cogs",
        summary:
          "Inventory-like costs should stay under explicit review until Tina knows whether they belong in inventory, cost of goods sold, or current deductions.",
        taxPositionBucket: "review",
        confidence: "high",
        suggestedTreatment:
          "Keep inventory-sensitive costs out of ordinary expense treatment until method and count support are rebuilt.",
        nextStep: "Confirm inventory method, beginning and ending counts, and the COGS rollforward before final treatment.",
        requiredProof: [
          "Beginning and ending inventory counts",
          "Inventory method and year-end rollforward",
          "Purchase records tied to product or materials movement",
        ],
        alternativeTreatments: [
          "Inventory and COGS treatment",
          "Non-incidental materials and supplies treatment if facts support simplification",
          "Current deduction only for truly non-inventory spend",
        ],
        cleanupDependency: "cleanup_first",
        federalStateSensitivity: "federal_with_state_follow_through",
        commercialPriority: "immediate",
        authorityWorkIdeaIds: ["inventory-review"],
        likelyForms: [],
      })
    );
  }

  if (hasWorkerClassification) {
    resolutions.push(
      buildResolution({
        id: "worker-classification-treatment",
        title: "Review worker-classification treatment",
        policyArea: "worker_payments",
        summary:
          "Worker payment treatment is unstable enough that Tina should keep employee-versus-contractor decisions under reviewer control before final use.",
        taxPositionBucket: "review",
        confidence: "high",
        suggestedTreatment:
          "Keep worker-sensitive payments separate until control facts, payroll posture, and contractor support are coherent.",
        nextStep: "Confirm the same worker was not pushed through both payroll and contractor lanes and document the control facts first.",
        requiredProof: [
          "Behavioral, financial, and relationship facts for the workers",
          "Who was paid through payroll versus contractor channels and why",
          "Payroll reports or contractor registers tied to the same labor streams",
        ],
        alternativeTreatments: [
          "Employee payroll treatment",
          "Independent-contractor treatment with information-return compliance",
          "Personal or household labor outside deductible business labor",
        ],
        cleanupDependency: "cleanup_first",
        federalStateSensitivity: "state_can_change_answer",
        commercialPriority: "immediate",
        authorityWorkIdeaIds: [
          "worker-classification-review",
          "payroll-review",
          "contractor-review",
        ],
        likelyForms: ["Form 941", "Form W-2", "Form 1099-NEC"],
      })
    );
  } else if (hasPayroll || hasContractors) {
    resolutions.push(
      buildResolution({
        id: hasPayroll ? "payroll-treatment" : "contractor-treatment",
        title: hasPayroll ? "Review payroll treatment" : "Review contractor treatment",
        policyArea: "worker_payments",
        summary:
          "Labor-cost treatment needs separate review so Tina does not flatten payroll, contractor, and owner compensation issues together.",
        taxPositionBucket: "review",
        confidence: "medium",
        suggestedTreatment:
          "Keep labor-sensitive costs in their own treatment lane until supporting records and classifications are coherent.",
        nextStep: "Confirm payment support and consistency before finalizing labor-cost treatment.",
        requiredProof: hasPayroll
          ? [
              "Payroll registers, deposits, and quarterly filing support",
              "Owner wage treatment if an S-corporation posture is in play",
            ]
          : ["Contractor payment register", "Collected W-9s and filing-threshold support"],
        alternativeTreatments: hasPayroll
          ? [
              "Deductible wage expense",
              "Owner compensation reclassification",
              "Payroll cleanup before deduction use",
            ]
          : [
              "Contractor expense with 1099 compliance",
              "Employee payroll treatment if worker facts fail contractor status",
            ],
        cleanupDependency: "proof_first",
        federalStateSensitivity: hasPayroll
          ? "state_can_change_answer"
          : "federal_with_state_follow_through",
        commercialPriority: "next",
        authorityWorkIdeaIds: hasPayroll ? ["payroll-review"] : ["contractor-review"],
        likelyForms: hasPayroll ? ["Form 941", "Form W-2"] : ["Form 1099-NEC"],
      })
    );
  }

  if (hasInfoReturns) {
    resolutions.push(
      buildResolution({
        id: "information-return-treatment",
        title: "Review contractor information-return support",
        policyArea: "info_returns",
        summary:
          "Contractor deductions may be real, but Tina should still treat missing W-9 and 1099 support as a real review burden before signoff.",
        taxPositionBucket: "review",
        confidence: "medium",
        suggestedTreatment:
          "Keep contractor-payment reporting under review instead of assuming the deduction lane is finished just because the spend is real.",
        nextStep: "Build the payee register, collect W-9 support, and identify filing-threshold vendors before final reviewer packaging.",
        requiredProof: [
          "Vendor payment register with threshold analysis",
          "Existing W-9s or payee tax IDs",
          "Card-versus-direct payment split for 1099 scope",
        ],
        alternativeTreatments: [
          "Contractor expense with 1099 compliance complete",
          "Contractor expense with reviewer signoff on unresolved information-return gaps",
        ],
        cleanupDependency: "proof_first",
        federalStateSensitivity: "federal_with_state_follow_through",
        commercialPriority: "next",
        authorityWorkIdeaIds: ["contractor-review"],
        likelyForms: ["Form 1099-NEC", "Form W-9 collection"],
      })
    );
  }

  if (hasReasonableComp) {
    resolutions.push(
      buildResolution({
        id: "reasonable-comp-treatment",
        title: "Review reasonable-compensation treatment",
        policyArea: "reasonable_compensation",
        summary:
          "A corporate-election posture with owner distributions and weak payroll support still needs reasonable-compensation review before Tina trusts the return.",
        taxPositionBucket: "review",
        confidence: "high",
        suggestedTreatment:
          "Keep owner-pay treatment under reviewer control until payroll, distributions, and the election trail are coherent together.",
        nextStep: "Confirm the election trail and reconcile owner payroll versus distributions before finalizing the corporate return posture.",
        requiredProof: [
          "Election acceptance or relief support",
          "Owner payroll history and payroll tax filings",
          "Distribution and draw history for the same period",
        ],
        alternativeTreatments: [
          "S-corporation treatment with reasonable compensation",
          "Default entity treatment if the election trail fails",
          "Owner draws or distributions without wage treatment only if the corporate posture is not valid",
        ],
        cleanupDependency: "cleanup_first",
        federalStateSensitivity: "state_can_change_answer",
        commercialPriority: "immediate",
        authorityWorkIdeaIds: ["reasonable-comp-review", "payroll-review"],
        likelyForms: ["Form 1120-S", "Form 941", "Form W-2"],
      })
    );
  }

  if (hasOwnerFlows) {
    resolutions.push(
      buildResolution({
        id: "owner-flow-treatment",
        title: "Review owner-flow characterization",
        policyArea: "owner_flows",
        summary:
          "Owner cash movement should stay reviewable until Tina knows whether each flow is a draw, distribution, loan, contribution, wage, or reimbursement.",
        taxPositionBucket: "review",
        confidence: "high",
        suggestedTreatment:
          "Do not let owner-flow activity silently become deductible business expense treatment.",
        nextStep: "Characterize each material owner-flow item before it affects deductions or basis-sensitive results.",
        requiredProof: [
          "Owner-flow ledger or draw schedule",
          "Support for whether the business or owner ultimately bore each cost",
        ],
        alternativeTreatments: [
          "Owner draw or distribution",
          "Loan to or from owner",
          "Compensation or reimbursement",
          "Capital contribution",
        ],
        cleanupDependency: "cleanup_first",
        federalStateSensitivity: "federal_only",
        commercialPriority: "immediate",
        authorityWorkIdeaIds: ["owner-flow-characterization-review"],
        likelyForms: [],
      })
    );
  }

  if (hasBasisCapital && (profile.ownerCount === null || profile.ownerCount > 1 || hasOwnerFlows)) {
    resolutions.push(
      buildResolution({
        id: "basis-capital-treatment",
        title: "Review basis and capital treatment",
        policyArea: "basis_capital",
        summary:
          "Basis, capital-account, and debt-versus-equity treatment still need proof before Tina can trust owner-level taxability or loss use.",
        taxPositionBucket: "review",
        confidence: "high",
        suggestedTreatment:
          "Keep basis-sensitive items under reviewer control until opening basis, capital changes, and debt posture are coherent.",
        nextStep: "Reconstruct opening basis or capital and tie current-year owner flows into that schedule before final treatment.",
        requiredProof: [
          "Opening basis or capital balances",
          "Contribution, loan, draw, and distribution history",
          "Debt documents or repayment evidence if loans are claimed",
        ],
        alternativeTreatments: [
          "Debt treatment with basis effects",
          "Equity or capital treatment",
          "Taxable distribution treatment if basis support fails",
        ],
        cleanupDependency: "cleanup_first",
        federalStateSensitivity: "federal_only",
        commercialPriority: "immediate",
        authorityWorkIdeaIds: ["basis-capital-review"],
        likelyForms: ["Schedule K-1 support workpapers"],
      })
    );
  }

  if (hasEntityBoundary) {
    resolutions.push(
      buildResolution({
        id: "entity-boundary-treatment",
        title: "Review intercompany and related-party treatment",
        policyArea: "entity_boundary",
        summary:
          "Related-party and intercompany flows should stay out of ordinary deductions and income until Tina proves what they really are.",
        taxPositionBucket: "review",
        confidence: "high",
        suggestedTreatment:
          "Keep related-party and intercompany balances separate from ordinary return-facing totals until they are characterized cleanly.",
        nextStep: "Confirm whether the amounts are loans, due-to or due-from balances, compensation, rent, or unrelated business activity.",
        requiredProof: [
          "Related-party agreements or notes",
          "Business purpose and settlement terms for the flows",
          "Which entity or owner actually bore the economics",
        ],
        alternativeTreatments: [
          "Loan or due-to/due-from balance",
          "Compensation or rent",
          "Capital flow",
          "Arm's-length business expense or income",
        ],
        cleanupDependency: "cleanup_first",
        federalStateSensitivity: "federal_only",
        commercialPriority: "immediate",
        authorityWorkIdeaIds: [
          "intercompany-separation-review",
          "related-party-transaction-review",
        ],
        likelyForms: [],
      })
    );
  }

  if (hasSalesTax) {
    resolutions.push(
      buildResolution({
        id: "sales-tax-treatment",
        title: profile.hasAuthoritySalesTaxSupport
          ? "Use supported sales-tax exclusion treatment"
          : "Review sales-tax exclusion treatment",
        policyArea: "sales_tax",
        summary: profile.hasAuthoritySalesTaxSupport
          ? "Tina has reviewer-backed support to keep collected sales tax out of taxable income where the records show pass-through collection."
          : "Sales-tax-sensitive amounts should stay in review until Tina proves collection, remittance, and the state-law posture cleanly.",
        taxPositionBucket: profile.hasAuthoritySalesTaxSupport ? "use" : "review",
        confidence: profile.hasAuthoritySalesTaxSupport ? "high" : "medium",
        suggestedTreatment: profile.hasAuthoritySalesTaxSupport
          ? "Keep collected sales tax out of taxable income where the records support pass-through collection."
          : "Keep collected sales-tax amounts out of ordinary income only after the state collection and remittance facts are locked.",
        nextStep: profile.hasAuthoritySalesTaxSupport
          ? "Carry the supported exclusion through reviewer-final numbers with traceability."
          : "Confirm state collection, remittance, and marketplace-facilitator facts before final exclusion treatment.",
        requiredProof: [
          "Sales-tax collection and remittance support",
          "Marketplace-facilitator or reseller support where relevant",
          "State-law posture for the jurisdictions involved",
        ],
        alternativeTreatments: [
          "Pass-through tax collected for the state and excluded from income",
          "Gross receipts with offsetting remittance only if the facts really require it",
        ],
        cleanupDependency: "proof_first",
        federalStateSensitivity: "state_can_change_answer",
        commercialPriority: "next",
        authorityWorkIdeaIds: ["wa-state-review"],
        likelyForms: [],
      })
    );
  }

  if (hasDebtForgiveness) {
    resolutions.push(
      buildResolution({
        id: "debt-forgiveness-treatment",
        title: "Review cancellation-of-debt treatment",
        policyArea: "debt_forgiveness",
        summary:
          "Debt settlement or forgiveness can create COD income, exclusions, and disposition consequences that Tina should not collapse into a simple payoff answer.",
        taxPositionBucket: "review",
        confidence: "high",
        suggestedTreatment:
          "Keep debt-event treatment under reviewer control until Tina knows whether the event created COD income, a disposition, or a supportable exclusion path.",
        nextStep: "Characterize the debt event and confirm whether collateral, solvency, or bankruptcy facts change the tax result.",
        requiredProof: [
          "Lender settlement or forgiveness documents",
          "Whether collateral was surrendered or disposed",
          "Financial-condition facts relevant to insolvency or bankruptcy exceptions",
        ],
        alternativeTreatments: [
          "Taxable cancellation-of-debt income",
          "Form 982 exclusion path if facts support it",
          "Asset disposition or recapture treatment tied to the same event",
        ],
        cleanupDependency: "cleanup_first",
        federalStateSensitivity: "federal_with_state_follow_through",
        commercialPriority: "immediate",
        authorityWorkIdeaIds: ["cod-income-review", "fixed-assets-review"],
        likelyForms: ["Form 982"],
      })
    );
  }

  if (hasFilingContinuity) {
    resolutions.push(
      buildResolution({
        id: "filing-continuity-treatment",
        title: "Review filing continuity and election treatment",
        policyArea: "filing_continuity",
        summary:
          "Tina should keep classification-sensitive treatment in review when prior returns, elections, or missed filings point in different directions.",
        taxPositionBucket: "review",
        confidence: "high",
        suggestedTreatment:
          "Do not let current-year treatment assume the filing family is settled until elections, prior returns, and missing years line up.",
        nextStep: "Map the filing-family timeline and confirm which years, elections, and return families are actually real before final prep.",
        requiredProof: [
          "Prior-year filed return family",
          "Election support such as Forms 2553 or 8832 and IRS acceptance",
          "Missing-year matrix showing which filing families are actually outstanding",
        ],
        alternativeTreatments: [
          "Continue the historical filing family if the trail is valid",
          "Switch to the current-election filing family if the support is real",
          "Cleanup and relief work before trusting either path",
        ],
        cleanupDependency: "cleanup_first",
        federalStateSensitivity: "state_can_change_answer",
        commercialPriority: "immediate",
        authorityWorkIdeaIds: ["filing-continuity-review"],
        likelyForms: ["Form 2553", "Form 8832"],
      })
    );
  }

  return resolutions;
}
