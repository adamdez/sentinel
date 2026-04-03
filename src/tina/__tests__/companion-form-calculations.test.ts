import { describe, expect, it } from "vitest";
import { buildTinaCompanionFormCalculations } from "@/tina/lib/companion-form-calculations";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("companion-form-calculations", () => {
  it("builds Schedule SE and Form 1040 carry calculations from positive Schedule C profit", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Profit LLC",
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
            amount: 50000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income", "doc-bank"],
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
            amount: 50000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-income", "doc-bank"],
          },
        ],
        notes: [],
      },
    };

    const calculations = buildTinaCompanionFormCalculations(draft);

    expect(calculations.overallStatus).toBe("ready");
    expect(calculations.items.find((item) => item.id === "form-1040-line-carry")?.status).toBe(
      "ready"
    );
    expect(calculations.items.find((item) => item.id === "schedule-se-estimate")?.status).toBe(
      "ready"
    );
    expect(
      calculations.items.find((item) => item.id === "schedule-se-estimate")?.estimatedValues.length
    ).toBeGreaterThan(0);
  });

  it("blocks home-office calculations when support inputs are missing", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Home Office LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting home office",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
        notes: "Home office deduction likely applies.",
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
            amount: 10000,
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
            amount: 10000,
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

    const calculations = buildTinaCompanionFormCalculations(draft);

    expect(calculations.overallStatus).toBe("blocked");
    expect(calculations.items.find((item) => item.id === "form-8829-home-office")?.status).toBe(
      "blocked"
    );
  });
});
