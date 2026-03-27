import { describe, expect, it } from "vitest";
import {
  buildTinaReviewerFinalSnapshot,
  markTinaReviewerFinalStale,
} from "@/tina/lib/reviewer-final";
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

describe("buildTinaReviewerFinalSnapshot", () => {
  it("waits for tax adjustments first", () => {
    const draft = buildDraft({
      taxAdjustments: {
        lastRunAt: null,
        status: "idle",
        summary: "Not ready",
        nextStep: "Build it",
        adjustments: [],
      },
    });

    const snapshot = buildTinaReviewerFinalSnapshot(draft);

    expect(snapshot.status).toBe("idle");
    expect(snapshot.summary).toContain("needs a complete tax-adjustment layer");
    expect(snapshot.lines).toHaveLength(0);
  });

  it("waits for human-approved tax adjustments", () => {
    const draft = buildDraft({
      taxAdjustments: {
        lastRunAt: "2026-03-27T02:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Review",
        adjustments: [
          {
            id: "tax-adjustment-1",
            kind: "carryforward_line",
            status: "ready_for_review",
            risk: "low",
            requiresAuthority: false,
            title: "Carry income",
            summary: "Ready",
            suggestedTreatment: "Carry it",
            whyItMatters: "Matters",
            amount: 12000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-cleanup-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaReviewerFinalSnapshot(draft);

    expect(snapshot.status).toBe("idle");
    expect(snapshot.summary).toContain("does not have any human-approved tax adjustments");
    expect(snapshot.lines).toHaveLength(0);
  });

  it("builds reviewer-final lines from approved tax adjustments", () => {
    const draft = buildDraft({
      aiCleanup: {
        lastRunAt: "2026-03-27T02:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "ai-cleanup-1",
            kind: "income",
            layer: "ai_cleanup",
            label: "Clean income",
            amount: 12000,
            status: "ready",
            summary: "Looks clean",
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            issueIds: [],
            derivedFromLineIds: ["line-1"],
            cleanupSuggestionIds: ["cleanup-1"],
          },
        ],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T02:02:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Review",
        adjustments: [
          {
            id: "tax-adjustment-1",
            kind: "carryforward_line",
            status: "approved",
            risk: "low",
            requiresAuthority: false,
            title: "Carry income",
            summary: "Approved",
            suggestedTreatment: "Carry it",
            whyItMatters: "Matters",
            amount: 12000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-cleanup-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "Okay to use.",
          },
        ],
      },
    });

    const snapshot = buildTinaReviewerFinalSnapshot(draft);
    const line = snapshot.lines[0];

    expect(snapshot.status).toBe("complete");
    expect(line?.layer).toBe("reviewer_final");
    expect(line?.label).toBe("Gross receipts candidate");
    expect(line?.taxAdjustmentIds).toEqual(["tax-adjustment-1"]);
    expect(line?.summary).toContain("Okay to use.");
  });

  it("keeps complex approved items visible as needs review", () => {
    const draft = buildDraft({
      aiCleanup: {
        lastRunAt: "2026-03-27T02:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "ai-cleanup-2",
            kind: "signal",
            layer: "ai_cleanup",
            label: "Sales tax clue",
            amount: 1500,
            status: "ready",
            summary: "Looks like sales tax",
            sourceDocumentIds: ["doc-2"],
            sourceFactIds: ["fact-2"],
            issueIds: [],
            derivedFromLineIds: ["line-2"],
            cleanupSuggestionIds: ["cleanup-2"],
          },
        ],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T02:02:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Review",
        adjustments: [
          {
            id: "tax-adjustment-2",
            kind: "sales_tax_exclusion",
            status: "approved",
            risk: "medium",
            requiresAuthority: true,
            title: "Keep sales tax out of income",
            summary: "Approved",
            suggestedTreatment: "Separate it",
            whyItMatters: "Matters",
            amount: 1500,
            authorityWorkIdeaIds: ["wa-state-review"],
            aiCleanupLineIds: ["ai-cleanup-2"],
            sourceDocumentIds: ["doc-2"],
            sourceFactIds: ["fact-2"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaReviewerFinalSnapshot(draft);

    expect(snapshot.lines[0]?.status).toBe("needs_attention");
    expect(snapshot.lines[0]?.label).toBe("Sales tax should stay out of income");
  });
});

describe("markTinaReviewerFinalStale", () => {
  it("marks a built reviewer-final layer as stale", () => {
    const stale = markTinaReviewerFinalStale({
      lastRunAt: "2026-03-27T02:10:00.000Z",
      status: "complete",
      summary: "Built",
      nextStep: "Done",
      lines: [],
    });

    expect(stale.status).toBe("stale");
    expect(stale.summary).toContain("changed");
  });
});
