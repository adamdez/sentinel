import { describe, expect, it } from "vitest";
import { buildTinaOfficialFormExport } from "@/tina/lib/official-form-export";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaOfficialFormExport", () => {
  it("creates a single html form packet", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop" as const,
      },
      officialFormPacket: {
        ...base.officialFormPacket,
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Hand it off",
        forms: [
          {
            id: "schedule-c",
            formNumber: "Schedule C (Form 1040)",
            title: "Profit or Loss From Business",
            taxYear: "2025",
            revisionYear: "2025",
            status: "ready" as const,
            summary: "Ready",
            nextStep: "Hand it off",
            lines: [
              {
                id: "line-1-gross-receipts",
                lineNumber: "Line 1",
                label: "Gross receipts or sales",
                value: "$22,000",
                state: "filled" as const,
                summary: "Ready",
                scheduleCDraftFieldIds: [],
                scheduleCDraftNoteIds: [],
                sourceDocumentIds: ["doc-1"],
              },
              {
                id: "line-31-tentative-net",
                lineNumber: "Line 31",
                label: "Tentative net profit or loss",
                value: "$16,000",
                state: "filled" as const,
                summary: "Ready",
                scheduleCDraftFieldIds: [],
                scheduleCDraftNoteIds: [],
                sourceDocumentIds: ["doc-1"],
              },
            ],
            supportSchedules: [
              {
                id: "schedule-c-part-v-other-expenses",
                title: "Part V support schedule for line 27a",
                summary: "Support for other expenses.",
                rows: [
                  {
                    id: "part-v-row-1",
                    label: "Approved other expense total",
                    amount: 4000,
                    summary: "Approved total.",
                    reviewerFinalLineIds: [],
                    taxAdjustmentIds: [],
                    sourceDocumentIds: ["doc-1"],
                  },
                ],
                sourceDocumentIds: ["doc-1"],
              },
            ],
            relatedNoteIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
      },
    };

    const exportFile = buildTinaOfficialFormExport(draft);

    expect(exportFile.fileName).toContain("official-form-packet");
    expect(exportFile.mimeType).toContain("text/html");
    expect(exportFile.contents).toContain("Packet ID TINA-2025-");
    expect(exportFile.contents).toContain("federal business form packet");
    expect(exportFile.contents).toContain("Schedule C (Form 1040)");
    expect(exportFile.contents).toContain("Line 31");
    expect(exportFile.contents).toContain("Part V support schedule for line 27a");
    expect(exportFile.contents).toContain("Approved other expense total");
    expect(exportFile.contents).toContain("exact supported federal business form packet");
  });

  it("adds a clear draft banner when the form still needs review", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop" as const,
      },
      officialFormPacket: {
        ...base.officialFormPacket,
        status: "complete" as const,
        summary: "Needs review",
        nextStep: "Have a human look at the draft.",
        forms: [
          {
            id: "schedule-c",
            formNumber: "Schedule C (Form 1040)",
            title: "Profit or Loss From Business",
            taxYear: "2025",
            revisionYear: "2025",
            status: "needs_review" as const,
            summary: "Needs review",
            nextStep: "Have a human look at the draft.",
            lines: [
              {
                id: "line-1-gross-receipts",
                lineNumber: "Line 1",
                label: "Gross receipts or sales",
                value: "$22,000",
                state: "review" as const,
                summary: "One review note still touches the draft.",
                scheduleCDraftFieldIds: [],
                scheduleCDraftNoteIds: ["schedule-c-sales-tax-note"],
                sourceDocumentIds: ["doc-1"],
              },
            ],
            supportSchedules: [],
            relatedNoteIds: ["schedule-c-sales-tax-note"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
      },
    };

    const exportFile = buildTinaOfficialFormExport(draft);

    expect(exportFile.contents).toContain("Draft - review required");
    expect(exportFile.contents).toContain("human still needs to review");
    expect(exportFile.contents).toContain("blocked federal business form preview only");
  });

  it("renders the saved official form packet instead of rebuilding from raw draft state", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop" as const,
      },
      officialFormPacket: {
        ...base.officialFormPacket,
        status: "complete" as const,
        summary: "Saved packet summary",
        nextStep: "Use the saved packet.",
        forms: [
          {
            id: "schedule-c",
            formNumber: "Schedule C (Form 1040)",
            title: "Profit or Loss From Business",
            taxYear: "2025",
            revisionYear: "2025",
            status: "ready" as const,
            summary: "Saved form summary",
            nextStep: "Saved next step",
            lines: [
              {
                id: "saved-line-1",
                lineNumber: "Line 1",
                label: "Gross receipts or sales",
                value: "$18,000",
                state: "filled" as const,
                summary: "Saved line summary",
                scheduleCDraftFieldIds: [],
                scheduleCDraftNoteIds: [],
                sourceDocumentIds: ["doc-1"],
              },
            ],
            supportSchedules: [],
            relatedNoteIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
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
        summary: "Raw draft is not ready",
        nextStep: "Do not rebuild from this.",
        items: [],
      },
    };

    const exportFile = buildTinaOfficialFormExport(draft);

    expect(exportFile.contents).toContain("Saved packet summary");
    expect(exportFile.contents).toContain("Saved form summary");
    expect(exportFile.contents).toContain("Saved line summary");
    expect(exportFile.contents).not.toContain("Raw draft is not ready");
  });
});
