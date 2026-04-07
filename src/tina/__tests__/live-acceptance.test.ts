import { describe, expect, it } from "vitest";
import { buildTinaLiveAcceptanceReport } from "@/tina/lib/live-acceptance";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaLiveAcceptanceReport", () => {
  it("builds rolling reviewer outcome windows, cohorts, and benchmark movement guidance", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Live Acceptance LLC",
        entityType: "single_member_llc" as const,
      },
      reviewerOutcomeMemory: {
        updatedAt: "2026-04-07T08:10:00.000Z",
        summary: "Saved reviewer outcomes.",
        nextStep: "Review repeated corrections first.",
        scorecard: {
          totalOutcomes: 4,
          acceptedCount: 2,
          revisedCount: 1,
          rejectedCount: 1,
          acceptanceScore: 58,
          trustLevel: "fragile" as const,
          nextStep: "Review repeated corrections first.",
          patterns: [
            {
              patternId: "tax_adjustment:tax_review",
              label: "tax adjustment in tax review",
              targetType: "tax_adjustment" as const,
              phase: "tax_review" as const,
              totalOutcomes: 4,
              acceptedCount: 2,
              revisedCount: 1,
              rejectedCount: 1,
              acceptanceScore: 58,
              trustLevel: "fragile" as const,
              confidenceImpact: "lower" as const,
              nextStep: "Treat tax adjustment in tax review as unstable.",
              lessons: ["Owner-flow treatment still drifts without stronger proof."],
              updatedAt: "2026-04-07T08:10:00.000Z",
            },
          ],
        },
        overrides: [],
        outcomes: [
          {
            id: "outcome-1",
            title: "Recent accept",
            phase: "tax_review" as const,
            verdict: "accepted" as const,
            targetType: "tax_adjustment" as const,
            targetId: "adj-1",
            summary: "Accepted.",
            lessons: [],
            caseTags: ["clean_books", "schedule_c"] as const,
            overrideIds: [],
            decidedAt: "2026-04-06T08:10:00.000Z",
            decidedBy: "reviewer-1",
          },
          {
            id: "outcome-2",
            title: "Recent revision",
            phase: "tax_review" as const,
            verdict: "revised" as const,
            targetType: "tax_adjustment" as const,
            targetId: "adj-2",
            summary: "Revised.",
            lessons: [],
            caseTags: ["messy_books", "schedule_c"] as const,
            overrideIds: [],
            decidedAt: "2026-04-01T08:10:00.000Z",
            decidedBy: "reviewer-1",
          },
          {
            id: "outcome-3",
            title: "Recent rejection",
            phase: "package" as const,
            verdict: "rejected" as const,
            targetType: "reviewer_final_line" as const,
            targetId: "rf-1",
            summary: "Rejected.",
            lessons: [],
            caseTags: ["commingled_entity", "messy_books"] as const,
            overrideIds: [],
            decidedAt: "2026-03-20T08:10:00.000Z",
            decidedBy: "reviewer-1",
          },
          {
            id: "outcome-4",
            title: "Old accept",
            phase: "package" as const,
            verdict: "accepted" as const,
            targetType: "reviewer_final_line" as const,
            targetId: "rf-2",
            summary: "Accepted.",
            lessons: [],
            caseTags: ["clean_books"] as const,
            overrideIds: [],
            decidedAt: "2025-12-15T08:10:00.000Z",
            decidedBy: "reviewer-1",
          },
        ],
      },
    };

    const report = buildTinaLiveAcceptanceReport(draft, "2026-04-07T08:10:00.000Z");

    expect(report.windows[0]?.label).toBe("last 30 days");
    expect(report.windows[0]?.totalOutcomes).toBe(3);
    expect(report.windows[1]?.label).toBe("last 90 days");
    expect(report.windows[1]?.totalOutcomes).toBe(3);
    expect(report.windows[2]?.label).toBe("all time");
    expect(report.windows[2]?.totalOutcomes).toBe(4);
    expect(report.cohorts.find((cohort) => cohort.tag === "messy_books")?.trustLevel).toBe(
      "fragile"
    );
    expect(report.currentFileTags).toContain("schedule_c");
    expect(report.currentFileCohorts.find((cohort) => cohort.tag === "schedule_c")?.trustLevel).toBe(
      "mixed"
    );
    expect(report.unstablePatterns[0]?.label).toContain("tax adjustment");
    expect(report.benchmarkMovement.recommendation).toBe("hold");
    expect(report.nextStep).toContain("Do not move benchmark scores up yet");
  });
});
