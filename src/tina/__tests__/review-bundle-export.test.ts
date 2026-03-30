import { describe, expect, it } from "vitest";
import { buildTinaReviewBundleExport } from "@/tina/lib/review-bundle-export";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaReviewBundleExport", () => {
  it("builds a multi-file review bundle", () => {
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
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        summary: "Ready",
        nextStep: "Hand it off",
        items: [],
      },
      cpaHandoff: {
        ...createDefaultTinaWorkspaceDraft().cpaHandoff,
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Hand it off",
        artifacts: [
          {
            id: "cpa-cover-note",
            title: "CPA cover note",
            status: "ready" as const,
            summary: "Ready",
            includes: ["Business facts"],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
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
      officialFormPacket: {
        ...createDefaultTinaWorkspaceDraft().officialFormPacket,
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Download it",
        forms: [
          {
            id: "schedule-c",
            formNumber: "Schedule C (Form 1040)",
            title: "Profit or Loss From Business",
            taxYear: "2025",
            revisionYear: "2025",
            status: "ready" as const,
            summary: "Ready",
            nextStep: "Share it",
            sourceDocumentIds: ["doc-1"],
            lines: [],
            supportSchedules: [],
          },
        ],
      },
      finalSignoff: {
        ...createDefaultTinaWorkspaceDraft().finalSignoff,
        status: "complete" as const,
        level: "ready" as const,
        reviewerName: "Ada Reviewer",
        checks: createDefaultTinaWorkspaceDraft().finalSignoff.checks.map((check) => ({
          ...check,
          checked: true,
        })),
        confirmedAt: "2026-03-27T05:00:00.000Z",
      },
    };

    const bundle = buildTinaReviewBundleExport(draft, {
      packetReview: {
        decision: "reference_only",
        reviewerName: "Pat Reviewer",
        reviewerNote: "Keep this one for the audit trail.",
        reviewedAt: "2026-03-27T05:10:00.000Z",
        events: [],
      },
    });

    expect(bundle.files).toHaveLength(10);
    expect(bundle.files.some((file) => file.fileName.includes("artifact-manifest"))).toBe(true);
    expect(bundle.files.some((file) => file.fileName.includes("owner-summary"))).toBe(true);
    expect(bundle.files.some((file) => file.fileName.includes("packet-review"))).toBe(true);
    expect(bundle.files.some((file) => file.fileName.includes("signoff"))).toBe(true);
    expect(bundle.files.some((file) => file.fileName.includes("review-packet"))).toBe(true);
    expect(bundle.files.some((file) => file.fileName.includes("full-handoff-packet"))).toBe(true);
    expect(bundle.files.some((file) => file.fileName.includes("official-form-packet"))).toBe(true);
  });
});
