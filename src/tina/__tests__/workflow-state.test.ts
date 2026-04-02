import { describe, expect, it } from "vitest";
import {
  applyTinaReviewerDecision,
  captureTinaPackageSnapshot,
  refreshTinaWorkflowState,
} from "@/tina/lib/workflow-state";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaWorkspaceDraft } from "@/tina/types";

function buildReadyDraft(): TinaWorkspaceDraft {
  return {
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
      status: "complete",
      lastRunAt: "2026-04-02T18:00:00.000Z",
      summary: "Ready",
      nextStep: "Keep going",
      lines: [],
    },
    scheduleCDraft: {
      ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
      status: "complete",
      lastRunAt: "2026-04-02T18:01:00.000Z",
      summary: "Ready",
      nextStep: "Keep going",
      fields: [],
      notes: [],
    },
    packageReadiness: {
      ...createDefaultTinaWorkspaceDraft().packageReadiness,
      status: "complete",
      lastRunAt: "2026-04-02T18:02:00.000Z",
      level: "ready_for_cpa",
      summary: "Ready",
      nextStep: "Hand it off",
      items: [],
    },
    cpaHandoff: {
      ...createDefaultTinaWorkspaceDraft().cpaHandoff,
      status: "complete",
      lastRunAt: "2026-04-02T18:03:00.000Z",
      summary: "Ready",
      nextStep: "Hand it off",
      artifacts: [],
    },
  };
}

describe("workflow-state helpers", () => {
  it("refreshes appendix, signoff, and operational status together", () => {
    const refreshed = refreshTinaWorkflowState(buildReadyDraft());

    expect(refreshed.appendix.status).toBe("complete");
    expect(refreshed.reviewerSignoff.packageState).toBe("ready_for_cpa_review");
    expect(refreshed.operationalStatus.maturity).toBe("schedule_c_core");
  });

  it("captures a snapshot and then applies a reviewer decision", () => {
    const withSnapshot = captureTinaPackageSnapshot(refreshTinaWorkflowState(buildReadyDraft()));
    expect(withSnapshot.packageSnapshots.length).toBe(1);

    const approved = applyTinaReviewerDecision(withSnapshot, {
      snapshotId: withSnapshot.packageSnapshots[0]!.id,
      reviewerName: "CPA Reviewer",
      decision: "approved",
      notes: "Looks good.",
      decidedAt: "2026-04-02T18:05:00.000Z",
    });

    expect(approved.reviewerDecisions.length).toBe(1);
    expect(approved.reviewerSignoff.packageState).toBe("signed_off");
    expect(approved.operationalStatus.packageState).toBe("signed_off");
  });
});
