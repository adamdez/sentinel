import { describe, expect, it } from "vitest";
import { buildTinaBenchmarkDashboardReport } from "@/tina/lib/benchmark-dashboard";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaBenchmarkDashboardReport", () => {
  it("turns cohort-specific rescore evidence into dashboard cards", () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "Dashboard Tina LLC",
        entityType: "single_member_llc" as const,
      },
      packageReadiness: {
        ...baseDraft.packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
      },
      reviewerOutcomeMemory: {
        updatedAt: "2026-04-07T08:10:00.000Z",
        summary: "Strong outcome history.",
        nextStep: "Keep measuring.",
        scorecard: {
          totalOutcomes: 4,
          acceptedCount: 4,
          revisedCount: 0,
          rejectedCount: 0,
          acceptanceScore: 100,
          trustLevel: "strong" as const,
          nextStep: "Keep measuring.",
          patterns: [],
        },
        overrides: [],
        outcomes: [
          {
            id: "outcome-1",
            title: "Accepted",
            phase: "package" as const,
            verdict: "accepted" as const,
            targetType: "reviewer_final_line" as const,
            targetId: "rf-1",
            summary: "Accepted.",
            lessons: [],
            caseTags: ["clean_books", "schedule_c"] as const,
            overrideIds: [],
            decidedAt: "2026-04-06T08:10:00.000Z",
            decidedBy: "reviewer-1",
          },
          {
            id: "outcome-2",
            title: "Accepted",
            phase: "package" as const,
            verdict: "accepted" as const,
            targetType: "reviewer_final_line" as const,
            targetId: "rf-2",
            summary: "Accepted.",
            lessons: [],
            caseTags: ["clean_books", "schedule_c"] as const,
            overrideIds: [],
            decidedAt: "2026-04-05T08:10:00.000Z",
            decidedBy: "reviewer-1",
          },
          {
            id: "outcome-3",
            title: "Accepted",
            phase: "tax_review" as const,
            verdict: "accepted" as const,
            targetType: "tax_adjustment" as const,
            targetId: "adj-1",
            summary: "Accepted.",
            lessons: [],
            caseTags: ["clean_books", "schedule_c"] as const,
            overrideIds: [],
            decidedAt: "2026-04-04T08:10:00.000Z",
            decidedBy: "reviewer-1",
          },
          {
            id: "outcome-4",
            title: "Accepted",
            phase: "tax_review" as const,
            verdict: "accepted" as const,
            targetType: "tax_adjustment" as const,
            targetId: "adj-2",
            summary: "Accepted.",
            lessons: [],
            caseTags: ["clean_books", "schedule_c"] as const,
            overrideIds: [],
            decidedAt: "2026-04-03T08:10:00.000Z",
            decidedBy: "reviewer-1",
          },
        ],
      },
      documents: [
        {
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document" as const,
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-04-07T08:00:00.000Z",
        },
        {
          id: "doc-bank",
          name: "bank.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/bank.pdf",
          category: "supporting_document" as const,
          requestId: "bank-support",
          requestLabel: "Bank support",
          uploadedAt: "2026-04-07T08:00:00.000Z",
        },
      ],
      reviewerFinal: {
        ...baseDraft.reviewerFinal,
        status: "complete" as const,
        lines: [],
      },
      scheduleCDraft: {
        ...baseDraft.scheduleCDraft,
        status: "complete" as const,
        fields: [],
        notes: [],
      },
      taxAdjustments: {
        ...baseDraft.taxAdjustments,
        status: "complete" as const,
        adjustments: [],
      },
      taxPositionMemory: {
        ...baseDraft.taxPositionMemory,
        status: "complete" as const,
        records: [],
      },
    };

    const report = buildTinaBenchmarkDashboardReport(draft);
    expect(report.cards.some((card) => card.title === "Cohort raise candidates")).toBe(true);
    expect(report.cards[1]?.lines.join(" ")).toContain("documentation and defensibility");
  });
});
