import { describe, expect, it } from "vitest";
import {
  buildTinaPackageReadiness,
  markTinaPackageReadinessStale,
} from "@/tina/lib/package-readiness";
import {
  createTinaPackageSnapshotRecord,
  recordTinaReviewerDecision,
} from "@/tina/lib/package-state";
import { buildTinaProfileFingerprint } from "@/tina/lib/profile-fingerprint";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaWorkspaceDraft } from "@/tina/types";

function buildDraft(overrides?: Partial<TinaWorkspaceDraft>): TinaWorkspaceDraft {
  const merged = {
    ...createDefaultTinaWorkspaceDraft(),
    ...overrides,
    profile: {
      ...createDefaultTinaWorkspaceDraft().profile,
      ...(overrides?.profile ?? {}),
    },
  };
  const profileFingerprint = buildTinaProfileFingerprint(merged.profile);

  return {
    ...merged,
    bootstrapReview: {
      ...merged.bootstrapReview,
      profileFingerprint,
    },
    issueQueue: {
      ...merged.issueQueue,
      profileFingerprint,
    },
  };
}

describe("buildTinaPackageReadiness", () => {
  it("fails closed when the filing lane is unsupported", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina S Corp",
        entityType: "s_corp",
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);

    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "lane-not-supported")).toBe(true);
  });

  it("fails closed when source-fact start-path routing blocks the supported lane", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Conflicted LLC",
        entityType: "single_member_llc",
      },
      sourceFacts: [
        {
          id: "ownership-change-fact",
          sourceDocumentId: "doc-1",
          label: "Ownership change clue",
          value: "This paper may show an ownership change.",
          confidence: "high",
          capturedAt: "2026-04-02T19:10:00.000Z",
        },
      ],
    });

    const snapshot = buildTinaPackageReadiness(draft);

    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "lane-not-supported")).toBe(true);
  });

  it("calls out exact missing start-path proof in package readiness", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Complex LLC",
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
          capturedAt: "2026-04-02T19:12:00.000Z",
        },
      ],
    });

    const snapshot = buildTinaPackageReadiness(draft);

    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "proof-ownership-agreement")).toBe(true);
  });

  it("shows blocking items for unapproved tax moves and waiting draft fields", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "sole_prop",
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Review",
        adjustments: [
          {
            id: "tax-1",
            kind: "carryforward_line",
            status: "ready_for_review",
            risk: "low",
            requiresAuthority: false,
            title: "Carry income",
            summary: "Ready",
            suggestedTreatment: "Carry it",
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
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
        nextStep: "Check",
        fields: [
          {
            id: "line-27a-other-expenses",
            lineNumber: "Line 27a",
            label: "Other expenses",
            amount: null,
            status: "waiting",
            summary: "Still waiting on approved expense lines.",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);

    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "adjustment-review-tax-1")).toBe(true);
    expect(snapshot.items.some((item) => item.id === "field-waiting-line-27a-other-expenses")).toBe(
      true
    );
  });

  it("drops to needs review when only attention items remain", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "single_member_llc",
      },
      bootstrapReview: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        items: [],
        records: [],
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
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
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
        nextStep: "Check",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "needs_attention",
            summary: "Needs a human look.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
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
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);

    expect(snapshot.level).toBe("needs_review");
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.severity).toBe("needs_attention");
  });

  it("blocks when bootstrap review or issue queue are not current", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "sole_prop",
      },
      bootstrapReview: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "stale",
        summary: "Needs rerun",
        nextStep: "Run again",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "idle",
        summary: "Not run",
        nextStep: "Run",
        items: [],
        records: [],
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
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
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
        nextStep: "Check",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
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
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);
    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "bootstrap-review-not-current")).toBe(true);
    expect(snapshot.items.some((item) => item.id === "issue-queue-not-current")).toBe(true);
  });

  it("blocks when review layers claim complete but have no run timestamp", () => {
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
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      bootstrapReview: {
        lastRunAt: null,
        status: "complete",
        summary: "Claimed complete",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: null,
        status: "complete",
        summary: "Claimed complete",
        nextStep: "Keep going",
        items: [],
        records: [],
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
        nextStep: "Check",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
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
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);
    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "bootstrap-review-not-current")).toBe(true);
    expect(snapshot.items.some((item) => item.id === "issue-queue-not-current")).toBe(true);
  });

  it("blocks when review layers claim complete but use invalid run timestamps", () => {
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
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      bootstrapReview: {
        lastRunAt: "not-a-date",
        status: "complete",
        summary: "Claimed complete",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "totally-invalid-date",
        status: "complete",
        summary: "Claimed complete",
        nextStep: "Keep going",
        items: [],
        records: [],
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
        nextStep: "Check",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
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
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);
    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "bootstrap-review-not-current")).toBe(true);
    expect(snapshot.items.some((item) => item.id === "issue-queue-not-current")).toBe(true);
  });

  it("blocks when new evidence is newer than the last review runs", () => {
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
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "late-fact",
          sourceDocumentId: "doc-qb",
          label: "State clue",
          value: "Idaho reference found.",
          confidence: "medium",
          capturedAt: "2026-03-27T04:10:00.000Z",
        },
      ],
      bootstrapReview: {
        lastRunAt: "2026-03-27T04:05:00.000Z",
        status: "complete",
        summary: "Claimed complete",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-03-27T04:05:00.000Z",
        status: "complete",
        summary: "Claimed complete",
        nextStep: "Keep going",
        items: [],
        records: [],
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
        nextStep: "Check",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
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
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);
    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "bootstrap-review-not-current")).toBe(true);
    expect(snapshot.items.some((item) => item.id === "issue-queue-not-current")).toBe(true);
  });

  it("blocks when review runs were completed under a different organizer profile", () => {
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
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      bootstrapReview: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        items: [],
        records: [],
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
        nextStep: "Check",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
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
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const withMismatchedProfileRun = {
      ...draft,
      bootstrapReview: {
        ...draft.bootstrapReview,
        profileFingerprint: "totally-different-profile-token",
      },
      issueQueue: {
        ...draft.issueQueue,
        profileFingerprint: "totally-different-profile-token",
      },
    };

    const snapshot = buildTinaPackageReadiness(withMismatchedProfileRun);
    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "bootstrap-review-not-current")).toBe(true);
    expect(snapshot.items.some((item) => item.id === "issue-queue-not-current")).toBe(true);
  });

  it("blocks when complete review runs are missing profile fingerprint metadata", () => {
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
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      bootstrapReview: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        items: [],
        records: [],
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
        nextStep: "Check",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
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
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const withMissingProfileRunMetadata = {
      ...draft,
      bootstrapReview: {
        ...draft.bootstrapReview,
        profileFingerprint: null,
      },
      issueQueue: {
        ...draft.issueQueue,
        profileFingerprint: null,
      },
    };

    const snapshot = buildTinaPackageReadiness(withMissingProfileRunMetadata);
    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "bootstrap-review-not-current")).toBe(true);
    expect(snapshot.items.some((item) => item.id === "issue-queue-not-current")).toBe(true);
  });

  it("blocks when a newer document reading exists after review runs", () => {
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
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-qb",
          status: "complete",
          kind: "spreadsheet",
          summary: "Read complete.",
          nextStep: "Keep going.",
          facts: [],
          detailLines: [],
          rowCount: 10,
          headers: ["Date", "Amount"],
          sheetNames: ["Sheet1"],
          lastReadAt: "2026-03-27T04:12:00.000Z",
        },
      ],
      bootstrapReview: {
        lastRunAt: "2026-03-27T04:05:00.000Z",
        status: "complete",
        summary: "Claimed complete",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-03-27T04:05:00.000Z",
        status: "complete",
        summary: "Claimed complete",
        nextStep: "Keep going",
        items: [],
        records: [],
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
        nextStep: "Check",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
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
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);
    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "bootstrap-review-not-current")).toBe(true);
    expect(snapshot.items.some((item) => item.id === "issue-queue-not-current")).toBe(true);
  });

  it("blocks when evidence timestamps are invalid and freshness cannot be trusted", () => {
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
        capturedAt: "not-a-real-date",
      },
      documents: [
        {
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      bootstrapReview: {
        lastRunAt: "2026-03-27T04:20:00.000Z",
        status: "complete",
        summary: "Claimed complete",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-03-27T04:20:00.000Z",
        status: "complete",
        summary: "Claimed complete",
        nextStep: "Keep going",
        items: [],
        records: [],
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
        nextStep: "Check",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
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
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);
    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "bootstrap-review-not-current")).toBe(true);
    expect(snapshot.items.some((item) => item.id === "issue-queue-not-current")).toBe(true);
    expect(
      snapshot.items.find((item) => item.id === "bootstrap-review-not-current")?.summary
    ).toContain("invalid evidence timestamps");
  });

  it("marks the package ready for CPA when no blockers or review items remain", () => {
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
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
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
        nextStep: "Check",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
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
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
      bootstrapReview: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);

    expect(snapshot.level).toBe("ready_for_cpa");
    expect(snapshot.items).toHaveLength(0);
  });

  it("does not downgrade readiness for watch-only issue queue items", () => {
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
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      bootstrapReview: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Watch-only",
        nextStep: "Keep going",
        items: [
          {
            id: "watch-only",
            title: "Low-confidence clue",
            summary: "This is a weak signal and should not block readiness.",
            severity: "watch",
            status: "open",
            category: "books",
            requestId: null,
            documentId: "doc-qb",
            factId: null,
          },
        ],
        records: [],
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
        nextStep: "Check",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
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
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);
    expect(snapshot.level).toBe("ready_for_cpa");
    expect(snapshot.items.some((item) => item.id === "issue-watch-only")).toBe(false);
  });

  it("blocks readiness when treatment judgment rejects mixed-use deductions", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Mixed Use LLC",
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
          id: "doc-mixed",
          name: "transactions.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/transactions.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-mixed",
          sourceDocumentId: "doc-mixed",
          label: "Mixed personal/business clue",
          value: "Meals and personal household charges appear in the same ledger stream.",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
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
        nextStep: "Check",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-mixed"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
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
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-mixed"],
            sourceFactIds: ["fact-mixed"],
            reviewerNotes: "",
          },
        ],
      },
      bootstrapReview: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);

    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "treatment-mixed-use-treatment")).toBe(true);
  });

  it("keeps readiness in review when treatment judgment still needs reviewer handling", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Asset Review LLC",
        entityType: "sole_prop",
        hasFixedAssets: true,
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
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
        {
          id: "doc-assets",
          name: "asset-list.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/asset-list.csv",
          category: "supporting_document",
          requestId: "assets",
          requestLabel: "Fixed asset schedule",
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-depreciation",
          sourceDocumentId: "doc-assets",
          label: "Depreciation clue",
          value: "A fixed asset schedule and Section 179 notes appear in the records.",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
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
        nextStep: "Check",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-assets"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
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
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-assets"],
            sourceFactIds: ["fact-depreciation"],
            reviewerNotes: "",
          },
        ],
      },
      bootstrapReview: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);

    expect(snapshot.level).toBe("needs_review");
    expect(snapshot.items.some((item) => item.id === "treatment-depreciation-treatment")).toBe(
      true
    );
  });

  it("blocks when a previously signed-off snapshot has drifted", () => {
    const readyDraft = buildDraft({
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
          id: "doc-qb",
          name: "qb.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/qb.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
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
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
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
        nextStep: "Check",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 20000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
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
            whyItMatters: "Matters",
            amount: 20000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
      bootstrapReview: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
    });

    const snapshot = createTinaPackageSnapshotRecord(readyDraft, "2026-03-27T04:10:00.000Z");
    const decision = recordTinaReviewerDecision({
      snapshotId: snapshot.id,
      reviewerName: "CPA Tina",
      decision: "approved",
      decidedAt: "2026-03-27T04:11:00.000Z",
    });

    const staleDraft = {
      ...readyDraft,
      packageSnapshots: [snapshot],
      reviewerDecisions: [decision],
      scheduleCDraft: {
        ...readyDraft.scheduleCDraft,
        fields: [
          {
            ...readyDraft.scheduleCDraft.fields[0],
            amount: 21000,
          },
        ],
      },
    };

    const readiness = buildTinaPackageReadiness(staleDraft);
    expect(readiness.level).toBe("blocked");
    expect(readiness.items.some((item) => item.id === "signed-off-snapshot-stale")).toBe(true);
  }, 10000);
});

describe("markTinaPackageReadinessStale", () => {
  it("marks a checked package snapshot as stale", () => {
    const stale = markTinaPackageReadinessStale({
      lastRunAt: "2026-03-27T04:10:00.000Z",
      status: "complete",
      level: "blocked",
      summary: "Checked",
      nextStep: "Done",
      items: [],
    });

    expect(stale.status).toBe("stale");
    expect(stale.summary).toContain("changed");
  });
});
