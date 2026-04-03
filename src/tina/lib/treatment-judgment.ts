import type {
  TinaSourceFact,
  TinaTaxPositionBucket,
  TinaTreatmentJudgmentItem,
  TinaTreatmentJudgmentSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";

function normalizeForComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findFactsByLabel(sourceFacts: TinaSourceFact[], label: string): TinaSourceFact[] {
  return sourceFacts.filter(
    (fact) => normalizeForComparison(fact.label) === normalizeForComparison(label)
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildItem(args: TinaTreatmentJudgmentItem): TinaTreatmentJudgmentItem {
  return {
    ...args,
    relatedFactIds: unique(args.relatedFactIds),
    relatedDocumentIds: unique(args.relatedDocumentIds),
  };
}

function hasAuthorityUseIt(draft: TinaWorkspaceDraft, ideaId: string): boolean {
  const workItem = draft.authorityWork.find((item) => item.ideaId === ideaId);
  return Boolean(workItem && workItem.reviewerDecision === "use_it" && workItem.status !== "rejected");
}

function makeLinkedIds(facts: TinaSourceFact[]) {
  return {
    relatedFactIds: facts.map((fact) => fact.id),
    relatedDocumentIds: facts.map((fact) => fact.sourceDocumentId),
  };
}

export function buildTinaTreatmentJudgment(
  draft: TinaWorkspaceDraft
): TinaTreatmentJudgmentSnapshot {
  const items: TinaTreatmentJudgmentItem[] = [];
  const mixedUseFacts = findFactsByLabel(draft.sourceFacts, "Mixed personal/business clue");
  const depreciationFacts = findFactsByLabel(draft.sourceFacts, "Depreciation clue");
  const inventoryFacts = findFactsByLabel(draft.sourceFacts, "Inventory clue");
  const payrollFacts = findFactsByLabel(draft.sourceFacts, "Payroll clue");
  const contractorFacts = findFactsByLabel(draft.sourceFacts, "Contractor clue");
  const ownerFlowFacts = findFactsByLabel(draft.sourceFacts, "Owner draw clue");
  const intercompanyFacts = findFactsByLabel(draft.sourceFacts, "Intercompany transfer clue");
  const relatedPartyFacts = findFactsByLabel(draft.sourceFacts, "Related-party clue");
  const salesTaxFacts = findFactsByLabel(draft.sourceFacts, "Sales tax clue");

  if (mixedUseFacts.length > 0) {
    items.push(
      buildItem({
        id: "mixed-use-treatment",
        title: "Reject unallocated mixed personal/business deductions",
        summary:
          "Tina should reject ordinary deduction treatment for mixed-use spending until a defensible business-only allocation exists.",
        taxPositionBucket: "reject",
        confidence: "high",
        suggestedTreatment:
          "Hold these amounts out of final deductions until the personal and business portions are separated and supported.",
        nextStep: "Get allocation support or route the item to reviewer handling.",
        authorityWorkIdeaIds: [],
        ...makeLinkedIds(mixedUseFacts),
      })
    );
  }

  if (depreciationFacts.length > 0) {
    items.push(
      buildItem({
        id: "depreciation-treatment",
        title: "Review depreciation and fixed-asset treatment",
        summary:
          draft.profile.hasFixedAssets
            ? "Tina sees fixed-asset signals, but depreciation treatment still needs reviewer-grade support before use."
            : "Tina sees depreciation-like signals without confirmed fixed-asset setup, so she should review rather than silently deduct.",
        taxPositionBucket: "review",
        confidence: draft.profile.hasFixedAssets ? "medium" : "high",
        suggestedTreatment:
          "Keep depreciation, Section 179, and bonus treatment in review until asset history and support are complete.",
        nextStep: "Confirm asset schedule, placed-in-service dates, and prior depreciation history.",
        authorityWorkIdeaIds: ["fixed-assets-review"],
        ...makeLinkedIds(depreciationFacts),
      })
    );
  }

  if (inventoryFacts.length > 0 || draft.profile.hasInventory) {
    items.push(
      buildItem({
        id: "inventory-treatment",
        title: "Review inventory and COGS treatment",
        summary:
          "Tina should keep inventory-related costs in review until she knows whether they belong in inventory, cost of goods sold, or current deductions.",
        taxPositionBucket: "review",
        confidence: "high",
        suggestedTreatment:
          "Do not let inventory-like costs flow straight into ordinary expenses without inventory treatment review.",
        nextStep: "Confirm inventory method, year-end inventory, and any small-business simplification path.",
        authorityWorkIdeaIds: ["inventory-review"],
        ...makeLinkedIds(inventoryFacts),
      })
    );
  }

  if (payrollFacts.length > 0 && contractorFacts.length > 0) {
    items.push(
      buildItem({
        id: "worker-classification-treatment",
        title: "Review worker-classification treatment",
        summary:
          "Tina sees both payroll and contractor signals, so a reviewer should confirm whether worker costs are classified correctly before use.",
        taxPositionBucket: "review",
        confidence: "high",
        suggestedTreatment:
          "Keep worker-classification-sensitive costs under reviewer control rather than trusting book labels alone.",
        nextStep: "Confirm whether the same workers or payment streams are being classified consistently.",
        authorityWorkIdeaIds: ["worker-classification-review", "payroll-review", "contractor-review"],
        ...makeLinkedIds([...payrollFacts, ...contractorFacts]),
      })
    );
  } else if (payrollFacts.length > 0 || contractorFacts.length > 0) {
    const facts = payrollFacts.length > 0 ? payrollFacts : contractorFacts;
    items.push(
      buildItem({
        id: payrollFacts.length > 0 ? "payroll-treatment" : "contractor-treatment",
        title: payrollFacts.length > 0 ? "Review payroll treatment" : "Review contractor treatment",
        summary:
          "Tina sees labor-cost treatment issues that should stay distinct and reviewable before final use.",
        taxPositionBucket: "review",
        confidence: "medium",
        suggestedTreatment:
          "Keep labor-related amounts in their own treatment lane instead of flattening them into generic expenses.",
        nextStep: "Confirm supporting records and treatment consistency before final use.",
        authorityWorkIdeaIds: payrollFacts.length > 0 ? ["payroll-review"] : ["contractor-review"],
        ...makeLinkedIds(facts),
      })
    );
  }

  if (ownerFlowFacts.length > 0) {
    items.push(
      buildItem({
        id: "owner-flow-treatment",
        title: "Review owner-flow characterization",
        summary:
          "Tina should review whether owner cash movement is really draws, distributions, loans, or compensation before using any of it as ordinary business expense treatment.",
        taxPositionBucket: "review",
        confidence: "high",
        suggestedTreatment:
          "Do not allow owner-flow activity to silently become deductible business expense treatment.",
        nextStep: "Confirm whether each owner-flow item is draw, distribution, loan, or compensation.",
        authorityWorkIdeaIds: ["owner-flow-characterization-review"],
        ...makeLinkedIds(ownerFlowFacts),
      })
    );
  }

  if (intercompanyFacts.length > 0 || relatedPartyFacts.length > 0) {
    const facts = [...intercompanyFacts, ...relatedPartyFacts];
    items.push(
      buildItem({
        id: "entity-boundary-treatment",
        title: "Review intercompany and related-party treatment",
        summary:
          "Tina should review related-party and intercompany activity before using those balances or flows in ordinary return-facing totals.",
        taxPositionBucket: "review",
        confidence: "high",
        suggestedTreatment:
          "Keep entity-boundary-sensitive items out of ordinary deductions and income until they are characterized cleanly.",
        nextStep: "Confirm whether the amounts are loans, due-to/due-from balances, capital flows, or unrelated business activity.",
        authorityWorkIdeaIds: ["intercompany-separation-review", "related-party-transaction-review"],
        ...makeLinkedIds(facts),
      })
    );
  }

  if (salesTaxFacts.length > 0 || draft.profile.collectsSalesTax) {
    const bucket: TinaTaxPositionBucket = hasAuthorityUseIt(draft, "wa-state-review")
      ? "use"
      : "review";
    items.push(
      buildItem({
        id: "sales-tax-treatment",
        title:
          bucket === "use"
            ? "Use supported sales-tax exclusion treatment"
            : "Review sales-tax exclusion treatment",
        summary:
          bucket === "use"
            ? "Tina has reviewer-backed authority support to keep collected sales tax out of taxable income where the facts support pass-through treatment."
            : "Tina sees a sales-tax clue, but the exclusion treatment should stay in review until authority and facts are locked.",
        taxPositionBucket: bucket,
        confidence: bucket === "use" ? "high" : "medium",
        suggestedTreatment:
          bucket === "use"
            ? "Keep collected sales tax out of taxable income where the records support pass-through collection for the state."
            : "Keep sales-tax-sensitive amounts in review until authority work and fact support are complete.",
        nextStep:
          bucket === "use"
            ? "Carry the supported treatment into reviewer-final numbers with traceability."
            : "Finish authority review and confirm collection/remittance support.",
        authorityWorkIdeaIds: ["wa-state-review"],
        ...makeLinkedIds(salesTaxFacts),
      })
    );
  }

  const useCount = items.filter((item) => item.taxPositionBucket === "use").length;
  const reviewCount = items.filter((item) => item.taxPositionBucket === "review").length;
  const rejectCount = items.filter((item) => item.taxPositionBucket === "reject").length;

  let summary = "Tina has not formed treatment judgments for messy tax items yet.";
  let nextStep =
    "Keep building evidence and authority so Tina can classify more treatment choices with confidence.";

  if (items.length > 0) {
    summary = `Tina classified ${items.length} treatment judgment item${
      items.length === 1 ? "" : "s"
    }: ${useCount} use, ${reviewCount} review, ${rejectCount} reject.`;
    nextStep =
      reviewCount > 0 || rejectCount > 0
        ? "Clear the review and reject treatment calls before letting messy items affect final output."
        : "The current treatment judgments are strong enough to carry into reviewer-final handling.";
  }

  return {
    lastBuiltAt: new Date().toISOString(),
    status: "complete",
    summary,
    nextStep,
    items: items.filter(
      (item, index) => items.findIndex((candidate) => candidate.id === item.id) === index
    ),
  };
}
