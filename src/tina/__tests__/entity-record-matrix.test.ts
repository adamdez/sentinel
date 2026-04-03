import { describe, expect, it } from "vitest";
import { buildTinaEntityRecordMatrix } from "@/tina/lib/entity-record-matrix";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("entity-record-matrix", () => {
  it("maps required partnership records and shows where coverage is still thin", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Partnership Matrix LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "multi_member_llc" as const,
        ownerCount: 2,
      },
      documents: [
        {
          id: "doc-operating",
          name: "operating-agreement.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/operating-agreement.pdf",
          category: "supporting_document" as const,
          requestId: "ownership",
          requestLabel: "Operating agreement",
          uploadedAt: "2026-04-03T08:00:00.000Z",
        },
        {
          id: "doc-trial-balance",
          name: "trial-balance.xlsx",
          size: 100,
          mimeType: "application/vnd.ms-excel",
          storagePath: "tina/trial-balance.xlsx",
          category: "supporting_document" as const,
          requestId: "books",
          requestLabel: "Trial balance",
          uploadedAt: "2026-04-03T08:01:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-1065",
          sourceDocumentId: "doc-operating",
          label: "Return type clue",
          value: "Form 1065 partnership return and K-1 references appear in the papers.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:02:00.000Z",
        },
        {
          id: "fact-owners",
          sourceDocumentId: "doc-operating",
          label: "Ownership breakdown clue",
          value: "Operating agreement shows partner percentages and member split.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:03:00.000Z",
        },
        {
          id: "fact-books",
          sourceDocumentId: "doc-trial-balance",
          label: "Books clue",
          value: "Trial balance and balance sheet support are available.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:04:00.000Z",
        },
      ],
    };

    const matrix = buildTinaEntityRecordMatrix(draft);

    expect(matrix.laneId).toBe("1065");
    expect(matrix.items.find((item) => item.id === "partnership-ownership")?.status).toBe("covered");
    expect(matrix.items.find((item) => item.id === "partnership-books")?.status).toBe("covered");
    expect(matrix.items.find((item) => item.id === "partnership-capital")?.status).toBe("partial");
    expect(matrix.overallStatus).toBe("partial");
    expect(matrix.items.some((item) => item.status === "partial")).toBe(true);
  });
});
