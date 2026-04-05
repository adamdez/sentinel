import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import {
  buildTinaCpaHandoff,
  markTinaCpaHandoffStale,
} from "@/tina/lib/cpa-handoff";
import { buildTinaProfileFingerprint } from "@/tina/lib/profile-fingerprint";
import {
  createTinaPackageSnapshotRecord,
  recordTinaReviewerDecision,
} from "@/tina/lib/package-state";
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
  it("recomputes the package check instead of waiting on a stored packet snapshot", () => {
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

    expect(snapshot.status).toBe("complete");
    expect(snapshot.summary).not.toContain("filing-package check");
  });

  it("blocks the authority packet section when tax moves still need proof", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
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
            sourceDocumentIds: ["doc-qb", "doc-bank"],
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
            sourceDocumentIds: ["doc-qb", "doc-bank"],
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

  it("marks the Schedule C packet section waiting when only review items remain", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
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
            sourceDocumentIds: ["doc-qb", "doc-bank"],
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

  it("builds a ready packet when the package is ready for CPA handoff", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
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
      sourceFacts: [
        {
          id: "fact-income",
          sourceDocumentId: "doc-bank",
          label: "Income support clue",
          value: "Bank support agrees to the gross receipts figure.",
          confidence: "high",
          capturedAt: "2026-03-27T04:02:45.000Z",
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
            sourceDocumentIds: ["doc-qb", "doc-bank"],
            sourceFactIds: ["fact-income"],
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
            sourceDocumentIds: ["doc-qb", "doc-bank"],
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
            sourceDocumentIds: ["doc-qb", "doc-bank"],
            sourceFactIds: ["fact-income"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaCpaHandoff(draft);

    expect(snapshot.status).toBe("complete");
    expect(snapshot.artifacts.find((artifact) => artifact.id === "start-path-decision")?.status).toBe(
      "ready"
    );
    expect(snapshot.artifacts.find((artifact) => artifact.id === "schedule-c-form-output")?.status)
      .toBe("ready");
    expect(snapshot.artifacts.find((artifact) => artifact.id === "entity-treatment-judgment")?.status)
      .toBe("ready");
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "federal-return-requirements")?.status
    ).toBe("ready");
    expect(snapshot.artifacts.find((artifact) => artifact.id === "entity-record-matrix")?.status).toBe(
      "ready"
    );
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "entity-economics-readiness")?.status
    ).toBe("ready");
    expect(snapshot.artifacts.find((artifact) => artifact.id === "entity-return-runbook")?.status).toBe(
      "ready"
    );
    expect(snapshot.artifacts.find((artifact) => artifact.id === "ownership-timeline")?.status).toBe(
      "ready"
    );
    expect(snapshot.artifacts.find((artifact) => artifact.id === "treatment-judgment")?.status).toBe(
      "ready"
    );
    expect(snapshot.artifacts.find((artifact) => artifact.id === "form-traceability")?.status).toBe(
      "ready"
    );
    expect(snapshot.artifacts.find((artifact) => artifact.id === "books-normalization")?.status).toBe(
      "ready"
    );
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "official-form-execution")?.status
    ).toBe("ready");
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "companion-form-render-plan")?.status
    ).toBe("ready");
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "accounting-artifact-coverage")?.status
    ).toBe("ready");
    expect(snapshot.artifacts.find((artifact) => artifact.id === "attachment-schedules")?.status).toBe(
      "ready"
    );
    expect(snapshot.artifacts.find((artifact) => artifact.id === "planning-action-board")?.status).toBe(
      "waiting"
    );
    expect(snapshot.artifacts.find((artifact) => artifact.id === "review-bundle-export")?.status).toBe(
      "blocked"
    );
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "reviewer-challenge-forecast")?.status
    ).toBe("ready");
    expect(snapshot.artifacts.find((artifact) => artifact.id === "reviewer-signoff-state")?.status)
      .toBe("waiting");
    expect(snapshot.artifacts.find((artifact) => artifact.id === "reviewer-appendix")?.status).toBe(
      "ready"
    );
  });

  it("shows start-path proof requirements in the handoff artifact for complex llc files", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Complex Handoff LLC",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "multi_member_llc",
        ownerCount: 2,
      },
      sourceFacts: [
        {
          id: "multi-owner-fact",
          sourceDocumentId: "doc-owners",
          label: "Multi-owner clue",
          value: "This paper may show more than one owner, partner, member, K-1, or ownership split.",
          confidence: "high",
          capturedAt: "2026-03-27T05:02:00.000Z",
        },
      ],
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
      packageReadiness: {
        lastRunAt: "2026-03-27T05:02:00.000Z",
        status: "complete",
        level: "blocked",
        summary: "Blocked",
        nextStep: "Get proof",
        items: [
          {
            id: "proof-ownership-agreement",
            title: "Operating agreement or ownership breakdown still needed",
            summary: "Need ownership proof first.",
            severity: "blocking",
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReviewItemIds: [],
            sourceDocumentIds: ["doc-owners"],
          },
        ],
      },
    });

    const snapshot = buildTinaCpaHandoff(draft);
    const startPathArtifact = snapshot.artifacts.find((artifact) => artifact.id === "start-path-decision");

    expect(startPathArtifact?.includes.some((entry) => entry.includes("Operating agreement or ownership breakdown"))).toBe(true);
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "entity-treatment-judgment")?.status
    ).toBe("blocked");
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "federal-return-requirements")?.status
    ).toBe("blocked");
    expect(snapshot.artifacts.find((artifact) => artifact.id === "entity-record-matrix")?.status).toBe(
      "blocked"
    );
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "entity-economics-readiness")?.status
    ).toBe("blocked");
    expect(snapshot.artifacts.find((artifact) => artifact.id === "entity-return-runbook")?.status).toBe(
      "blocked"
    );
    expect(snapshot.artifacts.find((artifact) => artifact.id === "ownership-timeline")?.status).toBe(
      "blocked"
    );
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "accounting-artifact-coverage")?.status
    ).toBe("blocked");
    expect(snapshot.artifacts.find((artifact) => artifact.id === "treatment-judgment")?.status).toBe(
      "ready"
    );
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "reviewer-challenge-forecast")?.status
    ).toBe("blocked");
  });

  it("recomputes package readiness when the stored readiness snapshot is stale or idle", () => {
    const profile = {
      ...createDefaultTinaWorkspaceDraft().profile,
      businessName: "Recompute Ready LLC",
      taxYear: "2025",
      principalBusinessActivity: "Consulting",
      naicsCode: "541611",
      entityType: "single_member_llc" as const,
    };
    const profileFingerprint = buildTinaProfileFingerprint(profile);
    const draft = buildDraft({
      profile,
      bootstrapReview: {
        ...createDefaultTinaWorkspaceDraft().bootstrapReview,
        status: "complete",
        lastRunAt: "2026-03-27T05:00:00.000Z",
        profileFingerprint,
      },
      issueQueue: {
        ...createDefaultTinaWorkspaceDraft().issueQueue,
        status: "complete",
        lastRunAt: "2026-03-27T05:01:00.000Z",
        profileFingerprint,
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete",
        lastRunAt: "2026-03-27T05:02:00.000Z",
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete",
        lastRunAt: "2026-03-27T05:03:00.000Z",
        fields: [
          {
            id: "line-27a-other-expenses",
            lineNumber: "Line 27a",
            label: "Other expenses",
            amount: 3000,
            status: "waiting",
            summary: "Still needs classification.",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: [],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "idle",
      },
    });

    const snapshot = buildTinaCpaHandoff(draft);
    const openItemsArtifact = snapshot.artifacts.find((artifact) => artifact.id === "open-items-list");

    expect(snapshot.status).toBe("complete");
    expect(snapshot.summary).not.toContain("filing-package check");
    expect(openItemsArtifact?.status).toBe("blocked");
    expect(openItemsArtifact?.includes.some((entry) => entry.includes("blocking item"))).toBe(true);
  });

  it("includes appendix and signoff artifacts when reviewer workflow exists", () => {
    const profile = {
      ...createDefaultTinaWorkspaceDraft().profile,
      businessName: "Tina Sole Prop",
      taxYear: "2025",
      principalBusinessActivity: "Consulting",
      naicsCode: "541611",
      entityType: "sole_prop" as const,
    };
    const profileFingerprint = buildTinaProfileFingerprint(profile);
    const baseDraft = buildDraft({
      profile,
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
          name: "quickbooks.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/quickbooks.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-03-27T04:00:30.000Z",
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
          lastReadAt: "2026-03-27T04:00:15.000Z",
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
          lastReadAt: "2026-03-27T04:00:45.000Z",
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
          lastReadAt: "2026-03-27T04:01:15.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-income",
          sourceDocumentId: "doc-qb",
          label: "Gross receipts support",
          value: "QuickBooks income summary supports the gross receipts figure.",
          confidence: "high",
          capturedAt: "2026-03-27T04:01:30.000Z",
        },
      ],
      bootstrapReview: {
        ...createDefaultTinaWorkspaceDraft().bootstrapReview,
        status: "complete",
        lastRunAt: "2026-03-27T05:00:00.000Z",
        profileFingerprint,
      },
      issueQueue: {
        ...createDefaultTinaWorkspaceDraft().issueQueue,
        status: "complete",
        lastRunAt: "2026-03-27T05:01:00.000Z",
        profileFingerprint,
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete",
        lastRunAt: "2026-03-27T05:02:00.000Z",
        lines: [
          {
            id: "rf-income",
            kind: "income",
            layer: "reviewer_final",
            label: "Gross receipts candidate",
            amount: 18000,
            status: "ready",
            summary: "Ready",
            sourceDocumentIds: ["doc-1", "doc-qb", "doc-bank"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-income"],
          },
        ],
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete",
        lastRunAt: "2026-03-27T05:03:00.000Z",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "ready",
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: ["tax-income"],
            sourceDocumentIds: ["doc-1", "doc-qb", "doc-bank"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        lastRunAt: "2026-03-27T05:04:00.000Z",
        status: "complete",
        level: "ready_for_cpa",
        summary: "Ready",
        nextStep: "Capture snapshot",
        items: [],
      },
      reviewerSignoff: {
        ...createDefaultTinaWorkspaceDraft().reviewerSignoff,
        packageState: "ready_for_cpa_review",
        summary: "Approved",
        nextStep: "Preserve snapshot",
        activeSnapshotId: null,
      },
      appendix: {
        lastRunAt: "2026-03-27T05:03:00.000Z",
        status: "complete",
        summary: "One appendix item",
        nextStep: "Review it",
        items: [
          {
            id: "appendix-1",
            title: "Non-standard deduction review",
            summary: "Review it",
            whyItMatters: "It could matter",
            taxPositionBucket: "appendix",
            category: "deduction",
            nextStep: "Research more",
            authoritySummary: "Needs more support",
            reviewerQuestion: "Would a reviewer allow it?",
            disclosureFlag: "unknown",
            authorityTargets: ["IRS guidance"],
            sourceLabels: [],
            factIds: [],
            documentIds: [],
          },
        ],
      },
      taxAdjustments: {
        ...createDefaultTinaWorkspaceDraft().taxAdjustments,
        status: "complete",
        lastRunAt: "2026-03-27T05:04:30.000Z",
        adjustments: [
          {
            id: "tax-income",
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
            aiCleanupLineIds: [],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-income"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshotRecord = createTinaPackageSnapshotRecord(
      baseDraft,
      "2026-03-27T05:03:00.000Z"
    );
    const reviewerDecision = recordTinaReviewerDecision({
      snapshotId: snapshotRecord.id,
      reviewerName: "CPA Tina",
      decision: "approved",
      notes: "Looks good",
      decidedAt: "2026-03-27T05:03:30.000Z",
    });
    const draft = {
      ...baseDraft,
      packageSnapshots: [snapshotRecord],
      reviewerDecisions: [reviewerDecision],
    };

    const snapshot = buildTinaCpaHandoff(draft);
    expect(snapshot.artifacts.find((artifact) => artifact.id === "schedule-c-form-output")?.status)
      .toBe("ready");
    expect(snapshot.artifacts.find((artifact) => artifact.id === "reviewer-signoff-state")?.status)
      .toBe("ready");
    expect(snapshot.artifacts.find((artifact) => artifact.id === "reviewer-appendix")?.status).toBe(
      "waiting"
    );
    expect(snapshot.artifacts.some((artifact) => artifact.id === "authority-position-matrix")).toBe(
      true
    );
    expect(snapshot.artifacts.some((artifact) => artifact.id === "disclosure-readiness")).toBe(true);
    expect(
      snapshot.artifacts.some((artifact) => artifact.id === "reviewer-acceptance-forecast")
    ).toBe(true);
    expect(snapshot.artifacts.some((artifact) => artifact.id === "confidence-calibration")).toBe(
      true
    );
    expect(snapshot.artifacts.some((artifact) => artifact.id === "case-memory-ledger")).toBe(
      true
    );
    expect(snapshot.artifacts.some((artifact) => artifact.id === "reviewer-learning-loop")).toBe(
      true
    );
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "reviewer-override-governance")
        ?.status
    ).toBe("ready");
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "reviewer-policy-versioning")
        ?.status
    ).toBe("ready");
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "reviewer-acceptance-reality")
        ?.status
    ).toBe("ready");
    expect(snapshot.artifacts.find((artifact) => artifact.id === "unknown-pattern-resolution")?.status)
      .toBe("ready");
  }, 30000);

  it("blocks the form-output artifact when the form is still only thinly supported", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Thin Proof Handoff LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop",
      },
      bootstrapReview: {
        ...createDefaultTinaWorkspaceDraft().bootstrapReview,
        status: "complete",
        lastRunAt: "2026-03-27T05:00:00.000Z",
        profileFingerprint: buildTinaProfileFingerprint({
          ...createDefaultTinaWorkspaceDraft().profile,
          businessName: "Thin Proof Handoff LLC",
          taxYear: "2025",
          principalBusinessActivity: "Consulting",
          naicsCode: "541611",
          entityType: "sole_prop",
        }),
      },
      issueQueue: {
        ...createDefaultTinaWorkspaceDraft().issueQueue,
        status: "complete",
        lastRunAt: "2026-03-27T05:01:00.000Z",
        profileFingerprint: buildTinaProfileFingerprint({
          ...createDefaultTinaWorkspaceDraft().profile,
          businessName: "Thin Proof Handoff LLC",
          taxYear: "2025",
          principalBusinessActivity: "Consulting",
          naicsCode: "541611",
          entityType: "sole_prop",
        }),
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete",
        lastRunAt: "2026-03-27T05:02:00.000Z",
        lines: [
          {
            id: "rf-income",
            kind: "income",
            layer: "reviewer_final",
            label: "Gross receipts candidate",
            amount: 15000,
            status: "ready",
            summary: "Ready",
            sourceDocumentIds: [],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-income"],
          },
        ],
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete",
        lastRunAt: "2026-03-27T05:03:00.000Z",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 15000,
            status: "ready",
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: ["tax-income"],
            sourceDocumentIds: [],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        ...createDefaultTinaWorkspaceDraft().taxAdjustments,
        status: "complete",
        lastRunAt: "2026-03-27T05:04:00.000Z",
        adjustments: [
          {
            id: "tax-income",
            kind: "carryforward_line",
            status: "approved",
            risk: "low",
            requiresAuthority: false,
            title: "Carry income",
            summary: "Approved",
            suggestedTreatment: "Carry it",
            whyItMatters: "It matters",
            amount: 15000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: [],
            sourceDocumentIds: [],
            sourceFactIds: [],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaCpaHandoff(draft);

    expect(snapshot.artifacts.find((artifact) => artifact.id === "schedule-c-form-output")?.status).toBe(
      "blocked"
    );
  });

  it("includes the single-member entity-history artifact when that proof still blocks the route", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaCpaHandoff({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Transition Drift LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "single_member_llc",
        ownerCount: 1,
        taxElection: "s_corp",
        hasPayroll: true,
        ownershipChangedDuringYear: true,
        notes:
          "A sole prop became an LLC and maybe later an S corp, but the books still look like the old business and no one is sure when payroll actually started.",
      },
      documents: [
        {
          id: "doc-transition",
          name: "entity-transition-notes.pdf",
          size: 120,
          mimeType: "application/pdf",
          storagePath: "tina/tests/entity-transition-notes.pdf",
          category: "supporting_document",
          requestId: "entity-election",
          requestLabel: "Entity transition notes",
          uploadedAt: "2026-04-05T12:00:00.000Z",
        },
      ],
      reviewerFinal: {
        ...base.reviewerFinal,
        status: "complete",
        lines: [
          {
            id: "rf-income",
            kind: "income",
            layer: "reviewer_final",
            label: "Gross receipts",
            amount: 12000,
            status: "ready",
            summary: "Ready",
            sourceDocumentIds: ["doc-transition"],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
        ],
      },
      scheduleCDraft: {
        ...base.scheduleCDraft,
        status: "complete",
        fields: [
          {
            id: "line-1",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 12000,
            status: "ready",
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-transition"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...base.packageReadiness,
        status: "complete",
        level: "blocked",
        summary: "Blocked",
        nextStep: "Resolve route history",
        items: [],
      },
      documentReadings: [
        {
          documentId: "doc-transition",
          status: "complete",
          kind: "pdf",
          summary: "Books never caught up",
          nextStep: "Resolve route history",
          facts: [],
          detailLines: [
            "The business changed structure mid-year and the books never caught up.",
            "The books still reflect the old business and owner-flow labels.",
            "No clean IRS acceptance trail exists and payroll actually started later.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-05T12:01:00.000Z",
        },
      ],
    });
    const artifact = snapshot.artifacts.find(
      (item) => item.id === "single-member-entity-history-proof"
    );

    expect(artifact?.status).toBe("blocked");
    expect(artifact?.summary).toMatch(/books posture|owner history|transition year/i);
  });

  it("keeps an explicit unknown-pattern artifact when prior-return drift creates competing explanations", () => {
    const snapshot = buildTinaCpaHandoff(TINA_SKILL_REVIEW_DRAFTS["prior-return-drift"]);
    const artifact = snapshot.artifacts.find(
      (candidate) => candidate.id === "unknown-pattern-resolution"
    );
    const filingRemediationArtifact = snapshot.artifacts.find(
      (candidate) => candidate.id === "entity-filing-remediation"
    );
    const confidenceArtifact = snapshot.artifacts.find(
      (candidate) => candidate.id === "confidence-calibration"
    );
    const caseMemoryArtifact = snapshot.artifacts.find(
      (candidate) => candidate.id === "case-memory-ledger"
    );
    const learningArtifact = snapshot.artifacts.find(
      (candidate) => candidate.id === "reviewer-learning-loop"
    );

    expect(snapshot.status).toBe("complete");
    expect(artifact?.status).not.toBe("ready");
    expect(artifact?.includes.some((line) => /Handling:/i.test(line))).toBe(true);
    expect(artifact?.includes.some((line) => /hypothesis/i.test(line))).toBe(true);
    expect(filingRemediationArtifact?.status).not.toBe("ready");
    expect(filingRemediationArtifact?.includes.some((line) => /Likely prior lanes:/i.test(line))).toBe(
      true
    );
    expect(
      filingRemediationArtifact?.includes.some((line) => /History status:/i.test(line))
    ).toBe(true);
    expect(
      filingRemediationArtifact?.includes.some((line) => /Amendment status:/i.test(line))
    ).toBe(true);
    expect(confidenceArtifact?.status).not.toBe("ready");
    expect(caseMemoryArtifact?.status).toBe("waiting");
    expect(learningArtifact?.status).toBe("ready");
  }, 30000);

  it("shows entity-return calculations as a waiting artifact for reviewer-controlled partnership files", () => {
    const baseDraft = TINA_SKILL_REVIEW_DRAFTS["uneven-multi-owner"];
    const snapshot = buildTinaCpaHandoff({
      ...baseDraft,
      reviewerFinal: {
        ...baseDraft.reviewerFinal,
        status: "complete",
      },
      scheduleCDraft: {
        ...baseDraft.scheduleCDraft,
        status: "complete",
      },
    });
    const artifact = snapshot.artifacts.find(
      (candidate) => candidate.id === "entity-return-calculations"
    );
    const supportArtifact = snapshot.artifacts.find(
      (candidate) => candidate.id === "entity-return-support-artifacts"
    );
    const scheduleFamilyArtifact = snapshot.artifacts.find(
      (candidate) => candidate.id === "entity-return-schedule-families"
    );
    const scheduleFamilyFinalizationArtifact = snapshot.artifacts.find(
      (candidate) => candidate.id === "entity-return-schedule-family-finalizations"
    );
    const scheduleFamilyPayloadArtifact = snapshot.artifacts.find(
      (candidate) => candidate.id === "entity-return-schedule-family-payloads"
    );

    expect(snapshot.status).toBe("complete");
    expect(artifact?.status).toBe("blocked");
    expect(artifact?.includes.some((line) => /Form 1065 primary return/i.test(line))).toBe(true);
    expect(
      artifact?.includes.some((line) => /structured values/i.test(line))
    ).toBe(true);
    expect(scheduleFamilyArtifact?.status).toBe("blocked");
    expect(
      scheduleFamilyArtifact?.includes.some((line) => /Partnership Schedule K-1 family/i.test(line))
    ).toBe(true);
    expect(scheduleFamilyFinalizationArtifact?.status).toBe("blocked");
    expect(
      scheduleFamilyFinalizationArtifact?.includes.some((line) =>
        /Partnership Schedule K-1 family/i.test(line)
      )
    ).toBe(true);
    expect(["waiting", "blocked"]).toContain(scheduleFamilyPayloadArtifact?.status ?? "");
    expect(
      scheduleFamilyPayloadArtifact?.includes.some((line) => /Partnership Schedule K-1 family/i.test(line))
    ).toBe(true);
    expect(supportArtifact?.status).toBe("blocked");
    expect(supportArtifact?.includes.some((line) => /Partner Schedule K-1 set/i.test(line))).toBe(
      true
    );
  });

  it("keeps owner-flow and basis adjudication visible on buyout-year handoffs", { timeout: 15000 }, () => {
    const baseDraft = TINA_SKILL_REVIEW_DRAFTS["buyout-year"];
    const snapshot = buildTinaCpaHandoff({
      ...baseDraft,
      reviewerFinal: {
        ...baseDraft.reviewerFinal,
        status: "complete",
      },
      scheduleCDraft: {
        ...baseDraft.scheduleCDraft,
        status: "complete",
      },
    });
    const artifact = snapshot.artifacts.find(
      (candidate) => candidate.id === "owner-flow-basis-adjudication"
    );

    expect(snapshot.status).toBe("complete");
    expect(artifact?.status).toBe("blocked");
    expect(
      artifact?.includes.some((line) => /Opening basis and capital footing|Owner-flow characterization/i.test(line))
    ).toBe(true);
    expect(artifact?.includes).toContain("Transition economics: blocked");
  });

  it("keeps payroll compliance visible when wage treatment outruns the filing trail", { timeout: 15000 }, () => {
    const defaultDraft = createDefaultTinaWorkspaceDraft();
    const draft = buildDraft({
      profile: {
        ...defaultDraft.profile,
        businessName: "Payroll Drift LLC",
        entityType: "s_corp",
        hasPayroll: true,
        notes:
          "Payroll provider was used, but deposits were late and quarterly payroll filings are incomplete.",
      },
      documents: [
        {
          id: "doc-payroll",
          name: "payroll-register.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/payroll-register.pdf",
          category: "supporting_document",
          requestId: "payroll",
          requestLabel: "Payroll register",
          uploadedAt: "2026-04-04T09:00:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-payroll",
          status: "complete",
          kind: "pdf",
          summary: "Payroll register with late deposits",
          nextStep: "Review",
          facts: [],
          detailLines: [
            "Payroll provider summary shows wages and officer pay.",
            "Late deposit notices appear and quarterly filing support is incomplete.",
          ],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-04-04T09:02:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-payroll-gap",
          sourceDocumentId: "doc-payroll",
          label: "Payroll clue",
          value: "Payroll existed but the compliance trail is incomplete and deposits were late.",
          confidence: "high",
          capturedAt: "2026-04-04T09:03:00.000Z",
        },
      ],
      reviewerFinal: {
        ...defaultDraft.reviewerFinal,
        status: "complete",
        lastRunAt: "2026-04-04T09:04:00.000Z",
        lines: [
          {
            id: "rf-wages",
            kind: "expense",
            layer: "reviewer_final",
            label: "Wages",
            amount: 18000,
            status: "ready",
            summary: "Wages visible in the books.",
            sourceDocumentIds: ["doc-payroll"],
            sourceFactIds: ["fact-payroll-gap"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
        ],
      },
      scheduleCDraft: {
        ...defaultDraft.scheduleCDraft,
        status: "complete",
        lastRunAt: "2026-04-04T09:05:00.000Z",
        fields: [
          {
            id: "line-26-wages",
            lineNumber: "Line 26",
            label: "Wages",
            amount: 18000,
            status: "ready",
            summary: "Mapped wages line.",
            reviewerFinalLineIds: ["rf-wages"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-payroll"],
          },
        ],
        notes: [],
      },
    });

    const snapshot = buildTinaCpaHandoff(draft);
    const artifact = snapshot.artifacts.find(
      (candidate) => candidate.id === "payroll-compliance-reconstruction"
    );
    const singleOwnerArtifact = snapshot.artifacts.find(
      (candidate) => candidate.id === "single-owner-corporate-route-proof"
    );

    expect(snapshot.status).toBe("complete");
    expect(artifact?.status).toBe("blocked");
    expect(artifact?.includes.some((line) => /likely missing filings/i.test(line))).toBe(true);
    expect(singleOwnerArtifact?.status).toBe("blocked");
    expect(singleOwnerArtifact?.includes.some((line) => /Election proof: missing/i.test(line))).toBe(
      true
    );
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
