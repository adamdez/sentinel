import { describe, expect, it } from "vitest";
import { buildTinaScheduleCReturn } from "@/tina/lib/schedule-c-return";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaScheduleCReturn", () => {
  it("maps supported Schedule C fields into a structured return snapshot", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
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
            label: "Gross receipts candidate",
            amount: 22000,
            status: "ready" as const,
            summary: "Approved income",
            sourceDocumentIds: ["doc-income"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: ["ai-income"],
            cleanupSuggestionIds: ["cleanup-income"],
            taxAdjustmentIds: ["tax-income"],
          },
          {
            id: "rf-expense",
            kind: "expense" as const,
            layer: "reviewer_final" as const,
            label: "Business expense candidate",
            amount: 4000,
            status: "ready" as const,
            summary: "Approved advertising expense candidate",
            sourceDocumentIds: ["doc-expense"],
            sourceFactIds: ["fact-expense"],
            issueIds: [],
            derivedFromLineIds: ["ai-expense"],
            cleanupSuggestionIds: ["cleanup-expense"],
            taxAdjustmentIds: ["tax-expense"],
          },
        ],
      },
    };

    const snapshot = buildTinaScheduleCReturn(draft);
    expect(snapshot.status).toBe("complete");
    expect(snapshot.fields.find((field) => field.formKey === "grossReceipts")?.amount).toBe(22000);
    expect(snapshot.fields.find((field) => field.formKey === "advertising")?.amount).toBe(4000);
    expect(snapshot.fields.find((field) => field.formKey === "totalExpenses")?.amount).toBe(4000);
    expect(snapshot.fields.find((field) => field.formKey === "netProfitOrLoss")?.amount).toBe(
      18000
    );
  });

  it("refuses to build a supported schedule c return when source papers point to another lane", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Conflicted LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "single_member_llc" as const,
      },
      sourceFacts: [
        {
          id: "return-hint-1065",
          sourceDocumentId: "doc-1",
          label: "Return type hint",
          value: "1065 / partnership return",
          confidence: "high" as const,
          capturedAt: "2026-04-02T19:05:00.000Z",
        },
      ],
    };

    const snapshot = buildTinaScheduleCReturn(draft);
    expect(snapshot.status).toBe("idle");
    expect(snapshot.laneId).toBe("1065");
    expect(snapshot.summary).toContain("will not build");
    expect(snapshot.validationIssues.some((issue) => issue.id === "start-path-blocked")).toBe(true);
  });

  it("raises blocking validation when form lines are still unresolved", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
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
            label: "Gross receipts candidate",
            amount: 22000,
            status: "ready" as const,
            summary: "Approved income",
            sourceDocumentIds: ["doc-income"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: ["ai-income"],
            cleanupSuggestionIds: ["cleanup-income"],
            taxAdjustmentIds: ["tax-income"],
          },
          {
            id: "rf-sales-tax",
            kind: "signal" as const,
            layer: "reviewer_final" as const,
            label: "Sales tax should stay out of income",
            amount: 1200,
            status: "needs_attention" as const,
            summary: "Still careful",
            sourceDocumentIds: ["doc-sales-tax"],
            sourceFactIds: ["fact-sales-tax"],
            issueIds: [],
            derivedFromLineIds: ["ai-sales-tax"],
            cleanupSuggestionIds: ["cleanup-sales-tax"],
            taxAdjustmentIds: ["tax-sales-tax"],
          },
        ],
      },
    };

    const snapshot = buildTinaScheduleCReturn(draft);
    expect(snapshot.validationIssues.some((issue) => issue.severity === "blocking")).toBe(true);
  });

  it("raises blocking validation when mapped form math does not reconcile", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
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
            label: "Gross receipts candidate",
            amount: 22000,
            status: "ready" as const,
            summary: "Approved income",
            sourceDocumentIds: ["doc-income"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: ["ai-income"],
            cleanupSuggestionIds: ["cleanup-income"],
            taxAdjustmentIds: ["tax-income"],
          },
          {
            id: "rf-wages",
            kind: "expense" as const,
            layer: "reviewer_final" as const,
            label: "Payroll expense candidate",
            amount: 1000,
            status: "ready" as const,
            summary: "Approved wages",
            sourceDocumentIds: ["doc-wages"],
            sourceFactIds: ["fact-wages"],
            issueIds: [],
            derivedFromLineIds: ["ai-wages"],
            cleanupSuggestionIds: ["cleanup-wages"],
            taxAdjustmentIds: ["tax-wages"],
          },
          {
            id: "rf-expense",
            kind: "expense" as const,
            layer: "reviewer_final" as const,
            label: "Business expense candidate",
            amount: 4000,
            status: "ready" as const,
            summary: "Approved office expense candidate",
            sourceDocumentIds: ["doc-expense"],
            sourceFactIds: ["fact-expense"],
            issueIds: [],
            derivedFromLineIds: ["ai-expense"],
            cleanupSuggestionIds: ["cleanup-expense"],
            taxAdjustmentIds: ["tax-expense"],
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
            amount: 22000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: ["tax-income"],
            sourceDocumentIds: ["doc-income"],
          },
          {
            id: "line-11-contract-labor",
            lineNumber: "Line 11",
            label: "Contract labor",
            amount: 0,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: [],
          },
          {
            id: "line-18-office-expense",
            lineNumber: "Line 18",
            label: "Office expense",
            amount: 4000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-expense"],
            taxAdjustmentIds: ["tax-expense"],
            sourceDocumentIds: ["doc-expense"],
          },
          {
            id: "line-26-wages",
            lineNumber: "Line 26",
            label: "Wages",
            amount: 1000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-wages"],
            taxAdjustmentIds: ["tax-wages"],
            sourceDocumentIds: ["doc-wages"],
          },
          {
            id: "line-27a-other-expenses",
            lineNumber: "Line 27a",
            label: "Other expenses",
            amount: 0,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: [],
          },
          {
            id: "line-28-total-expenses",
            lineNumber: "Line 28",
            label: "Total expenses",
            amount: 9999,
            status: "ready" as const,
            summary: "Wrong",
            reviewerFinalLineIds: ["rf-wages", "rf-expense"],
            taxAdjustmentIds: ["tax-wages", "tax-expense"],
            sourceDocumentIds: ["doc-wages", "doc-expense"],
          },
          {
            id: "line-31-tentative-net",
            lineNumber: "Line 31",
            label: "Tentative net profit or loss",
            amount: 12345,
            status: "ready" as const,
            summary: "Wrong",
            reviewerFinalLineIds: ["rf-income", "rf-wages", "rf-expense"],
            taxAdjustmentIds: ["tax-income", "tax-wages", "tax-expense"],
            sourceDocumentIds: ["doc-income", "doc-wages", "doc-expense"],
          },
        ],
        notes: [],
      },
    };

    const snapshot = buildTinaScheduleCReturn(draft);
    expect(snapshot.header.principalBusinessActivity).toBe("Consulting");
    expect(snapshot.header.naicsCode).toBe("541611");
    expect(snapshot.validationIssues.some((issue) => issue.id === "total-expenses-cross-check")).toBe(
      true
    );
    expect(snapshot.validationIssues.some((issue) => issue.id === "net-profit-cross-check")).toBe(
      true
    );
  });
});
