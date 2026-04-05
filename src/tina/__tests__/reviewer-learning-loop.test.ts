import { describe, expect, it } from "vitest";
import {
  createTinaPackageSnapshotRecord,
  recordTinaReviewerDecision,
} from "@/tina/lib/package-state";
import { buildTinaReviewerLearningLoop } from "@/tina/lib/reviewer-learning-loop";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

function buildReadyDraft() {
  const base = createDefaultTinaWorkspaceDraft();

  return {
    ...base,
    profile: {
      ...base.profile,
      businessName: "Tina Review Loop LLC",
      entityType: "sole_prop" as const,
    },
    packageReadiness: {
      lastRunAt: "2026-04-03T01:00:00.000Z",
      status: "complete" as const,
      level: "ready_for_cpa" as const,
      summary: "Ready for CPA review.",
      nextStep: "Capture snapshot.",
      items: [],
    },
    reviewerFinal: {
      ...base.reviewerFinal,
      status: "complete" as const,
    },
    scheduleCDraft: {
      ...base.scheduleCDraft,
      status: "complete" as const,
      fields: [
        {
          id: "line-1",
          lineNumber: "Line 1",
          label: "Gross receipts",
          amount: 120000,
          status: "ready" as const,
          summary: "Supported by books and bank support.",
          reviewerFinalLineIds: [],
          taxAdjustmentIds: [],
          sourceDocumentIds: [],
        },
      ],
      notes: [],
    },
  };
}

describe("reviewer-learning-loop", () => {
  it("turns reviewer changes-requested notes into queued lessons and policy candidates", () => {
    const readyDraft = buildReadyDraft();
    const snapshot = createTinaPackageSnapshotRecord(readyDraft, "2026-04-03T01:05:00.000Z");
    const decision = recordTinaReviewerDecision({
      snapshotId: snapshot.id,
      reviewerName: "CPA Tina",
      decision: "changes_requested",
      notes: "Need more support for owner payments before trusting the buyout story.",
      decidedAt: "2026-04-03T01:10:00.000Z",
    });

    const learningLoop = buildTinaReviewerLearningLoop({
      ...readyDraft,
      packageSnapshots: [snapshot],
      reviewerDecisions: [decision],
    });

    expect(learningLoop.overallStatus).toBe("active_learning");
    expect(learningLoop.activeLessonCount).toBeGreaterThan(0);
    expect(
      learningLoop.policyCandidates.some((candidate) =>
        candidate.recommendedChange.includes("owner, buyout")
      )
    ).toBe(true);
    expect(
      learningLoop.regressionTargets.some((target) => target.fixtureId === "buyout-year")
    ).toBe(true);
  });

  it("promotes reviewer rejection of thin authority posture into a high-priority policy update", () => {
    const readyDraft = buildReadyDraft();
    const learningLoop = buildTinaReviewerLearningLoop({
      ...readyDraft,
      authorityWork: [
        {
          ideaId: "sales-tax-authority-review",
          status: "reviewed",
          reviewerDecision: "do_not_use",
          disclosureDecision: "needs_review",
          memo: "Sales tax support is too thin.",
          reviewerNotes: "Sales tax exclusion still needs stronger authority before use.",
          missingAuthority: ["Primary authority for sales tax pass-through treatment"],
          citations: [],
          lastAiRunAt: "2026-04-03T01:00:00.000Z",
          updatedAt: "2026-04-03T01:05:00.000Z",
        },
      ],
    });

    expect(learningLoop.overallStatus).toBe("policy_update_required");
    expect(
      learningLoop.policyCandidates.some(
        (candidate) =>
          candidate.theme === "sales_tax_authority" && candidate.priority === "high"
      )
    ).toBe(true);
    expect(
      learningLoop.regressionTargets.some(
        (target) => target.theme === "sales_tax_authority" && target.fixtureId === "sales-tax-authority"
      )
    ).toBe(true);
  });

  it("preserves stale-signoff drift as a reusable governance lesson", () => {
    const readyDraft = buildReadyDraft();
    const snapshot = createTinaPackageSnapshotRecord(readyDraft, "2026-04-03T01:05:00.000Z");
    const decision = recordTinaReviewerDecision({
      snapshotId: snapshot.id,
      reviewerName: "CPA Tina",
      decision: "approved",
      notes: "Looks good.",
      decidedAt: "2026-04-03T01:10:00.000Z",
    });

    const driftedDraft = {
      ...readyDraft,
      packageSnapshots: [snapshot],
      reviewerDecisions: [decision],
      packageReadiness: {
        ...readyDraft.packageReadiness,
        summary: "Ready, but changed after signoff.",
      },
      scheduleCDraft: {
        ...readyDraft.scheduleCDraft,
        fields: [{ ...readyDraft.scheduleCDraft.fields[0], amount: 125000 }],
      },
    };

    const learningLoop = buildTinaReviewerLearningLoop(driftedDraft);

    expect(learningLoop.overallStatus).toBe("policy_update_required");
    expect(
      learningLoop.lessons.some((lesson) => lesson.theme === "snapshot_drift")
    ).toBe(true);
    expect(
      learningLoop.policyCandidates.some(
        (candidate) => candidate.theme === "snapshot_drift" && candidate.priority === "high"
      )
    ).toBe(true);
    expect(
      learningLoop.regressionTargets.some((target) => target.fixtureId === "drifted-package")
    ).toBe(true);
  });
});
