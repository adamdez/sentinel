import { describe, expect, it } from "vitest";
import {
  buildTinaPackageReadiness,
  markTinaPackageReadinessStale,
} from "@/tina/lib/package-readiness";
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

  it("blocks when saved documents point to a different lane than the organizer", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "sole_prop",
      },
      sourceFacts: [
        {
          id: "return-type-hint-1",
          sourceDocumentId: "prior-doc",
          label: "Return type hint",
          value: "1120-S",
          confidence: "high",
          capturedAt: "2026-04-08T18:00:00.000Z",
        },
      ],
    });

    const snapshot = buildTinaPackageReadiness(draft);

    expect(snapshot.items.some((item) => item.id === "intake-document-lane-conflict")).toBe(true);
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
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
      bookTieOut: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        entries: [
          {
            id: "entry-1",
            documentId: "doc-qb",
            label: "Gross receipts",
            moneyIn: 20000,
            moneyOut: 0,
            net: 20000,
            dateCoverage: "2025-01-01 to 2025-12-31",
            status: "ready",
          },
        ],
        variances: [],
      },
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "rf-1",
            label: "Gross receipts",
            amount: 20000,
            status: "approved",
            summary: "Matches approved treatment.",
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-qb"],
          },
        ],
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
            sourceDocumentIds: ["doc-qb"],
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

  it("blocks when tax-position memory is stale or still needs review", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "sole_prop",
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
      bookTieOut: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        entries: [
          {
            id: "entry-1",
            documentId: "doc-qb",
            label: "Gross receipts",
            moneyIn: 20000,
            moneyOut: 0,
            net: 20000,
            dateCoverage: "2025-01-01 to 2025-12-31",
            status: "ready",
          },
        ],
        variances: [],
      },
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "rf-1",
            label: "Gross receipts",
            amount: 20000,
            status: "approved",
            summary: "Matches approved treatment.",
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-qb"],
          },
        ],
      },
      scheduleCDraft: {
        lastRunAt: "2026-03-27T04:02:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Check",
        fields: [],
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
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
            reviewerNotes: "Approved by reviewer.",
          },
        ],
      },
      taxPositionMemory: {
        lastRunAt: "2026-03-27T04:00:30.000Z",
        status: "stale",
        summary: "Needs rebuild",
        nextStep: "Rebuild",
        records: [
          {
            id: "tax-position-tax-1",
            adjustmentId: "tax-1",
            title: "Carry income",
            status: "needs_review",
            confidence: "medium",
            summary: "Still needs reviewer anchoring.",
            treatmentSummary: "Carry it",
            reviewerGuidance: "Still needs reviewer confirmation.",
            authorityWorkIdeaIds: [],
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
            reviewerOutcomeIds: [],
            reviewerOverrideIds: [],
            updatedAt: "2026-03-27T04:00:30.000Z",
          },
        ],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);

    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "tax-position-memory-not-current")).toBe(true);
    expect(
      snapshot.items.some((item) => item.id === "tax-position-review-tax-position-tax-1")
    ).toBe(true);
  });

  it("blocks when direct scenario-family clues exist without governed treatment paths", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "sole_prop",
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
      sourceFacts: [
        {
          id: "payroll-1",
          sourceDocumentId: "doc-qb",
          label: "Payroll filing period clue",
          value: "Q1 2025",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
        {
          id: "owner-1",
          sourceDocumentId: "doc-qb",
          label: "Owner draw clue",
          value: "Owner draws posted in ledger.",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      bookTieOut: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        entries: [
          {
            id: "entry-1",
            documentId: "doc-qb",
            label: "Gross receipts",
            moneyIn: 20000,
            moneyOut: 0,
            net: 20000,
            dateCoverage: "2025-01-01 to 2025-12-31",
            status: "ready",
          },
        ],
        variances: [],
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
        fields: [],
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
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
            reviewerNotes: "",
          },
        ],
      },
      taxPositionMemory: {
        lastRunAt: "2026-03-27T04:00:30.000Z",
        status: "complete",
        summary: "Current",
        nextStep: "Keep going",
        records: [],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);

    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "payroll-treatment-path-missing")).toBe(true);
    expect(snapshot.items.some((item) => item.id === "owner-flow-treatment-path-missing")).toBe(
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
      bookTieOut: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        entries: [
          {
            id: "entry-1",
            documentId: "doc-qb",
            label: "Gross receipts",
            moneyIn: 20000,
            moneyOut: 0,
            net: 20000,
            dateCoverage: "2025-01-01 to 2025-12-31",
            status: "ready",
          },
        ],
        variances: [],
      },
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "rf-1",
            label: "Gross receipts",
            amount: 20000,
            status: "approved",
            summary: "Matches approved treatment.",
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-qb"],
          },
        ],
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
            sourceDocumentIds: ["doc-qb"],
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
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
            reviewerNotes: "",
          },
        ],
      },
      taxPositionMemory: {
        lastRunAt: "2026-03-27T04:00:30.000Z",
        status: "complete",
        summary: "Current",
        nextStep: "Keep going",
        records: [
          {
            id: "tax-position-tax-1",
            adjustmentId: "tax-1",
            title: "Carry income",
            status: "ready",
            confidence: "high",
            summary: "Reviewer anchored.",
            treatmentSummary: "Carry it",
            reviewerGuidance: "Approved by reviewer.",
            authorityWorkIdeaIds: [],
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
            reviewerOutcomeIds: ["outcome-1"],
            reviewerOverrideIds: [],
            updatedAt: "2026-03-27T04:00:30.000Z",
          },
        ],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);

    expect(snapshot.level).toBe("needs_review");
    expect(snapshot.items.length).toBeGreaterThan(0);
    expect(snapshot.items.every((item) => item.severity === "needs_attention")).toBe(true);
    expect(snapshot.items.some((item) => item.id === "field-review-line-1-gross-receipts")).toBe(
      true
    );
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
      sourceFacts: [
        {
          id: "late-fact",
          sourceDocumentId: "doc-qb",
          label: "State clue",
          value: "Idaho reference found.",
          confidence: "medium",
          capturedAt: "2026-03-27T04:10:00.000Z",
        },
        {
          id: "fact-group-1",
          sourceDocumentId: "doc-qb",
          label: "Transaction group clue",
          value: "Gross receipts deposits grouped by month",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      bookTieOut: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        entries: [
          {
            id: "entry-1",
            documentId: "doc-qb",
            label: "Gross receipts",
            moneyIn: 20000,
            moneyOut: 0,
            net: 20000,
            dateCoverage: "2025-01-01 to 2025-12-31",
            status: "ready",
          },
        ],
        variances: [],
      },
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "rf-1",
            label: "Gross receipts",
            amount: 20000,
            status: "approved",
            summary: "Matches approved treatment.",
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-qb"],
          },
        ],
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
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
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
      sourceFacts: [
        {
          id: "fact-group-1",
          sourceDocumentId: "doc-qb",
          label: "Transaction group clue",
          value: "Gross receipts deposits grouped by month",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      bookTieOut: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        entries: [
          {
            id: "entry-1",
            documentId: "doc-qb",
            label: "Gross receipts",
            moneyIn: 20000,
            moneyOut: 0,
            net: 20000,
            dateCoverage: "2025-01-01 to 2025-12-31",
            status: "ready",
          },
        ],
        variances: [],
      },
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "rf-1",
            label: "Gross receipts",
            amount: 20000,
            status: "approved",
            summary: "Matches approved treatment.",
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-qb"],
          },
        ],
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
            sourceDocumentIds: ["doc-qb"],
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
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
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
      sourceFacts: [
        {
          id: "fact-group-1",
          sourceDocumentId: "doc-qb",
          label: "Transaction group clue",
          value: "Gross receipts deposits grouped by month",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      bookTieOut: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        entries: [
          {
            id: "entry-1",
            documentId: "doc-qb",
            label: "Gross receipts",
            moneyIn: 20000,
            moneyOut: 0,
            net: 20000,
            dateCoverage: "2025-01-01 to 2025-12-31",
            status: "ready",
          },
        ],
        variances: [],
      },
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "rf-1",
            label: "Gross receipts",
            amount: 20000,
            status: "approved",
            summary: "Matches approved treatment.",
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-qb"],
          },
        ],
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
            sourceDocumentIds: ["doc-qb"],
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
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
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
        {
          id: "fact-group-1",
          sourceDocumentId: "doc-qb",
          label: "Transaction group clue",
          value: "Gross receipts deposits grouped by month",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
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
      bookTieOut: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        entries: [
          {
            id: "entry-1",
            documentId: "doc-qb",
            label: "Gross receipts",
            moneyIn: 20000,
            moneyOut: 0,
            net: 20000,
            dateCoverage: "2025-01-01 to 2025-12-31",
            status: "ready",
          },
        ],
        variances: [],
      },
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "rf-1",
            label: "Gross receipts",
            amount: 20000,
            status: "approved",
            summary: "Matches approved treatment.",
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-qb"],
          },
        ],
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
            sourceDocumentIds: ["doc-qb"],
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
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
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
      sourceFacts: [
        {
          id: "fact-group-1",
          sourceDocumentId: "doc-qb",
          label: "Transaction group clue",
          value: "Gross receipts deposits grouped by month",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      bookTieOut: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        entries: [
          {
            id: "entry-1",
            documentId: "doc-qb",
            label: "Gross receipts",
            moneyIn: 20000,
            moneyOut: 0,
            net: 20000,
            dateCoverage: "2025-01-01 to 2025-12-31",
            status: "ready",
          },
        ],
        variances: [],
      },
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "rf-1",
            label: "Gross receipts",
            amount: 20000,
            status: "approved",
            summary: "Matches approved treatment.",
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-qb"],
          },
        ],
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
            sourceDocumentIds: ["doc-qb"],
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
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
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
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
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
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
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
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
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
      sourceFacts: [
        {
          id: "fact-group-1",
          sourceDocumentId: "doc-qb",
          label: "Transaction group clue",
          value: "Gross receipts deposits grouped by month",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      bookTieOut: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        entries: [
          {
            id: "entry-1",
            documentId: "doc-qb",
            label: "Gross receipts",
            moneyIn: 20000,
            moneyOut: 0,
            net: 20000,
            dateCoverage: "2025-01-01 to 2025-12-31",
            status: "ready",
          },
        ],
        variances: [],
      },
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "rf-1",
            label: "Gross receipts",
            amount: 20000,
            status: "approved",
            summary: "Matches approved treatment.",
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-qb"],
          },
        ],
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
            sourceDocumentIds: ["doc-qb"],
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
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
            reviewerNotes: "",
          },
        ],
      },
      taxPositionMemory: {
        lastRunAt: "2026-03-27T04:00:30.000Z",
        status: "complete",
        summary: "Current",
        nextStep: "Keep going",
        records: [
          {
            id: "tax-position-tax-1",
            adjustmentId: "tax-1",
            title: "Carry income",
            status: "ready",
            confidence: "high",
            summary: "Reviewer anchored.",
            treatmentSummary: "Carry it",
            reviewerGuidance: "Approved by reviewer.",
            authorityWorkIdeaIds: [],
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
            reviewerOutcomeIds: ["outcome-1"],
            reviewerOverrideIds: [],
            updatedAt: "2026-03-27T04:00:30.000Z",
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
      sourceFacts: [
        {
          id: "fact-group-1",
          sourceDocumentId: "doc-qb",
          label: "Transaction group clue",
          value: "Gross receipts deposits grouped by month",
          confidence: "high",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      bookTieOut: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        entries: [
          {
            id: "entry-1",
            documentId: "doc-qb",
            label: "Gross receipts",
            moneyIn: 20000,
            moneyOut: 0,
            net: 20000,
            dateCoverage: "2025-01-01 to 2025-12-31",
            status: "ready",
          },
        ],
        variances: [],
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
        lines: [
          {
            id: "rf-1",
            label: "Gross receipts",
            amount: 20000,
            status: "approved",
            summary: "Matches approved treatment.",
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-qb"],
          },
        ],
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
            sourceDocumentIds: ["doc-qb"],
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
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
            reviewerNotes: "",
          },
        ],
      },
      taxPositionMemory: {
        lastRunAt: "2026-03-27T04:00:30.000Z",
        status: "complete",
        summary: "Current",
        nextStep: "Keep going",
        records: [
          {
            id: "tax-position-tax-1",
            adjustmentId: "tax-1",
            title: "Carry income",
            status: "ready",
            confidence: "high",
            summary: "Reviewer anchored.",
            treatmentSummary: "Carry it",
            reviewerGuidance: "Approved by reviewer.",
            authorityWorkIdeaIds: [],
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-group-1"],
            reviewerOutcomeIds: ["outcome-1"],
            reviewerOverrideIds: [],
            updatedAt: "2026-03-27T04:00:30.000Z",
          },
        ],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);
    expect(snapshot.level).toBe("ready_for_cpa");
    expect(snapshot.items.some((item) => item.id === "issue-watch-only")).toBe(false);
  });

  it("turns thin current-year planning scenarios into review items and prioritizes them", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Payroll LLC",
        entityType: "single_member_llc",
        hasPayroll: true,
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
          id: "doc-payroll",
          name: "payroll.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/payroll.pdf",
          category: "supporting_document",
          requestId: "payroll",
          requestLabel: "Payroll reports",
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "group-1",
          sourceDocumentId: "doc-qb",
          label: "Transaction group clue",
          value: "Client receipts (inflow): 4 rows, total $20,000.00, dates Apr 1, 2026 to Apr 30, 2026",
          confidence: "medium",
          capturedAt: "2026-04-07T08:04:00.000Z",
        },
        {
          id: "payroll-form-fact",
          sourceDocumentId: "doc-qb",
          label: "Payroll tax form clue",
          value: "This paper includes Form 941 details.",
          confidence: "medium",
          capturedAt: "2026-04-07T08:04:00.000Z",
        },
      ],
      bookTieOut: {
        ...createDefaultTinaWorkspaceDraft().bookTieOut,
        status: "complete",
        summary: "Tie-out complete",
        nextStep: "Keep going",
        entries: [
          {
            id: "book-doc-qb",
            documentId: "doc-qb",
            label: "QuickBooks export",
            status: "ready",
            moneyIn: 20000,
            moneyOut: 0,
            net: 20000,
            dateCoverage: "2026-04-01 through 2026-04-30",
            sourceFactIds: ["group-1"],
            issueIds: [],
          },
        ],
        variances: [],
      },
      bootstrapReview: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
      reviewerFinal: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "rf-1",
            kind: "income",
            layer: "reviewer_final",
            label: "Gross receipts candidate",
            amount: 20000,
            status: "ready",
            summary: "Ready.",
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["group-1"],
            issueIds: [],
            derivedFromLineIds: ["ai-1"],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-1"],
          },
        ],
      },
      scheduleCDraft: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
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
            sourceDocumentIds: ["doc-qb"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
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
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["group-1"],
            reviewerNotes: "",
          },
        ],
      },
      taxPositionMemory: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Current",
        nextStep: "Keep going",
        records: [
          {
            id: "tax-position-tax-1",
            adjustmentId: "tax-1",
            title: "Carry income",
            status: "ready",
            confidence: "high",
            summary: "Reviewer anchored.",
            treatmentSummary: "Carry it",
            reviewerGuidance: "Approved by reviewer.",
            authorityWorkIdeaIds: [],
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["group-1"],
            reviewerOutcomeIds: [],
            reviewerOverrideIds: [],
            updatedAt: "2026-04-07T08:05:00.000Z",
          },
        ],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);
    expect(snapshot.level).toBe("needs_review");
    expect(snapshot.items.some((item) => item.id === "planning-payroll")).toBe(true);
    expect(snapshot.nextStep).toContain("reviewer call");
  });

  it("blocks false-ready packages when ledger buckets reveal hidden specialized treatment", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Hidden Payroll LLC",
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
          id: "bucket-1",
          sourceDocumentId: "doc-qb",
          label: "Ledger bucket clue",
          value: "Payroll Expense: 3 rows, net -$3,000.00",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
      ],
      bootstrapReview: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
      reviewerFinal: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [],
      },
      scheduleCDraft: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Check",
        fields: [],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
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
            title: "Carry expense",
            summary: "Approved",
            suggestedTreatment: "Carry it",
            whyItMatters: "Matters",
            amount: 3000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-1"],
            reviewerNotes: "",
          },
        ],
      },
      taxPositionMemory: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Current",
        nextStep: "Keep going",
        records: [],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);
    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items.some((item) => item.id === "ledger-bucket-specialization-missing")).toBe(
      true
    );
  });

  it("blocks false-ready packages when transaction lineage still shows unresolved specialized activity", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Lineage Payroll LLC",
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
      sourceFacts: [
        {
          id: "group-1",
          sourceDocumentId: "doc-qb",
          label: "Transaction group clue",
          value:
            "Payroll register (outflow): 3 rows, total ($3,000.00), dates Jan 1, 2025 to Jan 31, 2025",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
        {
          id: "lineage-1",
          sourceDocumentId: "doc-qb",
          label: "Transaction lineage clue",
          value:
            "Payroll register | 2025-01 (outflow): 3 rows, total ($3,000.00), dates Jan 1, 2025 to Jan 31, 2025",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
      ],
      bootstrapReview: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
      reviewerFinal: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [],
      },
      scheduleCDraft: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Check",
        fields: [],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
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
            title: "Carry payroll",
            summary: "Approved",
            suggestedTreatment: "Carry it",
            whyItMatters: "Matters",
            amount: 3000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["group-1", "lineage-1"],
            reviewerNotes: "",
          },
        ],
      },
      taxPositionMemory: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Current",
        nextStep: "Keep going",
        records: [],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);
    expect(snapshot.level).toBe("blocked");
    expect(
      snapshot.items.some(
        (item) =>
          item.title === "Transaction lineage still needs governed treatment" &&
          item.summary.includes("row-cluster lineage")
      )
    ).toBe(true);
  });

  it("blocks readiness when current-file reviewer reality is still fragile", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Fragile Review LLC",
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
      sourceFacts: [
        {
          id: "fact-group-1",
          sourceDocumentId: "doc-qb",
          label: "Transaction group clue",
          value:
            "Client receipts (inflow): 2 rows, total $20,000.00, dates Jan 1, 2025 to Jan 31, 2025",
          confidence: "medium",
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      bootstrapReview: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
      reviewerFinal: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [],
      },
      scheduleCDraft: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Check",
        fields: [],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Review",
        adjustments: [],
      },
      taxPositionMemory: {
        lastRunAt: "2026-04-07T08:05:00.000Z",
        status: "complete",
        summary: "Current",
        nextStep: "Keep going",
        records: [],
      },
      reviewerOutcomeMemory: {
        ...createDefaultTinaWorkspaceDraft().reviewerOutcomeMemory,
        outcomes: [
          {
            id: "outcome-1",
            title: "Schedule C messy books rejection",
            phase: "package",
            verdict: "rejected",
            targetType: "reviewer_final_line",
            targetId: "missing-local-target",
            summary: "Rejected.",
            lessons: ["Do not overstate readiness when Schedule C messy books patterns repeat."],
            caseTags: ["schedule_c", "messy_books"],
            overrideIds: [],
            decidedAt: "2026-04-06T08:00:00.000Z",
            decidedBy: "CPA",
          },
        ],
      },
      bookTieOut: {
        ...createDefaultTinaWorkspaceDraft().bookTieOut,
        variances: [
          {
            id: "conflicting-money-story",
            title: "Conflicting money story",
            summary: "Money story conflicts.",
            severity: "blocking",
            documentIds: ["doc-qb"],
          },
        ],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);
    expect(snapshot.level).toBe("blocked");
    expect(
      snapshot.items.some((item) => item.id === "current-file-reviewer-reality-fragile")
    ).toBe(true);
  });
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


