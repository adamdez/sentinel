import { describe, expect, it } from "vitest";
import { buildTinaTransactionReconciliationReport } from "@/tina/lib/transaction-reconciliation";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaWorkspaceDraft } from "@/tina/types";

function buildDraft(overrides?: Partial<TinaWorkspaceDraft>): TinaWorkspaceDraft {
  return {
    ...createDefaultTinaWorkspaceDraft(),
    ...overrides,
    profile: {
      ...createDefaultTinaWorkspaceDraft().profile,
      ...(overrides?.profile ?? {}),
    },
  };
}

describe("buildTinaTransactionReconciliationReport", () => {
  it("marks generic approved treatment as ready for a current transaction group", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-group-1",
          sourceDocumentId: "doc-qb",
          label: "Transaction group clue",
          value: "Gross receipts deposits grouped by month",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-qb"],
          },
        ],
      },
      taxAdjustments: {
        ...createDefaultTinaWorkspaceDraft().taxAdjustments,
        status: "complete",
        adjustments: [
          {
            id: "tax-1",
            kind: "carryforward_line",
            status: "approved",
            risk: "low",
            requiresAuthority: false,
            title: "Carry income",
            summary: "Approved",
            suggestedTreatment: "Carry it",
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: [],
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const report = buildTinaTransactionReconciliationReport(draft);

    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]?.status).toBe("ready");
    expect(report.groups[0]?.lineageCount).toBe(0);
  });

  it("blocks specialized evidence when the downstream treatment is still generic", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-group-1",
          sourceDocumentId: "doc-qb",
          label: "Transaction group clue",
          value: "Payroll transfers grouped by month",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete",
        fields: [
          {
            id: "line-26-wages",
            lineNumber: "Line 26",
            label: "Wages",
            amount: 12000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-qb"],
          },
        ],
      },
      taxAdjustments: {
        ...createDefaultTinaWorkspaceDraft().taxAdjustments,
        status: "complete",
        adjustments: [
          {
            id: "tax-1",
            kind: "carryforward_line",
            status: "approved",
            risk: "low",
            requiresAuthority: false,
            title: "Carry payroll number",
            summary: "Approved",
            suggestedTreatment: "Carry it",
            whyItMatters: "Matters",
            amount: 12000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: [],
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const report = buildTinaTransactionReconciliationReport(draft);

    expect(report.groups[0]?.status).toBe("blocked");
    expect(report.summary).toContain("blocked");
  });

  it("blocks lineage-rich evidence when field amounts still do not align cleanly", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-group-1",
          sourceDocumentId: "doc-qb",
          label: "Transaction group clue",
          value:
            "Client receipts (inflow): 2 rows, total $12,000.00, dates Jan 1, 2025 to Jan 31, 2025",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
        {
          id: "fact-lineage-1",
          sourceDocumentId: "doc-qb",
          label: "Transaction lineage clue",
          value:
            "Client receipts | 2025-01 (inflow): 2 rows, total $12,000.00, dates Jan 1, 2025 to Jan 31, 2025",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-qb"],
          },
        ],
      },
      taxAdjustments: {
        ...createDefaultTinaWorkspaceDraft().taxAdjustments,
        status: "complete",
        adjustments: [
          {
            id: "tax-1",
            kind: "carryforward_line",
            status: "approved",
            risk: "low",
            requiresAuthority: false,
            title: "Carry income",
            summary: "Approved",
            suggestedTreatment: "Carry it",
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: [],
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1", "fact-lineage-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const report = buildTinaTransactionReconciliationReport(draft);

    expect(report.groups[0]?.status).toBe("blocked");
    expect(report.groups[0]?.lineageCount).toBe(1);
    expect(report.groups[0]?.mismatchCount).toBe(1);
    expect(report.groups[0]?.summary).toContain("row-cluster lineage");
    expect(report.groups[0]?.summary).toContain("do not align cleanly");
  });
});
