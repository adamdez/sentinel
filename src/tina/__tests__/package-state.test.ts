import { describe, expect, it } from "vitest";
import {
  buildTinaPackageState,
  createTinaPackageSnapshotRecord,
  recordTinaReviewerDecision,
  tinaHasReviewerDrift,
} from "@/tina/lib/package-state";
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

describe("package-state", () => {
  it("marks a ready package as ready for CPA review before signoff", () => {
    const draft = buildReadyDraft();
    expect(buildTinaPackageState(draft)).toBe("ready_for_cpa_review");
  });

  it("marks a package signed off when approved snapshot matches live package", () => {
    const draft = buildReadyDraft();
    const snapshot = createTinaPackageSnapshotRecord(draft, "2026-03-27T05:10:00.000Z");
    const decision = recordTinaReviewerDecision({
      snapshotId: snapshot.id,
      reviewerName: "CPA Tina",
      decision: "approved",
      decidedAt: "2026-03-27T05:11:00.000Z",
    });

    const signedDraft = {
      ...draft,
      packageSnapshots: [snapshot],
      reviewerDecisions: [decision],
    };

    expect(tinaHasReviewerDrift(signedDraft)).toBe(false);
    expect(buildTinaPackageState(signedDraft)).toBe("signed_off");
  });

  it("marks a package stale when signed-off snapshot no longer matches", () => {
    const draft = buildReadyDraft();
    const snapshot = createTinaPackageSnapshotRecord(draft, "2026-03-27T05:10:00.000Z");
    const decision = recordTinaReviewerDecision({
      snapshotId: snapshot.id,
      reviewerName: "CPA Tina",
      decision: "approved",
      decidedAt: "2026-03-27T05:11:00.000Z",
    });

    const staleDraft = {
      ...draft,
      packageSnapshots: [snapshot],
      reviewerDecisions: [decision],
      scheduleCDraft: {
        ...draft.scheduleCDraft,
        fields: [{ ...draft.scheduleCDraft.fields[0], amount: 15000 }],
      },
    };

    expect(tinaHasReviewerDrift(staleDraft)).toBe(true);
    expect(buildTinaPackageState(staleDraft)).toBe("signed_off_stale");
  });
});
