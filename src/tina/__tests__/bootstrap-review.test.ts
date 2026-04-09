import { describe, expect, it } from "vitest";
import {
  buildTinaBootstrapReview,
  createDefaultTinaBootstrapReview,
  markTinaBootstrapReviewStale,
} from "@/tina/lib/bootstrap-review";
import { buildTinaProfileFingerprint } from "@/tina/lib/profile-fingerprint";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaBootstrapReview", () => {
  it("creates blocking items when setup answers are still missing", () => {
    const draft = createDefaultTinaWorkspaceDraft();

    const review = buildTinaBootstrapReview(draft);

    expect(review.status).toBe("complete");
    expect(review.profileFingerprint).toBe(buildTinaProfileFingerprint(draft.profile));
    expect(review.items.some((item) => item.severity === "blocking")).toBe(true);
    expect(review.summary).toContain("must be fixed");
  });

  it("creates a calmer summary when the supported lane is ready and key papers are present", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      priorReturnDocumentId: "doc-prior",
      documents: [
        {
          id: "doc-prior",
          name: "2024 return.pdf",
          size: 1500,
          mimeType: "application/pdf",
          storagePath: "user/2025/doc-prior.pdf",
          category: "prior_return" as const,
          requestId: "prior-return",
          requestLabel: "Last year's tax return",
          uploadedAt: "2026-03-26T21:00:00.000Z",
        },
        {
          id: "doc-qb",
          name: "profit-loss.xlsx",
          size: 2500,
          mimeType: "application/vnd.ms-excel",
          storagePath: "user/2025/doc-qb.xlsx",
          category: "supporting_document" as const,
          requestId: "profit-loss",
          requestLabel: "Full-year profit and loss",
          uploadedAt: "2026-03-26T21:01:00.000Z",
        },
        {
          id: "doc-bank",
          name: "bank.pdf",
          size: 3500,
          mimeType: "application/pdf",
          storagePath: "user/2025/doc-bank.pdf",
          category: "supporting_document" as const,
          requestId: "bank-support",
          requestLabel: "Business bank and card statements",
          uploadedAt: "2026-03-26T21:02:00.000Z",
        },
        {
          id: "doc-ledger",
          name: "general-ledger.csv",
          size: 2600,
          mimeType: "text/csv",
          storagePath: "user/2025/doc-ledger.csv",
          category: "supporting_document" as const,
          requestId: "general-ledger",
          requestLabel: "General ledger export",
          uploadedAt: "2026-03-26T21:03:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-prior",
          status: "complete" as const,
          kind: "pdf" as const,
          summary: "This prior return is readable and ready for continuity checks.",
          nextStep: "Tina can compare this against the current year.",
          detailLines: ["Prior-year return package found."],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-03-26T21:06:00.000Z",
        },
        {
          documentId: "doc-qb",
          status: "complete" as const,
          kind: "spreadsheet" as const,
          summary: "This looks like the money report Tina can use to start the numbers side of your taxes.",
          nextStep: "Tina can use this structured paper in the next extraction step and compare it against your other records.",
          detailLines: ["1 sheet found in this file."],
          rowCount: 20,
          headers: ["Account", "Amount"],
          sheetNames: ["Sheet1"],
          lastReadAt: "2026-03-26T21:07:00.000Z",
        },
      ],
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
        naicsCode: "landscaping",
      },
    };

    const review = buildTinaBootstrapReview(draft);

    expect(review.items.some((item) => item.severity === "blocking")).toBe(false);
    expect(review.facts.some((fact) => fact.id === "prior-return")).toBe(true);
    expect(
      review.facts.some(
        (fact) =>
          fact.label === "Full-year profit and loss" &&
          fact.source === "document_vault"
      )
    ).toBe(true);
    expect(review.summary).toContain("basics");
  });

  it("flags a business name mismatch between organizer answers and saved paper facts", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      sourceFacts: [
        {
          id: "source-1",
          sourceDocumentId: "doc-prior",
          label: "Business name",
          value: "Different Business LLC",
          confidence: "high" as const,
          capturedAt: "2026-03-26T21:20:00.000Z",
        },
      ],
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
      },
    };

    const review = buildTinaBootstrapReview(draft);

    expect(
      review.items.some((item) => item.id === "business-name-mismatch" && item.severity === "needs_attention")
    ).toBe(true);
  });
});

describe("markTinaBootstrapReviewStale", () => {
  it("marks a completed review stale when Tina inputs change", () => {
    const review = {
      ...createDefaultTinaBootstrapReview(),
      status: "complete" as const,
      summary: "Old summary",
      nextStep: "Old step",
    };

    const stale = markTinaBootstrapReviewStale(review);

    expect(stale.status).toBe("stale");
    expect(stale.summary).toContain("changed");
  });
});
