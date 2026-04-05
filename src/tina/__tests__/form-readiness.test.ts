import { describe, expect, it } from "vitest";
import { buildTinaFormReadiness } from "@/tina/lib/form-readiness";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("form-readiness", () => {
  it("marks the supported Schedule C lane reviewer-ready when form metadata, math, and trace are clean", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Ready Test LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
      },
      documents: [
        {
          id: "doc-income",
          name: "quickbooks.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/quickbooks.csv",
          category: "supporting_document" as const,
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
          category: "supporting_document" as const,
          requestId: "bank-support",
          requestLabel: "Bank support",
          uploadedAt: "2026-03-27T04:01:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-income",
          status: "complete" as const,
          kind: "spreadsheet" as const,
          summary: "Read",
          nextStep: "Keep going",
          facts: [],
          detailLines: [],
          rowCount: 10,
          headers: ["Date", "Amount"],
          sheetNames: ["Sheet1"],
          lastReadAt: "2026-03-27T04:00:30.000Z",
        },
        {
          documentId: "doc-bank",
          status: "complete" as const,
          kind: "pdf" as const,
          summary: "Read",
          nextStep: "Keep going",
          facts: [],
          detailLines: [],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-03-27T04:01:30.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-income",
          sourceDocumentId: "doc-income",
          label: "Gross receipts support",
          value: "QuickBooks income summary supports the gross receipts figure.",
          confidence: "high" as const,
          capturedAt: "2026-03-27T04:02:00.000Z",
        },
      ],
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-income",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income", "doc-bank"],
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
        status: "complete" as const,
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: ["tax-income"],
            sourceDocumentIds: ["doc-income", "doc-bank"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        items: [],
      },
    };

    const readiness = buildTinaFormReadiness(draft);
    expect(readiness.level).toBe("reviewer_ready");
  });

  it("blocks readiness when header metadata is missing", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Blocked Test LLC",
        taxYear: "2025",
        entityType: "sole_prop" as const,
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-income",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-income"],
          },
        ],
      },
    };

    const readiness = buildTinaFormReadiness(draft);
    expect(readiness.level).toBe("not_ready");
    expect(readiness.reasons.some((reason) => reason.id === "validation-missing-naics-code")).toBe(
      true
    );
  });

  it("keeps community-property Schedule C paths provisional until proof is uploaded", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Community Property LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "single_member_llc" as const,
        ownerCount: 2,
        spouseCommunityPropertyTreatment: "confirmed" as const,
      },
      sourceFacts: [
        {
          id: "multi-owner-fact",
          sourceDocumentId: "doc-owners",
          label: "Multi-owner clue",
          value: "This paper may show more than one owner, partner, member, K-1, or ownership split.",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:02:00.000Z",
        },
        {
          id: "community-property-fact",
          sourceDocumentId: "doc-owners",
          label: "Community property clue",
          value: "This paper may show spouse community-property treatment or a husband-and-wife ownership setup.",
          confidence: "medium" as const,
          capturedAt: "2026-03-27T05:03:00.000Z",
        },
      ],
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-income",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income"],
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
        status: "complete" as const,
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: ["tax-income"],
            sourceDocumentIds: ["doc-income"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        items: [],
      },
    };

    const readiness = buildTinaFormReadiness(draft);
    expect(readiness.level).toBe("not_ready");
    expect(readiness.reasons.some((reason) => reason.id === "proof-community-property-proof")).toBe(
      true
    );
  });

  it("blocks official-form readiness when treatment judgment rejects mixed-use deductions", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Mixed Use LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
      },
      sourceFacts: [
        {
          id: "fact-mixed",
          sourceDocumentId: "doc-mixed",
          label: "Mixed personal/business clue",
          value: "Meals and personal charges appear in the same ledger stream.",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:02:00.000Z",
        },
      ],
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-income",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income"],
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
        status: "complete" as const,
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: ["tax-income"],
            sourceDocumentIds: ["doc-income"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        items: [],
      },
    };

    const readiness = buildTinaFormReadiness(draft);
    expect(readiness.level).toBe("not_ready");
    expect(readiness.reasons.some((reason) => reason.id === "treatment-mixed-use-treatment")).toBe(
      true
    );
  });

  it("blocks official-form readiness when non-zero lines only have thin evidence support", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Thin Proof LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-income",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 15000,
            status: "ready" as const,
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
        status: "complete" as const,
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: ["tax-income"],
            sourceDocumentIds: [],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        items: [],
      },
    };

    const readiness = buildTinaFormReadiness(draft);

    expect(readiness.level).toBe("not_ready");
    expect(readiness.reasons.some((reason) => reason.id === "evidence-trace-schedule-c-line-1")).toBe(
      true
    );
  });

  it("blocks official-form readiness when a position likely needs disclosure handling", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Disclosure LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-income",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income-1", "doc-income-2"],
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
        status: "complete" as const,
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 15000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: ["tax-income"],
            sourceDocumentIds: ["doc-income-1", "doc-income-2"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        items: [],
      },
      appendix: {
        ...createDefaultTinaWorkspaceDraft().appendix,
        status: "complete" as const,
        items: [
          {
            id: "appendix-1",
            title: "Aggressive state position",
            summary: "Potentially usable with disclosure",
            whyItMatters: "Could reduce tax if support holds",
            taxPositionBucket: "appendix" as const,
            category: "position",
            nextStep: "Review it",
            authoritySummary: "Credible but needs explicit disclosure handling",
            reviewerQuestion: "Should this move forward with disclosure?",
            disclosureFlag: "required",
            authorityTargets: ["State guidance"],
            sourceLabels: [],
            factIds: ["fact-income"],
            documentIds: ["doc-income-1"],
          },
        ],
      },
    };

    const readiness = buildTinaFormReadiness(draft);

    expect(readiness.level).toBe("not_ready");
    expect(readiness.reasons.some((reason) => reason.id.startsWith("disclosure-"))).toBe(true);
  });
});
