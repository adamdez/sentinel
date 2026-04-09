import { describe, expect, it } from "vitest";
import {
  buildTinaTaxAdjustmentSnapshot,
  markTinaTaxAdjustmentsStale,
} from "@/tina/lib/tax-adjustments";
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

describe("buildTinaTaxAdjustmentSnapshot", () => {
  it("waits for ai cleanup first", () => {
    const draft = buildDraft({
      aiCleanup: {
        lastRunAt: null,
        status: "idle",
        summary: "Not ready",
        nextStep: "Build it",
        lines: [],
      },
    });

    const snapshot = buildTinaTaxAdjustmentSnapshot(draft);

    expect(snapshot.status).toBe("idle");
    expect(snapshot.summary).toContain("needs a complete AI cleanup layer");
    expect(snapshot.adjustments).toHaveLength(0);
  });

  it("builds a review-ready carryforward adjustment from a normal ai cleanup line", () => {
    const draft = buildDraft({
      aiCleanup: {
        lastRunAt: "2026-03-27T01:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "ai-cleanup-income-1",
            kind: "income",
            layer: "ai_cleanup",
            label: "Clean business income",
            amount: 22000,
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
    });

    const snapshot = buildTinaTaxAdjustmentSnapshot(draft);
    const adjustment = snapshot.adjustments[0];

    expect(snapshot.status).toBe("complete");
    expect(adjustment?.kind).toBe("carryforward_line");
    expect(adjustment?.status).toBe("ready_for_review");
    expect(adjustment?.amount).toBe(22000);
    expect(adjustment?.requiresAuthority).toBe(false);
  });

  it("keeps signal-based adjustments blocked until authority review says use it", () => {
    const draft = buildDraft({
      aiCleanup: {
        lastRunAt: "2026-03-27T01:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "ai-cleanup-signal-1",
            kind: "signal",
            layer: "ai_cleanup",
            label: "Sales tax clue",
            amount: 1800,
            status: "ready",
            summary: "Looks like sales tax activity",
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            issueIds: [],
            derivedFromLineIds: ["line-1"],
            cleanupSuggestionIds: ["cleanup-1"],
          },
        ],
      },
    });

    const snapshot = buildTinaTaxAdjustmentSnapshot(draft);
    const adjustment = snapshot.adjustments[0];

    expect(adjustment?.kind).toBe("sales_tax_exclusion");
    expect(adjustment?.status).toBe("needs_authority");
    expect(adjustment?.authorityWorkIdeaIds).toEqual(["wa-state-review"]);
  });

  it("unblocks signal-based adjustments when authority review says use it", () => {
    const draft = buildDraft({
      aiCleanup: {
        lastRunAt: "2026-03-27T01:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "ai-cleanup-signal-1",
            kind: "signal",
            layer: "ai_cleanup",
            label: "Sales tax clue",
            amount: 1800,
            status: "ready",
            summary: "Looks like sales tax activity",
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            issueIds: [],
            derivedFromLineIds: ["line-1"],
            cleanupSuggestionIds: ["cleanup-1"],
          },
        ],
      },
      authorityWork: [
        {
          ideaId: "wa-state-review",
          status: "reviewed",
          reviewerDecision: "use_it",
          disclosureDecision: "not_needed",
          memo: "Looks supported.",
          reviewerNotes: "Okay to use.",
          missingAuthority: [],
          citations: [],
          lastAiRunAt: null,
          updatedAt: "2026-03-27T01:05:00.000Z",
        },
      ],
      taxAdjustments: {
        lastRunAt: "2026-03-27T01:06:00.000Z",
        status: "complete",
        summary: "Old",
        nextStep: "Old",
        adjustments: [
          {
            id: "tax-adjustment-ai-cleanup-signal-1",
            kind: "sales_tax_exclusion",
            status: "approved",
            risk: "medium",
            requiresAuthority: true,
            title: "Old",
            summary: "Old",
            suggestedTreatment: "Old",
            whyItMatters: "Old",
            amount: 1800,
            authorityWorkIdeaIds: ["wa-state-review"],
            aiCleanupLineIds: ["ai-cleanup-signal-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "Keep this decision.",
          },
        ],
      },
    });

    const snapshot = buildTinaTaxAdjustmentSnapshot(draft);
    const adjustment = snapshot.adjustments[0];

    expect(adjustment?.status).toBe("approved");
    expect(adjustment?.reviewerNotes).toBe("Keep this decision.");
  });

  it("hardens tax adjustments when reviewer history is fragile", () => {
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
              patternId: "tax_adjustment:all",
              label: "tax adjustment overall",
              targetType: "tax_adjustment",
              phase: "all",
              totalOutcomes: 3,
              acceptedCount: 1,
              revisedCount: 1,
              rejectedCount: 1,
              acceptanceScore: 48,
              trustLevel: "fragile",
              confidenceImpact: "lower",
              nextStep: "Review repeated corrections first.",
              lessons: ["Owner-flow cleanup is still being revised without stronger proof."],
              updatedAt: "2026-04-07T01:00:00.000Z",
            },
            {
              patternId: "tax_adjustment:tax_review",
              label: "tax adjustment in tax review",
              targetType: "tax_adjustment",
              phase: "tax_review",
              totalOutcomes: 3,
              acceptedCount: 1,
              revisedCount: 1,
              rejectedCount: 1,
              acceptanceScore: 48,
              trustLevel: "fragile",
              confidenceImpact: "lower",
              nextStep: "Review repeated corrections first.",
              lessons: ["Owner-flow cleanup is still being revised without stronger proof."],
              updatedAt: "2026-04-07T01:00:00.000Z",
            },
          ],
        },
        overrides: [],
        outcomes: [],
      },
      aiCleanup: {
        lastRunAt: "2026-03-27T01:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "ai-cleanup-income-1",
            kind: "income",
            layer: "ai_cleanup",
            label: "Clean business income",
            amount: 22000,
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
    });

    const snapshot = buildTinaTaxAdjustmentSnapshot(draft);
    const adjustment = snapshot.adjustments[0];

    expect(adjustment?.risk).toBe("medium");
    expect(adjustment?.summary).toContain("fragile");
    expect(adjustment?.summary).toContain("Owner-flow cleanup is still being revised");
    expect(adjustment?.suggestedTreatment).toContain("explicit reviewer review");
    expect(snapshot.nextStep).toContain("repeated reviewer correction pattern");
  });

  it("uses ledger bucket proof to change adjustment treatment instead of leaving it generic", () => {
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
        lastRunAt: "2026-03-27T01:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "ai-cleanup-expense-1",
            kind: "expense",
            layer: "ai_cleanup",
            label: "Clean business expense",
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
    });

    const snapshot = buildTinaTaxAdjustmentSnapshot(draft);
    const adjustment = snapshot.adjustments[0];

    expect(adjustment?.kind).toBe("payroll_classification");
    expect(adjustment?.summary).toContain("ledger buckets");
    expect(adjustment?.suggestedTreatment).toContain(
      "source facts, ledger buckets, and transaction groups visible"
    );
  });

  it("uses transaction-group proof to change adjustment treatment instead of leaving it generic", () => {
    const draft = buildDraft({
      sourceFacts: [
        {
          id: "group-1",
          sourceDocumentId: "doc-1",
          label: "Transaction group clue",
          value:
            "Payroll register (outflow): 3 rows, total ($3,000.00), dates Jan 1, 2025 to Jan 31, 2025",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
      ],
      aiCleanup: {
        lastRunAt: "2026-03-27T01:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "ai-cleanup-expense-1",
            kind: "expense",
            layer: "ai_cleanup",
            label: "Clean business expense",
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
    });

    const snapshot = buildTinaTaxAdjustmentSnapshot(draft);
    const adjustment = snapshot.adjustments[0];

    expect(adjustment?.kind).toBe("payroll_classification");
    expect(adjustment?.summary).toContain("transaction groups");
    expect(adjustment?.summary).toContain("Transaction-group proof");
  });

  it("uses direct source facts to govern continuity and depreciation-sensitive lines", () => {
    const draft = buildDraft({
      sourceFacts: [
        {
          id: "carryover-1",
          sourceDocumentId: "doc-1",
          label: "Carryover amount clue",
          value: "$1,250.00",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
        {
          id: "asset-1",
          sourceDocumentId: "doc-2",
          label: "Asset placed-in-service clue",
          value: "2025-03-03",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
      ],
      aiCleanup: {
        lastRunAt: "2026-03-27T01:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "ai-cleanup-net-1",
            kind: "net",
            layer: "ai_cleanup",
            label: "Tentative net income",
            amount: 12000,
            status: "ready",
            summary: "Looks clean",
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["carryover-1"],
            issueIds: [],
            derivedFromLineIds: ["line-1"],
            cleanupSuggestionIds: ["cleanup-1"],
          },
          {
            id: "ai-cleanup-expense-2",
            kind: "expense",
            layer: "ai_cleanup",
            label: "Other expense pool",
            amount: 5000,
            status: "ready",
            summary: "Looks clean",
            sourceDocumentIds: ["doc-2"],
            sourceFactIds: ["asset-1"],
            issueIds: [],
            derivedFromLineIds: ["line-2"],
            cleanupSuggestionIds: ["cleanup-2"],
          },
        ],
      },
    });

    const snapshot = buildTinaTaxAdjustmentSnapshot(draft);

    expect(snapshot.adjustments[0]?.kind).toBe("continuity_review");
    expect(snapshot.adjustments[0]?.summary).toContain("carryover support");
    expect(snapshot.adjustments[1]?.kind).toBe("depreciation_review");
    expect(snapshot.adjustments[1]?.summary).toContain("asset timing support");
    expect(snapshot.adjustments[1]?.suggestedTreatment).toContain("source facts");
  });

  it("uses owner-flow source facts to hold lines in high-risk review", () => {
    const draft = buildDraft({
      sourceFacts: [
        {
          id: "owner-1",
          sourceDocumentId: "doc-1",
          label: "Owner draw clue",
          value: "Owner distributions posted in ledger.",
          confidence: "high",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
      ],
      aiCleanup: {
        lastRunAt: "2026-03-27T01:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "ai-cleanup-expense-1",
            kind: "expense",
            layer: "ai_cleanup",
            label: "Clean expense line",
            amount: 3000,
            status: "ready",
            summary: "Looks clean",
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["owner-1"],
            issueIds: [],
            derivedFromLineIds: ["line-1"],
            cleanupSuggestionIds: ["cleanup-1"],
          },
        ],
      },
    });

    const snapshot = buildTinaTaxAdjustmentSnapshot(draft);
    const adjustment = snapshot.adjustments[0];

    expect(adjustment?.kind).toBe("owner_flow_separation");
    expect(adjustment?.risk).toBe("high");
    expect(adjustment?.summary).toContain("owner-flow");
    expect(adjustment?.whyItMatters).toContain("Source-fact proof");
  });
});

describe("markTinaTaxAdjustmentsStale", () => {
  it("marks built tax adjustments as stale", () => {
    const stale = markTinaTaxAdjustmentsStale({
      lastRunAt: "2026-03-27T01:10:00.000Z",
      status: "complete",
      summary: "Built",
      nextStep: "Done",
      adjustments: [],
    });

    expect(stale.status).toBe("stale");
    expect(stale.summary).toContain("changed");
  });
});
