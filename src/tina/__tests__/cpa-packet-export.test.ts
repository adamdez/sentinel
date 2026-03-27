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
    expect(exportFile.contents).toContain("Line 1 Gross receipts or sales");
    expect(exportFile.contents).toContain("2025-return.pdf");
  });
});
