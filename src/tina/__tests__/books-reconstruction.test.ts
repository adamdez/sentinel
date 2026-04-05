import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaLedgerReconstruction } from "@/tina/lib/ledger-reconstruction";
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
    expect(snapshot.areas.find((area) => area.id === "income")?.status).toBe("needs_review");
    expect(snapshot.areas.find((area) => area.id === "core_expenses")?.status).toBe("blocked");
    expect(snapshot.areas.find((area) => area.id === "worker_payments")?.status).toBe("needs_review");
    expect(snapshot.areas.find((area) => area.id === "inventory_cogs")?.status).toBe("blocked");
    expect(snapshot.areas.find((area) => area.id === "entity_boundary")?.status).toBe("blocked");
  });

  it("builds ledger groups with contamination and independence truth for messy files", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Ledger Truth LLC",
        taxYear: "2025",
        entityType: "single_member_llc" as const,
        hasPayroll: true,
        paysContractors: true,
        hasFixedAssets: true,
        notes: "Owner draws and mixed personal spending are mixed with payroll and contractor payments.",
      },
      quickBooksConnection: {
        ...base.quickBooksConnection,
        status: "connected" as const,
        importedDocumentIds: ["doc-ledger", "doc-payroll"],
      },
      documents: [
        {
          id: "doc-ledger",
          name: "General ledger export.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/gl.csv",
          category: "supporting_document" as const,
          requestId: "gl",
          requestLabel: "General ledger",
          uploadedAt: "2026-04-03T10:00:00.000Z",
        },
        {
          id: "doc-payroll",
          name: "Payroll register.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/payroll.pdf",
          category: "supporting_document" as const,
          requestId: "payroll",
          requestLabel: "Payroll summary",
          uploadedAt: "2026-04-03T10:01:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-ledger",
          status: "complete" as const,
          kind: "spreadsheet" as const,
          summary: "General ledger loaded",
          nextStep: "Review",
          facts: [],
          detailLines: [
            "Owner draws, mixed personal spending, contractor payments, and depreciation entries appear.",
          ],
          rowCount: 20,
          headers: ["Date", "Memo", "Amount"],
          sheetNames: ["Sheet1"],
          lastReadAt: "2026-04-03T10:02:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-owner",
          sourceDocumentId: "doc-ledger",
          label: "Owner draw clue",
          value: "Owner draws hit the expense ledger.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T10:03:00.000Z",
        },
        {
          id: "fact-mixed-use",
          sourceDocumentId: "doc-ledger",
          label: "Mixed personal/business clue",
          value: "Personal and business spending are mixed.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T10:04:00.000Z",
        },
        {
          id: "fact-payroll",
          sourceDocumentId: "doc-payroll",
          label: "Payroll clue",
          value: "Payroll entries appear in the books.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T10:05:00.000Z",
        },
        {
          id: "fact-contractor",
          sourceDocumentId: "doc-ledger",
          label: "Contractor clue",
          value: "Contract labor appears in the books.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T10:06:00.000Z",
        },
      ],
    };

    const snapshot = buildTinaLedgerReconstruction(draft);
    const mixedUse = snapshot.groups.find((group) => group.id === "mixed-use");

    expect(snapshot.overallStatus).toBe("partial");
    expect(snapshot.highContaminationGroupCount).toBeGreaterThanOrEqual(1);
    expect(mixedUse?.contaminationRisk).toBe("high");
    expect(mixedUse?.supportChannels.some((channel) => channel.kind === "general_ledger")).toBe(
      true
    );
  });

  it("treats non-applicable ledger families as not-applicable instead of partial on clean files", () => {
    const snapshot = buildTinaLedgerReconstruction(TINA_SKILL_REVIEW_DRAFTS["supported-core"]);

    expect(snapshot.overallStatus).toBe("reconstructed");
    expect(snapshot.groups.find((group) => group.id === "owner-flow")?.status).toBe(
      "not_applicable"
    );
    expect(snapshot.groups.find((group) => group.id === "income")?.status).toBe("reconstructed");
  });

  it("uses structured asset continuity to unblock heavy depreciation files while keeping dirty books partial", () => {
    const heavyDepreciation = buildTinaBooksReconstruction(
      TINA_SKILL_REVIEW_DRAFTS["heavy-depreciation-year"]
    );
    const dirtyLedger = buildTinaLedgerReconstruction(TINA_SKILL_REVIEW_DRAFTS["dirty-books"]);

    expect(heavyDepreciation.overallStatus).toBe("reconstructed");
    expect(heavyDepreciation.areas.find((area) => area.id === "fixed_assets")?.status).toBe(
      "ready"
    );
    expect(dirtyLedger.overallStatus).toBe("partial");
    expect(dirtyLedger.groups.some((group) => group.status === "blocked")).toBe(true);
  });
});
