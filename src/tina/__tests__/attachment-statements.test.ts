import { describe, expect, it } from "vitest";
import { buildTinaAttachmentStatements } from "@/tina/lib/attachment-statements";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("attachment-statements", () => {
  it("builds the expected attachment statements for messy supported Schedule C files", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Attachment Heavy LLC",
        taxYear: "2025",
        principalBusinessActivity: "Retail consulting",
        naicsCode: "454110",
        entityType: "sole_prop" as const,
        hasFixedAssets: true,
        hasInventory: true,
        notes: "Home office used exclusively for business.",
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
            amount: 22000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: ["tax-income"],
            sourceDocumentIds: ["doc-income"],
          },
          {
            id: "line-4-cogs",
            lineNumber: "Line 4",
            label: "Cost of goods sold",
            amount: 6000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-income"],
          },
          {
            id: "line-13-depreciation",
            lineNumber: "Line 13",
            label: "Depreciation and section 179",
            amount: 1800,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-income"],
          },
          {
            id: "line-27a-other-expenses",
            lineNumber: "Line 27a",
            label: "Other expenses",
            amount: 3000,
            status: "needs_attention" as const,
            summary: "Still needs categorization.",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-income"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "needs_review" as const,
        items: [],
      },
    };

    const snapshot = buildTinaAttachmentStatements(draft);

    expect(snapshot.items.some((item) => item.category === "other_expense_detail")).toBe(true);
    expect(snapshot.items.some((item) => item.category === "depreciation_support")).toBe(true);
    expect(snapshot.items.some((item) => item.category === "home_office_support")).toBe(true);
    expect(snapshot.items.some((item) => item.category === "inventory_support")).toBe(true);
    expect(snapshot.overallStatus).toBe("blocked");
  });
});
