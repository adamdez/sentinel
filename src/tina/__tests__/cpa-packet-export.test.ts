import { describe, expect, it } from "vitest";
import { buildTinaCpaPacketExport } from "@/tina/lib/cpa-packet-export";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaCpaPacketExport", () => {
  it("creates a markdown packet summary from the current Tina draft", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop" as const,
      },
      documents: [
        {
          id: "doc-1",
          name: "2025-return.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/2025-return.pdf",
          category: "prior_return" as const,
          requestId: "prior-return",
          requestLabel: "Last year's return",
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "reviewer-final-1",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 18000,
            status: "ready" as const,
            summary: "Ready for a return preview.",
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-1"],
          },
        ],
      },
      scheduleCDraft: {
        lastRunAt: "2026-03-27T04:02:00.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Review it",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "ready" as const,
            summary: "Mapped safely.",
            reviewerFinalLineIds: ["reviewer-final-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        summary: "Ready",
        nextStep: "Hand it off",
        items: [],
      },
      cpaHandoff: {
        lastRunAt: "2026-03-27T04:04:00.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Hand it off",
        artifacts: [],
      },
      authorityWork: [
        {
          ideaId: "wa-state-review",
          status: "ready_for_reviewer" as const,
          reviewerDecision: "need_more_support" as const,
          disclosureDecision: "needs_review" as const,
          challengeVerdict: "needs_care" as const,
          memo: "Washington treatment may work, but Tina wants a reviewer look.",
          challengeMemo: "The position survives for now, but the business facts need a tight fit.",
          reviewerNotes: "",
          missingAuthority: ["Need Washington support that matches this fact pattern."],
          challengeWarnings: ["The Washington classification may be narrower than it first looks."],
          challengeQuestions: ["Does the activity really fit the claimed Washington treatment?"],
          citations: [],
          lastAiRunAt: "2026-03-27T04:05:00.000Z",
          lastChallengeRunAt: "2026-03-27T04:06:00.000Z",
          updatedAt: "2026-03-27T04:06:00.000Z",
        },
      ],
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:03:30.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Review",
        adjustments: [
          {
            id: "tax-1",
            kind: "carryforward_line" as const,
            status: "approved" as const,
            risk: "low" as const,
            requiresAuthority: false,
            title: "Carry it",
            summary: "Approved",
            suggestedTreatment: "Carry it",
            whyItMatters: "It matters",
            amount: 18000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: [],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            reviewerNotes: "",
          },
        ],
      },
    };

    const exportFile = buildTinaCpaPacketExport(draft);

    expect(exportFile.fileName).toContain("tina-sole-prop");
    expect(exportFile.fileName).toContain("2025");
    expect(exportFile.contents).toContain("# Tina CPA Review Packet");
    expect(exportFile.contents).toContain("Packet ID: TINA-2025-");
    expect(exportFile.contents).toContain("Line 1 Gross receipts or sales");
    expect(exportFile.contents).toContain("2025-return.pdf");
    expect(exportFile.contents).toContain("Stress test: needs care");
    expect(exportFile.contents).toContain("Weak spot: The Washington classification may be narrower than it first looks.");
    expect(exportFile.contents).toContain("Reviewer question: Does the activity really fit the claimed Washington treatment?");
  });

  it("uses the saved cpa handoff snapshot instead of recalculating packet sections", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop" as const,
      },
      cpaHandoff: {
        ...base.cpaHandoff,
        status: "complete" as const,
        summary: "Saved handoff summary",
        nextStep: "Use the saved packet.",
        artifacts: [
          {
            id: "saved-artifact",
            title: "Saved section",
            status: "ready" as const,
            summary: "Saved section summary",
            includes: ["Saved bullet"],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
      scheduleCDraft: {
        ...base.scheduleCDraft,
        status: "idle" as const,
        fields: [],
        notes: [],
      },
      reviewerFinal: {
        ...base.reviewerFinal,
        status: "idle" as const,
        lines: [],
      },
      packageReadiness: {
        ...base.packageReadiness,
        status: "idle" as const,
        level: "blocked" as const,
        summary: "Raw draft not ready",
        nextStep: "Do not recompute from this.",
        items: [],
      },
    };

    const exportFile = buildTinaCpaPacketExport(draft);

    expect(exportFile.contents).toContain("Saved handoff summary");
    expect(exportFile.contents).toContain("Saved section [ready]");
    expect(exportFile.contents).toContain("Saved bullet");
    expect(exportFile.contents).not.toContain("Raw draft not ready");
  });

  it("includes saved packet review trail when provided", () => {
    const draft = createDefaultTinaWorkspaceDraft();

    const exportFile = buildTinaCpaPacketExport(draft, {
      packetReview: {
        decision: "needs_follow_up",
        reviewerName: "Pat Reviewer",
        reviewerNote: "Need one more bank-fee check.",
        reviewedAt: "2026-03-27T12:20:00.000Z",
        events: [],
      },
    });

    expect(exportFile.contents).toContain("## Saved packet review");
    expect(exportFile.contents).toContain("Needs follow-up");
    expect(exportFile.contents).toContain("Pat Reviewer");
    expect(exportFile.contents).toContain("Need one more bank-fee check.");
  });
});
