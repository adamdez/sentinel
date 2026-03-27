import { describe, expect, it } from "vitest";
import {
  buildTinaAiCleanupSnapshot,
  markTinaAiCleanupStale,
} from "@/tina/lib/ai-cleanup";
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

describe("buildTinaAiCleanupSnapshot", () => {
  it("waits for approved cleanup ideas first", () => {
    const draft = buildDraft({
      workpapers: {
        lastRunAt: "2026-03-27T00:05:00.000Z",
        status: "complete",
        summary: "Built",
        nextStep: "Review",
        lines: [],
      },
      cleanupPlan: {
        lastRunAt: "2026-03-27T00:06:00.000Z",
        status: "complete",
        summary: "Built",
        nextStep: "Approve",
        suggestions: [],
      },
    });

    const snapshot = buildTinaAiCleanupSnapshot(draft);

    expect(snapshot.status).toBe("idle");
    expect(snapshot.summary).toContain("does not have any approved cleanup ideas");
    expect(snapshot.lines).toHaveLength(0);
  });

  it("builds ai cleanup lines from approved, issue-free cleanup ideas", () => {
    const draft = buildDraft({
      workpapers: {
        lastRunAt: "2026-03-27T00:05:00.000Z",
        status: "complete",
        summary: "Built",
        nextStep: "Review",
        lines: [
          {
            id: "income-books-doc",
            kind: "income",
            layer: "book_original",
            label: "QuickBooks money in",
            amount: 18000,
            status: "ready",
            summary: "Looks good",
            sourceDocumentIds: ["books-doc"],
            sourceFactIds: ["money-in"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
          },
        ],
      },
      cleanupPlan: {
        lastRunAt: "2026-03-27T00:06:00.000Z",
        status: "complete",
        summary: "Built",
        nextStep: "Approve",
        suggestions: [
          {
            id: "cleanup-income-books-doc",
            type: "reconcile_line",
            priority: "helpful",
            status: "approved",
            title: "Double-check quickbooks money in",
            summary: "Carry it forward",
            suggestedAction: "Approve this line.",
            whyItMatters: "It matters.",
            workpaperLineIds: ["income-books-doc"],
            issueIds: [],
            sourceDocumentIds: ["books-doc"],
            sourceFactIds: ["money-in"],
            reviewerNotes: "Looks clean enough to carry forward.",
          },
        ],
      },
    });

    const snapshot = buildTinaAiCleanupSnapshot(draft);
    const line = snapshot.lines[0];

    expect(snapshot.status).toBe("complete");
    expect(snapshot.summary).toContain("1 AI cleanup line");
    expect(line?.layer).toBe("ai_cleanup");
    expect(line?.derivedFromLineIds).toEqual(["income-books-doc"]);
    expect(line?.cleanupSuggestionIds).toEqual(["cleanup-income-books-doc"]);
    expect(line?.summary).toContain("Looks clean enough to carry forward.");
  });

  it("keeps blocked approved ideas out of the ai cleanup layer", () => {
    const draft = buildDraft({
      workpapers: {
        lastRunAt: "2026-03-27T00:05:00.000Z",
        status: "complete",
        summary: "Built",
        nextStep: "Review",
        lines: [
          {
            id: "coverage-books-doc",
            kind: "coverage",
            layer: "book_original",
            label: "Books date coverage",
            amount: null,
            status: "needs_attention",
            summary: "Needs review",
            sourceDocumentIds: ["books-doc"],
            sourceFactIds: ["date-range"],
            issueIds: ["books-year"],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
          },
        ],
      },
      cleanupPlan: {
        lastRunAt: "2026-03-27T00:06:00.000Z",
        status: "complete",
        summary: "Built",
        nextStep: "Approve",
        suggestions: [
          {
            id: "cleanup-coverage-books-doc",
            type: "reconcile_line",
            priority: "important",
            status: "approved",
            title: "Double-check books date coverage",
            summary: "Carry it forward",
            suggestedAction: "Approve this line.",
            whyItMatters: "It matters.",
            workpaperLineIds: ["coverage-books-doc"],
            issueIds: ["books-year"],
            sourceDocumentIds: ["books-doc"],
            sourceFactIds: ["date-range"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaAiCleanupSnapshot(draft);

    expect(snapshot.status).toBe("stale");
    expect(snapshot.summary).toContain("still point at unresolved issues");
    expect(snapshot.lines).toHaveLength(0);
  });
});

describe("markTinaAiCleanupStale", () => {
  it("marks a built ai cleanup layer as stale", () => {
    const stale = markTinaAiCleanupStale({
      lastRunAt: "2026-03-27T00:10:00.000Z",
      status: "complete",
      summary: "Built",
      nextStep: "Done",
      lines: [],
    });

    expect(stale.status).toBe("stale");
    expect(stale.summary).toContain("changed");
  });
});
