import { describe, expect, it } from "vitest";
import { buildTinaScheduleCFormCoverage } from "@/tina/lib/schedule-c-form-coverage";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("schedule-c-form-coverage", () => {
  it("shows a simple zero-expense supported file as covered on currently relevant sections", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Coverage Test LLC",
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
            amount: 15000,
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
            amount: 15000,
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
        items: [],
      },
    };

    const coverage = buildTinaScheduleCFormCoverage(draft);
    expect(coverage.items.find((item) => item.id === "part-ii-expenses-core")?.status).toBe(
      "covered"
    );
  });

  it("flags unsupported sections when inventory, fixed assets, or vehicle signals exist", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Coverage Test LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
        hasInventory: true,
        hasFixedAssets: true,
        notes: "vehicle mileage log exists",
      },
    };

    const coverage = buildTinaScheduleCFormCoverage(draft);
    expect(coverage.items.find((item) => item.id === "inventory-cogs-support")?.status).toBe(
      "unsupported"
    );
    expect(coverage.items.find((item) => item.id === "depreciation-and-4562")?.status).toBe(
      "unsupported"
    );
    expect(coverage.items.find((item) => item.id === "vehicle-information")?.status).toBe(
      "unsupported"
    );
  });

  it("marks core Part II coverage as partial when uncategorized other expenses remain", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Coverage Test LLC",
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
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-income"],
          },
          {
            id: "rf-expense",
            kind: "expense" as const,
            layer: "reviewer_final" as const,
            label: "Business expense candidate",
            amount: 500,
            status: "ready" as const,
            summary: "General expense candidate",
            sourceDocumentIds: ["doc-expense"],
            sourceFactIds: ["fact-expense"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-expense"],
          },
        ],
      },
    };

    const coverage = buildTinaScheduleCFormCoverage(draft);
    expect(coverage.items.find((item) => item.id === "part-ii-expenses-core")?.status).toBe(
      "partial"
    );
  });

  it("treats schedule c coverage as unsupported context when the filing path is blocked", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Blocked Coverage LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "multi_member_llc" as const,
        ownerCount: 2,
      },
      sourceFacts: [
        {
          id: "multi-owner-fact",
          sourceDocumentId: "doc-owners",
          label: "Multi-owner clue",
          value:
            "This paper may show more than one owner, partner, member, K-1, or ownership split.",
          confidence: "high" as const,
          capturedAt: "2026-04-02T19:20:00.000Z",
        },
      ],
    };

    const coverage = buildTinaScheduleCFormCoverage(draft);

    expect(coverage.summary).toContain("routed away from the supported Schedule C lane");
    expect(coverage.items.every((item) => item.status === "unsupported")).toBe(true);
  });
});
