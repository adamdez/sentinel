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

  it("keeps otherwise ready reviewer-final lines in attention mode when reviewer history is fragile", () => {
    const draft = buildDraft({
      reviewerOutcomeMemory: {
        updatedAt: "2026-04-07T01:00:00.000Z",
        summary: "Fragile reviewer history.",
        nextStep: "Review repeated corrections first.",
        scorecard: {
          totalOutcomes: 3,
          acceptedCount: 1,
          revisedCount: 1,
          rejectedCount: 1,
          acceptanceScore: 48,
          trustLevel: "fragile",
          nextStep: "Review repeated corrections first.",
          patterns: [
            {
              patternId: "reviewer_final_line:package",
              label: "reviewer final line in package",
              targetType: "reviewer_final_line",
              phase: "package",
              totalOutcomes: 3,
              acceptedCount: 1,
              revisedCount: 1,
              rejectedCount: 1,
              acceptanceScore: 48,
              trustLevel: "fragile",
              confidenceImpact: "lower",
              nextStep: "Treat reviewer final line in package as unstable until Tina stops repeating the correction pattern.",
              lessons: ["Do not present gross receipts candidates as settled when tie-out proof is still thin."],
              updatedAt: "2026-04-07T01:00:00.000Z",
            },
          ],
        },
        overrides: [],
        outcomes: [],
      },
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
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaReviewerFinalSnapshot(draft);

    expect(snapshot.lines[0]?.status).toBe("needs_attention");
    expect(snapshot.lines[0]?.summary).toContain("fragile");
    expect(snapshot.lines[0]?.summary).toContain("gross receipts candidates");
    expect(snapshot.nextStep).toContain("Reviewer history is still fragile");
  });

  it("keeps carryforward lines in attention mode when ledger buckets reveal specialized treatment", () => {
    const draft = buildDraft({
      sourceFacts: [
        {
          id: "bucket-1",
          sourceDocumentId: "doc-1",
          label: "Ledger bucket clue",
          value: "Payroll Expense: 3 rows, net -$3,000.00",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
      ],
      aiCleanup: {
        lastRunAt: "2026-03-27T02:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "ai-cleanup-1",
            kind: "expense",
            layer: "ai_cleanup",
            label: "Clean expense",
            amount: 3000,
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
            title: "Carry expense",
            summary: "Approved",
            suggestedTreatment: "Carry it",
            whyItMatters: "Matters",
            amount: 3000,
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
    expect(snapshot.lines[0]?.status).toBe("needs_attention");
    expect(snapshot.lines[0]?.summary).toContain("Ledger buckets");
  });

  it("keeps carryforward lines in attention mode when transaction-group totals do not align cleanly", () => {
    const draft = buildDraft({
      sourceFacts: [
        {
          id: "group-1",
          sourceDocumentId: "doc-1",
          label: "Transaction group clue",
          value:
            "Client deposit (inflow): 2 rows, total $12,000, dates Jan 1, 2025 to Jan 30, 2025",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
      ],
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
            amount: 18000,
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
            amount: 18000,
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

    expect(snapshot.lines[0]?.status).toBe("needs_attention");
    expect(snapshot.lines[0]?.summary).toContain("Transaction groups behind this line");
    expect(snapshot.lines[0]?.summary).toContain("do not align cleanly");
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
