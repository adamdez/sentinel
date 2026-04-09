import { describe, expect, it } from "vitest";
import { buildTinaEntityReturnIntakeContract } from "@/tina/lib/entity-return-intake-contract";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaEntityReturnIntakeContract", () => {
  it("builds a sendable 1120-S intake review contract without pretending the return is prepared", () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "North Ridge Home Services LLC",
        taxYear: "2025",
        entityType: "s_corp" as const,
        hasPayroll: true,
      },
      priorReturnDocumentId: "prior-doc",
      documents: [
        {
          id: "prior-doc",
          name: "tina_messy_prior_year_return_extract_2024.csv",
          size: 1200,
          mimeType: "text/csv",
          storagePath: "local/prior-year.csv",
          category: "prior_return" as const,
          requestId: "prior-return",
          requestLabel: "Prior-year filed return",
          uploadedAt: "2026-04-08T20:00:00.000Z",
        },
        {
          id: "pnl-doc",
          name: "tina_messy_full_year_pnl_2025.csv",
          size: 1100,
          mimeType: "text/csv",
          storagePath: "local/pnl.csv",
          category: "supporting_document" as const,
          requestId: "profit-loss",
          requestLabel: "Full-year profit and loss",
          uploadedAt: "2026-04-08T20:01:00.000Z",
        },
        {
          id: "gl-doc",
          name: "tina_messy_general_ledger_2025.csv",
          size: 2100,
          mimeType: "text/csv",
          storagePath: "local/gl.csv",
          category: "supporting_document" as const,
          requestId: "general-ledger",
          requestLabel: "General ledger export",
          uploadedAt: "2026-04-08T20:02:00.000Z",
        },
        {
          id: "bank-doc",
          name: "tina_messy_bank_statements_extract_2025.csv",
          size: 1800,
          mimeType: "text/csv",
          storagePath: "local/bank.csv",
          category: "supporting_document" as const,
          requestId: "bank-support",
          requestLabel: "Business bank statements",
          uploadedAt: "2026-04-08T20:03:00.000Z",
        },
        {
          id: "payroll-doc",
          name: "tina_messy_payroll_and_1099_summary_2025.csv",
          size: 1800,
          mimeType: "text/csv",
          storagePath: "local/payroll.csv",
          category: "supporting_document" as const,
          requestId: "payroll",
          requestLabel: "Payroll reports and W-2 support",
          uploadedAt: "2026-04-08T20:04:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "gl-doc",
          status: "complete" as const,
          kind: "spreadsheet" as const,
          summary: "Read.",
          nextStep: "Done.",
          facts: [],
          detailLines: [],
          rowCount: 42,
          headers: ["Date", "Account", "Debit", "Credit"],
          sheetNames: ["GL"],
          lastReadAt: "2026-04-08T20:05:00.000Z",
        },
        {
          documentId: "bank-doc",
          status: "complete" as const,
          kind: "spreadsheet" as const,
          summary: "Read.",
          nextStep: "Done.",
          facts: [],
          detailLines: [],
          rowCount: 12,
          headers: ["Month", "Deposits", "Withdrawals"],
          sheetNames: ["Bank"],
          lastReadAt: "2026-04-08T20:05:30.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "return-type-hint-1",
          sourceDocumentId: "prior-doc",
          label: "Return type hint",
          value: "1120-S",
          confidence: "high" as const,
          capturedAt: "2026-04-08T20:06:00.000Z",
        },
      ],
    };

    const contract = buildTinaEntityReturnIntakeContract(draft);

    expect(contract.laneId).toBe("1120_s");
    expect(contract.status).toBe("needs_review");
    expect(contract.summary).toContain("organized the entity-return packet");
  });
});
