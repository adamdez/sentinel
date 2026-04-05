import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import type {
  TinaEightFloorGateSnapshot,
  TinaSkillId,
  TinaTraitGateFailure,
  TinaTraitGateResult,
} from "@/tina/lib/skill-report-card-contracts";
import { buildTinaSmokeCaseReport, type TinaSmokeCaseReport } from "@/tina/lib/smoke-report";

const TARGET_SCORE = 8;
let cachedEightFloorGateSnapshot: TinaEightFloorGateSnapshot | null = null;

const SKILL_TITLES: Record<TinaSkillId, string> = {
  technical_tax_law: "Technical Tax Law",
  accounting_fluency: "Accounting Fluency",
  fact_pattern_judgment: "Fact-Pattern Judgment",
  entity_and_filing_path_classification: "Entity and Filing-Path Classification",
  tax_treatment_selection: "Tax Treatment Selection",
  record_and_evidence_analysis: "Record and Evidence Analysis",
  risk_and_materiality_judgment: "Risk and Materiality Judgment",
  tax_planning_and_savings_identification: "Tax Planning and Savings Identification",
  form_and_compliance_execution: "Form and Compliance Execution",
  review_and_error_detection: "Review and Error Detection",
  documentation_and_defensibility: "Documentation and Defensibility",
  client_communication: "Client Communication",
  workflow_and_case_management: "Workflow and Case Management",
  industry_and_scenario_familiarity: "Industry and Scenario Familiarity",
  ethics_and_professional_responsibility: "Ethics and Professional Responsibility",
  practice_judgment: "Practice Judgment",
};

type GateCheck = {
  pass: boolean;
  fixtureId: string;
  title: string;
  summary: string;
  severity: TinaTraitGateFailure["severity"];
  ownerEngine: string;
  currentValue: string;
  expectedValue: string;
};

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function getReport(id: keyof typeof TINA_SKILL_REVIEW_DRAFTS): TinaSmokeCaseReport {
  if (!(globalThis as Record<string, unknown>).__tinaSkillSmokeReportCache) {
    (globalThis as Record<string, unknown>).__tinaSkillSmokeReportCache = new Map<
      string,
      TinaSmokeCaseReport
    >();
  }
  const cache = (globalThis as Record<string, unknown>).__tinaSkillSmokeReportCache as Map<
    string,
    TinaSmokeCaseReport
  >;
  const cached = cache.get(id);
  if (cached) return cached;

  const report = buildTinaSmokeCaseReport(TINA_SKILL_REVIEW_DRAFTS[id]);
  cache.set(id, report);
  return report;
}

function buildResult(
  skillId: TinaSkillId,
  ownerEngines: string[],
  requiredFixtureIds: string[],
  checks: GateCheck[]
): TinaTraitGateResult {
  const failures = checks
    .filter((check) => !check.pass)
    .map<TinaTraitGateFailure>((check, index) => ({
      id: `${skillId}-failure-${index + 1}`,
      fixtureId: check.fixtureId,
      title: check.title,
      summary: check.summary,
      severity: check.severity,
      ownerEngine: check.ownerEngine,
      currentValue: check.currentValue,
      expectedValue: check.expectedValue,
    }));
  const deductions = failures.reduce((total, failure) => {
    if (failure.severity === "blocking") return total + 2.5;
    if (failure.severity === "major") return total + 1.5;
    return total + 0.5;
  }, 0);
  const score = roundScore(Math.max(1, 10 - deductions));

  return {
    skillId,
    title: SKILL_TITLES[skillId],
    status: score >= TARGET_SCORE ? "pass" : "fail",
    score,
    targetScore: TARGET_SCORE,
    summary:
      score >= TARGET_SCORE
        ? `${SKILL_TITLES[skillId]} is currently meeting the 8-floor gate.`
        : `${SKILL_TITLES[skillId]} is below the 8-floor gate because ${failures.length} fixture check${
            failures.length === 1 ? "" : "s"
          } still fail.`,
    ownerEngines,
    requiredFixtureIds,
    failures,
  };
}

function technicalTaxLaw(): TinaTraitGateResult {
  const sCorp = getReport("s-corp-election");
  const buyout = getReport("buyout-year");
  const salesTax = getReport("sales-tax-authority");
  return buildResult(
    "technical_tax_law",
    ["federal-return-classification", "authority-position-matrix", "entity-lane-execution"],
    ["s-corp-election", "buyout-year", "sales-tax-authority"],
    [
      {
        pass: sCorp.entityLaneExecution.assembly.status !== "blocked",
        fixtureId: "s-corp-election",
        title: "S-corp lane assembly is still blocked",
        summary: "The S-corp lane should at least assemble into a reviewer-grade form family.",
        severity: "major",
        ownerEngine: "entity-lane-execution",
        currentValue: sCorp.entityLaneExecution.assembly.status,
        expectedValue: "review_required or ready",
      },
      {
        pass: buyout.entityLaneExecution.economicsProofs.every((proof) => proof.status !== "missing"),
        fixtureId: "buyout-year",
        title: "Buyout-year economics proof is still missing",
        summary: "The buyout-year file should not have missing economics proofs.",
        severity: "blocking",
        ownerEngine: "entity-lane-execution",
        currentValue: `${buyout.entityLaneExecution.economicsProofs.filter((proof) => proof.status === "missing").length} missing proof(s)`,
        expectedValue: "0 missing proofs",
      },
      {
        pass: salesTax.authorityPositionMatrix.items.some((item) => item.recommendation === "use_now"),
        fixtureId: "sales-tax-authority",
        title: "Authority-backed use-now position is missing",
        summary: "The sales-tax authority fixture should produce a concrete use-now position.",
        severity: "major",
        ownerEngine: "authority-position-matrix",
        currentValue: `${salesTax.authorityPositionMatrix.items.filter((item) => item.recommendation === "use_now").length} use-now position(s)`,
        expectedValue: "1 or more use-now positions",
      },
    ]
  );
}

function accountingFluency(): TinaTraitGateResult {
  const dirty = getReport("dirty-books");
  const thin = getReport("thin-proof");
  const supported = getReport("supported-core");
  const payrollOverlap = getReport("payroll-contractor-overlap");
  const heavyDepreciation = getReport("heavy-depreciation-year");
  const inventoryRetail = getReport("inventory-heavy-retailer");
  return buildResult(
    "accounting_fluency",
    ["ledger-reconstruction", "books-reconciliation", "evidence-credibility"],
    [
      "dirty-books",
      "thin-proof",
      "supported-core",
      "payroll-contractor-overlap",
      "heavy-depreciation-year",
      "inventory-heavy-retailer",
    ],
    [
      {
        pass: dirty.ledgerReconstruction.overallStatus !== "blocked",
        fixtureId: "dirty-books",
        title: "Dirty-books ledger reconstruction is blocked",
        summary: "Dirty books should still yield at least a partial ledger story.",
        severity: "blocking",
        ownerEngine: "ledger-reconstruction",
        currentValue: dirty.ledgerReconstruction.overallStatus,
        expectedValue: "partial or reconstructed",
      },
      {
        pass: dirty.booksReconciliation.variances.length <= 2,
        fixtureId: "dirty-books",
        title: "Too many reconciliation variances remain",
        summary: "Dirty books still carry too many unresolved variances.",
        severity: "major",
        ownerEngine: "books-reconciliation",
        currentValue: `${dirty.booksReconciliation.variances.length} variances`,
        expectedValue: "2 or fewer variances",
      },
      {
        pass: thin.evidenceCredibility.overallStatus !== "credible",
        fixtureId: "thin-proof",
        title: "Thin proof still looks credible",
        summary: "A thin-proof file should stay mixed, thin, or blocked.",
        severity: "major",
        ownerEngine: "evidence-credibility",
        currentValue: thin.evidenceCredibility.overallStatus,
        expectedValue: "mixed, thin, or blocked",
      },
      {
        pass: supported.ledgerReconstruction.overallStatus === "reconstructed",
        fixtureId: "supported-core",
        title: "Supported-core ledger story is incomplete",
        summary: "The supported file should have a reconstructed ledger story.",
        severity: "minor",
        ownerEngine: "ledger-reconstruction",
        currentValue: supported.ledgerReconstruction.overallStatus,
        expectedValue: "reconstructed",
      },
      {
        pass:
          payrollOverlap.ledgerReconstruction.groups.some(
            (group) => group.category === "payroll" && group.status !== "blocked"
          ) &&
          payrollOverlap.ledgerReconstruction.groups.some(
            (group) => group.category === "contractors" && group.status !== "blocked"
          ),
        fixtureId: "payroll-contractor-overlap",
        title: "Worker overlap file still loses payroll or contractor reconstruction",
        summary: "The payroll overlap fixture should preserve both payroll and contractor ledger groups.",
        severity: "minor",
        ownerEngine: "ledger-reconstruction",
        currentValue: `${payrollOverlap.ledgerReconstruction.groups.filter((group) => group.category === "payroll" || group.category === "contractors").map((group) => `${group.category}:${group.status}`).join(", ")}`,
        expectedValue: "payroll and contractors groups present without blocked status",
      },
      {
        pass: heavyDepreciation.ledgerReconstruction.groups.some(
          (group) => group.category === "fixed_assets" && group.status !== "blocked"
        ),
        fixtureId: "heavy-depreciation-year",
        title: "Heavy depreciation file still lacks fixed-asset reconstruction",
        summary: "The heavy depreciation fixture should produce a usable fixed-assets ledger group.",
        severity: "minor",
        ownerEngine: "ledger-reconstruction",
        currentValue: `${heavyDepreciation.ledgerReconstruction.groups.find((group) => group.category === "fixed_assets")?.status ?? "missing group"}`,
        expectedValue: "partial or reconstructed",
      },
      {
        pass: inventoryRetail.ledgerReconstruction.groups.some(
          (group) => group.category === "inventory" && group.status !== "blocked"
        ),
        fixtureId: "inventory-heavy-retailer",
        title: "Inventory-heavy retailer still lacks an inventory books story",
        summary: "The inventory-heavy retailer should produce an inventory ledger group instead of a blind spot.",
        severity: "minor",
        ownerEngine: "ledger-reconstruction",
        currentValue: `${inventoryRetail.ledgerReconstruction.groups.find((group) => group.category === "inventory")?.status ?? "missing group"}`,
        expectedValue: "partial or reconstructed",
      },
    ]
  );
}

function factPattern(): TinaTraitGateResult {
  const spouse = getReport("spouse-community-property");
  const buyout = getReport("buyout-year");
  const thin = getReport("thin-proof");
  return buildResult(
    "fact_pattern_judgment",
    ["start-path", "ownership-capital-events", "evidence-credibility"],
    ["spouse-community-property", "buyout-year", "thin-proof"],
    [
      {
        pass: spouse.startPath.proofRequirements.length >= 2,
        fixtureId: "spouse-community-property",
        title: "Spouse proof burden is too shallow",
        summary: "The spouse exception should preserve multiple proof requirements.",
        severity: "major",
        ownerEngine: "start-path",
        currentValue: `${spouse.startPath.proofRequirements.length} proof requirement(s)`,
        expectedValue: "2 or more proof requirements",
      },
      {
        pass: buyout.ownershipCapitalEvents.eventCount >= 4,
        fixtureId: "buyout-year",
        title: "Buyout chronology is too thin",
        summary: "The buyout-year file should preserve multiple ownership events.",
        severity: "major",
        ownerEngine: "ownership-capital-events",
        currentValue: `${buyout.ownershipCapitalEvents.eventCount} event(s)`,
        expectedValue: "4 or more events",
      },
      {
        pass: thin.evidenceCredibility.overallStatus !== "credible",
        fixtureId: "thin-proof",
        title: "Thin-proof route facts outrun support",
        summary: "Thin proof should not look fully credible.",
        severity: "minor",
        ownerEngine: "evidence-credibility",
        currentValue: thin.evidenceCredibility.overallStatus,
        expectedValue: "mixed, thin, or blocked",
      },
    ]
  );
}

function entityPath(): TinaTraitGateResult {
  const uneven = getReport("uneven-multi-owner");
  const sCorp = getReport("s-corp-election");
  const buyout = getReport("buyout-year");
  const priorReturnDrift = getReport("prior-return-drift");
  return buildResult(
    "entity_and_filing_path_classification",
    ["federal-return-classification", "entity-lane-execution"],
    ["uneven-multi-owner", "s-corp-election", "buyout-year", "prior-return-drift"],
    [
      {
        pass: uneven.startPath.recommendation.laneId === "1065",
        fixtureId: "uneven-multi-owner",
        title: "Uneven multi-owner file misclassified",
        summary: "The uneven multi-owner file should land on 1065.",
        severity: "blocking",
        ownerEngine: "federal-return-classification",
        currentValue: uneven.startPath.recommendation.laneId,
        expectedValue: "1065",
      },
      {
        pass: sCorp.startPath.recommendation.laneId === "1120_s",
        fixtureId: "s-corp-election",
        title: "S-election file misclassified",
        summary: "The S-election file should land on 1120-S.",
        severity: "blocking",
        ownerEngine: "federal-return-classification",
        currentValue: sCorp.startPath.recommendation.laneId,
        expectedValue: "1120_s",
      },
      {
        pass: buyout.entityLaneExecution.assembly.primaryFormId === "f1065",
        fixtureId: "buyout-year",
        title: "Buyout-year package is not anchored to Form 1065",
        summary: "The buyout-year lane should still anchor to Form 1065.",
        severity: "major",
        ownerEngine: "entity-lane-execution",
        currentValue: String(buyout.entityLaneExecution.assembly.primaryFormId),
        expectedValue: "f1065",
      },
      {
        pass: priorReturnDrift.startPath.recommendation.laneId === "1120_s",
        fixtureId: "prior-return-drift",
        title: "Prior-return drift is not updating the current filing path",
        summary: "Current-year election proof should override older Schedule C history for lane selection.",
        severity: "major",
        ownerEngine: "federal-return-classification",
        currentValue: priorReturnDrift.startPath.recommendation.laneId,
        expectedValue: "1120_s",
      },
    ]
  );
}

function treatment(): TinaTraitGateResult {
  const dirty = getReport("dirty-books");
  const salesTax = getReport("sales-tax-authority");
  const creator = getReport("creator-media");
  const mixedUse = getReport("mixed-use-home-office-vehicle");
  const relatedParty = getReport("related-party-payments");
  return buildResult(
    "tax_treatment_selection",
    ["tax-treatment-policy", "authority-position-matrix", "industry-playbooks"],
    [
      "dirty-books",
      "sales-tax-authority",
      "creator-media",
      "mixed-use-home-office-vehicle",
      "related-party-payments",
    ],
    [
      {
        pass: dirty.treatmentJudgment.items.some((item) => item.taxPositionBucket === "reject"),
        fixtureId: "dirty-books",
        title: "Dirty-books file is not rejecting unsafe treatment",
        summary: "The dirty-books file should still reject at least one unsafe position.",
        severity: "major",
        ownerEngine: "tax-treatment-policy",
        currentValue: `${dirty.treatmentJudgment.items.filter((item) => item.taxPositionBucket === "reject").length} reject bucket(s)`,
        expectedValue: "1 or more reject buckets",
      },
      {
        pass: salesTax.authorityPositionMatrix.items.some((item) => item.recommendation === "use_now"),
        fixtureId: "sales-tax-authority",
        title: "Sales-tax fixture is not graduating to use-now treatment",
        summary: "The sales-tax authority case should produce at least one use-now position.",
        severity: "major",
        ownerEngine: "authority-position-matrix",
        currentValue: `${salesTax.authorityPositionMatrix.items.filter((item) => item.recommendation === "use_now").length} use-now position(s)`,
        expectedValue: "1 or more use-now positions",
      },
      {
        pass: creator.treatmentJudgment.items.some((item) => item.taxPositionBucket === "review"),
        fixtureId: "creator-media",
        title: "Creator file is not surfacing gray-area review treatment",
        summary: "Mixed-use creator files should preserve reviewer-controlled treatment items.",
        severity: "minor",
        ownerEngine: "industry-playbooks",
        currentValue: `${creator.treatmentJudgment.items.filter((item) => item.taxPositionBucket === "review").length} review bucket(s)`,
        expectedValue: "1 or more review buckets",
      },
      {
        pass: mixedUse.treatmentJudgment.items.some(
          (item) => item.taxPositionBucket === "review" || item.taxPositionBucket === "reject"
        ),
        fixtureId: "mixed-use-home-office-vehicle",
        title: "Mixed-use file is not surfacing reviewer-controlled treatment",
        summary: "The home-office and vehicle mixed-use file should not wash into ordinary ready treatment.",
        severity: "minor",
        ownerEngine: "tax-treatment-policy",
        currentValue: `${mixedUse.treatmentJudgment.items.map((item) => item.taxPositionBucket).join(", ")}`,
        expectedValue: "at least one review or reject bucket",
      },
      {
        pass: relatedParty.treatmentJudgment.items.some(
          (item) =>
            item.taxPositionBucket === "review" &&
            /related-party|intercompany/i.test(item.title)
        ),
        fixtureId: "related-party-payments",
        title: "Related-party file is not preserving review treatment",
        summary: "Related-party payments should stay in reviewer-controlled treatment buckets.",
        severity: "minor",
        ownerEngine: "tax-treatment-policy",
        currentValue: `${relatedParty.treatmentJudgment.items.map((item) => `${item.title}:${item.taxPositionBucket}`).join(" | ")}`,
        expectedValue: "a related-party or intercompany review treatment item",
      },
    ]
  );
}

function evidence(): TinaTraitGateResult {
  const supported = getReport("supported-core");
  const thin = getReport("thin-proof");
  const dirty = getReport("dirty-books");
  return buildResult(
    "record_and_evidence_analysis",
    ["evidence-sufficiency", "evidence-credibility", "accounting-artifact-coverage"],
    ["supported-core", "thin-proof", "dirty-books"],
    [
      {
        pass: supported.evidenceCredibility.overallStatus === "credible",
        fixtureId: "supported-core",
        title: "Supported-core evidence is not credible enough",
        summary: "The supported file should reach a credible evidence picture.",
        severity: "major",
        ownerEngine: "evidence-credibility",
        currentValue: supported.evidenceCredibility.overallStatus,
        expectedValue: "credible",
      },
      {
        pass: thin.evidenceCredibility.overallStatus !== "credible",
        fixtureId: "thin-proof",
        title: "Thin-proof evidence still looks too credible",
        summary: "Thin proof should never score as fully credible.",
        severity: "major",
        ownerEngine: "evidence-credibility",
        currentValue: thin.evidenceCredibility.overallStatus,
        expectedValue: "mixed, thin, or blocked",
      },
      {
        pass: dirty.accountingArtifactCoverage.overallStatus !== "covered",
        fixtureId: "dirty-books",
        title: "Dirty-books artifact coverage is overstated",
        summary: "Dirty books should stay partial or missing at the artifact layer.",
        severity: "minor",
        ownerEngine: "accounting-artifact-coverage",
        currentValue: dirty.accountingArtifactCoverage.overallStatus,
        expectedValue: "partial or missing",
      },
    ]
  );
}

function risk(): TinaTraitGateResult {
  const buyout = getReport("buyout-year");
  const dirty = getReport("dirty-books");
  const drifted = getReport("drifted-package");
  return buildResult(
    "risk_and_materiality_judgment",
    ["materiality-priority", "operational-status"],
    ["buyout-year", "dirty-books", "drifted-package"],
    [
      {
        pass: buyout.operationalStatus.blockers.length >= 2,
        fixtureId: "buyout-year",
        title: "Buyout-year blockers are too quiet",
        summary: "The buyout-year file should still surface multiple blockers.",
        severity: "major",
        ownerEngine: "operational-status",
        currentValue: `${buyout.operationalStatus.blockers.length} blocker(s)`,
        expectedValue: "2 or more blockers",
      },
      {
        pass: dirty.materialityPriority.items.some((item) => item.priority === "immediate"),
        fixtureId: "dirty-books",
        title: "Dirty-books file lacks immediate priorities",
        summary: "Material dirty-books issues should land in the immediate bucket.",
        severity: "major",
        ownerEngine: "materiality-priority",
        currentValue: `${dirty.materialityPriority.items.filter((item) => item.priority === "immediate").length} immediate item(s)`,
        expectedValue: "1 or more immediate items",
      },
      {
        pass: drifted.operationalStatus.packageState === "signed_off_stale",
        fixtureId: "drifted-package",
        title: "Post-signoff drift is not invalidating trust",
        summary: "A drifted package must become stale immediately.",
        severity: "blocking",
        ownerEngine: "operational-status",
        currentValue: drifted.operationalStatus.packageState,
        expectedValue: "signed_off_stale",
      },
    ]
  );
}

function planning(): TinaTraitGateResult {
  const supported = getReport("supported-core");
  const salesTax = getReport("sales-tax-authority");
  const creator = getReport("creator-media");
  return buildResult(
    "tax_planning_and_savings_identification",
    ["planning-action-board", "tax-planning-memo"],
    ["supported-core", "sales-tax-authority", "creator-media"],
    [
      {
        pass: supported.planningActionBoard.items.some((item) => item.status === "advance"),
        fixtureId: "supported-core",
        title: "Supported-core planning board is not advancing anything",
        summary: "The supported file should still have at least one advance item.",
        severity: "major",
        ownerEngine: "planning-action-board",
        currentValue: `${supported.planningActionBoard.items.filter((item) => item.status === "advance").length} advance item(s)`,
        expectedValue: "1 or more advance items",
      },
      {
        pass: salesTax.taxPlanningMemo.items.some((item) => item.priority === "now"),
        fixtureId: "sales-tax-authority",
        title: "Authority-backed planning is not making it to now",
        summary: "The sales-tax case should push at least one planning item into now.",
        severity: "major",
        ownerEngine: "tax-planning-memo",
        currentValue: `${salesTax.taxPlanningMemo.items.filter((item) => item.priority === "now").length} now item(s)`,
        expectedValue: "1 or more now items",
      },
      {
        pass: creator.taxPlanningMemo.overallStatus !== "thin",
        fixtureId: "creator-media",
        title: "Creator planning is still too thin",
        summary: "The creator playbook should produce more than a thin planning memo.",
        severity: "major",
        ownerEngine: "tax-planning-memo",
        currentValue: creator.taxPlanningMemo.overallStatus,
        expectedValue: "actionable or mixed",
      },
    ]
  );
}

function forms(): TinaTraitGateResult {
  const supported = getReport("supported-core");
  const thin = getReport("thin-proof");
  const sCorp = getReport("s-corp-election");
  const heavyDepreciation = getReport("heavy-depreciation-year");
  const mixedUse = getReport("mixed-use-home-office-vehicle");
  return buildResult(
    "form_and_compliance_execution",
    ["official-form-fill", "official-form-execution", "return-package-artifacts", "entity-lane-execution"],
    [
      "supported-core",
      "thin-proof",
      "s-corp-election",
      "heavy-depreciation-year",
      "mixed-use-home-office-vehicle",
    ],
    [
      {
        pass: supported.returnPackageArtifacts.renderedForms.some(
          (artifact) => artifact.formId === "f1040sc" && artifact.status === "ready"
        ),
        fixtureId: "supported-core",
        title: "Supported-core Schedule C still lacks a ready rendered artifact",
        summary: "The supported file should now produce a ready rendered Schedule C preview artifact.",
        severity: "blocking",
        ownerEngine: "return-package-artifacts",
        currentValue: `${supported.returnPackageArtifacts.renderedForms.filter((artifact) => artifact.formId === "f1040sc" && artifact.status === "ready").length} ready artifact(s)`,
        expectedValue: "1 ready Schedule C artifact",
      },
      {
        pass: thin.returnPackageArtifacts.overallStatus !== "ready",
        fixtureId: "thin-proof",
        title: "Thin-proof package still looks too ready",
        summary: "Thin proof should not produce a ready rendered package.",
        severity: "major",
        ownerEngine: "return-package-artifacts",
        currentValue: thin.returnPackageArtifacts.overallStatus,
        expectedValue: "provisional or blocked",
      },
      {
        pass: sCorp.entityLaneExecution.assembly.primaryFormId === "f1120s",
        fixtureId: "s-corp-election",
        title: "S-corp package is not anchored to Form 1120-S",
        summary: "The S-corp lane should explicitly assemble around Form 1120-S.",
        severity: "major",
        ownerEngine: "entity-lane-execution",
        currentValue: String(sCorp.entityLaneExecution.assembly.primaryFormId),
        expectedValue: "f1120s",
      },
      {
        pass: heavyDepreciation.returnPackageArtifacts.attachments.some(
          (artifact) => artifact.category === "depreciation_support"
        ),
        fixtureId: "heavy-depreciation-year",
        title: "Heavy depreciation file lacks a depreciation attachment artifact",
        summary: "The heavy depreciation fixture should now emit a depreciation support artifact.",
        severity: "minor",
        ownerEngine: "return-package-artifacts",
        currentValue: `${heavyDepreciation.returnPackageArtifacts.attachments.map((artifact) => artifact.category).join(", ")}`,
        expectedValue: "includes depreciation_support",
      },
      {
        pass: mixedUse.returnPackageArtifacts.attachments.some(
          (artifact) => artifact.category === "home_office_support"
        ),
        fixtureId: "mixed-use-home-office-vehicle",
        title: "Mixed-use file lacks a home-office attachment artifact",
        summary: "The mixed-use file should emit a home-office support artifact instead of hiding the requirement.",
        severity: "minor",
        ownerEngine: "return-package-artifacts",
        currentValue: `${mixedUse.returnPackageArtifacts.attachments.map((artifact) => artifact.category).join(", ")}`,
        expectedValue: "includes home_office_support",
      },
    ]
  );
}

function review(): TinaTraitGateResult {
  const dirty = getReport("dirty-books");
  const drifted = getReport("drifted-package");
  const supported = getReport("supported-core");
  return buildResult(
    "review_and_error_detection",
    ["reviewer-challenges", "cross-form-consistency", "operational-status"],
    ["dirty-books", "drifted-package", "supported-core"],
    [
      {
        pass: dirty.reviewerChallenges.items.length >= 3,
        fixtureId: "dirty-books",
        title: "Dirty-books challenge surface is too shallow",
        summary: "Dirty books should still produce several reviewer challenges.",
        severity: "major",
        ownerEngine: "reviewer-challenges",
        currentValue: `${dirty.reviewerChallenges.items.length} challenge(s)`,
        expectedValue: "3 or more challenges",
      },
      {
        pass: drifted.operationalStatus.packageState === "signed_off_stale",
        fixtureId: "drifted-package",
        title: "Drifted package is not being caught",
        summary: "Post-signoff drift must invalidate package trust.",
        severity: "blocking",
        ownerEngine: "operational-status",
        currentValue: drifted.operationalStatus.packageState,
        expectedValue: "signed_off_stale",
      },
      {
        pass: supported.crossFormConsistency.overallStatus === "aligned",
        fixtureId: "supported-core",
        title: "Supported-core cross-form consistency is not aligned",
        summary: "The clean supported file should keep cross-form consistency aligned.",
        severity: "minor",
        ownerEngine: "cross-form-consistency",
        currentValue: supported.crossFormConsistency.overallStatus,
        expectedValue: "aligned",
      },
    ]
  );
}

function documentation(): TinaTraitGateResult {
  const supported = getReport("supported-core");
  const dirty = getReport("dirty-books");
  const buyout = getReport("buyout-year");
  return buildResult(
    "documentation_and_defensibility",
    ["review-bundle", "return-package-artifacts", "entity-lane-execution"],
    ["supported-core", "dirty-books", "buyout-year"],
    [
      {
        pass: supported.reviewBundleFileCount >= 10,
        fixtureId: "supported-core",
        title: "Review bundle is too thin",
        summary: "The supported file should ship a dense review bundle.",
        severity: "minor",
        ownerEngine: "review-bundle",
        currentValue: `${supported.reviewBundleFileCount} file(s)`,
        expectedValue: "10 or more files",
      },
      {
        pass: dirty.returnPackageArtifacts.attachments.length >= 4,
        fixtureId: "dirty-books",
        title: "Dirty-books package lacks enough attachment artifacts",
        summary: "The dirty-books case should preserve multiple attachment artifacts.",
        severity: "minor",
        ownerEngine: "return-package-artifacts",
        currentValue: `${dirty.returnPackageArtifacts.attachments.length} attachment artifact(s)`,
        expectedValue: "4 or more attachment artifacts",
      },
      {
        pass: buyout.entityLaneExecution.assembly.summary.length > 40,
        fixtureId: "buyout-year",
        title: "Blocked-lane assembly story is too thin",
        summary: "The buyout-year assembly should still tell a coherent form-family story.",
        severity: "minor",
        ownerEngine: "entity-lane-execution",
        currentValue: `${buyout.entityLaneExecution.assembly.summary.length} chars`,
        expectedValue: "more than 40 chars",
      },
    ]
  );
}

function communication(): TinaTraitGateResult {
  const thin = getReport("thin-proof");
  const creator = getReport("creator-media");
  const spouse = getReport("spouse-community-property");
  return buildResult(
    "client_communication",
    ["decision-briefings", "document-request-plan"],
    ["thin-proof", "creator-media", "spouse-community-property"],
    [
      {
        pass: thin.decisionBriefings.owner.recommendedActions.length >= 2,
        fixtureId: "thin-proof",
        title: "Thin-proof owner briefing is not concrete enough",
        summary: "Thin-proof owner communication should include multiple explicit next actions.",
        severity: "major",
        ownerEngine: "decision-briefings",
        currentValue: `${thin.decisionBriefings.owner.recommendedActions.length} recommended action(s)`,
        expectedValue: "2 or more recommended actions",
      },
      {
        pass: creator.decisionBriefings.owner.keyPoints.length >= 3,
        fixtureId: "creator-media",
        title: "Creator owner briefing is too generic",
        summary: "Industry-specific owner communication should preserve several key points.",
        severity: "minor",
        ownerEngine: "decision-briefings",
        currentValue: `${creator.decisionBriefings.owner.keyPoints.length} key point(s)`,
        expectedValue: "3 or more key points",
      },
      {
        pass: spouse.documentRequestPlan.items.some((item) => item.audience === "owner"),
        fixtureId: "spouse-community-property",
        title: "Spouse proof request is not clearly exposed to the owner",
        summary: "The spouse exception should still produce an owner-facing request plan item.",
        severity: "major",
        ownerEngine: "document-request-plan",
        currentValue: `${spouse.documentRequestPlan.items.filter((item) => item.audience === "owner").length} owner request(s)`,
        expectedValue: "1 or more owner requests",
      },
    ]
  );
}

function workflow(): TinaTraitGateResult {
  const drifted = getReport("drifted-package");
  const buyout = getReport("buyout-year");
  const supported = getReport("supported-core");
  return buildResult(
    "workflow_and_case_management",
    ["operational-status", "package-readiness", "return-package-artifacts"],
    ["drifted-package", "buyout-year", "supported-core"],
    [
      {
        pass: drifted.operationalStatus.packageState === "signed_off_stale",
        fixtureId: "drifted-package",
        title: "Snapshot drift is not invalidating signoff",
        summary: "A drifted package must become stale immediately.",
        severity: "blocking",
        ownerEngine: "operational-status",
        currentValue: drifted.operationalStatus.packageState,
        expectedValue: "signed_off_stale",
      },
      {
        pass: buyout.packageReadiness.level === "blocked",
        fixtureId: "buyout-year",
        title: "Blocked lane is drifting into readiness",
        summary: "The buyout-year file should still stay blocked at the package level.",
        severity: "major",
        ownerEngine: "package-readiness",
        currentValue: buyout.packageReadiness.level,
        expectedValue: "blocked",
      },
      {
        pass: supported.returnPackageArtifacts.overallStatus !== "blocked",
        fixtureId: "supported-core",
        title: "Supported-core package artifacts are blocked",
        summary: "The supported file should keep the package artifact pipeline open.",
        severity: "minor",
        ownerEngine: "return-package-artifacts",
        currentValue: supported.returnPackageArtifacts.overallStatus,
        expectedValue: "ready or provisional",
      },
    ]
  );
}

function industry(): TinaTraitGateResult {
  const creator = getReport("creator-media");
  const dirty = getReport("dirty-books");
  const retail = getReport("sales-tax-authority");
  return buildResult(
    "industry_and_scenario_familiarity",
    ["industry-playbooks", "industry-evidence-matrix", "tax-planning-memo"],
    ["creator-media", "dirty-books", "sales-tax-authority"],
    [
      {
        pass: creator.industryEvidenceMatrix.overallStatus !== "missing",
        fixtureId: "creator-media",
        title: "Creator industry evidence is still missing",
        summary: "The creator playbook should drive at least partial industry evidence coverage.",
        severity: "major",
        ownerEngine: "industry-evidence-matrix",
        currentValue: creator.industryEvidenceMatrix.overallStatus,
        expectedValue: "covered or partial",
      },
      {
        pass: dirty.industryPlaybooks.primaryIndustryId === "skilled_trades",
        fixtureId: "dirty-books",
        title: "Skilled-trades file lost its industry identity",
        summary: "The dirty-books contractor file should still identify as skilled trades.",
        severity: "major",
        ownerEngine: "industry-playbooks",
        currentValue: String(dirty.industryPlaybooks.primaryIndustryId),
        expectedValue: "skilled_trades",
      },
      {
        pass: retail.taxPlanningMemo.items.length >= 2,
        fixtureId: "sales-tax-authority",
        title: "Retail planning depth is too shallow",
        summary: "The ecommerce retail case should produce multiple planning memo items.",
        severity: "major",
        ownerEngine: "tax-planning-memo",
        currentValue: `${retail.taxPlanningMemo.items.length} planning item(s)`,
        expectedValue: "2 or more planning items",
      },
    ]
  );
}

function ethics(): TinaTraitGateResult {
  const thin = getReport("thin-proof");
  const dirty = getReport("dirty-books");
  const buyout = getReport("buyout-year");
  return buildResult(
    "ethics_and_professional_responsibility",
    ["form-readiness", "tax-treatment-policy", "start-path"],
    ["thin-proof", "dirty-books", "buyout-year"],
    [
      {
        pass: thin.formReadiness.level !== "reviewer_ready",
        fixtureId: "thin-proof",
        title: "Thin-proof file is overstating readiness",
        summary: "Thin proof should stay below reviewer-ready.",
        severity: "blocking",
        ownerEngine: "form-readiness",
        currentValue: thin.formReadiness.level,
        expectedValue: "not reviewer_ready",
      },
      {
        pass: dirty.treatmentJudgment.items.some((item) => item.taxPositionBucket === "reject"),
        fixtureId: "dirty-books",
        title: "Dirty-books file is not failing closed",
        summary: "The dirty-books file should still reject at least one unsafe position.",
        severity: "major",
        ownerEngine: "tax-treatment-policy",
        currentValue: `${dirty.treatmentJudgment.items.filter((item) => item.taxPositionBucket === "reject").length} reject bucket(s)`,
        expectedValue: "1 or more reject buckets",
      },
      {
        pass: buyout.startPath.route === "blocked",
        fixtureId: "buyout-year",
        title: "Buyout-year file is not failing closed at route time",
        summary: "The buyout-year file should still block when route proof is weak.",
        severity: "major",
        ownerEngine: "start-path",
        currentValue: buyout.startPath.route,
        expectedValue: "blocked",
      },
    ]
  );
}

function practice(): TinaTraitGateResult {
  const dirty = getReport("dirty-books");
  const drifted = getReport("drifted-package");
  const salesTax = getReport("sales-tax-authority");
  return buildResult(
    "practice_judgment",
    ["materiality-priority", "operational-status", "planning-action-board"],
    ["dirty-books", "drifted-package", "sales-tax-authority"],
    [
      {
        pass: dirty.materialityPriority.items.filter((item) => item.priority === "immediate").length <= 4,
        fixtureId: "dirty-books",
        title: "Dirty-books immediate queue is too broad",
        summary: "Practice judgment should narrow the immediate dirty-books queue.",
        severity: "major",
        ownerEngine: "materiality-priority",
        currentValue: `${dirty.materialityPriority.items.filter((item) => item.priority === "immediate").length} immediate item(s)`,
        expectedValue: "4 or fewer immediate items",
      },
      {
        pass: drifted.operationalStatus.packageState === "signed_off_stale",
        fixtureId: "drifted-package",
        title: "Drifted package is not being escalated first",
        summary: "Practice judgment should always elevate stale signoff immediately.",
        severity: "blocking",
        ownerEngine: "operational-status",
        currentValue: drifted.operationalStatus.packageState,
        expectedValue: "signed_off_stale",
      },
      {
        pass: salesTax.planningActionBoard.items.some(
          (item) => item.status === "advance" && item.priority === "immediate"
        ),
        fixtureId: "sales-tax-authority",
        title: "Strong opportunity is not being sequenced aggressively",
        summary: "A strong authority-backed item should surface as immediate advance work.",
        severity: "major",
        ownerEngine: "planning-action-board",
        currentValue: `${salesTax.planningActionBoard.items.filter((item) => item.status === "advance" && item.priority === "immediate").length} immediate advance item(s)`,
        expectedValue: "1 or more immediate advance items",
      },
    ]
  );
}

export function buildTinaEightFloorGate(): TinaEightFloorGateSnapshot {
  if (!cachedEightFloorGateSnapshot) {
    const results = [
      technicalTaxLaw(),
      accountingFluency(),
      factPattern(),
      entityPath(),
      treatment(),
      evidence(),
      risk(),
      planning(),
      forms(),
      review(),
      documentation(),
      communication(),
      workflow(),
      industry(),
      ethics(),
      practice(),
    ];
    const passingTraitCount = results.filter((result) => result.status === "pass").length;
    const failingTraitCount = results.length - passingTraitCount;

    cachedEightFloorGateSnapshot = {
      generatedAt: new Date().toISOString(),
      targetScore: TARGET_SCORE,
      overallStatus: failingTraitCount === 0 ? "pass" : "fail",
      summary:
        failingTraitCount === 0
          ? "Every Tina trait is currently meeting the 8-floor gate."
          : `${failingTraitCount} Tina trait${failingTraitCount === 1 ? "" : "s"} are still below the 8-floor gate.`,
      passingTraitCount,
      failingTraitCount,
      results,
    };
  }

  const snapshot = structuredClone(cachedEightFloorGateSnapshot);
  snapshot.generatedAt = new Date().toISOString();
  return snapshot;
}
