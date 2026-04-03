import { describe, expect, it } from "vitest";
import { buildTinaEvidenceSufficiency } from "@/tina/lib/evidence-sufficiency";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("evidence-sufficiency", () => {
  it("blocks thinly supported non-zero lines", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaEvidenceSufficiency({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Thin Proof Sole Prop",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop",
      },
      documents: [
        {
          id: "doc-bank",
          name: "bank-statement.pdf",
          size: 120,
          mimeType: "application/pdf",
          storagePath: "tina/bank-statement.pdf",
          category: "supporting_document",
          requestId: "bank-statements",
          requestLabel: "Bank statements",
          uploadedAt: "2026-04-02T11:00:00.000Z",
        },
      ],
      reviewerFinal: {
        ...base.reviewerFinal,
        lines: [
          {
            id: "rf-income",
            kind: "income",
            layer: "reviewer_final",
            label: "Gross receipts",
            amount: 16000,
            status: "ready",
            summary: "Income line mapped from one thin proof source.",
            sourceDocumentIds: ["doc-bank"],
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
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 16000,
            status: "ready",
            summary: "Mapped from one bank statement.",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-bank"],
          },
        ],
        notes: [],
      },
    });

    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.counts.weak).toBeGreaterThan(0);
    expect(snapshot.issues.some((issue) => issue.id.startsWith("line-"))).toBe(true);
  });

  it("reaches reviewer-grade when mapped lines have deeper direct and underlying support", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaEvidenceSufficiency({
      ...base,
      profile: {
        ...base.profile,
        businessName: "Deep Proof Sole Prop",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop",
      },
      documents: [
        {
          id: "doc-pl",
          name: "profit-and-loss.csv",
          size: 80,
          mimeType: "text/csv",
          storagePath: "tina/profit-and-loss.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "Books export",
          uploadedAt: "2026-04-02T11:05:00.000Z",
        },
        {
          id: "doc-bank",
          name: "bank-statement.pdf",
          size: 120,
          mimeType: "application/pdf",
          storagePath: "tina/bank-statement.pdf",
          category: "supporting_document",
          requestId: "bank-statements",
          requestLabel: "Bank statements",
          uploadedAt: "2026-04-02T11:05:30.000Z",
        },
      ],
      reviewerFinal: {
        ...base.reviewerFinal,
        lines: [
          {
            id: "rf-income",
            kind: "income",
            layer: "reviewer_final",
            label: "Gross receipts",
            amount: 22000,
            status: "ready",
            summary: "Income line with deep support.",
            sourceDocumentIds: ["doc-pl", "doc-bank"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
        ],
      },
      sourceFacts: [
        {
          id: "fact-income",
          sourceDocumentId: "doc-pl",
          label: "Income fact",
          value: "Gross receipts total to 22000.",
          confidence: "high",
          capturedAt: "2026-04-02T11:06:00.000Z",
        },
      ],
      scheduleCDraft: {
        ...base.scheduleCDraft,
        status: "complete",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 22000,
            status: "ready",
            summary: "Mapped from books and bank support.",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-pl", "doc-bank"],
          },
        ],
        notes: [],
      },
    });

    expect(snapshot.overallStatus).toBe("reviewer_grade");
    expect(snapshot.counts.strong).toBeGreaterThan(0);
    expect(snapshot.issues).toHaveLength(0);
  });
});
