import { describe, expect, it } from "vitest";
import { buildTinaCaseMemoryLedger } from "@/tina/lib/case-memory-ledger";
import {
  createTinaPackageSnapshotRecord,
  recordTinaReviewerDecision,
} from "@/tina/lib/package-state";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

function buildReadyDraft() {
  const base = createDefaultTinaWorkspaceDraft();

  return {
    ...base,
    profile: {
      ...base.profile,
      businessName: "Tina Sole Prop",
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

describe("case-memory-ledger", () => {
  it("anchors a live package to the current approved snapshot when nothing drifted", () => {
    const readyDraft = buildReadyDraft();
    const snapshot = createTinaPackageSnapshotRecord(readyDraft, "2026-04-03T01:05:00.000Z");
    const decision = recordTinaReviewerDecision({
      snapshotId: snapshot.id,
      reviewerName: "CPA Tina",
      decision: "approved",
      notes: "Looks good.",
      decidedAt: "2026-04-03T01:10:00.000Z",
    });

    const ledger = buildTinaCaseMemoryLedger({
      ...readyDraft,
      packageSnapshots: [snapshot],
      reviewerDecisions: [decision],
    });

    expect(ledger.overallStatus).toBe("stable");
    expect(ledger.activeAnchorSnapshotId).toBe(snapshot.id);
    expect(ledger.openOverrideCount).toBe(0);
    expect(ledger.entries.some((entry) => entry.type === "snapshot")).toBe(true);
    expect(ledger.entries.some((entry) => entry.type === "reviewer_decision")).toBe(true);
  });

  it("surfaces explicit drift reasons when a once-approved package changes", () => {
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
        level: "needs_review" as const,
        summary: "Open items came back.",
        items: [
          {
            id: "blocking-1",
            title: "Fresh blocker",
            summary: "Something changed after approval.",
            severity: "blocking" as const,
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReviewItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
      scheduleCDraft: {
        ...readyDraft.scheduleCDraft,
        fields: [{ ...readyDraft.scheduleCDraft.fields[0], amount: 125000 }],
      },
    };

    const ledger = buildTinaCaseMemoryLedger(driftedDraft);

    expect(ledger.overallStatus).toBe("drifted");
    expect(ledger.driftReasons.length).toBeGreaterThan(0);
    expect(
      ledger.driftReasons.some((reason) => reason.includes("Readiness changed"))
    ).toBe(true);
  });

  it("keeps reviewer changes-requested overrides open until a new approval resolves them", () => {
    const readyDraft = buildReadyDraft();
    const snapshot = createTinaPackageSnapshotRecord(readyDraft, "2026-04-03T01:05:00.000Z");
    const decision = recordTinaReviewerDecision({
      snapshotId: snapshot.id,
      reviewerName: "CPA Tina",
      decision: "changes_requested",
      notes: "Need more support for owner payments.",
      decidedAt: "2026-04-03T01:10:00.000Z",
    });

    const ledger = buildTinaCaseMemoryLedger({
      ...readyDraft,
      packageSnapshots: [snapshot],
      reviewerDecisions: [decision],
    });

    expect(ledger.overallStatus).toBe("review_pending");
    expect(ledger.openOverrideCount).toBe(1);
    expect(ledger.overrides[0]?.status).toBe("open");
    expect(ledger.overrides[0]?.decision).toBe("changes_requested");
  });
});
