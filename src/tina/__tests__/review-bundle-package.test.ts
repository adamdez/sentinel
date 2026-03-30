import { describe, expect, it } from "vitest";
import { buildTinaReviewBundlePackage } from "@/tina/lib/review-bundle-package";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaReviewBundlePackage", () => {
  it("creates a single downloadable JSON package", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop" as const,
      },
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
            includes: [],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
        ],
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
            sourceDocumentIds: [],
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
      },
    };

    const packageFile = buildTinaReviewBundlePackage(draft, {
      packetReview: {
        decision: "approved_for_handoff",
        reviewerName: "Pat Reviewer",
        reviewerNote: "Looks ready to share.",
        reviewedAt: "2026-03-27T05:15:00.000Z",
        events: [],
      },
    });
    const payload = JSON.parse(packageFile.contents) as {
      businessName: string;
      taxYear: string;
      packetIdentity?: { packetId: string; packetVersion: string };
      packetReview?: { decision?: string; reviewerName?: string };
      manifest?: { items?: Array<{ id: string }> };
      files: Array<{ fileName: string }>;
    };

    expect(packageFile.fileName).toContain("tina-review-bundle");
    expect(payload.businessName).toBe("Tina Sole Prop");
    expect(payload.taxYear).toBe("2025");
    expect(payload.packetIdentity?.packetId).toContain("TINA-2025-");
    expect(payload.packetIdentity?.packetVersion).toMatch(/^rev-/);
    expect(payload.packetReview?.decision).toBe("approved_for_handoff");
    expect(payload.packetReview?.reviewerName).toBe("Pat Reviewer");
    expect(payload.manifest?.items?.some((item) => item.id === "review-bundle-package")).toBe(true);
    expect(Array.isArray(payload.files)).toBe(true);
    expect(payload.files.length).toBeGreaterThan(0);
    expect(payload.files.some((file) => file.fileName.includes("artifact-manifest"))).toBe(true);
    expect(payload.files.some((file) => file.fileName.includes("packet-review"))).toBe(true);
    expect(payload.files.some((file) => file.fileName.includes("review-packet"))).toBe(true);
    expect(payload.files.some((file) => file.fileName.includes("full-handoff-packet"))).toBe(true);
    expect(payload.files.some((file) => file.fileName.includes("official-form-packet"))).toBe(true);
  });
});
