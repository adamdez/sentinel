import { describe, expect, it } from "vitest";
import { buildTinaReviewBookExport } from "@/tina/lib/review-book-export";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaReviewBookExport", () => {
  it("builds a full handoff packet with the file map and official forms", () => {
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
          {
            id: "source-paper-index",
            title: "Source paper index",
            status: "ready" as const,
            summary: "Ready.",
            includes: [],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: ["doc-1"],
          },
          {
            id: "open-items-list",
            title: "Open items list",
            status: "ready" as const,
            summary: "Ready.",
            includes: [],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: [],
          },
          {
            id: "official-form-packet",
            title: "Official form packet",
            status: "ready" as const,
            summary: "Ready.",
            includes: [],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
      },
      officialFormPacket: {
        ...base.officialFormPacket,
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Download it.",
        forms: [
          {
            id: "schedule-c",
            formNumber: "Schedule C (Form 1040)",
            title: "Profit or Loss From Business",
            taxYear: "2025",
            revisionYear: "2025",
            status: "ready" as const,
            summary: "Ready",
            nextStep: "Share it.",
            sourceDocumentIds: ["doc-1"],
            lines: [
              {
                id: "line-1",
                lineNumber: "Line 1",
                label: "Gross receipts or sales",
                value: "$18,000",
                state: "filled" as const,
                summary: "Mapped from the current draft.",
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
          },
        ],
      },
      booksConnection: {
        ...base.booksConnection,
        status: "upload_only" as const,
        summary: "Tina is using 1 uploaded book file for now.",
        nextStep: "Keep going.",
      },
      booksImport: {
        ...base.booksImport,
        status: "complete" as const,
        summary: "Tina stitched together 1 books file with coverage 2025-01-01 through 2025-12-31.",
        nextStep: "Ready for the money story.",
        documentCount: 1,
        coverageStart: "2025-01-01",
        coverageEnd: "2025-12-31",
        moneyInTotal: 18000,
        moneyOutTotal: 8000,
        clueLabels: ["payroll"],
        documents: [
          {
            documentId: "doc-1",
            name: "2025-return.pdf",
            status: "ready" as const,
            summary: "Ready enough for review.",
            rowCount: 42,
            coverageStart: "2025-01-01",
            coverageEnd: "2025-12-31",
            moneyIn: 18000,
            moneyOut: 8000,
            clueLabels: ["payroll"],
            lastReadAt: "2026-03-27T04:01:00.000Z",
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

    const exportFile = buildTinaReviewBookExport(draft);

    expect(exportFile.fileName).toContain("full-handoff-packet");
    expect(exportFile.mimeType).toContain("text/html");
    expect(exportFile.contents).toContain("Tina full handoff packet for Tina Sole Prop");
    expect(exportFile.contents).toContain("Packet ID TINA-2025-");
    expect(exportFile.contents).toContain("Packet files");
    expect(exportFile.contents).toContain("Federal business form packet");
    expect(exportFile.contents).toContain("Schedule C (Form 1040)");
    expect(exportFile.contents).toContain("Part V support schedule for line 27a");
    expect(exportFile.contents).toContain("Bank fees");
    expect(exportFile.contents).toContain("Books lane");
    expect(exportFile.contents).toContain("Tina stitched together 1 books file");
    expect(exportFile.contents).toContain("Authority and stress tests");
    expect(exportFile.contents).toContain("needs care");
    expect(exportFile.contents).toContain("The Washington classification may be narrower than it first looks.");
  });

  it("shows a draft warning inside the full handoff packet when form paperwork still needs review", () => {
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
        summary: "Ready",
        nextStep: "Hand it off",
        artifacts: [
          {
            id: "official-form-packet",
            title: "Official form packet",
            status: "waiting" as const,
            summary: "Needs review.",
            includes: [],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
      },
      officialFormPacket: {
        ...base.officialFormPacket,
        status: "complete" as const,
        summary: "Needs review",
        nextStep: "Review it.",
        forms: [
          {
            id: "schedule-c",
            formNumber: "Schedule C (Form 1040)",
            title: "Profit or Loss From Business",
            taxYear: "2025",
            revisionYear: "2025",
            status: "needs_review" as const,
            summary: "Needs review",
            nextStep: "Review it.",
            lines: [
              {
                id: "line-1",
                lineNumber: "Line 1",
                label: "Gross receipts or sales",
                value: "$18,000",
                state: "review" as const,
                summary: "Still needs review.",
                scheduleCDraftFieldIds: ["line-1-gross-receipts"],
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
      finalSignoff: {
        ...base.finalSignoff,
        status: "complete" as const,
        level: "waiting" as const,
        reviewerName: "Ada Reviewer",
      },
    };

    const exportFile = buildTinaReviewBookExport(draft);

    expect(exportFile.contents).toContain("Draft - review required");
    expect(exportFile.contents).toContain("filing-ready paperwork");
  });
});
