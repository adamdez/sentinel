import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaOfficialFormExecution } from "@/tina/lib/official-form-execution";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("official-form-execution", () => {
  it("keeps supported schedule c execution visible with real placements", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Execution Ready LLC",
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

    const snapshot = buildTinaOfficialFormExecution(draft);
    const scheduleCItem = snapshot.items.find((item) => item.formId === "f1040sc");
    const form1040Item = snapshot.items.find((item) => item.formId === "f1040");
    const scheduleSEItem = snapshot.items.find((item) => item.formId === "f1040sse");

    expect(scheduleCItem?.templateReady).toBe(true);
    expect((scheduleCItem?.placementCount ?? 0) > 0).toBe(true);
    expect(scheduleCItem?.fillMode).toBe("rendered_pdf_ready");
    expect(scheduleCItem?.directPdfFieldCount).toBeGreaterThan(0);
    expect(form1040Item?.status).toBe("ready_to_fill");
    expect(form1040Item?.fillMode).toBe("rendered_pdf_ready");
    expect(form1040Item?.placementCount).toBeGreaterThan(0);
    expect(form1040Item?.directPdfFieldCount).toBeGreaterThan(0);
    expect(scheduleSEItem?.status).toBe("ready_to_fill");
    expect(scheduleSEItem?.fillMode).toBe("rendered_pdf_ready");
    expect(scheduleSEItem?.placementCount).toBeGreaterThan(0);
    expect(scheduleSEItem?.directPdfFieldCount).toBeGreaterThan(0);
  });

  it("blocks execution when the file routes away from the supported schedule c lane", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Blocked Route LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "multi_member_llc" as const,
        ownerCount: 2,
      },
      sourceFacts: [
        {
          id: "fact-multi-owner",
          sourceDocumentId: "doc-owners",
          label: "Multi-owner clue",
          value: "This paper may show more than one owner, partner, member, K-1, or ownership split.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T12:04:00.000Z",
        },
      ],
    };

    const snapshot = buildTinaOfficialFormExecution(draft);

    expect(snapshot.overallStatus).toBe("blocked");
  });

  it("keeps attachment-form execution visible when Tina has partial direct IRS mappings", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Attachment Execution LLC",
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
          storagePath: "tina/assets.pdf",
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

    const snapshot = buildTinaOfficialFormExecution(draft);
    const form4562Item = snapshot.items.find((item) => item.formId === "f4562");
    const form8829Item = snapshot.items.find((item) => item.formId === "f8829");

    expect(form4562Item?.fillMode).toBe("annotated_pdf_ready");
    expect(form4562Item?.directPdfFieldCount).toBeGreaterThan(0);
    expect(form8829Item?.fillMode).toBe("annotated_pdf_ready");
    expect(form8829Item?.directPdfFieldCount).toBeGreaterThan(0);
  });

  it("keeps reviewer-controlled partnership execution renderable once Tina has structured 1065 values", () => {
    const snapshot = buildTinaOfficialFormExecution(
      TINA_SKILL_REVIEW_DRAFTS["uneven-multi-owner"]
    );
    const form1065Item = snapshot.items.find((item) => item.formId === "f1065");

    expect(form1065Item?.status).toBe("blocked");
    expect(form1065Item?.fillMode).toBe("blank_only");
    expect(form1065Item?.placementCount).toBeGreaterThan(0);
    expect(form1065Item?.renderedArtifactCount).toBe(0);
    expect(form1065Item?.directPdfFieldCount).toBe(0);
  });

  it("blocks non-Schedule-C primary execution when support artifacts behind the return family are still blocked", () => {
    const snapshot = buildTinaOfficialFormExecution(
      TINA_SKILL_REVIEW_DRAFTS["s-corp-election"]
    );
    const form1120SItem = snapshot.items.find((item) => item.formId === "f1120s");

    expect(form1120SItem?.status).toBe("blocked");
    expect(form1120SItem?.summary).toContain("support artifacts");
  });
});
