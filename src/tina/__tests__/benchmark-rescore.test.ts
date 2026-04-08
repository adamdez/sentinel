import { describe, expect, it } from "vitest";
import { buildTinaBenchmarkRescoreReport } from "@/tina/lib/benchmark-rescore";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaBenchmarkRescoreReport", () => {
  it("freezes score movement when the current file still maps to fragile reviewer cohorts", () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "Fragile Cohort LLC",
        entityType: "single_member_llc" as const,
      },
      reviewerOutcomeMemory: {
        updatedAt: "2026-04-07T08:10:00.000Z",
        summary: "Fragile history.",
        nextStep: "Review repeated corrections first.",
        scorecard: {
          totalOutcomes: 2,
          acceptedCount: 0,
          revisedCount: 1,
          rejectedCount: 1,
          acceptanceScore: 23,
          trustLevel: "fragile" as const,
          nextStep: "Review repeated corrections first.",
          patterns: [],
        },
        overrides: [],
        outcomes: [
          {
            id: "outcome-1",
            title: "Revised",
            phase: "tax_review" as const,
            verdict: "revised" as const,
            targetType: "tax_adjustment" as const,
            targetId: "adj-1",
            summary: "Revised.",
            lessons: [],
            caseTags: ["messy_books", "schedule_c"] as const,
            overrideIds: [],
            decidedAt: "2026-04-06T08:10:00.000Z",
            decidedBy: "reviewer-1",
          },
          {
            id: "outcome-2",
            title: "Rejected",
            phase: "package" as const,
            verdict: "rejected" as const,
            targetType: "reviewer_final_line" as const,
            targetId: "rf-1",
            summary: "Rejected.",
            lessons: [],
            caseTags: ["messy_books", "schedule_c"] as const,
            overrideIds: [],
            decidedAt: "2026-04-05T08:10:00.000Z",
            decidedBy: "reviewer-1",
          },
        ],
      },
      packageReadiness: {
        ...baseDraft.packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
      },
    };

    const report = buildTinaBenchmarkRescoreReport(draft);
    const confidence = report.proposals.find(
      (proposal) => proposal.skillId === "confidence_calibration"
    );
    const messyBooksCohort = report.cohortProposals.find(
      (proposal) =>
        proposal.skillId === "accounting_fluency" && proposal.cohortTag === "messy_books"
    );

    expect(report.summary).toContain("frozen");
    expect(confidence?.recommendation).toBe("do_not_raise");
    expect(messyBooksCohort?.recommendation).toBe("do_not_raise");
  });

  it("flags narrow score review only for skills supported by stronger delivery and live evidence", () => {
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
      sourceFacts: [
        {
          id: "fact-group-1",
          sourceDocumentId: "doc-1",
          label: "Transaction group clue",
          value: "Gross receipts deposits grouped by month",
          confidence: "high" as const,
          capturedAt: "2026-04-07T08:01:15.000Z",
        },
      ],
      bookTieOut: {
        ...baseDraft.bookTieOut,
        status: "complete" as const,
        summary: "Tie-out complete.",
        nextStep: "Done.",
        entries: [
          {
            id: "entry-1",
            documentId: "doc-1",
            label: "Gross receipts",
            moneyIn: 18000,
            moneyOut: 0,
            net: 18000,
            dateCoverage: "2025-01-01 to 2025-12-31",
            status: "ready" as const,
            sourceFactIds: ["fact-group-1"],
            issueIds: [],
          },
        ],
        variances: [],
      },
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
            sourceFactIds: ["fact-group-1"],
            reviewerNotes: "Approved for CPA packet.",
          },
        ],
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
      packageReadiness: {
        ...baseDraft.packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
      },
      taxPositionMemory: {
        ...baseDraft.taxPositionMemory,
        status: "complete" as const,
        summary: "Tax positions current.",
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
            sourceFactIds: ["fact-group-1"],
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
      benchmarkProposalDecisions: [
        {
          id: "benchmark-proposal-clean_books-documentation_and_defensibility",
          skillId: "documentation_and_defensibility",
          cohortTag: "clean_books" as const,
          status: "accepted" as const,
          rationale: "Reviewer accepted the narrow raise.",
          decidedAt: "2026-04-07T08:11:00.000Z",
          decidedBy: "reviewer-1",
        },
      ],
    };

    const report = buildTinaBenchmarkRescoreReport(draft);
    const defensibility = report.proposals.find(
      (proposal) => proposal.skillId === "documentation_and_defensibility"
    );
    const planning = report.proposals.find(
      (proposal) => proposal.skillId === "tax_planning_and_savings_identification"
    );
    const cleanBooksCohort = report.cohortProposals.find(
      (proposal) =>
        proposal.skillId === "documentation_and_defensibility" &&
        proposal.cohortTag === "clean_books"
    );

    expect(report.summary).toContain("narrow");
    expect(defensibility?.recommendation).toBe("consider_raise");
    expect(planning?.recommendation).toBe("hold");
    expect(cleanBooksCohort?.recommendation).toBe("consider_raise");
    expect(cleanBooksCohort?.decision).toBe("accepted");
  });
});
