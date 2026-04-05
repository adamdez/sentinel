import { describe, expect, it } from "vitest";
import {
  buildTinaReviewerObservedDeltas,
  recordTinaReviewerObservedDelta,
} from "@/tina/lib/reviewer-observed-deltas";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("reviewer-observed-deltas", () => {
  it("builds a quiet empty snapshot when no raw reviewer deltas are recorded", () => {
    const snapshot = buildTinaReviewerObservedDeltas(createDefaultTinaWorkspaceDraft());

    expect(snapshot.overallStatus).toBe("quiet");
    expect(snapshot.totalDeltaCount).toBe(0);
  });

  it("maps raw reviewer deltas into themed observed acceptance truth", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      reviewerObservedDeltas: [
        recordTinaReviewerObservedDelta({
          title: "Reviewer accepted buyout cleanup after adjustment",
          domain: "entity_route",
          kind: "accepted_after_adjustment",
          reviewerName: "CPA Tina",
          summary: "Ownership transition posture was accepted after buyout proof landed.",
          relatedSnapshotId: "snapshot-1",
        }),
        recordTinaReviewerObservedDelta({
          title: "Reviewer requested stronger payroll support",
          domain: "evidence_books",
          kind: "change_requested",
          reviewerName: "CPA Tina",
          summary: "Payroll overlap still needs support.",
          benchmarkScenarioIds: ["contractor-vs-employee"],
        }),
      ],
    };

    const snapshot = buildTinaReviewerObservedDeltas(draft);

    expect(snapshot.overallStatus).toBe("policy_update_required");
    expect(snapshot.acceptedAfterAdjustmentCount).toBe(1);
    expect(snapshot.changeRequestedCount).toBe(1);
    expect(snapshot.items.some((item) => item.theme === "ownership_transition")).toBe(true);
    expect(snapshot.items.some((item) => item.theme === "worker_classification")).toBe(true);
  });
});
