import { describe, expect, it } from "vitest";
import {
  buildTinaClientIntakeBatchReview,
  buildTinaClientIntakeProfilePatch,
  inferTinaClientIntakeCandidate,
} from "@/tina/lib/client-intake-import";

describe("inferTinaClientIntakeCandidate", () => {
  it("maps a prior-year return extract and infers an 1120-S lane hint", () => {
    const candidate = inferTinaClientIntakeCandidate({
      fileName: "tina_messy_prior_year_return_extract_2024.csv",
      headers: [
        "entity_name",
        "tax_year",
        "form_type",
        "filing_status",
        "gross_receipts",
        "shareholder_distributions",
      ],
      sampleRows: [
        {
          entity_name: "North Ridge Home Services LLC",
          tax_year: "2024",
          form_type: "1120-S",
          filing_status: "Filed",
          gross_receipts: "362480",
          shareholder_distributions: "84500",
        },
      ],
      rowCount: 1,
    });

    expect(candidate.requestId).toBe("prior-return");
    expect(candidate.confidence).toBe("high");
    expect(candidate.laneHints).toContain("1120_s");
    expect(candidate.markAsPriorReturn).toBe(true);
  });

  it("maps a general ledger even when the layout is only transaction-style clues", () => {
    const candidate = inferTinaClientIntakeCandidate({
      fileName: "north_ridge_2025_activity_export.csv",
      headers: [
        "txn_id",
        "txn_date",
        "account",
        "description",
        "counter_account",
        "debit",
        "credit",
      ],
      sampleRows: [
        {
          txn_id: "GL-1",
          txn_date: "2025-01-03",
          account: "Service Income",
          description: "Customer ACH",
          counter_account: "Cash - Operating",
          debit: "8913.14",
          credit: "0",
        },
      ],
      rowCount: 420,
    });

    expect(candidate.requestId).toBe("general-ledger");
    expect(candidate.confidence).toBe("high");
  });

  it("keeps a fuzzy note file in approval-needed mode instead of bluffing high confidence", () => {
    const candidate = inferTinaClientIntakeCandidate({
      fileName: "owner_notes_extract.csv",
      headers: ["topic", "detail", "importance"],
      sampleRows: [
        {
          topic: "Owner draws",
          detail: "A few items may have hit expense accounts first.",
          importance: "medium",
        },
      ],
      rowCount: 5,
    });

    expect(candidate.requestId).toBe("unusual-items");
    expect(candidate.approvalNeeded).toBe(true);
    expect(candidate.confidence).not.toBe("high");
  });
});

describe("buildTinaClientIntakeBatchReview", () => {
  it("surfaces unsupported-lane review when the packet looks like 1120-S", () => {
    const review = buildTinaClientIntakeBatchReview([
      {
        fileName: "prior.csv",
        requestId: "prior-return",
        requestLabel: "Prior-year filed return",
        category: "prior_return",
        markAsPriorReturn: true,
        confidence: "high",
        score: 10,
        reasons: ["looks like prior return"],
        approvalNeeded: false,
        laneHints: ["1120_s"],
        businessNameHint: "North Ridge Home Services LLC",
        taxYearHint: "2024",
      },
      {
        fileName: "gl.csv",
        requestId: "general-ledger",
        requestLabel: "General ledger export",
        category: "supporting_document",
        markAsPriorReturn: false,
        confidence: "high",
        score: 10,
        reasons: ["looks like ledger"],
        approvalNeeded: false,
        laneHints: [],
        businessNameHint: "North Ridge Home Services LLC",
        taxYearHint: "2025",
      },
    ]);

    expect(review.likelyLane).toBe("1120_s");
    expect(review.unsupportedLane).toBe(true);
  });
});

describe("buildTinaClientIntakeProfilePatch", () => {
  it("derives conservative profile hints from the imported packet", () => {
    const patch = buildTinaClientIntakeProfilePatch([
      {
        fileName: "prior.csv",
        requestId: "prior-return",
        requestLabel: "Prior-year filed return",
        category: "prior_return",
        markAsPriorReturn: true,
        confidence: "high",
        score: 10,
        reasons: ["looks like prior return"],
        approvalNeeded: false,
        laneHints: ["1120_s"],
        businessNameHint: "North Ridge Home Services LLC",
        taxYearHint: "2024",
      },
      {
        fileName: "payroll.csv",
        requestId: "payroll",
        requestLabel: "Payroll reports and W-2 support",
        category: "supporting_document",
        markAsPriorReturn: false,
        confidence: "high",
        score: 9,
        reasons: ["looks like payroll"],
        approvalNeeded: false,
        laneHints: [],
        businessNameHint: null,
        taxYearHint: "2025",
      },
      {
        fileName: "1099.csv",
        requestId: "contractors",
        requestLabel: "Contractor and 1099 support",
        category: "supporting_document",
        markAsPriorReturn: false,
        confidence: "medium",
        score: 7,
        reasons: ["looks like 1099 support"],
        approvalNeeded: true,
        laneHints: [],
        businessNameHint: null,
        taxYearHint: "2025",
      },
    ]);

    expect(patch.entityType).toBe("s_corp");
    expect(patch.hasPayroll).toBe(true);
    expect(patch.paysContractors).toBe(true);
    expect(patch.businessName).toBe("North Ridge Home Services LLC");
  });
});
