import { describe, expect, it } from "vitest";
import { buildTinaBooksReconstruction } from "@/tina/lib/books-reconstruction";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("books-reconstruction", () => {
  it("classifies messy live-book areas into blocked, review, and ready reconstruction slices", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaBooksReconstruction({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Messy Books LLC",
        taxYear: "2025",
        entityType: "single_member_llc",
        ownerCount: 1,
        hasFixedAssets: true,
        hasInventory: true,
        hasPayroll: true,
        paysContractors: true,
      },
      quickBooksConnection: {
        ...base.quickBooksConnection,
        status: "connected",
        companyName: "Messy Books LLC",
        importedDocumentIds: ["doc-qb"],
      },
      reviewerFinal: {
        ...base.reviewerFinal,
        lines: [
          {
            id: "income-line",
            kind: "income",
            layer: "reviewer_final",
            label: "Gross receipts",
            amount: 25000,
            status: "ready",
            summary: "Income line available.",
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
          {
            id: "expense-line",
            kind: "expense",
            layer: "reviewer_final",
            label: "Expense line",
            amount: 4000,
            status: "ready",
            summary: "Expense line available.",
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
        ],
      },
      sourceFacts: [
        {
          id: "owner-draw",
          sourceDocumentId: "doc-qb",
          label: "Owner draw clue",
          value: "Owner draws hit the expense ledger.",
          confidence: "high",
          capturedAt: "2026-04-02T10:01:00.000Z",
        },
        {
          id: "mixed-use",
          sourceDocumentId: "doc-qb",
          label: "Mixed personal/business clue",
          value: "Personal and business spending are mixed.",
          confidence: "high",
          capturedAt: "2026-04-02T10:01:00.000Z",
        },
        {
          id: "contractor",
          sourceDocumentId: "doc-qb",
          label: "Contractor clue",
          value: "Contractor payments appear in the ledger.",
          confidence: "medium",
          capturedAt: "2026-04-02T10:01:00.000Z",
        },
        {
          id: "payroll",
          sourceDocumentId: "doc-qb",
          label: "Payroll clue",
          value: "Payroll entries also appear in the ledger.",
          confidence: "medium",
          capturedAt: "2026-04-02T10:01:00.000Z",
        },
        {
          id: "depreciation",
          sourceDocumentId: "doc-qb",
          label: "Depreciation clue",
          value: "Depreciation expense booked without full asset history.",
          confidence: "high",
          capturedAt: "2026-04-02T10:01:00.000Z",
        },
        {
          id: "intercompany",
          sourceDocumentId: "doc-qb",
          label: "Intercompany transfer clue",
          value: "Due-to and due-from balances are present.",
          confidence: "high",
          capturedAt: "2026-04-02T10:01:00.000Z",
        },
      ],
    });

    expect(snapshot.sourceMode).toBe("quickbooks_live");
    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.areas.find((area) => area.id === "income")?.status).toBe("ready");
    expect(snapshot.areas.find((area) => area.id === "core_expenses")?.status).toBe("blocked");
    expect(snapshot.areas.find((area) => area.id === "worker_payments")?.status).toBe("needs_review");
    expect(snapshot.areas.find((area) => area.id === "inventory_cogs")?.status).toBe("blocked");
    expect(snapshot.areas.find((area) => area.id === "entity_boundary")?.status).toBe("blocked");
  });
});
