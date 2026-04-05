import { describe, expect, it } from "vitest";
import {
  createTinaPackageSnapshotRecord,
  recordTinaReviewerDecision,
} from "@/tina/lib/package-state";
import { buildTinaReviewerPolicyVersioning } from "@/tina/lib/reviewer-policy-versioning";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

function buildReadyDraft() {
  const base = createDefaultTinaWorkspaceDraft();

  return {
    ...base,
    profile: {
      ...base.profile,
      businessName: "Policy Versioning LLC",
      entityType: "sole_prop" as const,
    },
    packageReadiness: {
      lastRunAt: "2026-04-04T02:00:00.000Z",
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

describe("reviewer-policy-versioning", () => {
  it("promotes anchored ownership-transition lessons into an active benchmark-backed policy track", () => {
    const readyDraft = buildReadyDraft();
    const snapshot = createTinaPackageSnapshotRecord(readyDraft, "2026-04-04T02:05:00.000Z");
    const changeRequest = recordTinaReviewerDecision({
      snapshotId: snapshot.id,
      reviewerName: "CPA Tina",
      decision: "changes_requested",
      notes: "Need more support for owner payments before trusting the buyout story.",
      decidedAt: "2026-04-04T02:10:00.000Z",
    });
    const approval = recordTinaReviewerDecision({
      snapshotId: snapshot.id,
      reviewerName: "CPA Tina",
      decision: "approved",
      notes: "Resolved after the buyout proof and owner payments were reconciled.",
      decidedAt: "2026-04-04T02:20:00.000Z",
    });

    const versioning = buildTinaReviewerPolicyVersioning({
      ...readyDraft,
      packageSnapshots: [snapshot],
      reviewerDecisions: [approval, changeRequest],
    });

    const track = versioning.items.find((item) => item.theme === "ownership_transition");

    expect(versioning.overallStatus).toBe("stable");
    expect(track?.status).toBe("active");
    expect(track?.currentVersionId).toBeTruthy();
    expect(track?.benchmarkCoverageStatus).toBe("covered");
    expect(track?.benchmarkScenarioIds).toContain("midyear-ownership-change");
    expect(track?.benchmarkScenarioIds).toContain("basisless-distributions");
  });

  it("keeps open overrides in a blocked candidate policy track", () => {
    const readyDraft = buildReadyDraft();
    const snapshot = createTinaPackageSnapshotRecord(readyDraft, "2026-04-04T02:05:00.000Z");
    const changeRequest = recordTinaReviewerDecision({
      snapshotId: snapshot.id,
      reviewerName: "CPA Tina",
      decision: "changes_requested",
      notes: "Need stronger route proof before trusting the election story.",
      decidedAt: "2026-04-04T02:10:00.000Z",
    });

    const versioning = buildTinaReviewerPolicyVersioning({
      ...readyDraft,
      packageSnapshots: [snapshot],
      reviewerDecisions: [changeRequest],
    });

    const track = versioning.items.find((item) => item.theme === "unknown_route");

    expect(versioning.overallStatus).toBe("blocked");
    expect(track?.status).toBe("blocked");
    expect(track?.candidateVersionId).toBeTruthy();
    expect(track?.blockers.some((blocker) => blocker.includes("No anchored reviewer lesson"))).toBe(
      true
    );
  });

  it("keeps anchored authority lessons in the release queue when benchmark coverage is only partial", () => {
    const readyDraft = buildReadyDraft();

    const versioning = buildTinaReviewerPolicyVersioning({
      ...readyDraft,
      authorityWork: [
        {
          ideaId: "sales-tax-authority-review",
          status: "reviewed",
          reviewerDecision: "use_it",
          disclosureDecision: "not_needed",
          memo: "Sales tax exclusion treatment looks supportable on the current facts.",
          reviewerNotes: "Sales tax exclusion is usable here with reviewer backing.",
          missingAuthority: [],
          citations: [{ title: "Primary authority", citation: "Rev. Rul. 2000-1" }],
          lastAiRunAt: "2026-04-04T02:00:00.000Z",
          updatedAt: "2026-04-04T02:05:00.000Z",
        },
      ],
    });

    const track = versioning.items.find((item) => item.theme === "sales_tax_authority");

    expect(versioning.overallStatus).toBe("release_queue");
    expect(track?.status).toBe("ready_to_promote");
    expect(track?.benchmarkCoverageStatus).toBe("partial");
    expect(track?.benchmarkScenarioIds).toEqual(["multi-state-entity-registration"]);
  });
});
