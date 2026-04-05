import { buildTinaEntityContinuitySignalProfileFromText } from "@/tina/lib/entity-continuity-signals";
import { buildTinaEntityFilingRemediationSignalProfileFromText } from "@/tina/lib/entity-filing-remediation-signals";
import { buildTinaSingleMemberEntityHistorySignalProfileFromText } from "@/tina/lib/single-member-entity-history-signals";
import { buildTinaSingleOwnerCorporateRouteSignalProfileFromText } from "@/tina/lib/single-owner-corporate-route-signals";
import type {
  TinaWeirdSmallBusinessBenchmarkAnswer,
  TinaWeirdSmallBusinessBenchmarkConfidence,
  TinaWeirdSmallBusinessDiagnosticHypothesisSnapshot,
  TinaWeirdSmallBusinessDiagnosticPreflight,
  TinaWeirdSmallBusinessDiagnosticPreflightPosture,
  TinaWeirdSmallBusinessScenario,
} from "@/tina/lib/weird-small-business-benchmark-contracts";
import { buildTinaOwnerFlowBasisSignalProfileFromText } from "@/tina/lib/owner-flow-basis-adjudication";
import { buildTinaPayrollComplianceSignalProfileFromText } from "@/tina/lib/payroll-compliance-signals";
import {
  buildTinaTreatmentAnalogicalProfileFromText,
  buildTinaTreatmentAnalogicalResolutions,
} from "@/tina/lib/treatment-proof-resolver";
import { buildTinaWeirdSmallBusinessEntityAmbiguity } from "@/tina/lib/weird-small-business-entity-ambiguity";
import { buildTinaWeirdSmallBusinessDiagnosticLane } from "@/tina/lib/weird-small-business-diagnostic-lanes";

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function hasAny(text: string, patterns: Array<string | RegExp>): boolean {
  return patterns.some((pattern) =>
    typeof pattern === "string" ? text.includes(pattern) : pattern.test(text)
  );
}

function pushAll(target: string[], values: string[]) {
  values.forEach((value) => {
    if (value) {
      target.push(value);
    }
  });
}

export function buildTinaWeirdSmallBusinessDiagnosticPreflight(
  scenario: TinaWeirdSmallBusinessScenario
): TinaWeirdSmallBusinessDiagnosticPreflight {
  const rawScenarioText = [
    scenario.title,
    scenario.summary,
    scenario.factPattern,
    ...scenario.diagnosticProblems,
    ...scenario.missingFactsToConfirm,
    ...scenario.cleanupStepsFirst,
  ].join(" ");
  const haystack = normalizeText(
    rawScenarioText
  );

  const signalIds: string[] = [];
  const classifications: string[] = [];
  const filings: string[] = [];
  const risks: string[] = [];
  const facts: string[] = [];
  const cleanup: string[] = [];
  const priorityFacts: string[] = [];
  const priorityCleanup: string[] = [];
  const federalIssues: string[] = [];
  const stateIssues: string[] = [];

  const mark = (signalId: string) => {
    signalIds.push(signalId);
  };
  const ownerFlowBasisSignals = buildTinaOwnerFlowBasisSignalProfileFromText(haystack);
  const continuitySignals = buildTinaEntityContinuitySignalProfileFromText(rawScenarioText);
  const remediationSignals =
    buildTinaEntityFilingRemediationSignalProfileFromText(rawScenarioText);
  const singleMemberEntityHistorySignals =
    buildTinaSingleMemberEntityHistorySignalProfileFromText(rawScenarioText);
  const payrollSignals = buildTinaPayrollComplianceSignalProfileFromText(rawScenarioText);
  const singleOwnerCorporateSignals =
    buildTinaSingleOwnerCorporateRouteSignalProfileFromText(rawScenarioText);

  const singleMemberLlc =
    hasAny(haystack, ["single member llc", "single-owner business", "single owner"]) ||
    remediationSignals.hasSingleOwnerSignal ||
    singleMemberEntityHistorySignals.singleMemberSignal ||
    singleMemberEntityHistorySignals.solePropSignal;
  const multiOwner = hasAny(haystack, [
    "two or more members",
    "multiple owners",
    "multi owner",
    "multi-member llc",
    "partner exit",
    "new owner",
    "profit informally",
  ]) || remediationSignals.hasMultiOwnerSignal || singleMemberEntityHistorySignals.multiOwnerSignal;
  const spouseOwned =
    hasAny(haystack, ["married couple", "husband wife", "spouse"]) ||
    singleMemberEntityHistorySignals.spouseSignal;
  const communityProperty =
    hasAny(haystack, ["community property"]) ||
    singleMemberEntityHistorySignals.communityPropertySignal;
  const sElection = hasAny(haystack, [
    "s corp",
    "s-corp",
    "1120-s",
    "2553",
    "reasonable compensation",
  ]) || remediationSignals.electionLanes.includes("1120_s");
  const cCorp =
    hasAny(haystack, ["c corp", "c-corp", "1120"]) ||
    remediationSignals.electionLanes.includes("1120");
  const ownershipChange = hasAny(haystack, [
    "buyout",
    "redemption",
    "owner enter",
    "owner exit",
    "ownership changed",
    "inheritance",
    "divorce",
    "sold interests",
  ]) || singleMemberEntityHistorySignals.ownershipChangeSignal;
  const basisOrCapital = hasAny(haystack, [
    "basis",
    "capital account",
    "contributed",
    "distribution",
    "draw",
    "owner loan",
    "loan",
    "equity",
  ]) ||
    ownerFlowBasisSignals.basisSignal ||
    ownerFlowBasisSignals.loanSignal ||
    ownerFlowBasisSignals.contributionSignal ||
    ownerFlowBasisSignals.distributionSignal;
  const workerClassification = hasAny(haystack, [
    "contractor",
    "employee",
    "workers paid as contractors",
    "household",
    "personal helpers",
  ]) || payrollSignals.contractorSignal;
  const payroll =
    hasAny(haystack, ["payroll", "941", "w-2", "w-3", "reasonable compensation"]) ||
    payrollSignals.payrollSignal ||
    payrollSignals.payrollProviderSignal ||
    payrollSignals.manualPayrollSignal ||
    payrollSignals.ownerCompSignal;
  const infoReturns = hasAny(haystack, ["1099", "w-9"]);
  const mixedSpend = hasAny(haystack, [
    "personal and business spending",
    "mixed personal business",
    "personal helpers through the business",
  ]);
  const noBooks = hasAny(haystack, ["no bookkeeping", "build the books", "weak books", "books were never tracked"]);
  const cashBusiness = hasAny(haystack, ["cash business", "cash sales", "incomplete sales"]);
  const priorReturnDrift =
    hasAny(haystack, ["prior-year returns do not match", "prior return", "filed return family"]) ||
    remediationSignals.hasPriorReturnFamilySignal ||
    remediationSignals.hasPriorPreparerMismatchSignal ||
    singleMemberEntityHistorySignals.priorReturnSignal ||
    singleMemberEntityHistorySignals.priorReturnMismatchSignal;
  const missedFilings =
    hasAny(haystack, ["missing schedule c", "missing partnership returns", "missed filings", "late or missing", "never started correctly"]) ||
    remediationSignals.hasMissingReturnSignal;
  const mixedUseVehicle = hasAny(haystack, ["vehicle", "mileage"]);
  const homeOffice = hasAny(haystack, ["home office"]);
  const capitalization = hasAny(haystack, ["capitalization", "capitalized", "improvements were expensed", "repairs", "hvac", "build-outs", "equipment"]);
  const assetDisposition = hasAny(haystack, ["sold", "traded", "repo", "abandoned", "disposed"]);
  const inventory = hasAny(haystack, ["inventory", "cogs", "product business", "retailer"]);
  const debtForgiveness = hasAny(haystack, ["debt forgiven", "cancellation of debt", "settled", "written off by a lender", "1099-c"]);
  const multiState = hasAny(haystack, ["formed in one state", "operating in another", "nexus", "sales-tax", "sales tax", "registration"]);
  const relatedParty = hasAny(haystack, ["related party", "intercompany", "personal helpers through the business"]);
  const singleMemberHistoryPressure =
    singleMemberEntityHistorySignals.priorReturnMismatchSignal ||
    singleMemberEntityHistorySignals.booksNotCaughtUpSignal ||
    singleMemberEntityHistorySignals.transitionTimelineSignal ||
    singleMemberEntityHistorySignals.ownershipChangeSignal;
  const singleMemberHistoryConflict =
    singleMemberEntityHistorySignals.booksNotCaughtUpSignal ||
    singleMemberEntityHistorySignals.transitionTimelineSignal ||
    singleMemberEntityHistorySignals.ownershipChangeSignal;

  if (singleMemberLlc) {
    mark("single_member_llc");
    pushAll(classifications, [
      "disregarded_entity",
      "s_corporation_if_elected",
      "c_corporation_if_elected",
      ...(sElection ? ["s_corporation_if_valid_or_relieved_election"] : []),
      ...(cCorp ? ["c_corporation_if_valid_election_exists"] : []),
    ]);
    pushAll(filings, ["Form 1040 Schedule C"]);
    pushAll(federalIssues, [
      "Federal return family depends on the actual election trail, not the LLC label alone.",
    ]);
    pushAll(facts, [
      "Filed Form 2553 or Form 8832",
      "Prior-year filed return family",
      "EIN notices and IRS correspondence",
      "IRS election acceptance or EIN notices",
    ]);
  }

  if (singleMemberLlc && singleMemberHistoryPressure) {
    if (singleMemberHistoryConflict) {
      mark("single_member_history_conflict");
    }
    pushAll(classifications, ["depends_on_transition_timeline"]);
    pushAll(risks, [
      "Prior filings may contradict current bookkeeping posture.",
      "Books may still label owner draws, wages, or equity incorrectly.",
    ]);
    pushAll(priorityFacts, [
      "How many owners existed at opening and closing, and did that change during the year",
      "Whether payroll was run as if it were an S corp",
      "When the books, payroll, and owner-equity labels actually changed",
    ]);
    pushAll(facts, [
      "How many owners existed at opening and closing, and did that change during the year",
      "Whether payroll was run as if it were an S corp",
      "When the books, payroll, and owner-equity labels actually changed",
    ]);
    pushAll(priorityCleanup, [
      "Rebuild owner-count and entity-history timeline before trusting single-member treatment.",
      "Align current books, payroll, and owner-pay labels to the actual tax posture.",
    ]);
    pushAll(cleanup, [
      "Rebuild owner-count and entity-history timeline before trusting single-member treatment.",
      "Align current books, payroll, and owner-pay labels to the actual tax posture.",
    ]);
    pushAll(federalIssues, [
      "A single-member answer can fail if prior filings, owner history, or books catch-up do not support it.",
    ]);
    pushAll(stateIssues, [
      "State accounts and annual reports may still reflect an older entity posture.",
    ]);
  }

  if (singleMemberEntityHistorySignals.transitionTimelineSignal) {
    mark("transition_year_ownership_proof");
  }

  if (singleMemberEntityHistorySignals.booksNotCaughtUpSignal) {
    mark("books_not_caught_up");
  }

  if (
    singleMemberLlc &&
    (
      singleOwnerCorporateSignals.sCorpSignal ||
      singleOwnerCorporateSignals.cCorpSignal ||
      singleOwnerCorporateSignals.corporateSignal ||
      singleOwnerCorporateSignals.electionSignal
    )
  ) {
    mark("single_owner_corporate_route");
    pushAll(risks, [
      "Single-owner files can look corporate operationally while still lacking the election or route proof that makes the federal path real.",
    ]);
    pushAll(facts, [
      "Form 2553 or Form 8832 and any IRS acceptance or rejection trail",
      "Whether the owner worked actively in the business",
      "How cash left the business: wages, draws, or distributions",
    ]);
    pushAll(cleanup, [
      "Settle the single-owner corporate election trail before trusting wages, draws, or shareholder distributions.",
    ]);
    pushAll(federalIssues, [
      "Single-owner corporate posture depends on the actual election trail, not books or payroll labels alone.",
    ]);
  }

  if (
    singleMemberLlc &&
    (priorReturnDrift ||
      remediationSignals.hasElectionUnprovedSignal ||
      remediationSignals.hasPriorReturnFamilySignal)
  ) {
    pushAll(priorityFacts, ["EIN notices and IRS correspondence"]);
    pushAll(filings, ["Form 2553", "Form 1120-S", "Form 1120"]);
  }

  if (multiOwner) {
    mark("multi_owner");
    pushAll(classifications, [
      "partnership",
      "s_corporation_if_valid_election_exists",
    ]);
    pushAll(filings, ["Form 1065", "Schedule K-1"]);
    pushAll(risks, [
      "Ownership economics can be wrong if Tina does not reconstruct capital, allocations, and timing first.",
      "Informal profit sharing can hide an unfiled partnership return family.",
    ]);
    pushAll(facts, [
      "Ownership timeline and percentages",
      "Operating agreement or ownership breakdown",
      "Capital contributions, draws, and allocation intent",
    ]);
    pushAll(cleanup, [
      "Establish the real ownership timeline before preparing any entity return.",
    ]);
    pushAll(federalIssues, [
      "A multi-owner LLC generally defaults to partnership treatment absent a valid election.",
    ]);
    pushAll(stateIssues, ["State partnership returns, LLC fees, or registration posture may also be missing."]);
  }

  if (spouseOwned) {
    mark("spouse_owned");
    if (communityProperty) {
      mark("spouse_exception_candidate");
    }
    pushAll(priorityFacts, ["Whether both spouses materially participate"]);
    pushAll(classifications, [
      "qualified_joint_venture_in_narrow_cases",
      "partnership",
      "sole_proprietorship_in_narrow_cases",
    ]);
    pushAll(facts, [
      "State of residence and property-law posture",
      "Which spouse legally owns the business or assets",
      "How prior years were filed",
      "Whether both spouses materially participate",
    ]);
    pushAll(risks, [
      "The right federal filing path depends on state-law and ownership facts, not just family relationships.",
    ]);
  }

  if (communityProperty) {
    mark("community_property");
    pushAll(stateIssues, [
      "Community-property treatment can change how income and ownership are analyzed at the state-law level.",
    ]);
  }

  if (sElection) {
    mark("s_election");
    pushAll(classifications, [
      "s_corporation_if_valid_or_relieved_election",
      ...(multiOwner
        ? ["default_llc_or_partnership_if_election_failed"]
        : ["default_llc_or_c_corp_if_not"]),
    ]);
    pushAll(filings, ["Form 2553", "Form 1120-S"]);
    pushAll(risks, [
      "Books and payroll may reflect S-corp behavior even if the election failed or relief was never secured.",
    ]);
    pushAll(facts, [
      "Form 2553 and IRS acceptance",
      "When payroll started and how owner compensation was treated",
    ]);
    pushAll(cleanup, [
      "Verify the S-election trail or relief path before trusting the S-corp posture.",
    ]);
    pushAll(federalIssues, [
      "Reasonable compensation and payroll treatment matter if S-corp treatment stands.",
    ]);
  }

  if (
    sElection &&
    singleOwnerCorporateSignals.noPayrollSignal &&
    (
      singleOwnerCorporateSignals.ownerServiceSignal ||
      singleOwnerCorporateSignals.distributionSignal ||
      singleOwnerCorporateSignals.drawSignal ||
      singleOwnerCorporateSignals.reasonableCompSignal
    )
  ) {
    mark("s_corp_no_payroll");
    pushAll(filings, ["Form 941", "Form 940", "Form W-2", "Form W-3"]);
    pushAll(risks, [
      "Single-owner S-corp treatment with no payroll can make reasonable-comp, wage deductions, and shareholder distributions unreliable.",
    ]);
    pushAll(priorityFacts, [
      "What work the owner performed in the business",
      "Whether any payroll account or provider ever existed",
      "How cash actually left the business: wages, draws, or distributions",
    ]);
    pushAll(facts, [
      "What work the owner performed in the business",
      "Whether any payroll account or provider ever existed",
      "How cash actually left the business: wages, draws, or distributions",
    ]);
    pushAll(priorityCleanup, [
      "Resolve payroll posture before trusting shareholder distribution characterization.",
    ]);
    pushAll(cleanup, [
      "Resolve payroll posture before trusting shareholder distribution characterization.",
    ]);
    pushAll(federalIssues, [
      "If S-corp treatment stands, reasonable compensation and payroll compliance are still open.",
    ]);
    pushAll(stateIssues, [
      "State payroll, unemployment, and wage reporting may also be missing if no-payroll S-corp treatment was used.",
    ]);
  }

  if (cCorp) {
    mark("c_corp");
    pushAll(classifications, ["c_corporation_if_valid_election_exists"]);
    pushAll(filings, ["Form 1120"]);
  }

  if (ownershipChange) {
    mark("ownership_change");
    pushAll(risks, [
      "Midyear ownership changes can alter allocations, redemptions, and basis-sensitive treatment.",
    ]);
    pushAll(facts, [
      "Who transferred what, when, and whether the entity redeemed interests or owners sold directly",
      "Cash, note, or payout economics tied to the ownership change",
    ]);
    pushAll(cleanup, [
      "Build the ownership-change economics before final allocations or basis-sensitive treatment.",
    ]);
    pushAll(stateIssues, ["State transfer documents may be the best proof of the ownership timeline."]);
  }

  if (basisOrCapital) {
    mark("basis_or_capital");
    pushAll(risks, [
      "Basis, capital-account, or debt-versus-equity treatment may be wrong.",
    ]);
    pushAll(facts, [
      "Opening basis or capital",
      "Contribution, loan, draw, and distribution history",
    ]);
    pushAll(cleanup, [
      "Reconstruct basis, capital, and owner-flow schedules before characterizing distributions or losses.",
    ]);
    pushAll(federalIssues, [
      "Basis and capital tracking can change distribution taxability, loss use, and debt treatment.",
    ]);
  }

  if (ownerFlowBasisSignals.capitalRollforwardSignal || ownerFlowBasisSignals.priorBasisSignal) {
    pushAll(risks, [
      "Beginning-versus-ending owner footing may drift if Tina cannot tie the rollforward back to prior filed history.",
    ]);
    pushAll(facts, [
      "Beginning basis or capital tied to filed prior-year returns",
      "Current-year rollforward showing how owner footing changed during the year",
    ]);
    pushAll(cleanup, [
      "Tie opening owner footing to a real beginning-to-ending rollforward before trusting current-year owner economics.",
    ]);
    pushAll(federalIssues, [
      "Basis rollforward continuity can change distribution taxability, loss use, and owner-level conclusions.",
    ]);
  }

  if (ownerFlowBasisSignals.loanSignal) {
    pushAll(risks, [
      "Loan-versus-equity posture may be overstated if owner funding moved without debt terms or repayment proof.",
    ]);
    pushAll(facts, [
      "Promissory notes, repayment history, and any interest terms",
      "Whether the parties expected repayment or permanent capital treatment",
    ]);
    pushAll(cleanup, [
      "Separate true owner loans from capital infusions and distributions before finalizing basis-sensitive treatment.",
    ]);
    pushAll(federalIssues, [
      "Debt-versus-equity posture can change basis, deduction, distribution, and owner-level taxability analysis.",
    ]);
  }

  if (ownerFlowBasisSignals.formerOwnerPaymentSignal || ownerFlowBasisSignals.buyoutSignal) {
    pushAll(risks, [
      "Former-owner payouts or buyout economics can change allocation timing, redemption treatment, and ending owner footing.",
    ]);
    pushAll(facts, [
      "Buyout, redemption, or former-owner payout documents",
      "How cash or notes changed hands in the owner transition",
    ]);
    pushAll(cleanup, [
      "Reconstruct former-owner economics before trusting transition-year allocations or basis-sensitive treatment.",
    ]);
  }

  if (ownerFlowBasisSignals.sweatEquitySignal) {
    pushAll(risks, [
      "Cash, labor, and property contributions may not line up cleanly with ownership economics or basis treatment.",
    ]);
    pushAll(facts, [
      "What value each owner contributed in cash, property, labor, or assumed liabilities",
      "Any side agreement showing how labor-for-equity economics were meant to work",
    ]);
    pushAll(cleanup, [
      "Separate cash, property, and labor contributions before trusting capital, basis, or allocation conclusions.",
    ]);
  }

  if (ownerFlowBasisSignals.distributionSignal && !basisOrCapital) {
    mark("basis_or_capital");
    pushAll(risks, [
      "Owner distributions or draws are basis-sensitive even if the rest of the books look casual.",
    ]);
    pushAll(facts, [
      "Opening owner basis or capital",
      "Current-year contributions, loans, losses, and distributions",
    ]);
    pushAll(cleanup, [
      "Reconstruct basis or capital before characterizing owner distributions as nontaxable or taxable.",
    ]);
  }

  if (workerClassification) {
    mark("worker_classification");
    pushAll(risks, [
      "Worker classification can trigger payroll exposure, deduction reclassifications, and information-return cleanup.",
    ]);
    pushAll(facts, [
      "Behavioral control, financial control, and relationship facts for the workers",
      "How labor was paid and documented",
    ]);
    pushAll(cleanup, [
      "Decide the employee-versus-contractor boundary before finalizing payroll or contractor reporting.",
    ]);
    pushAll(federalIssues, [
      "Employment-tax exposure can exist even when workers were paid as contractors.",
    ]);
    pushAll(stateIssues, ["State payroll and unemployment filings may be out of compliance if workers were misclassified."]);
  }

  if (payroll) {
    mark("payroll");
    pushAll(filings, ["Form 941", "Form W-2", "Form W-3"]);
    pushAll(facts, [
      "Which quarters were run through payroll",
      "Which payroll tax deposits actually cleared",
      "Whether year-end wage forms were filed",
      "Who owned payroll filing access and payroll provider setup",
      "Owner compensation versus distributions",
    ]);
    pushAll(cleanup, [
      "Reconcile payroll filings, deposits, and owner-compensation treatment before the income-tax return.",
    ]);
    pushAll(risks, [
      "Wage expense can be real while payroll compliance is still broken or incomplete.",
    ]);
  }

  if (payrollSignals.payrollProviderSignal) {
    pushAll(facts, ["Payroll provider reports and account-access trail"]);
  }

  if (payrollSignals.manualPayrollSignal) {
    pushAll(risks, [
      "Manual payroll often leaves a weaker quarterly and deposit trail than the wage expense alone suggests.",
    ]);
  }

  if (payrollSignals.missedComplianceSignal) {
    pushAll(risks, [
      "Payroll happened operationally, but the compliance trail appears broken or inconsistent.",
    ]);
    pushAll(cleanup, [
      "Map missing 941, W-2/W-3, and deposit periods before treating wages as clean.",
    ]);
  }

  if (infoReturns) {
    mark("info_returns");
    pushAll(filings, ["Form 1099-NEC", "Form W-9 collection"]);
    pushAll(risks, ["Information-return compliance may be missing for contractors or vendors."]);
    pushAll(facts, ["Vendor W-9 collection and 1099 filing history"]);
  }

  if (mixedSpend) {
    mark("mixed_spend");
    pushAll(risks, [
      "Personal and business spending are mixed, so deductions and owner-flow labels may be unreliable.",
    ]);
    pushAll(facts, ["Whether mixed charges were personal, owner draws, or business expenses"]);
    pushAll(cleanup, [
      "Separate personal, owner, and business charges before final tax treatment.",
    ]);
    pushAll(federalIssues, [
      "Deduction support is weak until mixed personal and business spending is separated cleanly.",
    ]);
  }

  if (noBooks) {
    mark("no_books");
    pushAll(risks, ["The file is a books-reconstruction job, not a normal return-prep job."]);
    pushAll(cleanup, ["Rebuild the books from primary records before preparing the return."]);
    pushAll(facts, ["Which records exist: bank statements, merchant reports, ledgers, payroll reports"]);
  }

  if (cashBusiness) {
    mark("cash_business");
    pushAll(risks, ["Income reconstruction and audit-risk pressure are high because sales records are incomplete."]);
    pushAll(cleanup, ["Reconstruct gross receipts from deposits, merchant data, and other primary records first."]);
    pushAll(federalIssues, ["Federal income reporting is unreliable until gross receipts are reconstructed."]);
  }

  if (priorReturnDrift) {
    mark("prior_return_drift");
    pushAll(classifications, ["depends_on_entity"]);
    pushAll(priorityFacts, ["Prior-year filed returns"]);
    pushAll(risks, [
      "Prior returns may not match the current books or current entity posture.",
      "Beginning balances may be wrong.",
    ]);
    pushAll(cleanup, ["Decide whether the mismatch is a bookkeeping adjustment, amended-return issue, or both."]);
    pushAll(facts, ["Which prior returns were actually filed and how current books diverge from them"]);
    pushAll(federalIssues, ["Need to distinguish current-year adjustment from prior-year filing error."]);
    pushAll(stateIssues, ["State amended-return posture may follow the federal decision."]);
  }

  if (remediationSignals.hasOwnerCountDuringYearSignal) {
    pushAll(priorityFacts, ["How many owners existed during the year and when"]);
    pushAll(facts, ["How many owners existed during the year and when"]);
  }

  if (remediationSignals.hasElectionSignal || remediationSignals.hasElectionUnprovedSignal) {
    pushAll(priorityFacts, ["Any election documents"]);
    pushAll(facts, ["Any election documents", "EIN notices and IRS correspondence"]);
  }

  if (remediationSignals.hasInitialEntityTypeSignal) {
    pushAll(priorityFacts, ["Initial entity type"]);
    pushAll(facts, ["Initial entity type"]);
  }

  if (remediationSignals.hasBeginningBalanceDriftSignal) {
    pushAll(risks, ["Beginning balances may be wrong."]);
    pushAll(priorityFacts, ["Beginning balances tied to filed prior-year returns"]);
    pushAll(facts, ["Beginning balances tied to filed prior-year returns"]);
    pushAll(cleanup, ["Tie beginning balances to filed returns before finalizing the current year."]);
  }

  if (remediationSignals.hasAmendedReturnSignal || remediationSignals.hasAmendmentSequencingSignal) {
    pushAll(priorityFacts, [
      "Prior-year filed returns",
      "Any amended returns or amendment workpapers",
    ]);
    pushAll(facts, ["Prior-year filed returns", "Any amended returns or amendment workpapers"]);
    pushAll(cleanup, [
      "Separate current-year cleanup from amended-return pressure before locking the return posture.",
    ]);
    pushAll(federalIssues, ["Need to distinguish current-year adjustment from prior-year filing error."]);
    pushAll(stateIssues, ["State amended-return posture may follow the federal decision."]);
  }

  if (remediationSignals.hasExtensionSignal) {
    pushAll(facts, ["Extension filings and filing history by year"]);
  }

  if (remediationSignals.hasPriorPreparerMismatchSignal) {
    pushAll(priorityFacts, ["Whether prior preparers changed return families correctly"]);
    pushAll(facts, ["Whether prior preparers changed return families correctly"]);
  }

  if (remediationSignals.hasTransitionTimelineSignal) {
    pushAll(priorityFacts, ["Election dates"]);
    pushAll(facts, ["Election dates"]);
    pushAll(stateIssues, ["State accounts may still reflect the old operating posture."]);
  }

  if (
    remediationSignals.hasStateRegistrationDriftSignal ||
    (singleMemberLlc &&
      (priorReturnDrift || remediationSignals.hasElectionUnprovedSignal))
  ) {
    pushAll(stateIssues, [
      "Entity registration and annual report posture may not match federal classification history.",
    ]);
  }

  if (
    remediationSignals.hasMissingReturnSignal ||
    remediationSignals.likelyMissingLanes.length > 0
  ) {
    pushAll(risks, ["Prior filings may have been omitted completely."]);
    pushAll(
      multiOwner ? cleanup : priorityCleanup,
      ["Map the missing filing years and filing families before preparing only the current year."]
    );
  }

  if (
    continuitySignals.priorFilingLanes.length > 0 &&
    continuitySignals.electionLanes.length > 0 &&
    continuitySignals.electionLanes.some(
      (laneId) => !continuitySignals.priorFilingLanes.includes(laneId)
    )
  ) {
    mark("prior_return_drift");
    pushAll(risks, [
      "Prior filed return posture may now be stale relative to the current election or conversion story.",
    ]);
    pushAll(facts, [
      "Which prior filing family is stale versus current",
      "Exact election or conversion effective date",
    ]);
    pushAll(cleanup, [
      "Build the entity continuity timeline before trusting either the old return family or the new election story.",
    ]);
    pushAll(federalIssues, [
      "The current-year return family can change if the old filing posture is stale and the transition timing is real.",
    ]);
  }

  if (continuitySignals.hasLateElectionSignal) {
    mark("s_election");
    pushAll(priorityFacts, [
      "Prior-year filed returns",
      "IRS acceptance, rejection, or late-election relief support",
    ]);
    pushAll(risks, [
      "Late-election relief or missing election acceptance can change the federal return family entirely.",
    ]);
    pushAll(facts, [
      "IRS acceptance, rejection, or late-election relief support",
    ]);
    pushAll(cleanup, [
      "Verify the election acceptance or relief posture before Tina trusts payroll and distribution labels.",
    ]);
    pushAll(federalIssues, [
      "Return family changes completely if the election was invalid.",
    ]);
  }

  if (continuitySignals.hasEntityChangeSignal) {
    mark("prior_return_drift");
    mark("single_member_history_conflict");
    pushAll(classifications, ["depends_on_transition_timeline"]);
    pushAll(priorityFacts, [
      "Exact legal conversion dates",
      "When separate entity books and payroll actually started",
    ]);
    pushAll(priorityCleanup, [
      "Build a transition timeline first so Tina does not mix old-entity and current-entity posture.",
    ]);
    pushAll(risks, [
      "Entity conversion timing can leave books and filed returns out of sync with the real tax posture.",
      "Return family may have changed midstream without operational follow-through.",
    ]);
    pushAll(facts, [
      "Exact legal conversion dates",
      "When separate entity books and payroll actually started",
    ]);
    pushAll(cleanup, [
      "Build a transition timeline first so Tina does not mix old-entity and current-entity posture.",
    ]);
  }

  if (
    continuitySignals.hasOwnershipChangeSignal ||
    continuitySignals.hasBuyoutSignal ||
    continuitySignals.hasFormerOwnerSignal
  ) {
    mark("ownership_change");
    pushAll(facts, [
      "Opening versus closing owners and percentages",
      "Transfer, buyout, or former-owner payment documents",
    ]);
    pushAll(cleanup, [
      "Reconstruct the ownership timeline before final allocations, basis work, or entity classification.",
    ]);
  }

  if (continuitySignals.hasMultiStateSignal) {
    mark("multi_state");
    pushAll(facts, [
      "Formation state, qualification state, and actual operating footprint",
    ]);
    pushAll(cleanup, [
      "Separate federal entity classification from state registration and nexus cleanup.",
    ]);
  }

  if (missedFilings) {
    mark("missed_filings");
    pushAll(risks, ["Back-tax cleanup may involve multiple missing federal filing families, not just the current-year return."]);
    pushAll(filings, ["Delinquent federal income-tax returns", "Estimated tax review"]);
    pushAll(cleanup, ["Map the missing filing years and filing families before preparing only the current year."]);
    pushAll(federalIssues, ["Income tax, self-employment tax, payroll, and information returns may all be missing."]);
  }

  if (mixedUseVehicle) {
    mark("mixed_use_vehicle");
    pushAll(filings, ["Form 4562"]);
    pushAll(risks, ["Mixed business and personal vehicle use needs defensible allocation support."]);
    pushAll(facts, ["Mileage logs or another defensible business-use method"]);
    pushAll(cleanup, ["Prove business-use allocation before claiming vehicle deductions."]);
  }

  if (homeOffice) {
    mark("home_office");
    pushAll(filings, ["Form 8829"]);
    pushAll(risks, ["Home-office claims need defensible business-use facts and allocation support."]);
    pushAll(facts, ["Exclusive-use and square-footage support for any home-office claim"]);
    pushAll(cleanup, ["Confirm home-office eligibility and allocation support before finalizing deductions."]);
  }

  if (capitalization) {
    mark("capitalization");
    pushAll(filings, ["Form 4562"]);
    pushAll(risks, ["Repairs versus capitalization and depreciation treatment may be wrong."]);
    pushAll(facts, ["Placed-in-service dates, asset descriptions, and depreciation history"]);
    pushAll(cleanup, ["Separate repairs from capital assets before final depreciation treatment."]);
    pushAll(federalIssues, ["Capitalization and depreciation choices can materially change current-year deductions."]);
  }

  if (assetDisposition) {
    mark("asset_disposition");
    pushAll(risks, ["Gain, loss, or recapture treatment may be wrong if basis and depreciation are missing."]);
    pushAll(facts, ["Original basis, depreciation history, and disposition details"]);
    pushAll(cleanup, ["Rebuild asset basis and depreciation before booking the sale, abandonment, or repossession."]);
  }

  if (ownerFlowBasisSignals.assetBasisSignal && !assetDisposition) {
    pushAll(risks, [
      "Asset-sensitive treatment still needs basis and depreciation footing before current-year treatment sounds final.",
    ]);
    pushAll(facts, [
      "Asset schedule with original cost and prior depreciation history",
    ]);
    pushAll(cleanup, [
      "Confirm asset basis and depreciation footing before finalizing any asset-sensitive treatment.",
    ]);
  }

  if (inventory) {
    mark("inventory");
    pushAll(risks, ["Inventory and COGS treatment are unreliable without counts and rollforwards."]);
    pushAll(facts, ["Inventory counts, rollforwards, and accounting method"]);
    pushAll(cleanup, ["Rebuild inventory counts and COGS support before trusting year-end gross margin."]);
    pushAll(federalIssues, ["Inventory accounting can change income materially and often requires deeper records than service businesses do."]);
  }

  if (debtForgiveness) {
    mark("debt_forgiveness");
    pushAll(filings, ["Form 1099-C", "Form 982 if an exclusion may apply"]);
    pushAll(risks, ["Cancellation-of-debt income or exclusion analysis may be live."]);
    pushAll(facts, ["Lender statements, settlement documents, and solvency/bankruptcy facts"]);
    pushAll(cleanup, ["Determine whether debt forgiveness creates taxable COD income or a supportable exclusion."]);
    pushAll(federalIssues, ["COD income and exclusion analysis can materially change the return."]);
  }

  if (multiState) {
    mark("multi_state");
    pushAll(risks, ["Federal return diagnosis is tangled with nexus, payroll, registration, or sales-tax facts across states."]);
    pushAll(facts, [
      "Formation state, qualification state, payroll locations, and where services or sales occurred",
      "State payroll, sales-tax, and registration accounts",
    ]);
    pushAll(cleanup, [
      "Separate the federal return-family question from the state registration and nexus cleanup.",
    ]);
    pushAll(stateIssues, [
      "State registration, nexus, payroll, and sales-tax obligations may be split across multiple states.",
    ]);
  }

  if (relatedParty) {
    mark("related_party");
    pushAll(risks, ["Related-party or intercompany flows may need stronger business-purpose and treatment support."]);
    pushAll(facts, ["Related-party agreements, business purpose, and how the flows were recorded"]);
  }

  const treatmentResolutions = buildTinaTreatmentAnalogicalResolutions(
    buildTinaTreatmentAnalogicalProfileFromText({
      text: haystack,
      signalIds,
      hasFixedAssets: capitalization || assetDisposition || mixedUseVehicle,
      hasInventory: inventory,
      hasPayroll: payroll,
      paysContractors: hasAny(haystack, ["contractor", "1099", "vendor"]),
      collectsSalesTax: hasAny(haystack, ["sales-tax", "sales tax", "marketplace facilitator"]),
      hasIdahoActivity: multiState,
      ownerCount: multiOwner || spouseOwned ? 2 : singleMemberLlc ? 1 : null,
      taxElection: sElection ? "s_corp" : cCorp ? "c_corp" : "unsure",
      entityType: multiOwner ? "multi_member_llc" : singleMemberLlc ? "single_member_llc" : "unsure",
    })
  );

  for (const resolution of treatmentResolutions) {
    pushAll(risks, [resolution.summary]);
    pushAll(facts, resolution.requiredProof);
    if (resolution.cleanupDependency !== "return_prep_ready") {
      pushAll(cleanup, [resolution.nextStep]);
    }
    pushAll(filings, resolution.likelyForms);
    pushAll(federalIssues, [resolution.suggestedTreatment]);
    if (resolution.federalStateSensitivity !== "federal_only") {
      pushAll(stateIssues, [
        `${resolution.title} can change once state-law, nexus, or state conformity facts are confirmed.`,
      ]);
    }
  }

  if (classifications.length === 0) {
    pushAll(classifications, ["depends_on_entity_and_election_history"]);
  }

  if (filings.length === 0) {
    pushAll(filings, ["Federal return family depends on the confirmed entity type and elections"]);
  }

  if (risks.length === 0) {
    pushAll(risks, ["The file has real classification, compliance, or record-quality uncertainty that should stay diagnostic first."]);
  }

  if (facts.length === 0) {
    pushAll(facts, ["The actual filed return history, entity documents, and primary books support"]);
  }

  if (cleanup.length === 0) {
    pushAll(cleanup, ["Confirm the legal and tax posture before finalizing return preparation."]);
  }

  if (federalIssues.length === 0) {
    pushAll(federalIssues, ["Federal return posture depends on resolving the entity, records, and treatment facts cleanly first."]);
  }

  if (stateIssues.length === 0) {
    pushAll(stateIssues, ["State registration, payroll, or legal-document posture may still matter once the federal path is settled."]);
  }

  const posture: TinaWeirdSmallBusinessDiagnosticPreflightPosture =
    scenario.group === "recordkeeping_and_cleanup_problems"
      ? "records_first"
      : scenario.group === "worker_classification_and_payroll_problems"
        ? "compliance_risk"
        : scenario.group === "entity_and_election_problems" ||
            scenario.group === "ownership_and_basis_problems"
          ? "route_sensitive"
          : "cleanup_heavy";

  const highUncertaintySignals = [
    multiOwner,
    spouseOwned,
    sElection,
    ownershipChange,
    ownerFlowBasisSignals.loanSignal,
    ownerFlowBasisSignals.distributionSignal,
    ownerFlowBasisSignals.debtForgivenessSignal,
    mixedSpend,
    noBooks,
    priorReturnDrift,
    missedFilings,
    multiState,
    continuitySignals.hasLateElectionSignal,
    continuitySignals.hasEntityChangeSignal,
    continuitySignals.hasOwnershipChangeSignal,
    continuitySignals.hasMultiStateSignal,
    cashBusiness,
  ].filter(Boolean).length;
  const confidenceCeiling: TinaWeirdSmallBusinessBenchmarkConfidence =
    highUncertaintySignals >= 3 ? "low" : highUncertaintySignals >= 1 ? "medium" : "high";

  const diagnosticLane = buildTinaWeirdSmallBusinessDiagnosticLane(scenario, {
    scenarioId: scenario.id,
    signalIds: unique(signalIds),
    posture,
    confidenceCeiling,
    likelyTaxClassifications: unique(classifications).slice(0, 5),
    likelyReturnsAndForms: unique(filings).slice(0, 8),
    factsToConfirmFirst: unique([...priorityFacts, ...facts]).slice(0, 8),
    cleanupStepsFirst: unique([...priorityCleanup, ...cleanup]).slice(0, 6),
  });

  const laneFacts = diagnosticLane.factBuckets.flatMap((bucket) => bucket.facts);
  const baseFacts = unique([...priorityFacts, ...laneFacts, ...facts]).slice(0, 8);
  const entityAmbiguity = buildTinaWeirdSmallBusinessEntityAmbiguity(scenario, {
    scenarioId: scenario.id,
    posture,
    confidenceCeiling: diagnosticLane.confidenceCeiling,
    signalIds: unique(signalIds),
    likelyTaxClassifications: unique([
      diagnosticLane.classificationAnchor,
      ...classifications,
    ]).slice(0, 4),
    factsToConfirmFirst: baseFacts,
  });

  return {
    scenarioId: scenario.id,
    posture,
    confidenceCeiling: diagnosticLane.confidenceCeiling,
    needsMoreFactsBeforePreparation: true,
    signalIds: unique(signalIds),
    likelyTaxClassifications: unique([
      diagnosticLane.classificationAnchor,
      ...entityAmbiguity.paths.map((path) => path.conclusion),
      ...classifications,
    ]).slice(0, 5),
    likelyReturnsAndForms: unique([
      ...diagnosticLane.filingLadder.map((item) => item.label),
      ...filings,
    ]).slice(0, 8),
    biggestRiskAreas: unique([...scenario.diagnosticProblems, ...risks]).slice(0, 8),
    factsToConfirmFirst: unique([...priorityFacts, ...entityAmbiguity.priorityQuestions, ...baseFacts]).slice(0, 8),
    cleanupStepsFirst: unique([...priorityCleanup, ...diagnosticLane.cleanupPriority, ...cleanup]).slice(0, 6),
    federalIssues: unique(federalIssues).slice(0, 6),
    stateIssues: unique(stateIssues).slice(0, 6),
    entityAmbiguity,
    diagnosticLane,
  };
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function buildLikelyClassificationAnswer(
  preflight: TinaWeirdSmallBusinessDiagnosticPreflight,
  diagnosticHypotheses?: TinaWeirdSmallBusinessDiagnosticHypothesisSnapshot
): string {
  const leadingClassification = diagnosticHypotheses?.hypotheses.find(
    (hypothesis) =>
      hypothesis.category === "tax_classification" && hypothesis.status === "leading"
  );
  const alternateClassification = diagnosticHypotheses?.hypotheses.find(
    (hypothesis) =>
      hypothesis.category === "tax_classification" && hypothesis.status === "plausible"
  );
  const classifications = unique([
    leadingClassification?.conclusion ?? "",
    alternateClassification?.conclusion ?? "",
    preflight.diagnosticLane.classificationAnchor,
    ...preflight.entityAmbiguity.paths.map((path) => path.conclusion),
    ...preflight.likelyTaxClassifications,
  ]);
  const hasSCorp = classifications.some((item) => item.includes("s_corporation"));
  const hasCCorp = classifications.some((item) => item.includes("c_corporation"));
  const prefersTransitionTimeline =
    classifications.includes("depends_on_transition_timeline") &&
    (preflight.diagnosticLane.classificationAnchor === "depends_on_transition_timeline" ||
      preflight.signalIds.some((signalId) =>
        [
          "single_member_history_conflict",
          "books_not_caught_up",
          "transition_year_ownership_proof",
        ].includes(signalId)
      ));

  if (prefersTransitionTimeline) {
    return "depends_on_transition_timeline";
  }

  if (
    classifications.includes("qualified_joint_venture_in_narrow_cases") &&
    classifications.includes("partnership") &&
    classifications.includes("sole_proprietorship_in_narrow_cases")
  ) {
    return "sole_proprietorship_in_narrow_cases or partnership or qualified_joint_venture_in_narrow_cases";
  }

  if (
    classifications.includes("depends_on_entity") &&
    preflight.diagnosticLane.classificationAnchor === "depends_on_entity"
  ) {
    return "depends_on_entity";
  }

  if (classifications.includes("disregarded_entity") && hasSCorp && hasCCorp) {
    return "disregarded entity unless a valid S- or C-corporation election applies";
  }

  if (classifications.includes("disregarded_entity") && hasSCorp) {
    return "disregarded entity unless a valid S-corporation election applies";
  }

  if (classifications.includes("partnership") && hasSCorp) {
    return "partnership unless a valid S-corporation election applies";
  }

  if (
    classifications.includes("s_corporation_if_valid_or_relieved_election") &&
    classifications.includes("default_llc_or_c_corp_if_not")
  ) {
    return "s_corporation_if_valid_or_relieved_election or default_llc_or_c_corp_if_not";
  }

  if (classifications.includes("depends_on_transition_timeline")) {
    return "depends_on_transition_timeline";
  }

  if (classifications.includes("depends_on_entity")) {
    return "depends_on_entity";
  }

  return (
    leadingClassification?.conclusion ??
    preflight.entityAmbiguity.paths[0]?.conclusion ??
    preflight.diagnosticLane.classificationAnchor ??
    preflight.likelyTaxClassifications[0] ??
    "depends_on_entity_and_election_history"
  );
}

export function buildTinaWeirdSmallBusinessBenchmarkAnswerFromPreflight(
  preflight: TinaWeirdSmallBusinessDiagnosticPreflight,
  diagnosticHypotheses?: TinaWeirdSmallBusinessDiagnosticHypothesisSnapshot
): TinaWeirdSmallBusinessBenchmarkAnswer {
  const leadingClassification = diagnosticHypotheses?.hypotheses.find(
    (hypothesis) =>
      hypothesis.category === "tax_classification" && hypothesis.status === "leading"
  );
  const alternateClassification = diagnosticHypotheses?.hypotheses.find(
    (hypothesis) =>
      hypothesis.category === "tax_classification" && hypothesis.status === "plausible"
  );
  const summary =
    diagnosticHypotheses?.overallStatus === "cleanup_before_conclusion"
      ? `Tina sees this as a cleanup-first file. ${preflight.diagnosticLane.summary}`
      : diagnosticHypotheses?.overallStatus === "competing_paths"
        ? `Tina sees competing paths here. Leading view: ${leadingClassification?.title ?? preflight.entityAmbiguity.paths[0]?.title ?? "the best-supported path"}. Alternate: ${alternateClassification?.title ?? preflight.entityAmbiguity.paths[1]?.title ?? "another plausible path"}. ${preflight.entityAmbiguity.summary}`
        : preflight.posture === "route_sensitive"
          ? `Tina sees this as a route-sensitive file. ${preflight.entityAmbiguity.summary}`
          : preflight.posture === "records_first"
            ? `Tina sees this as a books-and-records reconstruction file before normal return preparation. ${preflight.diagnosticLane.summary}`
            : preflight.posture === "compliance_risk"
              ? `Tina sees this as a compliance-risk file where payroll or worker treatment needs to be settled early. ${preflight.diagnosticLane.summary}`
              : `Tina sees this as a cleanup-heavy file that needs stronger support before final treatment work. ${preflight.diagnosticLane.summary}`;

  const diagnosticLaneFacts = preflight.diagnosticLane.factBuckets.flatMap((bucket) => bucket.facts);

  return {
    summary,
    likelyCurrentTaxClassification: buildLikelyClassificationAnswer(
      preflight,
      diagnosticHypotheses
    ),
    filingsThatMayBeMissing: unique([
      ...preflight.diagnosticLane.filingLadder.map((item) => item.label),
      ...preflight.likelyReturnsAndForms,
    ]).slice(0, 8),
    biggestRiskAreas: preflight.biggestRiskAreas,
    factsToConfirmBeforePreparation:
      diagnosticLaneFacts.length > 0
        ? unique([
            ...preflight.entityAmbiguity.priorityQuestions,
            ...diagnosticLaneFacts,
            ...preflight.factsToConfirmFirst,
          ]).slice(0, 6)
        : diagnosticHypotheses?.priorityQuestions.length
          ? diagnosticHypotheses.priorityQuestions
        : preflight.factsToConfirmFirst,
    cleanupStepsFirst: unique([
      ...preflight.diagnosticLane.cleanupPriority,
      ...preflight.cleanupStepsFirst,
    ]).slice(0, 6),
    federalIssues: preflight.federalIssues,
    stateIssues: preflight.stateIssues,
    needsMoreFactsBeforePreparation: preflight.needsMoreFactsBeforePreparation,
    confidence:
      diagnosticHypotheses?.overallStatus === "cleanup_before_conclusion"
        ? "low"
        : diagnosticHypotheses?.overallStatus === "competing_paths"
          ? "low"
          : preflight.diagnosticLane.confidenceCeiling,
  };
}

export function buildTinaWeirdSmallBusinessBenchmarkPromptSupport(
  preflight: TinaWeirdSmallBusinessDiagnosticPreflight,
  diagnosticHypotheses?: TinaWeirdSmallBusinessDiagnosticHypothesisSnapshot
): string {
  return [
    "Diagnostic preflight from Tina's offline weird-case engine:",
    `- Posture: ${titleCase(preflight.posture)}`,
    `- Confidence ceiling: ${preflight.confidenceCeiling}`,
    `- Diagnostic lane: ${preflight.diagnosticLane.label}`,
    `- Entity role: ${titleCase(preflight.diagnosticLane.entityRole)}`,
    `- Signals: ${preflight.signalIds.join(", ") || "none"}`,
    `- Lane summary: ${preflight.diagnosticLane.summary}`,
    `- Entity ambiguity: ${preflight.entityAmbiguity.summary}`,
    ...preflight.likelyTaxClassifications.map((item) => `- Classification candidate: ${item}`),
    ...preflight.entityAmbiguity.paths
      .slice(0, 2)
      .map(
        (path) =>
          `- Entity ambiguity path: ${path.title} (${path.confidence}, score ${path.stabilityScore})`
      ),
    ...preflight.diagnosticLane.filingLadder.slice(0, 5).map((item) => `- Filing ladder item: ${item.label} (${item.status})`),
    ...preflight.biggestRiskAreas.slice(0, 4).map((item) => `- Risk signal: ${item}`),
    ...preflight.diagnosticLane.factBuckets.slice(0, 3).flatMap((bucket) =>
      bucket.facts.slice(0, 2).map((item) => `- Fact to confirm: ${item}`)
    ),
    ...(diagnosticHypotheses
      ? [
          `- Hypothesis status: ${titleCase(diagnosticHypotheses.overallStatus)}`,
          ...diagnosticHypotheses.hypotheses
            .filter((hypothesis) => hypothesis.category === "tax_classification")
            .slice(0, 2)
            .map(
              (hypothesis) =>
                `- Ranked hypothesis: ${hypothesis.title} (${hypothesis.confidence}, score ${hypothesis.stabilityScore})`
            ),
          ...diagnosticHypotheses.priorityQuestions
            .slice(0, 3)
            .map((item) => `- Priority question: ${item}`),
        ]
      : []),
  ].join("\n");
}
