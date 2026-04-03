import { describe, expect, it } from "vitest";
import { buildTinaCompanionFormPlan } from "@/tina/lib/companion-form-plan";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("companion-form-plan", () => {
  it("maps the key federal companion forms for a supported profitable Schedule C file", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Companion Plan LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "single_member_llc" as const,
        ownerCount: 1,
        taxElection: "default" as const,
        hasFixedAssets: true,
      },
      sourceFacts: [
        {
          id: "fact-owner-count",
          sourceDocumentId: "doc-organizer",
          label: "Owner count clue",
          value: "Single member only.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:00:00.000Z",
        },
        {
          id: "fact-return-type",
          sourceDocumentId: "doc-prior",
          label: "Return type clue",
          value: "Schedule C",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:01:00.000Z",
        },
        {
          id: "fact-depr",
          sourceDocumentId: "doc-assets",
          label: "Depreciation clue",
          value: "Depreciation support",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:02:00.000Z",
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
            amount: 90000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income-1", "doc-income-2"],
            sourceFactIds: ["fact-return-type"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
          {
            id: "rf-depr",
            kind: "expense" as const,
            layer: "reviewer_final" as const,
            label: "Depreciation candidate",
            amount: 2000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-assets", "doc-assets-2"],
            sourceFactIds: ["fact-depr"],
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
            amount: 90000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-income-1", "doc-income-2"],
          },
          {
            id: "line-13-depreciation",
            lineNumber: "Line 13",
            label: "Depreciation and section 179",
            amount: 2000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-depr"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-assets", "doc-assets-2"],
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

    const snapshot = buildTinaCompanionFormPlan(draft);

    expect(snapshot.items.some((item) => item.formId === "f1040sc")).toBe(true);
    expect(snapshot.items.some((item) => item.formId === "f1040")).toBe(true);
    expect(snapshot.items.some((item) => item.formId === "f1040sse")).toBe(true);
    expect(snapshot.items.some((item) => item.formId === "f4562")).toBe(true);
  });
});
