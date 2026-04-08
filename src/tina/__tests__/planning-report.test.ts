import { describe, expect, it } from "vitest";
import { buildTinaPlanningReport } from "@/tina/lib/planning-report";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaPlanningReport", () => {
  it("builds structured planning scenarios from research ideas and review posture", () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...baseDraft,
      priorReturnDocumentId: "prior-doc",
      profile: {
        ...baseDraft.profile,
        businessName: "Planning LLC",
        entityType: "single_member_llc" as const,
        formationDate: "2025-02-01",
        taxYear: "2025",
        hasFixedAssets: true,
      },
      documents: [
        {
          id: "prior-doc",
          name: "2024-return.pdf",
          size: 1200,
          mimeType: "application/pdf",
          storagePath: "tina/2024-return.pdf",
          category: "prior_return" as const,
          requestId: "prior-return",
          requestLabel: "Last year's return",
          uploadedAt: "2026-04-07T08:00:00.000Z",
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
          uploadedAt: "2026-04-07T08:00:30.000Z",
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
          uploadedAt: "2026-04-07T08:01:00.000Z",
        },
      ],
      packageReadiness: {
        ...baseDraft.packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
      },
      reviewerFinal: {
        ...baseDraft.reviewerFinal,
        status: "complete" as const,
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
      scheduleCDraft: {
        ...baseDraft.scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-1",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "ready" as const,
            summary: "Mapped safely.",
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
        records: [
          {
            id: "position-1",
            adjustmentId: "adj-1",
            title: "Carry receipts",
            status: "ready" as const,
            confidence: "high" as const,
            summary: "Supported.",
            treatmentSummary: "Carry to line 1.",
            reviewerGuidance: "Strong.",
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
        ],
      },
    };

    const report = buildTinaPlanningReport(draft);

    expect(report.scenarios.length).toBeGreaterThan(0);
    expect(report.scenarios.some((scenario) => scenario.id === "continuity")).toBe(true);
    expect(report.scenarios.some((scenario) => scenario.id === "startup-costs")).toBe(true);
  });
});
