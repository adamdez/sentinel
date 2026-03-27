import { describe, expect, it } from "vitest";
import { buildTinaCleanupPlan, markTinaCleanupPlanStale } from "@/tina/lib/cleanup-plan";
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

describe("buildTinaCleanupPlan", () => {
  it("waits for a trusted money story first", () => {
    const plan = buildTinaCleanupPlan(createDefaultTinaWorkspaceDraft());

    expect(plan.status).toBe("idle");
    expect(plan.summary).toContain("needs the money story first");
    expect(plan.suggestions).toHaveLength(0);
  });

  it("builds cleanup suggestions from attention lines and signal clues", () => {
    const draft = buildDraft({
      profile: {
        hasPayroll: false,
      },
      issueQueue: {
        lastRunAt: "2026-03-26T23:40:00.000Z",
        status: "complete",
        summary: "Checked",
        nextStep: "Keep going",
        items: [
          {
            id: "books-year",
            title: "Books may be for the wrong year",
            summary: "The year in the books needs a human check.",
            severity: "needs_attention",
            status: "open",
            category: "books",
            requestId: null,
            documentId: "books-doc",
            factId: "date-range",
          },
        ],
        records: [],
      },
      workpapers: {
        lastRunAt: "2026-03-26T23:42:00.000Z",
        status: "complete",
        summary: "Built",
        nextStep: "Review",
        lines: [
          {
            id: "coverage-books-doc",
            kind: "coverage",
            layer: "book_original",
            label: "QuickBooks date coverage",
            amount: null,
            status: "needs_attention",
            summary: "Dates need a check.",
            sourceDocumentIds: ["books-doc"],
            sourceFactIds: ["date-range"],
            issueIds: ["books-year"],
          },
          {
            id: "payroll-books-doc",
            kind: "signal",
            layer: "book_original",
            label: "Payroll clue",
            amount: null,
            status: "ready",
            summary: "Payroll showed up in the books.",
            sourceDocumentIds: ["books-doc"],
            sourceFactIds: ["payroll-fact"],
            issueIds: [],
          },
        ],
      },
    });

    const plan = buildTinaCleanupPlan(draft);

    expect(plan.status).toBe("complete");
    expect(plan.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "cleanup-coverage-books-doc",
          type: "reconcile_line",
        }),
        expect.objectContaining({
          id: "cleanup-signal-payroll-payroll-books-doc",
          type: "confirm_scope",
        }),
      ])
    );
  });

  it("keeps reviewer decisions and notes when rebuilding", () => {
    const draft = buildDraft({
      cleanupPlan: {
        lastRunAt: "2026-03-26T23:44:00.000Z",
        status: "complete",
        summary: "Old plan",
        nextStep: "Old step",
        suggestions: [
          {
            id: "cleanup-signal-payroll-payroll-books-doc",
            type: "confirm_scope",
            priority: "important",
            status: "approved",
            title: "Old title",
            summary: "Old summary",
            suggestedAction: "Old action",
            whyItMatters: "Old why",
            workpaperLineIds: ["payroll-books-doc"],
            issueIds: [],
            sourceDocumentIds: ["books-doc"],
            sourceFactIds: ["payroll-fact"],
            reviewerNotes: "Keep this one.",
          },
        ],
      },
      workpapers: {
        lastRunAt: "2026-03-26T23:42:00.000Z",
        status: "complete",
        summary: "Built",
        nextStep: "Review",
        lines: [
          {
            id: "payroll-books-doc",
            kind: "signal",
            layer: "book_original",
            label: "Payroll clue",
            amount: null,
            status: "ready",
            summary: "Payroll showed up in the books.",
            sourceDocumentIds: ["books-doc"],
            sourceFactIds: ["payroll-fact"],
            issueIds: [],
          },
        ],
      },
    });

    const plan = buildTinaCleanupPlan(draft);
    const suggestion = plan.suggestions.find(
      (item) => item.id === "cleanup-signal-payroll-payroll-books-doc"
    );

    expect(suggestion?.status).toBe("approved");
    expect(suggestion?.reviewerNotes).toBe("Keep this one.");
  });
});

describe("markTinaCleanupPlanStale", () => {
  it("marks a built cleanup plan as stale", () => {
    const stale = markTinaCleanupPlanStale({
      lastRunAt: "2026-03-26T23:50:00.000Z",
      status: "complete",
      summary: "Built",
      nextStep: "Done",
      suggestions: [],
    });

    expect(stale.status).toBe("stale");
    expect(stale.summary).toContain("changed");
  });
});
