import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import type { TinaSourceFact, TinaWorkspaceDraft } from "@/tina/types";

export type TinaSCorpPrepStatus = "unsupported" | "blocked" | "needs_review" | "ready";

export interface TinaSCorpPrepSection {
  id:
    | "shareholder_basis"
    | "capital_continuity"
    | "distribution_tracking"
    | "officer_compensation"
    | "debt_basis"
    | "asset_continuity";
  title: string;
  status: Exclude<TinaSCorpPrepStatus, "unsupported">;
  summary: string;
  nextPrepAction: string;
  includes: string[];
  sourceDocumentIds: string[];
}

export interface TinaSCorpPrepReport {
  status: TinaSCorpPrepStatus;
  summary: string;
  nextStep: string;
  sections: TinaSCorpPrepSection[];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sourceFactsByLabel(draft: TinaWorkspaceDraft, label: string): TinaSourceFact[] {
  return draft.sourceFacts.filter((fact) => fact.label === label);
}

function sourceFactDocs(facts: TinaSourceFact[]): string[] {
  return Array.from(new Set(facts.map((fact) => fact.sourceDocumentId)));
}

function findDocsByRequest(draft: TinaWorkspaceDraft, requestId: string): string[] {
  return draft.documents
    .filter((document) => document.requestId === requestId)
    .map((document) => document.id);
}

function buildSection(args: TinaSCorpPrepSection): TinaSCorpPrepSection {
  return args;
}

export function buildTinaSCorpPrepReport(
  draft: TinaWorkspaceDraft
): TinaSCorpPrepReport {
  const lane = recommendTinaFilingLane(draft.profile);
  const hintedSCorp = sourceFactsByLabel(draft, "Return type hint").some((fact) =>
    normalize(fact.value).includes("1120 s")
  );

  if (lane.laneId !== "1120_s" && !hintedSCorp) {
    return {
      status: "unsupported",
      summary: "This packet does not currently look like an 1120-S prep file.",
      nextStep: "Use the Schedule C or partnership prep path that fits the current packet instead.",
      sections: [],
    };
  }

  const priorReturnIds = findDocsByRequest(draft, "prior-return");
  const entityDocIds = findDocsByRequest(draft, "entity-docs");
  const balanceSheetIds = findDocsByRequest(draft, "balance-sheet");
  const trialBalanceIds = findDocsByRequest(draft, "trial-balance");
  const generalLedgerIds = findDocsByRequest(draft, "general-ledger");
  const payrollIds = findDocsByRequest(draft, "payroll");
  const loanIds = findDocsByRequest(draft, "loan-support");
  const unusualItemIds = findDocsByRequest(draft, "unusual-items");
  const assetIds = findDocsByRequest(draft, "assets");

  const ownershipFacts = sourceFactsByLabel(draft, "Ownership record clue").concat(
    sourceFactsByLabel(draft, "Ownership percentage clue")
  );
  const carryoverFacts = sourceFactsByLabel(draft, "Carryover amount clue").concat(
    sourceFactsByLabel(draft, "Prior-year carryover clue")
  );
  const electionFacts = sourceFactsByLabel(draft, "Tax election clue").concat(
    sourceFactsByLabel(draft, "Election detail clue"),
    sourceFactsByLabel(draft, "EIN clue")
  );
  const ownerDrawFacts = sourceFactsByLabel(draft, "Owner draw clue");
  const payrollFacts = sourceFactsByLabel(draft, "Payroll clue").concat(
    sourceFactsByLabel(draft, "Payroll filing period clue"),
    sourceFactsByLabel(draft, "Payroll tax form clue")
  );
  const contractorFacts = sourceFactsByLabel(draft, "Contractor clue");
  const relatedPartyFacts = sourceFactsByLabel(draft, "Related-party clue").concat(
    sourceFactsByLabel(draft, "Intercompany transfer clue")
  );
  const depreciationFacts = sourceFactsByLabel(draft, "Depreciation clue").concat(
    sourceFactsByLabel(draft, "Fixed asset clue"),
    sourceFactsByLabel(draft, "Asset placed-in-service clue")
  );

  const basisSection = buildSection({
    id: "shareholder_basis",
    title: "Shareholder basis prep",
    status:
      priorReturnIds.length === 0 || ownershipFacts.length === 0 || balanceSheetIds.length === 0
        ? "blocked"
        : carryoverFacts.length === 0 || entityDocIds.length === 0
          ? "needs_review"
          : "ready",
    summary:
      priorReturnIds.length === 0 || ownershipFacts.length === 0 || balanceSheetIds.length === 0
        ? "Tina still needs prior-return continuity, shareholder ownership support, and the year-end balance sheet before basis prep should be trusted."
        : carryoverFacts.length === 0 || entityDocIds.length === 0
          ? "Tina has the bones of a basis schedule, but she still wants carryover or entity support before calling it clean prep."
          : "Tina has enough continuity and ownership support to frame a first-pass shareholder basis schedule for CPA review.",
    nextPrepAction:
      priorReturnIds.length === 0
        ? "Add the prior-year 1120-S return first."
        : ownershipFacts.length === 0
          ? "Add shareholder ownership support before basis prep moves forward."
          : carryoverFacts.length === 0
            ? "Confirm prior-year carryovers or retained balances next."
            : "Keep the shareholder basis schedule in the CPA packet.",
    includes: [
      priorReturnIds.length > 0 ? "Prior-year entity return is attached" : "Prior-year return is missing",
      balanceSheetIds.length > 0 ? "Year-end balance sheet is attached" : "Year-end balance sheet is missing",
      ownershipFacts.length > 0
        ? `${ownershipFacts.length} shareholder ownership clue${ownershipFacts.length === 1 ? "" : "s"} detected`
        : "No shareholder ownership clue detected yet",
      carryoverFacts.length > 0
        ? `${carryoverFacts.length} carryover clue${carryoverFacts.length === 1 ? "" : "s"} detected`
        : "No basis carryover clue detected yet",
    ],
    sourceDocumentIds: Array.from(
      new Set([
        ...priorReturnIds,
        ...balanceSheetIds,
        ...entityDocIds,
        ...sourceFactDocs(ownershipFacts),
        ...sourceFactDocs(carryoverFacts),
      ])
    ),
  });

  const capitalSection = buildSection({
    id: "capital_continuity",
    title: "Capital and retained-activity continuity",
    status:
      balanceSheetIds.length === 0 || generalLedgerIds.length === 0
        ? "blocked"
        : trialBalanceIds.length === 0 || carryoverFacts.length === 0
          ? "needs_review"
          : "ready",
    summary:
      balanceSheetIds.length === 0 || generalLedgerIds.length === 0
        ? "Tina still needs the balance sheet and general ledger before capital continuity should look real."
        : trialBalanceIds.length === 0 || carryoverFacts.length === 0
          ? "Tina can sketch capital continuity, but she still wants trial-balance or carryover support before treating the rollforward as clean."
          : "Tina has enough ledger and continuity support to frame a capital rollforward for CPA review.",
    nextPrepAction:
      balanceSheetIds.length === 0
        ? "Add the year-end balance sheet first."
        : generalLedgerIds.length === 0
          ? "Add the general ledger so capital movements can be traced."
          : trialBalanceIds.length === 0
            ? "Add a trial balance if available to tighten the capital rollforward."
            : "Keep the capital continuity schedule at the front of the CPA packet.",
    includes: [
      generalLedgerIds.length > 0 ? "General ledger is attached" : "General ledger is missing",
      trialBalanceIds.length > 0 ? "Trial balance is attached" : "Trial balance is missing",
      balanceSheetIds.length > 0 ? "Balance sheet is attached" : "Balance sheet is missing",
      carryoverFacts.length > 0
        ? `${carryoverFacts.length} continuity clue${carryoverFacts.length === 1 ? "" : "s"} detected`
        : "No retained-balance continuity clue detected yet",
    ],
    sourceDocumentIds: Array.from(
      new Set([
        ...generalLedgerIds,
        ...trialBalanceIds,
        ...balanceSheetIds,
        ...sourceFactDocs(carryoverFacts),
      ])
    ),
  });

  const distributionSection = buildSection({
    id: "distribution_tracking",
    title: "Shareholder distribution tracking",
    status:
      ownerDrawFacts.length > 0 && (generalLedgerIds.length === 0 || balanceSheetIds.length === 0)
        ? "blocked"
        : ownerDrawFacts.length > 0
          ? "needs_review"
        : generalLedgerIds.length > 0 && balanceSheetIds.length > 0
            ? "ready"
            : "blocked",
    summary:
      ownerDrawFacts.length > 0 && (generalLedgerIds.length === 0 || balanceSheetIds.length === 0)
        ? "Tina sees shareholder-flow activity but still needs the ledger and balance sheet to separate distributions from ordinary business activity."
        : ownerDrawFacts.length > 0
          ? "Tina can track likely distributions, but owner-flow or related-party signals still deserve an explicit CPA review pass."
          : generalLedgerIds.length > 0 && balanceSheetIds.length > 0
            ? "Tina has enough ledger support to keep shareholder distributions visible in the entity packet."
            : "Tina still needs the ledger and balance sheet before distribution tracking should look real.",
    nextPrepAction:
      generalLedgerIds.length === 0
        ? "Add the general ledger first."
        : balanceSheetIds.length === 0
          ? "Add the balance sheet so shareholder-flow entries can be tied out."
          : ownerDrawFacts.length > 0
            ? "Keep owner-flow and related-party distributions explicit in the CPA packet."
            : "Leave the distribution schedule in the handoff packet for CPA confirmation.",
    includes: [
      ownerDrawFacts.length > 0
        ? `${ownerDrawFacts.length} owner-flow clue${ownerDrawFacts.length === 1 ? "" : "s"} detected`
        : "No direct owner-draw clue detected yet",
      unusualItemIds.length > 0 ? "Client unusual-items notes are attached" : "No unusual-items notes attached",
      relatedPartyFacts.length > 0
        ? `${relatedPartyFacts.length} related-party or transfer clue${relatedPartyFacts.length === 1 ? "" : "s"} detected`
        : "No related-party or transfer clue detected yet",
      generalLedgerIds.length > 0 ? "General ledger is attached" : "General ledger is missing",
    ],
    sourceDocumentIds: Array.from(
      new Set([
        ...generalLedgerIds,
        ...balanceSheetIds,
        ...unusualItemIds,
        ...sourceFactDocs(ownerDrawFacts),
        ...sourceFactDocs(relatedPartyFacts),
      ])
    ),
  });

  const officerCompSection = buildSection({
    id: "officer_compensation",
    title: "Officer compensation and payroll prep",
    status:
      (draft.profile.hasPayroll || payrollFacts.length > 0) && payrollIds.length === 0
        ? "blocked"
        : payrollIds.length > 0 && contractorFacts.length > 0
          ? "needs_review"
          : payrollIds.length > 0 || payrollFacts.length > 0
            ? "ready"
            : "needs_review",
    summary:
      (draft.profile.hasPayroll || payrollFacts.length > 0) && payrollIds.length === 0
        ? "Tina sees payroll activity but still needs payroll support before officer compensation should be trusted."
        : payrollIds.length > 0 && contractorFacts.length > 0
          ? "Tina has payroll support, but contractor activity still overlaps enough that officer-comp treatment should stay visible in CPA review."
          : payrollIds.length > 0 || payrollFacts.length > 0
            ? "Tina has enough payroll support to frame officer-comp review in the entity packet."
            : "Tina does not see payroll support yet, so the CPA should confirm whether officer compensation exists.",
    nextPrepAction:
      payrollIds.length === 0
        ? "Add payroll reports and W-2 support first."
        : contractorFacts.length > 0
          ? "Keep payroll and contractor classifications separate in the CPA packet."
          : "Keep the officer-comp section ready for CPA review.",
    includes: [
      payrollIds.length > 0 ? "Payroll support is attached" : "Payroll support is missing",
      payrollFacts.length > 0
        ? `${payrollFacts.length} payroll clue${payrollFacts.length === 1 ? "" : "s"} detected`
        : "No payroll clue detected yet",
      contractorFacts.length > 0
        ? `${contractorFacts.length} contractor clue${contractorFacts.length === 1 ? "" : "s"} detected`
        : "No contractor-mix clue detected yet",
      electionFacts.length > 0 ? "Entity-election support is present" : "Election support is still thin",
    ],
    sourceDocumentIds: Array.from(
      new Set([
        ...payrollIds,
        ...entityDocIds,
        ...sourceFactDocs(payrollFacts),
        ...sourceFactDocs(contractorFacts),
        ...sourceFactDocs(electionFacts),
      ])
    ),
  });

  const debtBasisSection = buildSection({
    id: "debt_basis",
    title: "Debt basis and shareholder-loan prep",
    status:
      relatedPartyFacts.length > 0 &&
      (loanIds.length === 0 || priorReturnIds.length === 0 || balanceSheetIds.length === 0)
        ? "blocked"
        : loanIds.length > 0 && (ownershipFacts.length === 0 || carryoverFacts.length === 0)
          ? "needs_review"
          : loanIds.length > 0 || relatedPartyFacts.length > 0
            ? "ready"
            : "needs_review",
    summary:
      relatedPartyFacts.length > 0 &&
      (loanIds.length === 0 || priorReturnIds.length === 0 || balanceSheetIds.length === 0)
        ? "Tina sees shareholder-loan or related-party debt activity but still needs debt support, continuity, and the balance sheet before debt basis prep should be trusted."
        : loanIds.length > 0 && (ownershipFacts.length === 0 || carryoverFacts.length === 0)
          ? "Tina has loan support, but debt basis still wants cleaner shareholder ownership or carryover continuity."
          : loanIds.length > 0 || relatedPartyFacts.length > 0
            ? "Tina has enough debt support to frame a shareholder-loan review path in the CPA packet."
            : "Tina does not see strong debt-basis signals yet, so the CPA should confirm whether shareholder loans matter here.",
    nextPrepAction:
      loanIds.length === 0
        ? "Add loan statements and debt support first."
        : ownershipFacts.length === 0
          ? "Add shareholder ownership support to firm up debt basis."
          : carryoverFacts.length === 0
            ? "Confirm prior-year debt or basis carryovers next."
            : "Keep the debt-basis schedule visible in the CPA packet.",
    includes: [
      loanIds.length > 0 ? "Loan support is attached" : "Loan support is missing",
      relatedPartyFacts.length > 0
        ? `${relatedPartyFacts.length} related-party or transfer clue${relatedPartyFacts.length === 1 ? "" : "s"} detected`
        : "No related-party or debt-basis clue detected yet",
      priorReturnIds.length > 0 ? "Prior-year return continuity is present" : "Prior-year continuity is missing",
      carryoverFacts.length > 0
        ? `${carryoverFacts.length} carryover clue${carryoverFacts.length === 1 ? "" : "s"} detected`
        : "No prior debt-basis carryover clue detected yet",
    ],
    sourceDocumentIds: Array.from(
      new Set([
        ...loanIds,
        ...priorReturnIds,
        ...balanceSheetIds,
        ...sourceFactDocs(relatedPartyFacts),
        ...sourceFactDocs(ownershipFacts),
        ...sourceFactDocs(carryoverFacts),
      ])
    ),
  });

  const assetContinuitySection = buildSection({
    id: "asset_continuity",
    title: "Asset and depreciation continuity prep",
    status:
      depreciationFacts.length > 0 && assetIds.length === 0
        ? "blocked"
        : assetIds.length === 0
          ? "needs_review"
          : priorReturnIds.length === 0
            ? "needs_review"
            : "ready",
    summary:
      depreciationFacts.length > 0 && assetIds.length === 0
        ? "Tina sees depreciation or placed-in-service signals but still needs the asset schedule before depreciation prep should be trusted."
        : assetIds.length === 0
          ? "Tina does not have fixed-asset support yet, so the CPA should confirm whether depreciation continuity matters here."
          : priorReturnIds.length === 0
            ? "Tina has current asset support, but prior-year continuity is still needed to trust depreciation rollforward."
            : "Tina has enough asset support to keep depreciation continuity visible in the CPA packet.",
    nextPrepAction:
      assetIds.length === 0
        ? "Add fixed-asset and depreciation support first."
        : priorReturnIds.length === 0
          ? "Add prior-year depreciation continuity next."
          : "Keep the asset continuity schedule in the CPA packet.",
    includes: [
      assetIds.length > 0 ? "Fixed-asset support is attached" : "Fixed-asset support is missing",
      depreciationFacts.length > 0
        ? `${depreciationFacts.length} depreciation clue${depreciationFacts.length === 1 ? "" : "s"} detected`
        : "No direct depreciation clue detected yet",
      priorReturnIds.length > 0 ? "Prior-year continuity is attached" : "Prior-year continuity is missing",
    ],
    sourceDocumentIds: Array.from(
      new Set([...assetIds, ...priorReturnIds, ...sourceFactDocs(depreciationFacts)])
    ),
  });

  const sections = [
    basisSection,
    capitalSection,
    distributionSection,
    officerCompSection,
    debtBasisSection,
    assetContinuitySection,
  ];

  const blockedCount = sections.filter((section) => section.status === "blocked").length;
  const reviewCount = sections.filter((section) => section.status === "needs_review").length;

  if (blockedCount > 0) {
    return {
      status: "blocked",
      summary:
        "Tina has started a real 1120-S prep spine, but blocked sections still need support before this entity packet should look prep-ready.",
      nextStep:
        sections.find((section) => section.status === "blocked")?.nextPrepAction ??
        "Clear the blocked 1120-S prep sections first.",
      sections,
    };
  }

  if (reviewCount > 0) {
    return {
      status: "needs_review",
      summary:
        "Tina has a workable 1120-S prep spine, but some shareholder or continuity schedules still need explicit CPA review.",
      nextStep:
        sections.find((section) => section.status === "needs_review")?.nextPrepAction ??
        "Review the open 1120-S prep sections next.",
      sections,
    };
  }

  return {
    status: "ready",
    summary:
      "Tina has a clean first-pass 1120-S prep spine across basis, capital, distributions, officer comp, debt basis, and asset continuity.",
    nextStep:
      "Hand the 1120-S packet to the CPA with the prep spine at the front of the entity-return bundle.",
    sections,
  };
}
