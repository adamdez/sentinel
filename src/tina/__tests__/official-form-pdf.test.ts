import { describe, expect, it } from "vitest";
import {
  buildTinaOfficialFormPdfPayload,
  getTinaOfficialFormPdfFileName,
} from "@/tina/lib/official-form-pdf";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("official form pdf helpers", () => {
  it("builds a payload from the saved official form packet", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop",
      },
      officialFormPacket: {
        ...base.officialFormPacket,
        status: "complete" as const,
        forms: [
          {
            id: "schedule-c-2025",
            formNumber: "Schedule C (Form 1040)",
            title: "Profit or Loss From Business",
            taxYear: "2025",
            revisionYear: "2025",
            status: "ready" as const,
            summary: "Ready",
            nextStep: "Hand it off",
            lines: [
              {
                id: "schedule-c-line-1",
                lineNumber: "Line 1",
                label: "Gross receipts or sales",
                value: "$18,000",
                state: "filled" as const,
                summary: "Ready",
                scheduleCDraftFieldIds: ["line-1-gross-receipts"],
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
                    label: "Bank fees",
                    amount: 800,
                    summary: "Approved business banking cost.",
                    reviewerFinalLineIds: ["review-line-1"],
                    taxAdjustmentIds: ["tax-adjustment-1"],
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
        summary: "Ready",
        nextStep: "Hand it off",
      },
    };

    const payload = buildTinaOfficialFormPdfPayload(draft);

    expect(payload.businessName).toBe("Tina Sole Prop");
    expect(payload.forms).toHaveLength(1);
    expect(payload.forms[0]?.lines[0]?.label).toBe("Gross receipts or sales");
    expect(payload.forms[0]?.templateId).toBe("schedule-c-2025-template");
    expect(payload.forms[0]?.placedFields[0]?.fieldKey).toBe("schedule_c.line_1.gross_receipts");
    expect(payload.forms[0]?.placedFields[0]?.reference).toContain("2025 Schedule C");
    expect(payload.forms[0]?.supportSchedules[0]?.title).toContain("Part V");
    expect(payload.forms[0]?.supportSchedules[0]?.rows[0]?.amount).toBe("$800");
    expect(getTinaOfficialFormPdfFileName(draft)).toContain(".pdf");
  });

  it("refuses a PDF payload when the federal business packet is not export-ready", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop",
      },
      officialFormPacket: {
        ...base.officialFormPacket,
        status: "complete" as const,
        forms: [
          {
            id: "schedule-c-2025",
            formNumber: "Schedule C (Form 1040)",
            title: "Profit or Loss From Business",
            taxYear: "2025",
            revisionYear: "2025",
            status: "blocked" as const,
            summary: "Blocked",
            nextStep: "Do not export it",
            lines: [],
            supportSchedules: [],
            relatedNoteIds: [],
            sourceDocumentIds: [],
          },
        ],
        summary: "Blocked",
        nextStep: "Do not export it",
      },
    };

    expect(() => buildTinaOfficialFormPdfPayload(draft)).toThrow(
      "Blocked Do not export it"
    );
  });
});
