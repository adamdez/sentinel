import { describe, expect, it } from "vitest";
import { buildTinaAttachmentSchedules } from "@/tina/lib/attachment-schedules";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("attachment-schedules", () => {
  it("builds structured schedules for attachment-heavy supported files", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Attachment Heavy LLC",
        entityType: "sole_prop" as const,
        principalBusinessActivity: "Home office consulting",
        notes: "Uses a home office and keeps inventory in a small workspace.",
        hasFixedAssets: true,
        hasInventory: true,
        ownershipChangedDuringYear: true,
      },
      documents: [
        {
          id: "doc-asset",
          name: "asset register.xlsx",
          size: 100,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          storagePath: "tina/assets.xlsx",
          category: "supporting_document" as const,
          requestId: "asset-register",
          requestLabel: "Asset register",
          uploadedAt: "2026-04-03T11:00:00.000Z",
        },
        {
          id: "doc-inventory",
          name: "inventory counts.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/inventory.csv",
          category: "supporting_document" as const,
          requestId: "inventory",
          requestLabel: "Inventory counts",
          uploadedAt: "2026-04-03T11:01:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-home-office",
          sourceDocumentId: "doc-asset",
          label: "Home office support",
          value: "Exclusive use square footage is 120 square feet.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T11:02:00.000Z",
        },
        {
          id: "fact-inventory-method",
          sourceDocumentId: "doc-inventory",
          label: "Inventory method",
          value: "Inventory method uses FIFO.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T11:03:00.000Z",
        },
      ],
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-other-expense",
            kind: "expense" as const,
            layer: "reviewer_final" as const,
            label: "Business expense candidate",
            amount: 900,
            status: "ready" as const,
            summary: "Membership dues",
            sourceDocumentIds: ["doc-asset"],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
          {
            id: "rf-depreciation",
            kind: "expense" as const,
            layer: "reviewer_final" as const,
            label: "Business expense candidate",
            amount: 2400,
            status: "needs_attention" as const,
            summary: "Depreciation on equipment",
            sourceDocumentIds: ["doc-asset"],
            sourceFactIds: [],
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
            id: "line-13-depreciation",
            lineNumber: "Line 13",
            label: "Depreciation and section 179 expense deduction",
            amount: 2400,
            status: "needs_attention" as const,
            summary: "Needs review",
            reviewerFinalLineIds: ["rf-depreciation"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-asset"],
          },
          {
            id: "line-27a-other-expenses",
            lineNumber: "Line 27a",
            label: "Other expenses",
            amount: 900,
            status: "needs_attention" as const,
            summary: "Needs review",
            reviewerFinalLineIds: ["rf-other-expense"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-asset"],
          },
          {
            id: "line-4-cogs",
            lineNumber: "Line 4",
            label: "Cost of goods sold",
            amount: 3000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-inventory"],
          },
        ],
        notes: [],
      },
    };

    const snapshot = buildTinaAttachmentSchedules(draft);

    expect(snapshot.items.some((item) => item.category === "depreciation_support")).toBe(true);
    expect(snapshot.items.some((item) => item.category === "home_office_support")).toBe(true);
    expect(snapshot.items.some((item) => item.category === "inventory_support")).toBe(true);
    expect(snapshot.items.some((item) => item.category === "owner_flow_explanation")).toBe(true);
  });
});
