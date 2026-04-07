import { describe, expect, it } from "vitest";
import { buildTinaReviewDeliveryReport } from "@/tina/lib/review-delivery";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaReviewDeliveryReport", () => {
  it("blocks sending when package readiness is still blocked", () => {
    const draft = createDefaultTinaWorkspaceDraft();

    const report = buildTinaReviewDeliveryReport(draft);

    expect(report.status).toBe("blocked");
    expect(report.checks.find((check) => check.id === "package_readiness")?.status).toBe(
      "blocked"
    );
  });

  it("marks a strong supported packet as ready to send for CPA review", () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "Ready Review LLC",
        entityType: "single_member_llc" as const,
      },
      documents: [
        {
          id: "prior-doc",
          name: "2024-return.pdf",
          size: 1300,
          mimeType: "application/pdf",
          storagePath: "tina/2024-return.pdf",
          category: "prior_return" as const,
          requestId: "prior-return",
          requestLabel: "Last year's return",
          uploadedAt: "2026-04-07T07:59:00.000Z",
        },
        {
          id: "doc-1",
          name: "qb-export.csv",
          size: 1200,
          mimeType: "text/csv",
          storagePath: "tina/qb-export.csv",
          category: "supporting_document" as const,
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-04-07T08:00:00.000Z",
        },
        {
          id: "bank-doc",
          name: "bank-export.csv",
          size: 1100,
          mimeType: "text/csv",
          storagePath: "tina/bank-export.csv",
          category: "supporting_document" as const,
          requestId: "bank-support",
          requestLabel: "Bank support",
          uploadedAt: "2026-04-07T08:00:30.000Z",
        },
      ],
      priorReturnDocumentId: "prior-doc",
      documentReadings: [
        {
          documentId: "doc-1",
          status: "complete" as const,
          kind: "spreadsheet" as const,
          summary: "Read.",
          nextStep: "Done.",
          facts: [],
          detailLines: [],
          rowCount: 12,
          headers: ["Date", "Amount"],
          sheetNames: ["Sheet1"],
          lastReadAt: "2026-04-07T08:01:00.000Z",
        },
        {
          documentId: "bank-doc",
          status: "complete" as const,
          kind: "spreadsheet" as const,
          summary: "Read.",
          nextStep: "Done.",
          facts: [],
          detailLines: [],
          rowCount: 10,
          headers: ["Date", "Amount"],
          sheetNames: ["Sheet1"],
          lastReadAt: "2026-04-07T08:01:30.000Z",
        },
      ],
      taxAdjustments: {
        ...baseDraft.taxAdjustments,
        status: "complete" as const,
        summary: "Tax adjustments ready.",
        adjustments: [
          {
            id: "adj-1",
            kind: "carryforward_line" as const,
            status: "approved" as const,
            risk: "low" as const,
            requiresAuthority: false,
            title: "Carry receipts",
            summary: "Approved.",
            suggestedTreatment: "Carry to Schedule C line 1.",
            whyItMatters: "Traceability.",
            amount: 18000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            reviewerNotes: "Approved for CPA packet.",
          },
        ],
      },
      reviewerFinal: {
        ...baseDraft.reviewerFinal,
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete" as const,
        summary: "Reviewer-final ready.",
        lines: [
          {
            id: "rf-1",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 18000,
            status: "ready" as const,
            summary: "Ready.",
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: ["ai-1"],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["adj-1"],
          },
        ],
      },
      packageReadiness: {
        ...baseDraft.packageReadiness,
        lastRunAt: "2026-04-07T08:06:00.000Z",
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        summary: "Tina does not see anything blocking a CPA-ready package right now.",
      },
      scheduleCDraft: {
        ...baseDraft.scheduleCDraft,
        lastRunAt: "2026-04-07T08:05:30.000Z",
        status: "complete" as const,
        summary: "Schedule C ready.",
        fields: [
          {
            id: "line-1",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "ready" as const,
            summary: "Supported.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["adj-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      taxPositionMemory: {
        ...baseDraft.taxPositionMemory,
        status: "complete" as const,
        summary: "Tax positions are current.",
        records: [
          {
            id: "position-1",
            adjustmentId: "adj-1",
            title: "Carry receipts",
            status: "ready" as const,
            confidence: "high" as const,
            summary: "Supported.",
            treatmentSummary: "Carry to Schedule C line 1.",
            reviewerGuidance: "Strong reviewer history.",
            authorityWorkIdeaIds: [],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            reviewerOutcomeIds: [],
            reviewerOverrideIds: [],
            updatedAt: "2026-04-07T08:10:00.000Z",
          },
        ],
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
    };

    const report = buildTinaReviewDeliveryReport(draft);

    expect(report.checks.map((check) => `${check.id}:${check.status}`)).toEqual([
      "package_readiness:ready",
      "cpa_packet:ready",
      "tax_positions:ready",
      "current_file_acceptance:ready",
      "review_mode:ready",
    ]);
    expect(report.status).toBe("ready_to_send");
    expect(report.checks.every((check) => check.status === "ready")).toBe(true);
  });
});
