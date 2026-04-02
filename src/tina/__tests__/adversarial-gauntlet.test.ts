import { describe, expect, it } from "vitest";
import { buildTinaIssueQueue } from "@/tina/lib/issue-queue";
import { buildTinaPackageReadiness } from "@/tina/lib/package-readiness";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaWorkspaceDraft } from "@/tina/types";

function buildDraft(overrides?: Partial<TinaWorkspaceDraft>): TinaWorkspaceDraft {
  return {
    ...createDefaultTinaWorkspaceDraft(),
    ...overrides,
    profile: {
      ...createDefaultTinaWorkspaceDraft().profile,
      ...(overrides?.profile ?? {}),
    },
  };
}

describe("tina adversarial gauntlet", () => {
  it("catches stacked contradictions from fabricated intake papers", () => {
    const draft = buildDraft({
      profile: {
        businessName: "Dominion Seller Ops",
        entityType: "single_member_llc",
        taxYear: "2025",
        hasIdahoActivity: false,
      },
      documents: [
        {
          id: "qb-doc",
          name: "qb-export.csv",
          size: 2500,
          mimeType: "text/csv",
          storagePath: "tina/qb-export.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-04-01T23:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "return-hint",
          sourceDocumentId: "qb-doc",
          label: "Return type hint",
          value: "1120-S",
          confidence: "high",
          capturedAt: "2026-04-01T23:00:01.000Z",
        },
        {
          id: "state-idaho",
          sourceDocumentId: "qb-doc",
          label: "State clue",
          value: "This paper mentions Idaho.",
          confidence: "medium",
          capturedAt: "2026-04-01T23:00:02.000Z",
        },
        {
          id: "books-2024",
          sourceDocumentId: "qb-doc",
          label: "Date range clue",
          value: "2024-01-01 through 2024-12-31",
          confidence: "high",
          capturedAt: "2026-04-01T23:00:03.000Z",
        },
        {
          id: "books-2025",
          sourceDocumentId: "qb-doc",
          label: "Date range clue",
          value: "2025-01-01 through 2025-03-31",
          confidence: "high",
          capturedAt: "2026-04-01T23:00:04.000Z",
        },
      ],
    });

    const queue = buildTinaIssueQueue(draft);
    const itemIds = queue.items.map((item) => item.id);
    expect(itemIds).toContain("return-type-hint-conflict");
    expect(itemIds).toContain("idaho-state-clue");
    expect(itemIds).toContain("books-multi-year-mix");
  });

  it("does not over-block when contradictions are absent", () => {
    const draft = buildDraft({
      profile: {
        businessName: "Dominion Seller Ops",
        entityType: "sole_prop",
        taxYear: "2025",
      },
      documents: [
        {
          id: "qb-doc",
          name: "qb-export.csv",
          size: 2500,
          mimeType: "text/csv",
          storagePath: "tina/qb-export.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-04-01T23:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "books-2025-q1",
          sourceDocumentId: "qb-doc",
          label: "Date range clue",
          value: "2025-01-01 through 2025-03-31",
          confidence: "high",
          capturedAt: "2026-04-01T23:00:03.000Z",
        },
        {
          id: "books-2025-q2",
          sourceDocumentId: "qb-doc",
          label: "Date range clue",
          value: "2025-04-01 through 2025-06-30",
          confidence: "high",
          capturedAt: "2026-04-01T23:00:04.000Z",
        },
      ],
    });

    const queue = buildTinaIssueQueue(draft);
    expect(queue.items.some((item) => item.id === "return-type-hint-conflict")).toBe(false);
    expect(queue.items.some((item) => item.id === "idaho-state-clue")).toBe(false);
    expect(queue.items.some((item) => item.id === "books-multi-year-mix")).toBe(false);
  });

  it("prevents false ready_for_cpa when issue queue has open contradictions", () => {
    const baseDraft = buildDraft({
      profile: {
        businessName: "Dominion Seller Ops",
        entityType: "single_member_llc",
        taxYear: "2025",
      },
      sourceFacts: [
        {
          id: "return-hint",
          sourceDocumentId: "qb-doc",
          label: "Return type hint",
          value: "1120-S",
          confidence: "high",
          capturedAt: "2026-04-01T23:00:01.000Z",
        },
      ],
    });

    const queue = buildTinaIssueQueue(baseDraft);

    const draft = buildDraft({
      ...baseDraft,
      issueQueue: {
        ...queue,
        status: "complete",
      },
      bootstrapReview: {
        lastRunAt: "2026-04-01T23:05:00.000Z",
        status: "complete",
        summary: "Checked",
        nextStep: "Done",
        facts: [],
        items: [],
      },
      reviewerFinal: {
        lastRunAt: "2026-04-01T23:05:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Done",
        lines: [],
      },
      scheduleCDraft: {
        lastRunAt: "2026-04-01T23:05:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Done",
        fields: [
          {
            id: "line-1",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 100000,
            status: "ready",
            summary: "Ready",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["adj-1"],
            sourceDocumentIds: ["qb-doc"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-04-01T23:05:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Done",
        adjustments: [
          {
            id: "adj-1",
            kind: "carryforward_line",
            status: "approved",
            risk: "low",
            requiresAuthority: false,
            title: "Carry line",
            summary: "Approved",
            suggestedTreatment: "Carry",
            whyItMatters: "Traceability",
            amount: 100000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["qb-doc"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const readiness = buildTinaPackageReadiness(draft);
    expect(readiness.level).toBe("blocked");
    expect(readiness.items.some((item) => item.id === "issue-return-type-hint-conflict")).toBe(true);
  });
});

