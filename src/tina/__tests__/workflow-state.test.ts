import { describe, expect, it } from "vitest";
import {
  applyTinaReviewerObservedDelta,
  applyTinaReviewerDecision,
  captureTinaPackageSnapshot,
  refreshTinaWorkflowState,
} from "@/tina/lib/workflow-state";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

function buildReadyDraft() {
  return {
    ...createDefaultTinaWorkspaceDraft(),
    profile: {
      ...createDefaultTinaWorkspaceDraft().profile,
      businessName: "Tina Sole Prop",
      entityType: "sole_prop" as const,
    },
    packageReadiness: {
      lastRunAt: "2026-03-27T05:00:00.000Z",
      status: "complete" as const,
      level: "ready_for_cpa" as const,
      summary: "Ready",
      nextStep: "Capture snapshot",
      items: [],
    },
    reviewerFinal: {
      ...createDefaultTinaWorkspaceDraft().reviewerFinal,
      status: "complete" as const,
    },
    scheduleCDraft: {
      ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
      status: "complete" as const,
      fields: [
        {
          id: "line-1",
          lineNumber: "Line 1",
          label: "Gross receipts",
          amount: 10000,
          status: "ready" as const,
          summary: "Ready",
          reviewerFinalLineIds: [],
          taxAdjustmentIds: [],
          sourceDocumentIds: [],
        },
      ],
      notes: [],
    },
  };
}

describe("workflow-state", () => {
  it("refreshes appendix and operational status", () => {
    const draft = refreshTinaWorkflowState(buildReadyDraft());
    expect(draft.appendix.status).toBe("complete");
    expect(draft.operationalStatus.packageState).toBe("ready_for_cpa_review");
  });

  it("captures an immutable package snapshot", () => {
    const draft = captureTinaPackageSnapshot(buildReadyDraft());
    expect(draft.packageSnapshots).toHaveLength(1);
    expect(draft.packageSnapshots[0]?.exportContents).toContain("# Tina CPA Review Packet");
  });

  it("records reviewer decisions against a captured snapshot", () => {
    const withSnapshot = captureTinaPackageSnapshot(buildReadyDraft());
    const draft = applyTinaReviewerDecision(withSnapshot, {
      snapshotId: withSnapshot.packageSnapshots[0]!.id,
      reviewerName: "CPA Tina",
      decision: "approved",
      notes: "Looks good",
      decidedAt: "2026-03-27T05:12:00.000Z",
    });

    expect(draft.reviewerDecisions).toHaveLength(1);
    expect(draft.reviewerSignoff.packageState).toBe("signed_off");
  });

  it("records raw reviewer-observed deltas against the live draft", () => {
    const draft = applyTinaReviewerObservedDelta(buildReadyDraft(), {
      title: "Reviewer requested stronger route proof",
      domain: "entity_route",
      kind: "change_requested",
      reviewerName: "CPA Tina",
      summary: "Election story still needs direct proof before route trust widens.",
      relatedSnapshotId: "snapshot-1",
    });

    expect(draft.reviewerObservedDeltas).toHaveLength(1);
    expect(draft.reviewerObservedDeltas[0]?.kind).toBe("change_requested");
    expect(draft.operationalStatus.truths.some((truth) => /reviewer observed deltas/i.test(truth))).toBe(
      true
    );
  });
});
