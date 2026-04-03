import { describe, expect, it } from "vitest";
import { buildTinaCrossFormConsistency } from "@/tina/lib/cross-form-consistency";
import {
  createTinaPackageSnapshotRecord,
  recordTinaReviewerDecision,
} from "@/tina/lib/package-state";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("cross-form-consistency", () => {
  it("flags a signed-off package whose form output is still not ready", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Mismatch LLC",
        taxYear: "2025",
        principalBusinessActivity: "",
        naicsCode: "",
        entityType: "single_member_llc" as const,
        ownerCount: 1,
        taxElection: "default" as const,
      },
      sourceFacts: [
        {
          id: "fact-owner-count",
          sourceDocumentId: "doc-organizer",
          label: "Owner count clue",
          value: "Single member only.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:00:00.000Z",
        },
        {
          id: "fact-return-type",
          sourceDocumentId: "doc-prior",
          label: "Return type clue",
          value: "Schedule C",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:01:00.000Z",
        },
      ],
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 1000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-income"],
          },
        ],
        notes: [],
      },
      reviewerSignoff: {
        ...createDefaultTinaWorkspaceDraft().reviewerSignoff,
        packageState: "signed_off" as const,
        summary: "Signed off",
        nextStep: "Keep stable",
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        items: [],
      },
    };

    const snapshotRecord = createTinaPackageSnapshotRecord(
      {
        ...draft,
        packageReadiness: {
          ...draft.packageReadiness,
          level: "ready_for_cpa",
        },
      },
      "2026-04-03T08:05:00.000Z"
    );
    const reviewerDecision = recordTinaReviewerDecision({
      snapshotId: snapshotRecord.id,
      reviewerName: "CPA Tina",
      decision: "approved",
      notes: "Approved before header fields changed.",
      decidedAt: "2026-04-03T08:06:00.000Z",
    });
    const signedOffDraft = {
      ...draft,
      packageSnapshots: [snapshotRecord],
      reviewerDecisions: [reviewerDecision],
    };

    const snapshot = buildTinaCrossFormConsistency(signedOffDraft);

    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.issues.some((issue) => issue.id === "signed-off-without-ready-forms")).toBe(true);
  });
});
