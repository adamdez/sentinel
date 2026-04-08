import { describe, expect, it } from "vitest";
import { buildTinaCurrentFileReviewerReality } from "@/tina/lib/current-file-reviewer-reality";
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

describe("buildTinaCurrentFileReviewerReality", () => {
  it("returns mixed when no current-file reviewer outcomes are tied to the packet", () => {
    const draft = buildDraft();

    const report = buildTinaCurrentFileReviewerReality(draft);

    expect(report.status).toBe("mixed");
    expect(report.patterns).toHaveLength(0);
  });

  it("marks the file fragile when a current-file outcome was rejected", () => {
    const draft = buildDraft({
      documents: [
        {
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      taxAdjustments: {
        ...createDefaultTinaWorkspaceDraft().taxAdjustments,
        adjustments: [
          {
            id: "tax-1",
            kind: "carryforward_line",
            status: "approved",
            risk: "low",
            requiresAuthority: false,
            title: "Carry income",
            summary: "Approved",
            suggestedTreatment: "Carry it",
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: [],
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: [],
            reviewerNotes: "",
          },
        ],
      },
      reviewerOutcomeMemory: {
        ...createDefaultTinaWorkspaceDraft().reviewerOutcomeMemory,
        outcomes: [
          {
            id: "outcome-1",
            title: "Gross receipts treatment",
            phase: "tax_review",
            verdict: "rejected",
            targetType: "tax_adjustment",
            targetId: "tax-1",
            summary: "Reviewer rejected the generic treatment.",
            lessons: ["Separate payroll and owner-flow before carryforward."],
            caseTags: ["messy_books", "schedule_c"],
            overrideIds: [],
            decidedAt: "2026-03-28T02:00:00.000Z",
            decidedBy: "CPA",
          },
        ],
      },
    });

    const report = buildTinaCurrentFileReviewerReality(draft);

    expect(report.status).toBe("fragile");
    expect(report.patterns).toHaveLength(1);
    expect(report.lessons[0]).toContain("Separate payroll");
  });

  it("learns from matching file cohorts even when the exact paper stack has not been reviewed before", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        entityType: "single_member_llc",
      },
      bookTieOut: {
        ...createDefaultTinaWorkspaceDraft().bookTieOut,
        variances: [
          {
            id: "owner-flow-contamination",
            title: "Owner flow contamination",
            summary: "Owner flow is mixed into ordinary activity.",
            severity: "blocking",
            documentIds: ["doc-qb"],
          },
        ],
      },
      reviewerOutcomeMemory: {
        ...createDefaultTinaWorkspaceDraft().reviewerOutcomeMemory,
        outcomes: [
          {
            id: "outcome-1",
            title: "Messy books carryforward",
            phase: "tax_review",
            verdict: "rejected",
            targetType: "tax_adjustment",
            targetId: "missing-local-target",
            summary: "Reviewer rejected the generic treatment.",
            lessons: ["Do not trust generic carryforward on commingled Schedule C files."],
            caseTags: ["messy_books", "commingled_entity", "schedule_c"],
            overrideIds: [],
            decidedAt: "2026-03-28T02:00:00.000Z",
            decidedBy: "CPA",
          },
        ],
      },
    });

    const report = buildTinaCurrentFileReviewerReality(draft);

    expect(report.status).toBe("fragile");
    expect(report.patterns[0]?.matchType).toBe("cohort");
    expect(report.patterns[0]?.matchedCaseTags).toContain("messy_books");
    expect(report.summary).toContain("closest measured cohorts");
  });
});
