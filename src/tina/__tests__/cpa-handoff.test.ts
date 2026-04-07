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
          memo: "",
          reviewerNotes: "",
          missingAuthority: ["Need Washington support"],
          citations: [],
          lastAiRunAt: null,
          updatedAt: null,
        },
      ],
    });

    const snapshot = buildTinaCpaHandoff(draft);
    const authorityArtifact = snapshot.artifacts.find(
      (artifact) => artifact.id === "authority-and-risk"
    );

    expect(snapshot.status).toBe("complete");
    expect(authorityArtifact?.status).toBe("blocked");
  });

  it("blocks the authority packet section when tax-position memory is not current", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "sole_prop",
      },
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [],
      },
      scheduleCDraft: {
        lastRunAt: "2026-03-27T04:02:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Review it",
        fields: [],
        notes: [],
      },
      packageReadiness: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        level: "blocked",
        summary: "Blocked",
        nextStep: "Fix blockers",
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
            title: "Carry income",
            summary: "Approved",
            suggestedTreatment: "Carry it",
            whyItMatters: "It matters",
            amount: 18000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "Approved",
          },
        ],
      },
      taxPositionMemory: {
        lastRunAt: "2026-03-27T04:03:31.000Z",
        status: "stale",
        summary: "Needs rebuild",
        nextStep: "Rebuild",
        records: [],
      },
    });

    const snapshot = buildTinaCpaHandoff(draft);
    const authorityArtifact = snapshot.artifacts.find(
      (artifact) => artifact.id === "authority-and-risk"
    );

    expect(authorityArtifact?.status).toBe("blocked");
    expect(authorityArtifact?.summary).toContain("current tax-position register");
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
      taxPositionMemory: {
        lastRunAt: "2026-03-27T04:03:31.000Z",
        status: "complete",
        summary: "Current",
        nextStep: "Hand it off",
        records: [
          {
            id: "tax-position-tax-1",
            adjustmentId: "tax-1",
            title: "Carry it",
            status: "ready",
            confidence: "high",
            summary: "Supported and reviewer anchored.",
            treatmentSummary: "Carry it",
            reviewerGuidance: "Approved by reviewer.",
            authorityWorkIdeaIds: [],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerOutcomeIds: ["outcome-1"],
            reviewerOverrideIds: [],
            updatedAt: "2026-03-27T04:03:31.000Z",
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
      taxPositionMemory: {
        lastRunAt: "2026-03-27T04:03:31.000Z",
        status: "complete",
        summary: "Current",
        nextStep: "Hand it off",
        records: [
          {
            id: "tax-position-tax-1",
            adjustmentId: "tax-1",
            title: "Carry it",
            status: "ready",
            confidence: "high",
            summary: "Supported and reviewer anchored.",
            treatmentSummary: "Carry it",
            reviewerGuidance: "Approved by reviewer.",
            authorityWorkIdeaIds: [],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerOutcomeIds: ["outcome-1"],
            reviewerOverrideIds: [],
            updatedAt: "2026-03-27T04:03:31.000Z",
          },
        ],
      },
    });

    const snapshot = buildTinaCpaHandoff(draft);

    expect(snapshot.status).toBe("complete");
    expect(snapshot.summary).toContain("full first CPA handoff packet");
    expect(snapshot.artifacts.every((artifact) => artifact.status === "ready")).toBe(true);
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
