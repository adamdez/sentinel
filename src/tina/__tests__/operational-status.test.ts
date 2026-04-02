import { describe, expect, it } from "vitest";
import { buildTinaOperationalStatus } from "@/tina/lib/operational-status";
import { createTinaPackageSnapshotRecord } from "@/tina/lib/package-state";
import { buildTinaAppendix } from "@/tina/lib/appendix";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaWorkspaceDraft } from "@/tina/types";

function buildReviewerGradeDraft(): TinaWorkspaceDraft {
  const baseDraft: TinaWorkspaceDraft = {
    ...createDefaultTinaWorkspaceDraft(),
    profile: {
      ...createDefaultTinaWorkspaceDraft().profile,
      businessName: "Tina Sole Prop",
      taxYear: "2025",
      entityType: "sole_prop",
      ownerCount: 1,
      taxElection: "default",
    },
    reviewerFinal: {
      ...createDefaultTinaWorkspaceDraft().reviewerFinal,
      lastRunAt: "2026-04-02T18:00:00.000Z",
      status: "complete",
      summary: "Ready",
      nextStep: "Keep going",
      lines: [],
    },
    scheduleCDraft: {
      ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
      lastRunAt: "2026-04-02T18:01:00.000Z",
      status: "complete",
      summary: "Ready",
      nextStep: "Keep going",
      fields: [],
      notes: [],
    },
    packageReadiness: {
      ...createDefaultTinaWorkspaceDraft().packageReadiness,
      lastRunAt: "2026-04-02T18:02:00.000Z",
      status: "complete",
      level: "ready_for_cpa",
      summary: "Ready",
      nextStep: "Hand it off",
      items: [],
    },
    cpaHandoff: {
      ...createDefaultTinaWorkspaceDraft().cpaHandoff,
      lastRunAt: "2026-04-02T18:03:00.000Z",
      status: "complete",
      summary: "Ready",
      nextStep: "Hand it off",
      artifacts: [],
    },
  };
  const appendix = buildTinaAppendix(baseDraft);
  const draftWithAppendix = { ...baseDraft, appendix };
  const snapshot = createTinaPackageSnapshotRecord(
    draftWithAppendix,
    "2026-04-02T18:05:00.000Z"
  );

  return {
    ...draftWithAppendix,
    packageSnapshots: [snapshot],
    reviewerDecisions: [
      {
        id: "decision-1",
        snapshotId: snapshot.id,
        decision: "approved",
        reviewerName: "CPA Reviewer",
        notes: "Signed off.",
        decidedAt: "2026-04-02T18:06:00.000Z",
      },
    ],
  };
}

describe("buildTinaOperationalStatus", () => {
  it("reports reviewer-grade core truthfully when snapshots, decisions, and appendix exist", () => {
    const status = buildTinaOperationalStatus(buildReviewerGradeDraft());

    expect(status.maturity).toBe("reviewer_grade_core");
    expect(status.packageState).toBe("signed_off");
    expect(status.truths.some((truth) => truth.includes("immutable package snapshot"))).toBe(true);
  });
});
