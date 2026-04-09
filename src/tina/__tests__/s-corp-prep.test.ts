import { describe, expect, it } from "vitest";
import { buildTinaSCorpPrepReport } from "@/tina/lib/s-corp-prep";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaSCorpPrepReport", () => {
  it("builds a real 1120-S prep spine from a strong packet", () => {
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
      documents: [
        {
          id: "prior-doc",
          name: "prior-return.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "local/prior-return.csv",
          category: "prior_return" as const,
          requestId: "prior-return",
          requestLabel: "Prior-year filed return",
          uploadedAt: "2026-04-08T22:00:00.000Z",
        },
        {
          id: "entity-doc",
          name: "entity-docs.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "local/entity-docs.pdf",
          category: "supporting_document" as const,
          requestId: "entity-docs",
          requestLabel: "Entity and ownership documents",
          uploadedAt: "2026-04-08T22:00:30.000Z",
        },
        {
          id: "balance-doc",
          name: "balance-sheet.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "local/balance-sheet.csv",
          category: "supporting_document" as const,
          requestId: "balance-sheet",
          requestLabel: "Year-end balance sheet",
          uploadedAt: "2026-04-08T22:01:00.000Z",
        },
        {
          id: "tb-doc",
          name: "trial-balance.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "local/trial-balance.csv",
          category: "supporting_document" as const,
          requestId: "trial-balance",
          requestLabel: "Year-end trial balance",
          uploadedAt: "2026-04-08T22:01:15.000Z",
        },
        {
          id: "gl-doc",
          name: "gl.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "local/gl.csv",
          category: "supporting_document" as const,
          requestId: "general-ledger",
          requestLabel: "General ledger export",
          uploadedAt: "2026-04-08T22:01:30.000Z",
        },
        {
          id: "payroll-doc",
          name: "payroll.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "local/payroll.csv",
          category: "supporting_document" as const,
          requestId: "payroll",
          requestLabel: "Payroll reports and W-2 support",
          uploadedAt: "2026-04-08T22:02:00.000Z",
        },
        {
          id: "loan-doc",
          name: "loan.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "local/loan.csv",
          category: "supporting_document" as const,
          requestId: "loan-support",
          requestLabel: "Loan statements and debt support",
          uploadedAt: "2026-04-08T22:02:30.000Z",
        },
        {
          id: "asset-doc",
          name: "assets.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "local/assets.csv",
          category: "supporting_document" as const,
          requestId: "assets",
          requestLabel: "Fixed asset and depreciation support",
          uploadedAt: "2026-04-08T22:03:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "return-type",
          sourceDocumentId: "prior-doc",
          label: "Return type hint",
          value: "1120-S",
          confidence: "high" as const,
          capturedAt: "2026-04-08T22:03:30.000Z",
        },
        {
          id: "ownership",
          sourceDocumentId: "entity-doc",
          label: "Ownership percentage clue",
          value: "100%",
          confidence: "high" as const,
          capturedAt: "2026-04-08T22:03:45.000Z",
        },
        {
          id: "carryover",
          sourceDocumentId: "prior-doc",
          label: "Carryover amount clue",
          value: "$12,000",
          confidence: "medium" as const,
          capturedAt: "2026-04-08T22:04:00.000Z",
        },
        {
          id: "election",
          sourceDocumentId: "entity-doc",
          label: "Election detail clue",
          value: "S election accepted",
          confidence: "medium" as const,
          capturedAt: "2026-04-08T22:04:05.000Z",
        },
        {
          id: "payroll",
          sourceDocumentId: "payroll-doc",
          label: "Payroll clue",
          value: "This paper mentions payroll.",
          confidence: "medium" as const,
          capturedAt: "2026-04-08T22:04:20.000Z",
        },
        {
          id: "loan",
          sourceDocumentId: "loan-doc",
          label: "Related-party clue",
          value: "Shareholder loan activity.",
          confidence: "medium" as const,
          capturedAt: "2026-04-08T22:04:30.000Z",
        },
        {
          id: "depr",
          sourceDocumentId: "asset-doc",
          label: "Depreciation clue",
          value: "Depreciation schedule reference.",
          confidence: "medium" as const,
          capturedAt: "2026-04-08T22:04:40.000Z",
        },
      ],
    };

    const report = buildTinaSCorpPrepReport(draft);

    expect(report.status).toBe("ready");
    expect(report.sections.some((section) => section.id === "shareholder_basis")).toBe(true);
    expect(report.sections.some((section) => section.id === "debt_basis")).toBe(true);
  });
});
