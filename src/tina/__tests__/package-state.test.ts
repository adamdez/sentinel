import { describe, expect, it } from "vitest";
import {
  buildTinaPackageState,
  buildTinaReviewerSignoffSnapshot,
  createTinaPackageSnapshotRecord,
} from "@/tina/lib/package-state";
import { buildTinaCpaPacketExportFromSnapshot } from "@/tina/lib/cpa-packet-export";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaWorkspaceDraft } from "@/tina/types";

function buildReadyDraft(overrides?: Partial<TinaWorkspaceDraft>): TinaWorkspaceDraft {
  return {
    ...createDefaultTinaWorkspaceDraft(),
    ...overrides,
    profile: {
      ...createDefaultTinaWorkspaceDraft().profile,
      businessName: "Tina Sole Prop",
      taxYear: "2025",
      entityType: "sole_prop",
      ownerCount: 1,
      taxElection: "default",
      ...(overrides?.profile ?? {}),
    },
    reviewerFinal: {
      ...createDefaultTinaWorkspaceDraft().reviewerFinal,
      lastRunAt: "2026-04-02T18:00:00.000Z",
      status: "complete",
      summary: "Ready",
      nextStep: "Keep going",
      lines: [
        {
          id: "reviewer-final-1",
          kind: "income",
          layer: "reviewer_final",
          label: "Gross receipts candidate",
          amount: 18000,
          status: "ready",
          summary: "Ready for a return preview.",
          sourceDocumentIds: ["doc-1"],
          sourceFactIds: ["fact-1"],
          issueIds: [],
          derivedFromLineIds: [],
          cleanupSuggestionIds: [],
          taxAdjustmentIds: ["tax-1"],
        },
      ],
    },
    scheduleCDraft: {
      ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
      lastRunAt: "2026-04-02T18:01:00.000Z",
      status: "complete",
      summary: "Ready",
      nextStep: "Review it",
      fields: [
        {
          id: "line-1-gross-receipts",
          lineNumber: "Line 1",
          label: "Gross receipts or sales",
          amount: 18000,
          status: "ready",
          summary: "Mapped safely.",
          reviewerFinalLineIds: ["reviewer-final-1"],
          taxAdjustmentIds: ["tax-1"],
          sourceDocumentIds: ["doc-1"],
        },
      ],
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
    taxAdjustments: {
      ...createDefaultTinaWorkspaceDraft().taxAdjustments,
      lastRunAt: "2026-04-02T18:04:00.000Z",
      status: "complete",
      summary: "Ready",
      nextStep: "Review",
      adjustments: [
        {
          id: "tax-1",
          kind: "carryforward_line",
          status: "approved",
          risk: "low",
          requiresAuthority: false,
          title: "Carry it",
          summary: "Approved",
          suggestedTreatment: "Carry it",
          whyItMatters: "It matters",
          amount: 18000,
          authorityWorkIdeaIds: [],
          aiCleanupLineIds: [],
          sourceDocumentIds: ["doc-1"],
          sourceFactIds: ["fact-1"],
          reviewerNotes: "",
        },
      ],
    },
    documents: [
      {
        id: "doc-1",
        name: "2025-return.pdf",
        size: 100,
        mimeType: "application/pdf",
        storagePath: "tina/2025-return.pdf",
        category: "prior_return",
        requestId: "prior-return",
        requestLabel: "Last year's return",
        uploadedAt: "2026-04-02T17:59:00.000Z",
      },
    ],
  };
}

describe("package state", () => {
  it("marks a complete package ready for cpa review before signoff", () => {
    const draft = buildReadyDraft();

    expect(buildTinaPackageState(draft)).toBe("ready_for_cpa_review");

    const reviewerSignoff = buildTinaReviewerSignoffSnapshot(draft);
    expect(reviewerSignoff.packageState).toBe("ready_for_cpa_review");
    expect(reviewerSignoff.summary).toContain("ready for reviewer signoff");
  });

  it("marks a signed snapshot stale when the live package changes afterward", () => {
    const baseDraft = buildReadyDraft();
    const snapshot = createTinaPackageSnapshotRecord(baseDraft, "2026-04-02T18:05:00.000Z");

    const driftedDraft: TinaWorkspaceDraft = {
      ...baseDraft,
      packageSnapshots: [snapshot],
      reviewerDecisions: [
        {
          id: "decision-1",
          snapshotId: snapshot.id,
          decision: "approved",
          reviewerName: "CPA Reviewer",
          notes: "Looks good.",
          decidedAt: "2026-04-02T18:06:00.000Z",
        },
      ],
      scheduleCDraft: {
        ...baseDraft.scheduleCDraft,
        fields: [
          {
            ...baseDraft.scheduleCDraft.fields[0]!,
            amount: 19000,
          },
        ],
      },
    };

    expect(buildTinaPackageState(driftedDraft)).toBe("signed_off_stale");
    expect(buildTinaReviewerSignoffSnapshot(driftedDraft).hasDriftSinceSignoff).toBe(true);
  });

  it("can export the frozen packet directly from a saved snapshot", () => {
    const snapshot = createTinaPackageSnapshotRecord(
      buildReadyDraft(),
      "2026-04-02T18:05:00.000Z"
    );

    const packet = buildTinaCpaPacketExportFromSnapshot(snapshot);
    expect(packet.fileName).toBe(snapshot.exportFileName);
    expect(packet.contents).toBe(snapshot.exportContents);
    expect(packet.contents).toContain("# Tina CPA Review Packet");
  });
});
