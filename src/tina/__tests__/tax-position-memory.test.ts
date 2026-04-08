import { describe, expect, it } from "vitest";
import { buildTinaTaxPositionMemory } from "@/tina/lib/tax-position-memory";
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

describe("buildTinaTaxPositionMemory", () => {
  it("blocks positions that still require authority support", () => {
    const draft = buildDraft({
      taxAdjustments: {
        lastRunAt: "2026-04-06T22:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Review",
        adjustments: [
          {
            id: "tax-adjustment-1",
            kind: "sales_tax_exclusion",
            status: "needs_authority",
            risk: "medium",
            requiresAuthority: true,
            title: "Keep sales tax out of income",
            summary: "Needs authority first.",
            suggestedTreatment: "Exclude collected sales tax from gross receipts when facts support it.",
            whyItMatters: "It changes income totals.",
            amount: 1800,
            authorityWorkIdeaIds: ["wa-state-review"],
            aiCleanupLineIds: ["ai-line-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaTaxPositionMemory(draft);

    expect(snapshot.status).toBe("complete");
    expect(snapshot.records).toHaveLength(1);
    expect(snapshot.records[0]?.status).toBe("blocked");
    expect(snapshot.records[0]?.confidence).toBe("low");
    expect(snapshot.nextStep).toContain("blocked authority work");
  });

  it("builds a ready position when authority and reviewer history are linked", () => {
    const draft = buildDraft({
      authorityWork: [
        {
          ideaId: "wa-state-review",
          status: "reviewed",
          reviewerDecision: "use_it",
          disclosureDecision: "not_needed",
          memo: "Primary support confirms sales tax is a pass-through liability here.",
          reviewerNotes: "Use this support.",
          missingAuthority: [],
          citations: [
            {
              id: "citation-1",
              title: "Primary support",
              url: "https://example.com/authority",
              sourceClass: "primary_authority",
              effect: "supports",
              note: "Direct support",
            },
          ],
          lastAiRunAt: "2026-04-06T22:05:00.000Z",
          updatedAt: "2026-04-06T22:06:00.000Z",
        },
      ],
      reviewerOutcomeMemory: {
        updatedAt: "2026-04-06T22:08:00.000Z",
        summary: "One outcome saved.",
        nextStep: "Keep recording reviewer calls.",
        scorecard: {
          totalOutcomes: 1,
          acceptedCount: 1,
          revisedCount: 0,
          rejectedCount: 0,
          acceptanceScore: 70,
          trustLevel: "mixed",
          nextStep: "Keep recording reviewer calls.",
          patterns: [
            {
              patternId: "tax_adjustment:all",
              label: "tax adjustment overall",
              targetType: "tax_adjustment",
              phase: "all",
              totalOutcomes: 1,
              acceptedCount: 1,
              revisedCount: 0,
              rejectedCount: 0,
              acceptanceScore: 70,
              trustLevel: "mixed",
              confidenceImpact: "hold",
              nextStep: "Keep recording reviewer calls.",
              lessons: [
                "Keep sales tax separate from gross receipts when liability facts are present.",
              ],
              updatedAt: "2026-04-06T22:08:00.000Z",
            },
            {
              patternId: "tax_adjustment:tax_review",
              label: "tax adjustment in tax review",
              targetType: "tax_adjustment",
              phase: "tax_review",
              totalOutcomes: 1,
              acceptedCount: 1,
              revisedCount: 0,
              rejectedCount: 0,
              acceptanceScore: 70,
              trustLevel: "mixed",
              confidenceImpact: "hold",
              nextStep: "Keep recording reviewer calls.",
              lessons: [
                "Keep sales tax separate from gross receipts when liability facts are present.",
              ],
              updatedAt: "2026-04-06T22:08:00.000Z",
            },
          ],
        },
        overrides: [],
        outcomes: [
          {
            id: "outcome-1",
            title: "Sales tax treatment review",
            phase: "tax_review",
            verdict: "accepted",
            targetType: "tax_adjustment",
            targetId: "tax-adjustment-1",
            summary: "Reviewer accepted the treatment.",
            lessons: ["Keep sales tax separate from gross receipts when liability facts are present."],
            caseTags: ["clean_books", "schedule_c"],
            overrideIds: [],
            decidedAt: "2026-04-06T22:08:00.000Z",
            decidedBy: "reviewer-1",
          },
        ],
      },
      taxAdjustments: {
        lastRunAt: "2026-04-06T22:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Review",
        adjustments: [
          {
            id: "tax-adjustment-1",
            kind: "sales_tax_exclusion",
            status: "approved",
            risk: "medium",
            requiresAuthority: true,
            title: "Keep sales tax out of income",
            summary: "Supported and approved.",
            suggestedTreatment: "Exclude collected sales tax from gross receipts when facts support it.",
            whyItMatters: "It changes income totals.",
            amount: 1800,
            authorityWorkIdeaIds: ["wa-state-review"],
            aiCleanupLineIds: ["ai-line-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "Approved for carry-forward.",
          },
        ],
      },
    });

    const snapshot = buildTinaTaxPositionMemory(draft);

    expect(snapshot.records[0]?.status).toBe("ready");
    expect(snapshot.records[0]?.confidence).toBe("high");
    expect(snapshot.records[0]?.reviewerOutcomeIds).toEqual(["outcome-1"]);
    expect(snapshot.records[0]?.reviewerGuidance).toContain("Disclosure posture");
    expect(snapshot.records[0]?.reviewerGuidance).toContain("70/100");
    expect(snapshot.records[0]?.summary).toContain("Reviewer pattern score");
    expect(snapshot.summary).toContain("mapped 1 tax position");
  });

  it("pulls confidence down when reviewer pattern trust is fragile", () => {
    const draft = buildDraft({
      reviewerOutcomeMemory: {
        updatedAt: "2026-04-06T22:08:00.000Z",
        summary: "Weak pattern.",
        nextStep: "Review rejected patterns first.",
        scorecard: {
          totalOutcomes: 2,
          acceptedCount: 0,
          revisedCount: 1,
          rejectedCount: 1,
          acceptanceScore: 23,
          trustLevel: "fragile",
          nextStep: "Review rejected patterns first.",
          patterns: [
            {
              patternId: "tax_adjustment:all",
              label: "tax adjustment overall",
              targetType: "tax_adjustment",
              phase: "all",
              totalOutcomes: 2,
              acceptedCount: 0,
              revisedCount: 1,
              rejectedCount: 1,
              acceptanceScore: 23,
              trustLevel: "fragile",
              confidenceImpact: "lower",
              nextStep:
                "Treat tax adjustment overall as unstable until Tina proves why reviewers are still rejecting it.",
              lessons: ["Owner-flow treatment is still being rejected without tie-out proof."],
              updatedAt: "2026-04-06T22:08:00.000Z",
            },
            {
              patternId: "tax_adjustment:tax_review",
              label: "tax adjustment in tax review",
              targetType: "tax_adjustment",
              phase: "tax_review",
              totalOutcomes: 2,
              acceptedCount: 0,
              revisedCount: 1,
              rejectedCount: 1,
              acceptanceScore: 23,
              trustLevel: "fragile",
              confidenceImpact: "lower",
              nextStep:
                "Treat tax adjustment in tax review as unstable until Tina proves why reviewers are still rejecting it.",
              lessons: ["Owner-flow treatment is still being rejected without tie-out proof."],
              updatedAt: "2026-04-06T22:08:00.000Z",
            },
          ],
        },
        overrides: [],
        outcomes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-04-06T22:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Review",
        adjustments: [
          {
            id: "tax-adjustment-1",
            kind: "carryforward_line",
            status: "ready_for_review",
            risk: "medium",
            requiresAuthority: false,
            title: "Owner-flow cleanup",
            summary: "Needs reviewer caution.",
            suggestedTreatment: "Move likely owner draws out of deductible expenses.",
            whyItMatters: "It affects net income.",
            amount: 2200,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-line-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "Still under reviewer review.",
          },
        ],
      },
    });

    const snapshot = buildTinaTaxPositionMemory(draft);

    expect(snapshot.records[0]?.confidence).toBe("low");
    expect(snapshot.records[0]?.reviewerGuidance).toContain("unstable");
    expect(snapshot.records[0]?.reviewerGuidance).toContain(
      "Owner-flow treatment is still being rejected without tie-out proof."
    );
  });

  it("turns continuity and depreciation clues into governed positions even before packet export", () => {
    const draft = buildDraft({
      taxAdjustments: {
        lastRunAt: "2026-04-07T17:00:00.000Z",
        status: "complete",
        summary: "No direct adjustments yet.",
        nextStep: "Keep going.",
        adjustments: [],
      },
      sourceFacts: [
        {
          id: "fact-carryover",
          sourceDocumentId: "doc-prior",
          label: "Carryover amount clue",
          value: "$4,200",
          confidence: "medium",
          capturedAt: "2026-04-07T16:55:00.000Z",
        },
        {
          id: "fact-asset-date",
          sourceDocumentId: "doc-assets",
          label: "Asset placed-in-service clue",
          value: "2025-03-01",
          confidence: "medium",
          capturedAt: "2026-04-07T16:56:00.000Z",
        },
      ],
    });

    const snapshot = buildTinaTaxPositionMemory(draft);

    expect(snapshot.status).toBe("complete");
    expect(snapshot.records.map((record) => record.id)).toEqual([
      "tax-position-continuity-review",
      "tax-position-depreciation-review",
    ]);
    expect(snapshot.records[0]?.status).toBe("needs_review");
    expect(snapshot.records[0]?.summary).toContain("governed tax position");
    expect(snapshot.records[1]?.reviewerGuidance).toContain("placed-in-service timing");
  });

  it("turns broader messy Schedule C signals into governed tax positions", () => {
    const draft = buildDraft({
      taxAdjustments: {
        lastRunAt: "2026-04-07T17:00:00.000Z",
        status: "complete",
        summary: "No direct adjustments yet.",
        nextStep: "Keep going.",
        adjustments: [],
      },
      sourceFacts: [
        {
          id: "fact-payroll",
          sourceDocumentId: "doc-payroll",
          label: "Payroll clue",
          value: "This paper mentions payroll, wages, or employees.",
          confidence: "medium",
          capturedAt: "2026-04-07T16:55:00.000Z",
        },
        {
          id: "fact-contractor",
          sourceDocumentId: "doc-1099",
          label: "Contractor clue",
          value: "This paper mentions contractors or 1099-style payments.",
          confidence: "medium",
          capturedAt: "2026-04-07T16:56:00.000Z",
        },
        {
          id: "fact-owner",
          sourceDocumentId: "doc-ledger",
          label: "Owner draw clue",
          value: "This paper mentions owner draws, owner withdrawals, or owner distributions.",
          confidence: "medium",
          capturedAt: "2026-04-07T16:57:00.000Z",
        },
      ],
    });

    const snapshot = buildTinaTaxPositionMemory(draft);
    const ids = snapshot.records.map((record) => record.id);

    expect(ids).toContain("tax-position-payroll-classification-review");
    expect(ids).toContain("tax-position-contractor-classification-review");
    expect(ids).toContain("tax-position-owner-flow-review");
  });
});
