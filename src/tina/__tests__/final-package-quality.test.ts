import { describe, expect, it } from "vitest";
import { buildTinaFinalPackageQualityReport } from "@/tina/lib/final-package-quality";
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

describe("buildTinaFinalPackageQualityReport", () => {
  it("returns ready when trace, proof, and transaction reconciliation all line up", () => {
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
      bookTieOut: {
        ...createDefaultTinaWorkspaceDraft().bookTieOut,
        status: "complete",
        entries: [
          {
            id: "entry-1",
            documentId: "doc-qb",
            label: "Gross receipts",
            moneyIn: 20000,
            moneyOut: 0,
            net: 20000,
            dateCoverage: "2025-01-01 to 2025-12-31",
            status: "ready",
          },
        ],
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete",
        lines: [
          {
            id: "rf-1",
            label: "Gross receipts",
            amount: 20000,
            status: "approved",
            summary: "Looks good.",
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-qb"],
          },
        ],
      },
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
            reviewerFinalLineIds: ["rf-1"],
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
      taxPositionMemory: {
        ...createDefaultTinaWorkspaceDraft().taxPositionMemory,
        status: "complete",
        records: [
          {
            id: "tax-position-tax-1",
            adjustmentId: "tax-1",
            title: "Carry income",
            status: "ready",
            confidence: "high",
            summary: "Reviewer anchored.",
            treatmentSummary: "Carry it",
            reviewerGuidance: "Approved by reviewer.",
            authorityWorkIdeaIds: [],
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
            reviewerOutcomeIds: ["outcome-1"],
            reviewerOverrideIds: [],
            updatedAt: "2026-03-27T04:00:30.000Z",
          },
        ],
      },
    });

    const report = buildTinaFinalPackageQualityReport(draft);

    expect(report.status).toBe("ready");
    expect(report.checks.every((check) => check.status === "ready")).toBe(true);
  });

  it("blocks when book tie-out exists but numeric proof for the field is still weak", () => {
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
      bookTieOut: {
        ...createDefaultTinaWorkspaceDraft().bookTieOut,
        status: "complete",
        entries: [
          {
            id: "entry-1",
            documentId: "doc-qb",
            label: "Gross receipts",
            moneyIn: 20000,
            moneyOut: 0,
            net: 20000,
            dateCoverage: "2025-01-01 to 2025-12-31",
            status: "ready",
          },
        ],
      },
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
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-other"],
          },
        ],
      },
    });

    const report = buildTinaFinalPackageQualityReport(draft);

    expect(report.status).toBe("blocked");
    expect(report.checks.find((check) => check.id === "numeric_proof")?.status).toBe("blocked");
  });

  it("blocks when transaction-group totals do not align cleanly with the filed amount", () => {
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
            "Client deposit (inflow): 2 rows, total $12,000, dates Jan 1, 2025 to Jan 30, 2025",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      bookTieOut: {
        ...createDefaultTinaWorkspaceDraft().bookTieOut,
        status: "complete",
        entries: [
          {
            id: "entry-1",
            documentId: "doc-qb",
            label: "Gross receipts",
            moneyIn: 20000,
            moneyOut: 0,
            net: 20000,
            dateCoverage: "2025-01-01 to 2025-12-31",
            status: "ready",
          },
        ],
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete",
        lines: [
          {
            id: "rf-1",
            label: "Gross receipts",
            amount: 20000,
            status: "approved",
            summary: "Looks good.",
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-qb"],
          },
        ],
      },
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
            reviewerFinalLineIds: ["rf-1"],
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
      taxPositionMemory: {
        ...createDefaultTinaWorkspaceDraft().taxPositionMemory,
        status: "complete",
        records: [
          {
            id: "tax-position-tax-1",
            adjustmentId: "tax-1",
            title: "Carry income",
            status: "ready",
            confidence: "high",
            summary: "Reviewer anchored.",
            treatmentSummary: "Carry it",
            reviewerGuidance: "Approved by reviewer.",
            authorityWorkIdeaIds: [],
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
            reviewerOutcomeIds: ["outcome-1"],
            reviewerOverrideIds: [],
            updatedAt: "2026-03-27T04:00:30.000Z",
          },
        ],
      },
    });

    const report = buildTinaFinalPackageQualityReport(draft);

    expect(report.status).toBe("blocked");
    expect(report.checks.find((check) => check.id === "numeric_proof")?.status).toBe("blocked");
    expect(report.checks.find((check) => check.id === "numeric_proof")?.summary).toContain(
      "do not align cleanly"
    );
  });
});
