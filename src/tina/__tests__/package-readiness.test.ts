import { describe, expect, it } from "vitest";
import {
  buildTinaPackageReadiness,
  markTinaPackageReadinessStale,
} from "@/tina/lib/package-readiness";
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

  it("flags missing companion federal forms for CPA review instead of calling the packet exact", () => {
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
            id: "line-31-tentative-net",
            lineNumber: "Line 31",
            label: "Tentative net profit or loss",
            amount: 16000,
            status: "ready",
            summary: "Looks good.",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
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
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Review",
        adjustments: [],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);

    expect(snapshot.level).toBe("needs_review");
    expect(snapshot.items.some((item) => item.id === "federal-form-schedule-se")).toBe(true);
    expect(snapshot.summary).toContain("federal business packet");
  });

  it("fails closed when the IRS authority registry is not certified for the packet year", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2026",
        entityType: "sole_prop",
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [],
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete",
        summary: "Ready",
        nextStep: "Check",
        fields: [],
        notes: [],
      },
      bootstrapReview: {
        ...createDefaultTinaWorkspaceDraft().bootstrapReview,
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        ...createDefaultTinaWorkspaceDraft().issueQueue,
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
      taxAdjustments: {
        ...createDefaultTinaWorkspaceDraft().taxAdjustments,
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        adjustments: [],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);

    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "irs-authority-registry",
          severity: "blocking",
        }),
      ])
    );
    expect(snapshot.items.find((item) => item.id === "irs-authority-registry")?.summary).toContain(
      "2025"
    );
  });

  it("fails closed when the IRS freshness watch found changed sources", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop",
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [],
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete",
        summary: "Ready",
        nextStep: "Check",
        fields: [],
        notes: [],
      },
      bootstrapReview: {
        ...createDefaultTinaWorkspaceDraft().bootstrapReview,
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        ...createDefaultTinaWorkspaceDraft().issueQueue,
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
      taxAdjustments: {
        ...createDefaultTinaWorkspaceDraft().taxAdjustments,
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        adjustments: [],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft, {
      irsAuthorityWatchStatus: {
        level: "needs_review",
        generatedAt: "2026-03-29T04:20:00.000Z",
        checkedCount: 18,
        failedCount: 0,
        changedCount: 2,
        newCount: 0,
        summary: "The latest IRS watch found 2 changed IRS sources since the prior stored run.",
        nextStep: "Review the changed sources and recertify Tina's IRS registry before leaning on fresh IRS-facing claims.",
      },
    });

    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "irs-authority-watch",
          severity: "blocking",
        }),
      ])
    );
  });

  it("fails closed on an unresolved LLC return-type review even when the saved issue queue is still stale", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Harbor Beam Studio LLC",
        taxYear: "2025",
        entityType: "single_member_llc",
        llcFederalTaxTreatment: "owner_return",
      },
      sourceFacts: [
        {
          id: "fact-llc-election",
          sourceDocumentId: "doc-1",
          label: "LLC election clue",
          value: "Form 2553 election accepted for S corporation treatment.",
          confidence: "high",
          capturedAt: "2026-03-28T17:00:00.000Z",
        },
      ],
      reviewerFinal: {
        lastRunAt: "2026-03-28T17:01:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [],
      },
      scheduleCDraft: {
        lastRunAt: "2026-03-28T17:02:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        fields: [],
        notes: [],
      },
      bootstrapReview: {
        lastRunAt: "2026-03-28T17:03:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-03-28T17:04:00.000Z",
        status: "complete",
        summary: "Clear",
        nextStep: "Keep going",
        items: [],
        records: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-28T17:05:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        adjustments: [],
      },
    });

    const snapshot = buildTinaPackageReadiness(draft);

    expect(snapshot.level).toBe("blocked");
    expect(snapshot.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "review-lane-review",
          title: "Return type check",
          severity: "blocking",
        }),
      ])
    );
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
