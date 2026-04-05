import { describe, expect, it } from "vitest";
import {
  createTinaPackageSnapshotRecord,
  recordTinaReviewerDecision,
} from "@/tina/lib/package-state";
import { buildTinaReviewerOverrideGovernance } from "@/tina/lib/reviewer-override-governance";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

function buildReadyDraft() {
  const base = createDefaultTinaWorkspaceDraft();

  return {
    ...base,
    profile: {
      ...base.profile,
      businessName: "Governance Test LLC",
      entityType: "sole_prop" as const,
    },
    packageReadiness: {
      lastRunAt: "2026-04-04T01:00:00.000Z",
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

describe("reviewer-override-governance", () => {
  it("keeps unresolved reviewer overrides under governed reviewer control", () => {
    const readyDraft = buildReadyDraft();
    const snapshot = createTinaPackageSnapshotRecord(readyDraft, "2026-04-04T01:05:00.000Z");
    const decision = recordTinaReviewerDecision({
      snapshotId: snapshot.id,
      reviewerName: "CPA Tina",
      decision: "changes_requested",
      notes: "Need more support for owner payments before trusting the buyout story.",
      decidedAt: "2026-04-04T01:10:00.000Z",
    });

    const governance = buildTinaReviewerOverrideGovernance({
      ...readyDraft,
      packageSnapshots: [snapshot],
      reviewerDecisions: [decision],
    });

    expect(governance.overallStatus).toBe("policy_update_required");
    expect(governance.openOverrideCount).toBe(1);
    expect(governance.items[0]?.theme).toBe("ownership_transition");
    expect(governance.items[0]?.scope).toBe("entity_route");
    expect(governance.items[0]?.trustBoundary).toBe("reviewer_controlled");
    expect(governance.items[0]?.policyState).toBe("candidate");
    expect(governance.recommendedBenchmarkScenarioIds).toContain("midyear-ownership-change");
  });

  it("anchors resolved override lessons once a reviewer later approves the corrected pattern", () => {
    const readyDraft = buildReadyDraft();
    const snapshot = createTinaPackageSnapshotRecord(readyDraft, "2026-04-04T01:05:00.000Z");
    const changeRequest = recordTinaReviewerDecision({
      snapshotId: snapshot.id,
      reviewerName: "CPA Tina",
      decision: "changes_requested",
      notes: "Need stronger route proof before trusting the election story.",
      decidedAt: "2026-04-04T01:10:00.000Z",
    });
    const approval = recordTinaReviewerDecision({
      snapshotId: snapshot.id,
      reviewerName: "CPA Tina",
      decision: "approved",
      notes: "Resolved after the election proof landed.",
      decidedAt: "2026-04-04T01:20:00.000Z",
    });

    const governance = buildTinaReviewerOverrideGovernance({
      ...readyDraft,
      packageSnapshots: [snapshot],
      reviewerDecisions: [approval, changeRequest],
    });

    const governedItem = governance.items.find(
      (item) => item.relatedDecisionId === changeRequest.id
    );

    expect(governance.overallStatus).toBe("stable");
    expect(governedItem?.status).toBe("anchored");
    expect(governedItem?.policyState).toBe("anchored");
    expect(governedItem?.trustBoundary).toBe("bounded_reuse");
  });

  it("turns rejected authority posture into a blocking acceptance delta", () => {
    const readyDraft = buildReadyDraft();
    const governance = buildTinaReviewerOverrideGovernance({
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
          lastAiRunAt: "2026-04-04T01:00:00.000Z",
          updatedAt: "2026-04-04T01:05:00.000Z",
        },
      ],
    });

    expect(governance.overallStatus).toBe("policy_update_required");
    expect(governance.blockingAcceptanceDeltaCount).toBeGreaterThan(0);
    expect(
      governance.acceptanceDeltas.some(
        (delta) =>
          delta.theme === "sales_tax_authority" &&
          delta.status === "rejected" &&
          delta.severity === "blocking"
      )
    ).toBe(true);
  });
});
