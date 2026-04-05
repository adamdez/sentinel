import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaAccountingArtifactCoverage } from "@/tina/lib/accounting-artifact-coverage";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("accounting-artifact-coverage", () => {
  it("flags missing ownership records as critical on wild multi-owner files", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Wild Ownership LLC",
        entityType: "multi_member_llc" as const,
        ownerCount: 3,
        ownershipChangedDuringYear: true,
        hasOwnerBuyoutOrRedemption: true,
      },
    };

    const snapshot = buildTinaAccountingArtifactCoverage(draft);
    const ownershipRecords = snapshot.items.find((item) => item.id === "ownership-records");

    expect(snapshot.overallStatus).toBe("missing");
    expect(ownershipRecords?.criticality).toBe("critical");
    expect(ownershipRecords?.status).toBe("missing");
  });

  it("credits live books plus matching support for core accounting artifacts", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Books Covered LLC",
        entityType: "sole_prop" as const,
      },
      documents: [
        {
          id: "doc-bank",
          name: "Business bank statement.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/bank.pdf",
          category: "supporting_document" as const,
          requestId: "bank-support",
          requestLabel: "Bank support",
          uploadedAt: "2026-04-03T10:00:00.000Z",
        },
        {
          id: "doc-pnl",
          name: "Profit and loss.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/pnl.csv",
          category: "supporting_document" as const,
          requestId: "pnl",
          requestLabel: "Profit and loss",
          uploadedAt: "2026-04-03T10:01:00.000Z",
        },
        {
          id: "doc-gl",
          name: "General ledger export.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "tina/gl.csv",
          category: "supporting_document" as const,
          requestId: "gl",
          requestLabel: "General ledger",
          uploadedAt: "2026-04-03T10:02:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-bank",
          sourceDocumentId: "doc-bank",
          label: "Bank statement support",
          value: "Business bank statement supports income and expenses.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T10:03:00.000Z",
        },
        {
          id: "fact-pnl",
          sourceDocumentId: "doc-pnl",
          label: "Profit and loss support",
          value: "QuickBooks profit and loss supports year totals.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T10:04:00.000Z",
        },
        {
          id: "fact-gl",
          sourceDocumentId: "doc-gl",
          label: "General ledger support",
          value: "Ledger detail supports transaction-level review.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T10:05:00.000Z",
        },
      ],
      quickBooksConnection: {
        ...createDefaultTinaWorkspaceDraft().quickBooksConnection,
        status: "connected" as const,
        companyName: "Books Covered LLC",
        importedDocumentIds: ["doc-pnl", "doc-gl"],
      },
    };

    const snapshot = buildTinaAccountingArtifactCoverage(draft);

    expect(snapshot.items.find((item) => item.id === "bank-statements")?.status).toBe("covered");
    expect(snapshot.items.find((item) => item.id === "profit-and-loss")?.status).toBe("covered");
    expect(snapshot.items.find((item) => item.id === "general-ledger")?.status).toBe("covered");
  });

  it("keeps supported-core coverage focused on core accounting artifacts even when industry asks remain open", () => {
    const snapshot = buildTinaAccountingArtifactCoverage(TINA_SKILL_REVIEW_DRAFTS["supported-core"]);

    expect(snapshot.overallStatus).toBe("covered");
    expect(snapshot.items.some((item) => item.id.startsWith("industry-"))).toBe(true);
    expect(snapshot.items.find((item) => item.id === "bank-statements")?.status).toBe("covered");
  });
});
