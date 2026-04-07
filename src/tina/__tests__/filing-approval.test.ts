import { describe, expect, it } from "vitest";
import { buildTinaFilingApprovalReport } from "@/tina/lib/filing-approval";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaFilingApprovalReport", () => {
  it("keeps Tina in blocked mode when direct submission and other filing gates are not met", () => {
    const draft = createDefaultTinaWorkspaceDraft();

    const report = buildTinaFilingApprovalReport(draft);

    expect(report.status).toBe("blocked");
    expect(report.summary).toContain("not filing-ready");
    expect(report.checks.find((check) => check.id === "direct_submission_channel")?.status).toBe(
      "waiting"
    );
  });

  it("can reach review-only mode when the prep stack is strong but filing-only gates are still missing", () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "Review Only LLC",
        entityType: "single_member_llc" as const,
      },
      packageReadiness: {
        ...baseDraft.packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        summary: "Tina does not see anything blocking a CPA-ready package right now.",
      },
      taxPositionMemory: {
        ...baseDraft.taxPositionMemory,
        status: "complete" as const,
        summary: "Tax positions are current.",
        records: [
          {
            id: "position-1",
            adjustmentId: "adj-1",
            title: "Gross receipts carryforward",
            status: "ready" as const,
            confidence: "high" as const,
            summary: "Supported.",
            treatmentSummary: "Carry the amount to the return draft.",
            reviewerGuidance: "No repeated reviewer issues so far.",
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
        summary: "Reviewer outcomes saved.",
        nextStep: "Keep measuring.",
        scorecard: {
          totalOutcomes: 4,
          acceptedCount: 4,
          revisedCount: 0,
          rejectedCount: 0,
          acceptanceScore: 100,
          trustLevel: "strong" as const,
          nextStep: "Keep feeding outcomes back in.",
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

    const report = buildTinaFilingApprovalReport(draft);

    expect(report.status).toBe("review_only");
    expect(report.checks.find((check) => check.id === "package_readiness")?.status).toBe("ready");
    expect(report.checks.find((check) => check.id === "reviewer_acceptance")?.status).toBe("ready");
  });
});
