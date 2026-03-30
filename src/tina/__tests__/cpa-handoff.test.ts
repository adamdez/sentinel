import { describe, expect, it } from "vitest";
import {
  buildTinaCpaHandoff,
  markTinaCpaHandoffStale,
} from "@/tina/lib/cpa-handoff";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaWorkspaceDraft } from "@/tina/types";

function buildDraft(overrides?: Partial<TinaWorkspaceDraft>): TinaWorkspaceDraft {
  return {
    ...createDefaultTinaWorkspaceDraft(),
    ...overrides,
    profile: {
      ...createDefaultTinaWorkspaceDraft().profile,
      ...(overrides?.profile ?? {}),
    },
  };
}

describe("buildTinaCpaHandoff", () => {
  it("waits for the package check before building the packet", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        entityType: "sole_prop",
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete",
        lastRunAt: "2026-03-27T05:00:00.000Z",
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete",
        lastRunAt: "2026-03-27T05:01:00.000Z",
      },
    });

    const snapshot = buildTinaCpaHandoff(draft);

    expect(snapshot.status).toBe("idle");
    expect(snapshot.summary).toContain("filing-package check");
  });

  it("blocks the authority packet section when tax moves still need proof", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "sole_prop",
      },
      priorReturn: {
        fileName: "2025-return.pdf",
        fileSize: 1200,
        fileType: "application/pdf",
        lastModified: 1,
        capturedAt: "2026-03-27T04:00:00.000Z",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
        {
          id: "books-doc-1",
          name: "2025-p-and-l.xlsx",
          size: 100,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          storagePath: "tina/2025-p-and-l.xlsx",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-03-27T04:05:00.000Z",
        },
      ],
      booksConnection: {
        ...createDefaultTinaWorkspaceDraft().booksConnection,
        status: "upload_only",
        summary: "Tina is using 1 uploaded book file for now.",
      },
      booksImport: {
        ...createDefaultTinaWorkspaceDraft().booksImport,
        status: "complete",
        summary: "Tina stitched together 1 books file with coverage 2025-01-01 through 2025-12-31.",
        nextStep: "Ready for the money story.",
        documentCount: 1,
        coverageStart: "2025-01-01",
        coverageEnd: "2025-12-31",
        moneyInTotal: 18000,
        moneyOutTotal: 6000,
        documents: [
          {
            documentId: "books-doc-1",
            name: "2025-p-and-l.xlsx",
            status: "ready",
            summary: "Ready enough for a reviewer.",
            rowCount: 120,
            coverageStart: "2025-01-01",
            coverageEnd: "2025-12-31",
            moneyIn: 18000,
            moneyOut: 6000,
            clueLabels: [],
            lastReadAt: "2026-03-27T04:06:00.000Z",
          },
        ],
      },
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
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
            derivedFromLineIds: ["ai-1"],
            cleanupSuggestionIds: ["cleanup-1"],
            taxAdjustmentIds: ["tax-1"],
          },
        ],
      },
      scheduleCDraft: {
        lastRunAt: "2026-03-27T04:02:00.000Z",
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
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        level: "blocked",
        summary: "Blocked",
        nextStep: "Fix blockers",
        items: [
          {
            id: "adjustment-authority-tax-1",
            title: "Authority still needed",
            summary: "Needs authority first.",
            severity: "blocking",
            relatedFieldIds: ["line-1-gross-receipts"],
            relatedNoteIds: [],
            relatedReviewItemIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:03:30.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Review",
        adjustments: [
          {
            id: "tax-1",
            kind: "sales_tax_exclusion",
            status: "needs_authority",
            risk: "medium",
            requiresAuthority: true,
            title: "Keep sales tax out of income",
            summary: "Needs proof first",
            suggestedTreatment: "Keep collected sales tax separate.",
            whyItMatters: "It changes line 1.",
            amount: 18000,
            authorityWorkIdeaIds: ["wa-state-review"],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
      authorityWork: [
        {
          ideaId: "wa-state-review",
          status: "researching",
          reviewerDecision: "pending",
          disclosureDecision: "unknown",
          challengeVerdict: "needs_care",
          memo: "",
          challengeMemo: "This may still work, but only if the Washington facts match closely.",
          reviewerNotes: "",
          missingAuthority: ["Need Washington support"],
          challengeWarnings: ["The Washington classification may be narrower than it first looks."],
          challengeQuestions: ["Does the business activity really fit the claimed Washington bucket?"],
          citations: [],
          lastAiRunAt: null,
          lastChallengeRunAt: "2026-03-27T04:04:30.000Z",
          updatedAt: null,
        },
      ],
    });

    const snapshot = buildTinaCpaHandoff(draft);
    const authorityArtifact = snapshot.artifacts.find(
      (artifact) => artifact.id === "authority-and-risk"
    );
    const booksArtifact = snapshot.artifacts.find(
      (artifact) => artifact.id === "books-lane-summary"
    );

    expect(snapshot.status).toBe("complete");
    expect(authorityArtifact?.status).toBe("blocked");
    expect(authorityArtifact?.includes).toEqual(
      expect.arrayContaining([
        "1 stress test",
        "1 stress test that survived with caution",
      ])
    );
    expect(booksArtifact?.status).toBe("ready");
    expect(booksArtifact?.includes).toEqual(
      expect.arrayContaining(["Money in: $18,000", "Money out: $6,000"])
    );
  });

  it("marks the Schedule C packet section waiting when only review items remain", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "single_member_llc",
      },
      priorReturn: {
        fileName: "2025-return.pdf",
        fileSize: 1200,
        fileType: "application/pdf",
        lastModified: 1,
        capturedAt: "2026-03-27T04:00:00.000Z",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
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
            derivedFromLineIds: ["ai-1"],
            cleanupSuggestionIds: ["cleanup-1"],
            taxAdjustmentIds: ["tax-1"],
          },
        ],
      },
      scheduleCDraft: {
        lastRunAt: "2026-03-27T04:02:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Review it",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "needs_attention",
            summary: "Needs a human look first.",
            reviewerFinalLineIds: ["reviewer-final-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        level: "needs_review",
        summary: "Needs review",
        nextStep: "Finish review",
        items: [
          {
            id: "field-review-line-1-gross-receipts",
            title: "Line 1",
            summary: "Needs a human look first.",
            severity: "needs_attention",
            relatedFieldIds: ["line-1-gross-receipts"],
            relatedNoteIds: [],
            relatedReviewItemIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:03:30.000Z",
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
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaCpaHandoff(draft);
    const scheduleArtifact = snapshot.artifacts.find(
      (artifact) => artifact.id === "schedule-c-draft"
    );

    expect(scheduleArtifact?.status).toBe("waiting");
  });

  it("keeps the official form packet section waiting until paperwork is built", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "sole_prop",
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete",
        lastRunAt: "2026-03-27T04:01:00.000Z",
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
            derivedFromLineIds: ["ai-1"],
            cleanupSuggestionIds: ["cleanup-1"],
            taxAdjustmentIds: ["tax-1"],
          },
        ],
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete",
        lastRunAt: "2026-03-27T04:02:00.000Z",
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
        status: "complete",
        level: "ready_for_cpa",
        summary: "Ready",
        nextStep: "Hand it off",
        items: [],
      },
      taxAdjustments: {
        ...createDefaultTinaWorkspaceDraft().taxAdjustments,
        status: "complete",
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
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaCpaHandoff(draft);
    const officialArtifact = snapshot.artifacts.find(
      (artifact) => artifact.id === "official-form-packet"
    );

    expect(officialArtifact?.status).toBe("waiting");
  });

  it("builds a ready packet when the package is ready for CPA handoff", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "sole_prop",
      },
      priorReturn: {
        fileName: "2025-return.pdf",
        fileSize: 1200,
        fileType: "application/pdf",
        lastModified: 1,
        capturedAt: "2026-03-27T04:00:00.000Z",
      },
      priorReturnDocumentId: "doc-1",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
        {
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-03-27T04:01:00.000Z",
        },
        {
          id: "doc-bank",
          name: "bank.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/bank.pdf",
          category: "supporting_document",
          requestId: "bank-support",
          requestLabel: "Bank support",
          uploadedAt: "2026-03-27T04:02:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-1",
          status: "complete",
          kind: "pdf",
          summary: "Read",
          nextStep: "Keep going",
          facts: [],
          detailLines: [],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-03-27T04:00:30.000Z",
        },
        {
          documentId: "doc-qb",
          status: "complete",
          kind: "spreadsheet",
          summary: "Read",
          nextStep: "Keep going",
          facts: [],
          detailLines: [],
          rowCount: 10,
          headers: ["Date", "Amount"],
          sheetNames: ["Sheet1"],
          lastReadAt: "2026-03-27T04:01:30.000Z",
        },
        {
          documentId: "doc-bank",
          status: "complete",
          kind: "pdf",
          summary: "Read",
          nextStep: "Keep going",
          facts: [],
          detailLines: [],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-03-27T04:02:30.000Z",
        },
      ],
      booksConnection: {
        ...createDefaultTinaWorkspaceDraft().booksConnection,
        status: "upload_only",
        summary: "Tina is using 1 uploaded book file for now.",
        nextStep: "Keep going.",
      },
      booksImport: {
        ...createDefaultTinaWorkspaceDraft().booksImport,
        status: "complete",
        summary: "Tina stitched together 1 books file with coverage 2025-01-01 through 2025-12-31.",
        nextStep: "Ready for the money story.",
        documentCount: 1,
        coverageStart: "2025-01-01",
        coverageEnd: "2025-12-31",
        moneyInTotal: 18000,
        moneyOutTotal: 4000,
        clueLabels: [],
        documents: [
          {
            documentId: "doc-qb",
            name: "qb.csv",
            status: "ready",
            summary: "Ready enough for review.",
            rowCount: 10,
            coverageStart: "2025-01-01",
            coverageEnd: "2025-12-31",
            moneyIn: 18000,
            moneyOut: 4000,
            clueLabels: [],
            lastReadAt: "2026-03-27T04:01:30.000Z",
          },
        ],
      },
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
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
            derivedFromLineIds: ["ai-1"],
            cleanupSuggestionIds: ["cleanup-1"],
            taxAdjustmentIds: ["tax-1"],
          },
        ],
      },
      scheduleCDraft: {
        lastRunAt: "2026-03-27T04:02:00.000Z",
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
      officialFormPacket: {
        ...createDefaultTinaWorkspaceDraft().officialFormPacket,
        status: "complete",
        lastRunAt: "2026-03-27T04:02:30.000Z",
        summary: "Ready",
        nextStep: "Hand it off",
        forms: [
          {
            id: "schedule-c-2025",
            formNumber: "Schedule C (Form 1040)",
            title: "Profit or Loss From Business",
            taxYear: "2025",
            revisionYear: "2025",
            status: "ready",
            summary: "Ready",
            nextStep: "Hand it off",
            lines: [
              {
                id: "schedule-c-line-1",
                lineNumber: "Line 1",
                label: "Gross receipts or sales",
                value: "$18,000",
                state: "filled",
                summary: "Ready",
                scheduleCDraftFieldIds: ["line-1-gross-receipts"],
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
      packageReadiness: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        level: "ready_for_cpa",
        summary: "Ready",
        nextStep: "Hand it off",
        items: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:03:30.000Z",
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
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaCpaHandoff(draft);

    expect(snapshot.status).toBe("complete");
    expect(snapshot.summary).toContain("full first CPA handoff packet");
    expect(snapshot.artifacts.every((artifact) => artifact.status === "ready")).toBe(true);
  });

  it("keeps the source paper index waiting when saved papers are still unread", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "sole_prop",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
        {
          id: "doc-2",
          name: "bank.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/bank.pdf",
          category: "supporting_document",
          requestId: "bank-support",
          requestLabel: "Bank support",
          uploadedAt: "2026-03-27T04:01:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-1",
          status: "complete",
          kind: "pdf",
          summary: "Read",
          nextStep: "Keep going",
          facts: [],
          detailLines: [],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-03-27T04:00:30.000Z",
        },
      ],
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete",
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
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
        ],
        summary: "Ready",
        nextStep: "Keep going",
        lastRunAt: "2026-03-27T04:01:00.000Z",
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete",
        lastRunAt: "2026-03-27T04:02:00.000Z",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "ready",
            summary: "Mapped safely.",
            reviewerFinalLineIds: ["reviewer-final-1"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
        summary: "Ready",
        nextStep: "Review it",
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete",
        level: "ready_for_cpa",
        items: [],
        summary: "Ready",
        nextStep: "Hand it off",
        lastRunAt: "2026-03-27T04:03:00.000Z",
      },
    });

    const snapshot = buildTinaCpaHandoff(draft);
    const sourceArtifact = snapshot.artifacts.find(
      (artifact) => artifact.id === "source-paper-index"
    );

    expect(sourceArtifact?.status).toBe("waiting");
    expect(sourceArtifact?.includes.some((item) => item.includes("unread"))).toBe(true);
  });

  it("keeps the workpaper trace waiting when there is nothing in the form draft yet", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "sole_prop",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-1",
          status: "complete",
          kind: "pdf",
          summary: "Read",
          nextStep: "Keep going",
          facts: [],
          detailLines: [],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-03-27T04:00:30.000Z",
        },
      ],
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete",
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
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
        ],
        summary: "Ready",
        nextStep: "Keep going",
        lastRunAt: "2026-03-27T04:01:00.000Z",
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete",
        lastRunAt: "2026-03-27T04:02:00.000Z",
        fields: [],
        notes: [],
        summary: "No supported boxes yet",
        nextStep: "Keep going",
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete",
        level: "ready_for_cpa",
        items: [],
        summary: "Ready",
        nextStep: "Hand it off",
        lastRunAt: "2026-03-27T04:03:00.000Z",
      },
    });

    const snapshot = buildTinaCpaHandoff(draft);
    const traceArtifact = snapshot.artifacts.find(
      (artifact) => artifact.id === "workpaper-trace"
    );

    expect(traceArtifact?.status).toBe("waiting");
  });
});

describe("markTinaCpaHandoffStale", () => {
  it("marks a completed snapshot stale", () => {
    const snapshot = markTinaCpaHandoffStale({
      lastRunAt: "2026-03-27T04:00:00.000Z",
      status: "complete",
      summary: "Ready",
      nextStep: "Ship it",
      artifacts: [],
    });

    expect(snapshot.status).toBe("stale");
    expect(snapshot.summary).toContain("changed");
  });
});
