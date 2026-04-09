import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import type { TinaSourceFact, TinaWorkspaceDraft } from "@/tina/types";

export type TinaSCorpReviewStatus = "unsupported" | "blocked" | "needs_review" | "ready";

export interface TinaSCorpReviewSection {
  id:
    | "entity_governance"
    | "basis_and_capital"
    | "shareholder_distributions"
    | "officer_payroll"
    | "debt_and_related_party"
    | "depreciation_and_assets";
  title: string;
  status: Exclude<TinaSCorpReviewStatus, "unsupported">;
  summary: string;
  includes: string[];
  sourceDocumentIds: string[];
}

export interface TinaSCorpReviewReport {
  status: TinaSCorpReviewStatus;
  summary: string;
  nextStep: string;
  sections: TinaSCorpReviewSection[];
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

function hasRequest(draft: TinaWorkspaceDraft, requestId: string): boolean {
  return draft.documents.some((document) => document.requestId === requestId);
}

function hasReading(draft: TinaWorkspaceDraft, documentId: string): boolean {
  return draft.documentReadings.some(
    (reading) => reading.documentId === documentId && reading.status === "complete"
  );
}

function findDocsByRequest(draft: TinaWorkspaceDraft, requestId: string): string[] {
  return draft.documents
    .filter((document) => document.requestId === requestId)
    .map((document) => document.id);
}

function buildSection(args: TinaSCorpReviewSection): TinaSCorpReviewSection {
  return args;
}

export function buildTinaSCorpReviewReport(
  draft: TinaWorkspaceDraft
): TinaSCorpReviewReport {
  const lane = recommendTinaFilingLane(draft.profile);
  const hintedSCorp = sourceFactsByLabel(draft, "Return type hint").some((fact) =>
    normalize(fact.value).includes("1120 s")
  );

  if (lane.laneId !== "1120_s" && !hintedSCorp) {
    return {
      status: "unsupported",
      summary: "This packet does not currently look like an 1120-S review file.",
      nextStep: "Use the Schedule C or partnership flow that fits the current packet instead.",
      sections: [],
    };
  }

  const entityDocIds = findDocsByRequest(draft, "entity-docs");
  const priorReturnIds = findDocsByRequest(draft, "prior-return");
  const balanceSheetIds = findDocsByRequest(draft, "balance-sheet");
  const generalLedgerIds = findDocsByRequest(draft, "general-ledger");
  const payrollIds = findDocsByRequest(draft, "payroll");
  const loanIds = findDocsByRequest(draft, "loan-support");
  const unusualItemIds = findDocsByRequest(draft, "unusual-items");
  const assetIds = findDocsByRequest(draft, "assets");

  const electionFacts = sourceFactsByLabel(draft, "Tax election clue").concat(
    sourceFactsByLabel(draft, "Election detail clue"),
    sourceFactsByLabel(draft, "EIN clue")
  );
  const ownershipFacts = sourceFactsByLabel(draft, "Ownership record clue").concat(
    sourceFactsByLabel(draft, "Ownership percentage clue")
  );
  const carryoverFacts = sourceFactsByLabel(draft, "Carryover amount clue");
  const ownerDrawFacts = sourceFactsByLabel(draft, "Owner draw clue");
  const payrollFacts = sourceFactsByLabel(draft, "Payroll clue");
  const contractorFacts = sourceFactsByLabel(draft, "Contractor clue");
  const relatedPartyFacts = sourceFactsByLabel(draft, "Related-party clue").concat(
    sourceFactsByLabel(draft, "Intercompany transfer clue")
  );
  const depreciationFacts = sourceFactsByLabel(draft, "Depreciation clue").concat(
    sourceFactsByLabel(draft, "Fixed asset clue"),
    sourceFactsByLabel(draft, "Asset placed-in-service clue")
  );

  const governanceSection = buildSection({
    id: "entity_governance",
    title: "Entity governance and election review",
    status:
      priorReturnIds.length === 0
        ? "blocked"
        : entityDocIds.length === 0 && electionFacts.length === 0
          ? "needs_review"
          : "ready",
    summary:
      priorReturnIds.length === 0
        ? "Tina needs the prior-year entity return or election support before a CPA should trust the 1120-S posture."
        : entityDocIds.length === 0 && electionFacts.length === 0
          ? "Tina sees an S-corp posture, but the packet still wants direct entity or election support for clean review."
          : "Tina has enough entity-return posture support to frame the 1120-S review.",
    includes: [
      priorReturnIds.length > 0 ? "Prior-year entity return is attached" : "Prior-year entity return is missing",
      entityDocIds.length > 0 ? "Entity documents are attached" : "Entity documents are still missing",
      electionFacts.length > 0
        ? `${electionFacts.length} election or EIN clue${electionFacts.length === 1 ? "" : "s"} detected`
        : "No direct election detail clue detected yet",
    ],
    sourceDocumentIds: Array.from(new Set([...priorReturnIds, ...entityDocIds, ...sourceFactDocs(electionFacts)])),
  });

  const basisSection = buildSection({
    id: "basis_and_capital",
    title: "Shareholder basis and capital continuity",
    status:
      priorReturnIds.length === 0 || balanceSheetIds.length === 0
        ? "blocked"
        : ownershipFacts.length === 0 || carryoverFacts.length === 0
          ? "needs_review"
          : "ready",
    summary:
      priorReturnIds.length === 0 || balanceSheetIds.length === 0
        ? "Tina still needs prior-return and balance-sheet continuity before a CPA can trust basis or capital review."
        : ownershipFacts.length === 0 || carryoverFacts.length === 0
          ? "Tina has continuity documents, but basis and capital still need shareholder-specific support."
          : "Tina has a workable basis and capital continuity spine for CPA review.",
    includes: [
      priorReturnIds.length > 0 ? "Prior-year return continuity is present" : "Prior-year return continuity is missing",
      balanceSheetIds.length > 0 ? "Year-end balance sheet is attached" : "Year-end balance sheet is missing",
      ownershipFacts.length > 0
        ? `${ownershipFacts.length} ownership clue${ownershipFacts.length === 1 ? "" : "s"} detected`
        : "No shareholder ownership percentage clue yet",
      carryoverFacts.length > 0
        ? `${carryoverFacts.length} carryover clue${carryoverFacts.length === 1 ? "" : "s"} detected`
        : "No carryover or retained-balance clue yet",
    ],
    sourceDocumentIds: Array.from(
      new Set([
        ...priorReturnIds,
        ...balanceSheetIds,
        ...sourceFactDocs(ownershipFacts),
        ...sourceFactDocs(carryoverFacts),
      ])
    ),
  });

  const distributionSection = buildSection({
    id: "shareholder_distributions",
    title: "Shareholder distributions and owner-flow review",
    status:
      ownerDrawFacts.length > 0 && (generalLedgerIds.length === 0 || balanceSheetIds.length === 0)
        ? "blocked"
        : ownerDrawFacts.length > 0 || unusualItemIds.length > 0
          ? "needs_review"
          : generalLedgerIds.length > 0
            ? "ready"
            : "blocked",
    summary:
      ownerDrawFacts.length > 0 && (generalLedgerIds.length === 0 || balanceSheetIds.length === 0)
        ? "Tina sees owner-flow signals but still needs the ledger and balance-sheet support to frame distributions safely."
        : ownerDrawFacts.length > 0 || unusualItemIds.length > 0
          ? "Tina sees shareholder distribution or owner-flow patterns that should be isolated in CPA review."
          : generalLedgerIds.length > 0
            ? "Tina does not see obvious distribution signals beyond the current ledger support."
            : "Tina still needs general-ledger support before reviewing shareholder distributions.",
    includes: [
      generalLedgerIds.length > 0 ? "General ledger is attached" : "General ledger is missing",
      balanceSheetIds.length > 0 ? "Balance sheet is attached" : "Balance sheet is missing",
      ownerDrawFacts.length > 0
        ? `${ownerDrawFacts.length} owner-flow clue${ownerDrawFacts.length === 1 ? "" : "s"} detected`
        : "No direct owner-draw clue detected yet",
      unusualItemIds.length > 0 ? "Client unusual-items notes are attached" : "No unusual-items notes attached",
    ],
    sourceDocumentIds: Array.from(
      new Set([
        ...generalLedgerIds,
        ...balanceSheetIds,
        ...unusualItemIds,
        ...sourceFactDocs(ownerDrawFacts),
      ])
    ),
  });

  const payrollSection = buildSection({
    id: "officer_payroll",
    title: "Officer compensation and payroll review",
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
        ? "Tina sees payroll activity but still needs payroll support before a CPA should trust officer-comp treatment."
        : payrollIds.length > 0 && contractorFacts.length > 0
          ? "Tina has payroll support, but contractor activity still overlaps and needs a quick compensation review."
          : payrollIds.length > 0 || payrollFacts.length > 0
            ? "Tina has a workable payroll spine for officer-comp review."
            : "Tina does not see payroll support yet, so a CPA should confirm whether officer compensation exists.",
    includes: [
      payrollIds.length > 0 ? "Payroll support is attached" : "Payroll support is missing",
      payrollFacts.length > 0
        ? `${payrollFacts.length} payroll clue${payrollFacts.length === 1 ? "" : "s"} detected`
        : "No payroll clue detected yet",
      contractorFacts.length > 0
        ? `${contractorFacts.length} contractor clue${contractorFacts.length === 1 ? "" : "s"} detected`
        : "No contractor-mix clue detected yet",
    ],
    sourceDocumentIds: Array.from(new Set([...payrollIds, ...sourceFactDocs(payrollFacts), ...sourceFactDocs(contractorFacts)])),
  });

  const debtSection = buildSection({
    id: "debt_and_related_party",
    title: "Debt, loans, and related-party review",
    status:
      relatedPartyFacts.length > 0 && loanIds.length === 0
        ? "blocked"
        : relatedPartyFacts.length > 0
          ? "needs_review"
          : "ready",
    summary:
      relatedPartyFacts.length > 0 && loanIds.length === 0
        ? "Tina sees loan or related-party activity but still needs loan support to separate debt from owner flows."
        : relatedPartyFacts.length > 0
          ? "Tina has debt or related-party signals that belong in the CPA's entity-return review."
          : loanIds.length > 0
            ? "Tina has loan support attached and does not see unresolved related-party debt signals in the current packet."
            : "Tina does not see material debt or related-party signals in the current packet.",
    includes: [
      loanIds.length > 0 ? "Loan support is attached" : "Loan support is not attached",
      relatedPartyFacts.length > 0
        ? `${relatedPartyFacts.length} related-party clue${relatedPartyFacts.length === 1 ? "" : "s"} detected`
        : "No related-party or intercompany clue detected yet",
    ],
    sourceDocumentIds: Array.from(new Set([...loanIds, ...sourceFactDocs(relatedPartyFacts)])),
  });

  const depreciationSection = buildSection({
    id: "depreciation_and_assets",
    title: "Depreciation and fixed-asset review",
    status:
      depreciationFacts.length > 0 && assetIds.length === 0
        ? "blocked"
        : "ready",
    summary:
      depreciationFacts.length > 0 && assetIds.length === 0
        ? "Tina sees depreciation or placed-in-service signals but still needs asset support before a CPA should trust them."
        : assetIds.length > 0 || depreciationFacts.length > 0
          ? "Tina has asset or depreciation support attached and does not see a missing-support blocker in this section."
          : "Tina does not see a fixed-asset review path in the current packet yet.",
    includes: [
      assetIds.length > 0 ? "Fixed-asset support is attached" : "Fixed-asset support is missing",
      depreciationFacts.length > 0
        ? `${depreciationFacts.length} asset or depreciation clue${depreciationFacts.length === 1 ? "" : "s"} detected`
        : "No direct depreciation clue detected yet",
    ],
    sourceDocumentIds: Array.from(new Set([...assetIds, ...sourceFactDocs(depreciationFacts)])),
  });

  const sections = [
    governanceSection,
    basisSection,
    distributionSection,
    payrollSection,
    debtSection,
    depreciationSection,
  ];

  const blockedCount = sections.filter((section) => section.status === "blocked").length;
  const reviewCount = sections.filter((section) => section.status === "needs_review").length;

  if (blockedCount > 0) {
    return {
      status: "blocked",
      summary:
        "Tina has started an 1120-S review spine, but blocked entity-return sections still need coverage before the CPA packet should look complete.",
      nextStep:
        sections.find((section) => section.status === "blocked")?.summary ??
        "Clear the blocked 1120-S review sections first.",
      sections,
    };
  }

  if (reviewCount > 0) {
    return {
      status: "needs_review",
      summary:
        "Tina has a workable 1120-S review spine, but some shareholder or entity-return areas still need explicit CPA review.",
      nextStep:
        sections.find((section) => section.status === "needs_review")?.summary ??
        "Review the open 1120-S sections next.",
      sections,
    };
  }

  return {
    status: "ready",
    summary:
      "Tina has a clean first-pass 1120-S review spine for CPA handoff across governance, basis, distributions, payroll, debt, and depreciation.",
    nextStep:
      "Hand the 1120-S packet to the CPA with this review spine at the front of the entity-return intake bundle.",
    sections,
  };
}
