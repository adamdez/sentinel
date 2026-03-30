import { describe, expect, it } from "vitest";
import { buildTinaReviewPacketHtmlExport } from "@/tina/lib/review-packet-html";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaReviewPacketHtmlExport", () => {
  it("builds a reviewer-friendly single HTML packet", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
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
      documentReadings: [
        {
          id: "reading-1",
          documentId: "doc-1",
          status: "complete" as const,
          kind: "pdf" as const,
          summary: "Read it",
          notes: [],
          extractedText: "Tina Sole Prop",
          extractedFacts: [],
          lastReadAt: "2026-03-27T04:01:00.000Z",
        },
      ],
      scheduleCDraft: {
        ...base.scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "ready" as const,
            summary: "Mapped safely.",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...base.packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        summary: "Ready for a careful reviewer handoff.",
        nextStep: "Hand it off",
        items: [],
      },
      cpaHandoff: {
        ...base.cpaHandoff,
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Hand it off",
        artifacts: [
          {
            id: "cpa-cover-note",
            title: "CPA cover note",
            status: "ready" as const,
            summary: "Ready to scan.",
            includes: ["Business facts"],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
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
      finalSignoff: {
        ...base.finalSignoff,
        status: "complete" as const,
        level: "ready" as const,
        reviewerName: "Ada Reviewer",
      },
    };

    const exportFile = buildTinaReviewPacketHtmlExport(draft);

    expect(exportFile.fileName).toContain("tina-review-packet");
    expect(exportFile.mimeType).toContain("text/html");
    expect(exportFile.contents).toContain("<!doctype html>");
    expect(exportFile.contents).toContain("Tina review packet for Tina Sole Prop");
    expect(exportFile.contents).toContain("Packet ID TINA-2025-");
    expect(exportFile.contents).toContain("CPA handoff sections");
    expect(exportFile.contents).toContain("Schedule C draft");
    expect(exportFile.contents).toContain("Authority work");
    expect(exportFile.contents).toContain("needs care");
    expect(exportFile.contents).toContain("The Washington classification may be narrower than it first looks.");
  });

  it("uses saved handoff and signoff snapshots instead of rebuilding them", () => {
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
        summary: "Saved review packet summary",
        nextStep: "Use the saved packet.",
        artifacts: [
          {
            id: "saved-artifact",
            title: "Saved artifact",
            status: "ready" as const,
            summary: "Saved artifact summary",
            includes: ["Saved include"],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
      finalSignoff: {
        ...base.finalSignoff,
        status: "complete" as const,
        level: "ready" as const,
        summary: "Saved signoff summary",
        nextStep: "Saved signoff next step",
        reviewerName: "Saved Reviewer",
        reviewerNote: "Saved reviewer note.",
      },
      scheduleCDraft: {
        ...base.scheduleCDraft,
        status: "idle" as const,
        fields: [],
        notes: [],
      },
      packageReadiness: {
        ...base.packageReadiness,
        status: "idle" as const,
        level: "blocked" as const,
        summary: "Raw package state",
        nextStep: "Do not rebuild from this.",
        items: [],
      },
    };

    const exportFile = buildTinaReviewPacketHtmlExport(draft);

    expect(exportFile.contents).toContain("Saved artifact");
    expect(exportFile.contents).toContain("Saved artifact summary");
    expect(exportFile.contents).toContain("Saved Reviewer");
    expect(exportFile.contents).toContain("Saved reviewer note.");
    expect(exportFile.contents).toContain("Raw package state");
  });

  it("shows the saved packet review panel when review metadata is provided", () => {
    const exportFile = buildTinaReviewPacketHtmlExport(createDefaultTinaWorkspaceDraft(), {
      packetReview: {
        decision: "approved_for_handoff",
        reviewerName: "Pat Reviewer",
        reviewerNote: "This saved packet is calm enough to share.",
        reviewedAt: "2026-03-27T12:20:00.000Z",
        events: [],
      },
    });

    expect(exportFile.contents).toContain("Saved packet review");
    expect(exportFile.contents).toContain("Looks ready");
    expect(exportFile.contents).toContain("Pat Reviewer");
    expect(exportFile.contents).toContain("This saved packet is calm enough to share.");
  });
});
