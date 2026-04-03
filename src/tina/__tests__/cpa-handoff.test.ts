import { describe, expect, it } from "vitest";
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
      "waiting"
    );
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "entity-economics-readiness")?.status
    ).toBe("waiting");
    expect(snapshot.artifacts.find((artifact) => artifact.id === "entity-return-runbook")?.status).toBe(
      "waiting"
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
    ).toBe("waiting");
    expect(
      snapshot.artifacts.find((artifact) => artifact.id === "accounting-artifact-coverage")?.status
    ).toBe("waiting");
    expect(snapshot.artifacts.find((artifact) => artifact.id === "attachment-schedules")?.status).toBe(
      "ready"
    );
    expect(snapshot.artifacts.find((artifact) => artifact.id === "planning-action-board")?.status).toBe(
      "blocked"
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
            sourceDocumentIds: ["doc-1", "doc-bank"],
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
            sourceDocumentIds: ["doc-1", "doc-bank"],
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
  });

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
