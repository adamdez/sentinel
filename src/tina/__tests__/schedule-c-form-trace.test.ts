import { describe, expect, it } from "vitest";
import { buildTinaScheduleCFormTrace } from "@/tina/lib/schedule-c-form-trace";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("schedule-c-form-trace", () => {
  it("traces mapped Schedule C lines back to draft fields, reviewer lines, and source evidence", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Trace Test LLC",
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
            amount: 12000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income", "doc-bank"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-income"],
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
            taxAdjustmentIds: ["tax-income"],
            sourceDocumentIds: ["doc-income", "doc-bank"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
      },
    };

    const trace = buildTinaScheduleCFormTrace(draft);
    const line1 = trace.lines.find((line) => line.formKey === "grossReceipts");

    expect(trace.status).toBe("complete");
    expect(line1?.reviewerFinalLineIds).toContain("rf-income");
    expect(line1?.sourceDocumentIds).toContain("doc-income");
    expect(line1?.sourceFactIds).toContain("fact-income");
    expect(line1?.taxAdjustmentIds).toContain("tax-income");
    expect(line1?.evidenceSupportLevel).toBe("strong");
  });

  it("traces expanded supported Part II lines back to the categorized draft fields", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Trace Test LLC",
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
            amount: 12000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income", "doc-bank"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-income"],
          },
          {
            id: "rf-advertising",
            kind: "expense" as const,
            layer: "reviewer_final" as const,
            label: "Business expense candidate",
            amount: 600,
            status: "ready" as const,
            summary: "Advertising expense candidate",
            sourceDocumentIds: ["doc-advertising", "doc-bank"],
            sourceFactIds: ["fact-advertising"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-advertising"],
          },
        ],
      },
    };

    const trace = buildTinaScheduleCFormTrace(draft);
    const advertising = trace.lines.find((line) => line.formKey === "advertising");

    expect(advertising?.amount).toBe(600);
    expect(advertising?.sourceFieldIds).toContain("line-8-advertising");
    expect(advertising?.reviewerFinalLineIds).toContain("rf-advertising");
    expect(advertising?.sourceDocumentIds).toContain("doc-advertising");
    expect(advertising?.evidenceSupportLevel).toBe("strong");
  });

  it("downgrades one-document evidence to moderate instead of strong", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Thin Trace LLC",
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
            amount: 12000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-income"],
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
            taxAdjustmentIds: ["tax-income"],
            sourceDocumentIds: ["doc-income"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
      },
    };

    const trace = buildTinaScheduleCFormTrace(draft);
    const line1 = trace.lines.find((line) => line.formKey === "grossReceipts");

    expect(line1?.evidenceSupportLevel).toBe("moderate");
  });
});
