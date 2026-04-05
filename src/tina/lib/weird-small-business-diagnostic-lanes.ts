import type {
  TinaWeirdSmallBusinessBenchmarkConfidence,
  TinaWeirdSmallBusinessDiagnosticFactBucket,
  TinaWeirdSmallBusinessDiagnosticLaneEntityRole,
  TinaWeirdSmallBusinessDiagnosticLaneId,
  TinaWeirdSmallBusinessDiagnosticLaneSnapshot,
  TinaWeirdSmallBusinessFilingLadderItem,
  TinaWeirdSmallBusinessFilingLadderItemStatus,
  TinaWeirdSmallBusinessScenario,
} from "@/tina/lib/weird-small-business-benchmark-contracts";

interface TinaWeirdSmallBusinessDiagnosticLaneSeed {
  scenarioId: string;
  signalIds: string[];
  posture: "route_sensitive" | "cleanup_heavy" | "compliance_risk" | "records_first";
  confidenceCeiling: TinaWeirdSmallBusinessBenchmarkConfidence;
  likelyTaxClassifications: string[];
  likelyReturnsAndForms: string[];
  factsToConfirmFirst: string[];
  cleanupStepsFirst: string[];
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function includesSignal(seed: TinaWeirdSmallBusinessDiagnosticLaneSeed, signalId: string): boolean {
  return seed.signalIds.includes(signalId);
}

function laneLabel(laneId: TinaWeirdSmallBusinessDiagnosticLaneId): string {
  switch (laneId) {
    case "entity_route_resolution":
      return "Entity Route Resolution";
    case "ownership_and_basis_reconstruction":
      return "Ownership And Basis Reconstruction";
    case "worker_and_payroll_compliance":
      return "Worker And Payroll Compliance";
    case "books_and_reconstruction":
      return "Books And Revenue Reconstruction";
    case "asset_support_and_property_treatment":
      return "Asset Support And Property Treatment";
    case "multi_year_filing_backlog":
      return "Multi-Year Filing Backlog";
  }
}

function pickLaneId(
  scenario: TinaWeirdSmallBusinessScenario,
  seed: TinaWeirdSmallBusinessDiagnosticLaneSeed
): TinaWeirdSmallBusinessDiagnosticLaneId {
  if (
    scenario.id === "years-of-missed-filings" ||
    (includesSignal(seed, "missed_filings") &&
      (includesSignal(seed, "prior_return_drift") ||
        scenario.group === "recordkeeping_and_cleanup_problems"))
  ) {
    return "multi_year_filing_backlog";
  }

  if (
    includesSignal(seed, "worker_classification") ||
    includesSignal(seed, "payroll") ||
    includesSignal(seed, "info_returns")
  ) {
    return "worker_and_payroll_compliance";
  }

  if (
    includesSignal(seed, "mixed_spend") ||
    includesSignal(seed, "no_books") ||
    includesSignal(seed, "cash_business") ||
    includesSignal(seed, "prior_return_drift") ||
    scenario.group === "recordkeeping_and_cleanup_problems"
  ) {
    return "books_and_reconstruction";
  }

  if (
    includesSignal(seed, "capitalization") ||
    includesSignal(seed, "asset_disposition") ||
    includesSignal(seed, "mixed_use_vehicle") ||
    includesSignal(seed, "home_office") ||
    includesSignal(seed, "inventory") ||
    includesSignal(seed, "debt_forgiveness") ||
    scenario.group === "assets_depreciation_and_property_problems"
  ) {
    return "asset_support_and_property_treatment";
  }

  if (
    includesSignal(seed, "basis_or_capital") ||
    includesSignal(seed, "ownership_change") ||
    scenario.group === "ownership_and_basis_problems"
  ) {
    return "ownership_and_basis_reconstruction";
  }

  return "entity_route_resolution";
}

function pickEntityRole(
  laneId: TinaWeirdSmallBusinessDiagnosticLaneId
): TinaWeirdSmallBusinessDiagnosticLaneEntityRole {
  switch (laneId) {
    case "entity_route_resolution":
    case "ownership_and_basis_reconstruction":
      return "entity_primary";
    case "worker_and_payroll_compliance":
    case "asset_support_and_property_treatment":
      return "entity_secondary";
    case "books_and_reconstruction":
    case "multi_year_filing_backlog":
      return "entity_deferred_until_cleanup";
  }
}

function pickClassificationAnchor(
  scenario: TinaWeirdSmallBusinessScenario,
  seed: TinaWeirdSmallBusinessDiagnosticLaneSeed,
  laneId: TinaWeirdSmallBusinessDiagnosticLaneId
): string {
  const scenarioAnchor = scenario.likelyTaxClassifications[0];
  if (scenarioAnchor) {
    return scenarioAnchor;
  }

  switch (laneId) {
    case "worker_and_payroll_compliance":
      return "worker_classification_issue_inside_any_entity_type";
    case "multi_year_filing_backlog":
      return "depends_on_actual_entity_history";
    case "books_and_reconstruction":
    case "asset_support_and_property_treatment":
      return "depends_on_entity";
    default:
      return seed.likelyTaxClassifications[0] ?? "depends_on_entity_and_election_history";
  }
}

function pickConfidenceCeiling(
  scenario: TinaWeirdSmallBusinessScenario,
  seed: TinaWeirdSmallBusinessDiagnosticLaneSeed,
  laneId: TinaWeirdSmallBusinessDiagnosticLaneId
): TinaWeirdSmallBusinessBenchmarkConfidence {
  const lowSignal =
    includesSignal(seed, "worker_classification") ||
    includesSignal(seed, "cash_business") ||
    includesSignal(seed, "no_books") ||
    includesSignal(seed, "prior_return_drift") ||
    includesSignal(seed, "missed_filings") ||
    includesSignal(seed, "capitalization") ||
    includesSignal(seed, "mixed_use_vehicle") ||
    includesSignal(seed, "debt_forgiveness") ||
    scenario.group === "recordkeeping_and_cleanup_problems";

  if (
    laneId === "multi_year_filing_backlog" ||
    laneId === "books_and_reconstruction" ||
    lowSignal
  ) {
    return "low";
  }

  if (
    laneId === "worker_and_payroll_compliance" ||
    laneId === "asset_support_and_property_treatment"
  ) {
    return seed.confidenceCeiling === "high" ? "low" : seed.confidenceCeiling;
  }

  return seed.confidenceCeiling;
}

function filingStatus(label: string): TinaWeirdSmallBusinessFilingLadderItemStatus {
  const normalized = label.toLowerCase();

  if (/\bstate\b/.test(normalized)) {
    return "state_follow_through";
  }

  if (/support|workpaper|schedule|register|reconciliation|ladder/i.test(label)) {
    return "support_schedule";
  }

  if (/depends on|possible|if | or /i.test(label)) {
    return "conditional";
  }

  return "likely_missing";
}

function filingReason(
  label: string,
  laneId: TinaWeirdSmallBusinessDiagnosticLaneId
): string {
  switch (laneId) {
    case "worker_and_payroll_compliance":
      return "Labor, payroll, or contractor treatment can change both the compliance path and the reviewer burden.";
    case "books_and_reconstruction":
      return "The file needs books or revenue reconstruction support before the return family is trustworthy.";
    case "asset_support_and_property_treatment":
      return "Asset history and support schedules drive whether the deduction posture is defensible.";
    case "multi_year_filing_backlog":
      return "The missing-year matrix needs to be mapped before any single year is treated as complete.";
    case "ownership_and_basis_reconstruction":
      return "Owner-flow, basis, and capital support can materially change the return family and owner-level results.";
    case "entity_route_resolution":
      return "Entity, election, and filing-family proof need to line up before the return path is trusted.";
  }
}

function buildFilingLadder(
  scenario: TinaWeirdSmallBusinessScenario,
  seed: TinaWeirdSmallBusinessDiagnosticLaneSeed,
  laneId: TinaWeirdSmallBusinessDiagnosticLaneId
): TinaWeirdSmallBusinessFilingLadderItem[] {
  const labels = unique([
    ...scenario.likelyReturnsAndForms,
    ...seed.likelyReturnsAndForms,
  ]);

  return labels.slice(0, 8).map((label) => ({
    label,
    status: filingStatus(label),
    whyItMatters: filingReason(label, laneId),
  }));
}

function bucket(
  id: string,
  label: string,
  facts: string[],
  whyItMatters: string
): TinaWeirdSmallBusinessDiagnosticFactBucket {
  return {
    id,
    label,
    facts: unique(facts).slice(0, 4),
    whyItMatters,
  };
}

function buildFactBuckets(
  scenario: TinaWeirdSmallBusinessScenario,
  seed: TinaWeirdSmallBusinessDiagnosticLaneSeed,
  laneId: TinaWeirdSmallBusinessDiagnosticLaneId
): TinaWeirdSmallBusinessDiagnosticFactBucket[] {
  const scenarioFacts = scenario.missingFactsToConfirm;
  const fallbackFacts = seed.factsToConfirmFirst;

  switch (laneId) {
    case "worker_and_payroll_compliance":
      return [
        bucket(
          "worker-control",
          "Worker control and relationship facts",
          unique([
            ...scenarioFacts.filter((item) => /control|clients|tools|profit|agreement/i.test(item)),
            ...fallbackFacts.filter((item) => /control|relationship|tools|profit|labor|documented/i.test(item)),
          ]),
          "These facts determine whether Tina should keep the file in payroll review or contractor cleanup."
        ),
        bucket(
          "payee-register",
          "Payee and filing-threshold facts",
          unique([
            ...scenarioFacts.filter((item) => /threshold|card|direct|w-9|payees/i.test(item)),
            ...fallbackFacts.filter((item) => /w-9|1099|payroll|deposits|quarters|year-end wage/i.test(item)),
          ]),
          "The payee register is what turns labor ambiguity into an actual filing ladder."
        ),
      ];
    case "books_and_reconstruction":
      return [
        bucket(
          "books-rebuild",
          "Books and source-record completeness",
          unique([
            ...scenarioFacts.filter((item) => /bank|card|processor|balance-sheet|cash handling|point-of-sale|notebook/i.test(item)),
            ...fallbackFacts.filter((item) => /bank|merchant|processor|records|book|cash|deposits/i.test(item)),
          ]),
          "Tina needs source-record completeness before she can trust any downstream deduction or income answer."
        ),
        bucket(
          "year-mapping",
          "Year and filing-family drift",
          unique([
            ...scenarioFacts.filter((item) => /prior|filed|years|return families|rolled forward/i.test(item)),
            ...fallbackFacts.filter((item) => /prior|filed|years|return family|current books diverge/i.test(item)),
          ]),
          "Cross-year drift can turn a bookkeeping cleanup into an amended-return or missed-filing problem."
        ),
      ];
    case "asset_support_and_property_treatment":
      return [
        bucket(
          "asset-support",
          "Asset and invoice support",
          unique([
            ...scenarioFacts.filter((item) => /invoice|placed-in-service|asset|basis|depreciat|purchase|forgiveness|collateral/i.test(item)),
            ...fallbackFacts.filter((item) => /invoice|placed-in-service|asset|basis|depreciat|settlement|lender|solvency/i.test(item)),
          ]),
          "Asset, debt-event, and property support drive whether the treatment is deductible, capitalizable, or review-only."
        ),
        bucket(
          "method-history",
          "Method and prior-treatment history",
          unique([
            ...scenarioFacts.filter((item) => /previously|history|useful life|mileage|method|exception/i.test(item)),
            ...fallbackFacts.filter((item) => /history|mileage|method|exception|prior-year/i.test(item)),
          ]),
          "Prior method history determines whether Tina can carry the treatment or needs a more conservative cleanup path."
        ),
      ];
    case "multi_year_filing_backlog":
      return [
        bucket(
          "backlog-matrix",
          "Missing-year and filing-family matrix",
          unique([
            ...scenarioFacts.filter((item) => /years|return families|elections|registrations/i.test(item)),
            ...fallbackFacts.filter((item) => /years|return family|elections|registrations/i.test(item)),
          ]),
          "Tina has to map the missing-year ladder before treating any single-year answer as complete."
        ),
        bucket(
          "labor-and-revenue",
          "Payroll, contractor, and revenue facts by year",
          unique([
            ...scenarioFacts.filter((item) => /payroll|contractor|payments/i.test(item)),
            ...fallbackFacts.filter((item) => /payroll|contractor|deposits|sales/i.test(item)),
          ]),
          "The filing ladder changes materially if payroll, contractor, or sales-tax facts existed only in some years."
        ),
      ];
    case "ownership_and_basis_reconstruction":
      return [
        bucket(
          "owner-economics",
          "Owner economics and basis facts",
          unique([
            ...scenarioFacts.filter((item) => /owner|basis|capital|contributed|distribution|loan|equity/i.test(item)),
            ...fallbackFacts.filter((item) => /owner|basis|capital|contribution|distribution|loan|equity/i.test(item)),
          ]),
          "Owner-level economics can change allocations, taxability, and whether the return family is supportable."
        ),
      ];
    case "entity_route_resolution":
    default:
      return [
        bucket(
          "entity-route",
          "Entity, election, and transition facts",
          unique([
            ...scenarioFacts.filter((item) => /2553|8832|election|entity|conversion|legal|prior-year/i.test(item)),
            ...fallbackFacts.filter((item) => /2553|8832|election|entity|transition|conversion|prior-year/i.test(item)),
          ]),
          "Tina needs the route proof before the filing family is safe to use."
        ),
      ];
  }
}

function buildSummary(
  laneId: TinaWeirdSmallBusinessDiagnosticLaneId,
  entityRole: TinaWeirdSmallBusinessDiagnosticLaneEntityRole
): string {
  switch (laneId) {
    case "worker_and_payroll_compliance":
      return "Treat this first as a worker, payroll, and filing-ladder problem; entity posture still matters, but it is not the first thing Tina should overclaim.";
    case "books_and_reconstruction":
      return "Treat this first as a books-and-reconstruction file; entity posture stays provisional until source records and cross-year drift are rebuilt.";
    case "asset_support_and_property_treatment":
      return "Treat this first as an asset-support and property-treatment file; the entity path matters, but support quality is what currently blocks trust.";
    case "multi_year_filing_backlog":
      return "Treat this first as a missing-year filing backlog; Tina should map the year-by-year return ladder before narrowing to one filing family.";
    case "ownership_and_basis_reconstruction":
      return "Treat this first as an owner-economics reconstruction file; allocations, basis, and capital truth drive the usable answer.";
    case "entity_route_resolution":
    default:
      return entityRole === "entity_primary"
        ? "Treat this first as an entity-route file where the election and filing-family proof decide the answer."
        : "Treat this first as a route-sensitive file without overstating a settled entity answer.";
  }
}

export function buildTinaWeirdSmallBusinessDiagnosticLane(
  scenario: TinaWeirdSmallBusinessScenario,
  seed: TinaWeirdSmallBusinessDiagnosticLaneSeed
): TinaWeirdSmallBusinessDiagnosticLaneSnapshot {
  const laneId = pickLaneId(scenario, seed);
  const entityRole = pickEntityRole(laneId);
  const classificationAnchor = pickClassificationAnchor(scenario, seed, laneId);
  const confidenceCeiling = pickConfidenceCeiling(scenario, seed, laneId);
  const filingLadder = buildFilingLadder(scenario, seed, laneId);
  const factBuckets = buildFactBuckets(scenario, seed, laneId);

  return {
    scenarioId: scenario.id,
    laneId,
    label: laneLabel(laneId),
    summary: buildSummary(laneId, entityRole),
    entityRole,
    classificationAnchor,
    confidenceCeiling,
    filingLadder,
    factBuckets,
    cleanupPriority: unique([
      ...scenario.cleanupStepsFirst,
      ...seed.cleanupStepsFirst,
    ]).slice(0, 6),
  };
}
