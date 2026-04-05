import { describe, expect, it } from "vitest";
import { buildTinaBooksReconciliation } from "@/tina/lib/books-reconciliation";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("books-reconciliation", () => {
  it("reconciles clean reviewer-final books totals to Schedule C output", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Recon LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-income",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Income",
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
          {
            id: "rf-expense",
            kind: "expense" as const,
            layer: "reviewer_final" as const,
            label: "Advertising",
            amount: 500,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-expense"],
            sourceFactIds: ["fact-expense"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
        ],
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-income"],
          },
          {
            id: "line-8-advertising",
            lineNumber: "Line 8",
            label: "Advertising",
            amount: 500,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-expense"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-expense"],
          },
          {
            id: "line-28-total-expenses",
            lineNumber: "Line 28",
            label: "Total expenses",
            amount: 500,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-expense"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-expense"],
          },
          {
            id: "line-31-tentative-net",
            lineNumber: "Line 31",
            label: "Net profit or loss",
            amount: 14500,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income", "rf-expense"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-income", "doc-expense"],
          },
        ],
        notes: [],
      },
    };

    const reconciliation = buildTinaBooksReconciliation(draft);

    expect(["reconciled", "needs_review"]).toContain(reconciliation.overallStatus);
    expect(
      reconciliation.checks.find((check) => check.id === "gross-receipts-reconciliation")?.status
    ).toBe("reconciled");
    expect(
      reconciliation.checks.find((check) => check.id === "expense-reconciliation")?.status
    ).toBe("reconciled");
    expect(
      reconciliation.checks.find((check) => check.id === "net-profit-reconciliation")?.status
    ).toBe("reconciled");
    expect(reconciliation.materialVarianceCount).toBe(0);
  });

  it("blocks when reviewer-final income and line 1 do not match", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Mismatch LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-income",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Income",
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
        ],
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 12000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-income"],
          },
        ],
        notes: [],
      },
    };

    const reconciliation = buildTinaBooksReconciliation(draft);

    expect(reconciliation.overallStatus).toBe("blocked");
    expect(
      reconciliation.checks.find((check) => check.id === "gross-receipts-reconciliation")?.status
    ).toBe("blocked");
    expect(reconciliation.materialVarianceCount).toBeGreaterThanOrEqual(1);
  });
});
