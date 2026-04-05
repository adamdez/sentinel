import { describe, expect, it } from "vitest";
import { buildTinaCompanionFormRenderPlan } from "@/tina/lib/companion-form-render-plan";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("companion-form-render-plan", () => {
  it("builds explicit field payloads for ready companion forms on supported Schedule C files", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Render Plan LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
      },
      documents: [
        {
          id: "doc-income",
          name: "income-summary.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/income.pdf",
          category: "supporting_document" as const,
          requestId: "income",
          requestLabel: "Income summary",
          uploadedAt: "2026-04-03T12:00:00.000Z",
        },
        {
          id: "doc-expense",
          name: "advertising-ledger.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/expense.csv",
          category: "supporting_document" as const,
          requestId: "expense",
          requestLabel: "Advertising detail",
          uploadedAt: "2026-04-03T12:01:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-income",
          sourceDocumentId: "doc-income",
          label: "Income support",
          value: "Gross receipts support is complete.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T12:02:00.000Z",
        },
        {
          id: "fact-expense",
          sourceDocumentId: "doc-expense",
          label: "Advertising support",
          value: "Advertising support is complete.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T12:03:00.000Z",
        },
      ],
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
            taxAdjustmentIds: [],
          },
          {
            id: "rf-advertising",
            kind: "expense" as const,
            layer: "reviewer_final" as const,
            label: "Advertising expense candidate",
            amount: 1400,
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
            amount: 22000,
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
            amount: 1400,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-advertising"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-expense"],
          },
        ],
        notes: [],
      },
    };

    const snapshot = buildTinaCompanionFormRenderPlan(draft);
    const form1040Item = snapshot.items.find((item) => item.formId === "f1040");
    const scheduleSEItem = snapshot.items.find((item) => item.formId === "f1040sse");

    expect(snapshot.overallStatus).toBe("ready_to_fill");
    expect(form1040Item?.status).toBe("ready_to_fill");
    expect(form1040Item?.templateReady).toBe(true);
    expect(form1040Item?.fieldValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Schedule C line 31 carryover amount",
          supportLevel: "derived",
        }),
      ])
    );
    expect(scheduleSEItem?.status).toBe("ready_to_fill");
    expect(scheduleSEItem?.fieldValues.length).toBeGreaterThanOrEqual(3);
    expect(
      scheduleSEItem?.fieldValues.some(
        (fieldValue) =>
          fieldValue.label === "Estimated Schedule SE tax before wage interaction adjustments"
      )
    ).toBe(true);
  });

  it("includes attachment-form payloads for fixed-asset and home-office files", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Attachment Render LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
        hasFixedAssets: true,
        notes: "Home office deduction likely applies.",
      },
      documents: [
        {
          id: "doc-asset",
          name: "fixed-asset-register.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/fixed-assets.pdf",
          category: "supporting_document" as const,
          requestId: "asset-register",
          requestLabel: "Asset register",
          uploadedAt: "2026-04-03T12:00:00.000Z",
        },
        {
          id: "doc-home-office",
          name: "home-office-support.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/home-office.pdf",
          category: "supporting_document" as const,
          requestId: "home-office",
          requestLabel: "Home office support",
          uploadedAt: "2026-04-03T12:01:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-home-office",
          sourceDocumentId: "doc-home-office",
          label: "Home office facts",
          value:
            "Office square footage 180, home square footage 1800, rent 18000, utilities 2400, exclusive use confirmed.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T12:02:00.000Z",
        },
      ],
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
            sourceDocumentIds: ["doc-home-office"],
            sourceFactIds: ["fact-home-office"],
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
            amount: 3200,
            status: "ready" as const,
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
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 22000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-home-office"],
          },
          {
            id: "line-13-depreciation",
            lineNumber: "Line 13",
            label: "Depreciation and section 179 expense deduction",
            amount: 3200,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-depreciation"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-asset"],
          },
        ],
        notes: [],
      },
    };

    const snapshot = buildTinaCompanionFormRenderPlan(draft);
    const form4562 = snapshot.items.find((item) => item.formId === "f4562");
    const form8829 = snapshot.items.find((item) => item.formId === "f8829");

    expect(form4562?.fieldValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Business or activity to which this form relates",
          value: "Consulting",
        }),
        expect.objectContaining({
          label: "Current-year depreciation from Schedule C line 13",
          value: "$3,200",
        }),
      ])
    );
    expect(form8829?.fieldValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Area used regularly and exclusively for business",
          value: "180",
        }),
        expect.objectContaining({
          label: "Business-use percentage",
          value: "10.00",
        }),
        expect.objectContaining({
          label: "Rent indirect expense",
          value: "$18,000",
        }),
      ])
    );
  });
});
