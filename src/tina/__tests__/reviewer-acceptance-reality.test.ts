import { describe, expect, it } from "vitest";
import {
  createTinaPackageSnapshotRecord,
  recordTinaReviewerDecision,
} from "@/tina/lib/package-state";
import { buildTinaReviewerAcceptanceReality } from "@/tina/lib/reviewer-acceptance-reality";
import { recordTinaReviewerObservedDelta } from "@/tina/lib/reviewer-observed-deltas";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

function buildReadyDraft() {
  const base = createDefaultTinaWorkspaceDraft();

  return {
    ...base,
    profile: {
      ...base.profile,
      businessName: "Acceptance Reality LLC",
      entityType: "sole_prop" as const,
    },
    packageReadiness: {
      lastRunAt: "2026-04-04T03:00:00.000Z",
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

describe("reviewer-acceptance-reality", () => {
  it("treats reviewer-backed authority approval as accepted on first pass", () => {
    const readyDraft = buildReadyDraft();

    const snapshot = buildTinaReviewerAcceptanceReality({
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
          lastAiRunAt: "2026-04-04T03:00:00.000Z",
          updatedAt: "2026-04-04T03:05:00.000Z",
        },
      ],
    });

    const item = snapshot.items.find((candidate) => candidate.theme === "sales_tax_authority");

    expect(snapshot.overallStatus).toBe("trusted");
    expect(item?.outcome).toBe("accepted_first_pass");
    expect(item?.policyTrackStatus).toBe("ready_to_promote");
  });

  it("treats a later approval after reviewer change requests as accepted after adjustment", () => {
    const readyDraft = buildReadyDraft();
    const packageSnapshot = createTinaPackageSnapshotRecord(
      readyDraft,
      "2026-04-04T03:05:00.000Z"
    );
    const changeRequest = recordTinaReviewerDecision({
      snapshotId: packageSnapshot.id,
      reviewerName: "CPA Tina",
      decision: "changes_requested",
      notes: "Need more support for owner payments before trusting the buyout story.",
      decidedAt: "2026-04-04T03:10:00.000Z",
    });
    const approval = recordTinaReviewerDecision({
      snapshotId: packageSnapshot.id,
      reviewerName: "CPA Tina",
      decision: "approved",
      notes: "Resolved after the buyout proof and owner payments were reconciled.",
      decidedAt: "2026-04-04T03:20:00.000Z",
    });

    const snapshot = buildTinaReviewerAcceptanceReality({
      ...readyDraft,
      packageSnapshots: [packageSnapshot],
      reviewerDecisions: [approval, changeRequest],
    });

    const item = snapshot.items.find((candidate) => candidate.theme === "ownership_transition");

    expect(snapshot.overallStatus).toBe("trusted");
    expect(item?.outcome).toBe("accepted_after_adjustment");
    expect(item?.policyTrackStatus).toBe("active");
    expect(item?.benchmarkScenarioIds).toContain("midyear-ownership-change");
  });

  it("treats accepted themes as regressing once the approved snapshot drifts", () => {
    const readyDraft = buildReadyDraft();
    const packageSnapshot = createTinaPackageSnapshotRecord(
      readyDraft,
      "2026-04-04T03:05:00.000Z"
    );
    const approval = recordTinaReviewerDecision({
      snapshotId: packageSnapshot.id,
      reviewerName: "CPA Tina",
      decision: "approved",
      notes: "Approved with the current package.",
      decidedAt: "2026-04-04T03:10:00.000Z",
    });

    const snapshot = buildTinaReviewerAcceptanceReality({
      ...readyDraft,
      packageSnapshots: [packageSnapshot],
      reviewerDecisions: [approval],
      packageReadiness: {
        ...readyDraft.packageReadiness,
        level: "blocked",
        summary: "Drifted after approval.",
        nextStep: "Rebuild before signoff.",
        items: [
          {
            id: "drift-blocker",
            title: "New blocking item",
            summary: "A new blocker appeared after approval.",
            severity: "blocking",
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReviewItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
    });

    const item = snapshot.items[0];

    expect(snapshot.overallStatus).toBe("regressing");
    expect(item?.outcome).toBe("stale_after_acceptance");
  });

  it("uses raw reviewer-observed deltas as first-class acceptance evidence when present", () => {
    const readyDraft = buildReadyDraft();

    const snapshot = buildTinaReviewerAcceptanceReality({
      ...readyDraft,
      reviewerObservedDeltas: [
        recordTinaReviewerObservedDelta({
          title: "Reviewer accepted buyout posture after adjustment",
          domain: "entity_route",
          kind: "accepted_after_adjustment",
          reviewerName: "CPA Tina",
          summary: "Ownership transition posture was accepted after the buyout support arrived.",
          relatedSnapshotId: "snapshot-1",
        }),
      ],
    });

    const item = snapshot.items.find((candidate) => candidate.theme === "ownership_transition");

    expect(snapshot.overallStatus).toBe("watch");
    expect(item?.outcome).toBe("accepted_after_adjustment");
  });

  it("treats reviewer rejection as regressing live acceptance reality", () => {
    const readyDraft = buildReadyDraft();

    const snapshot = buildTinaReviewerAcceptanceReality({
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
          lastAiRunAt: "2026-04-04T03:00:00.000Z",
          updatedAt: "2026-04-04T03:05:00.000Z",
        },
      ],
    });

    const item = snapshot.items.find((candidate) => candidate.theme === "sales_tax_authority");

    expect(snapshot.overallStatus).toBe("regressing");
    expect(item?.outcome).toBe("rejected");
  });
});
