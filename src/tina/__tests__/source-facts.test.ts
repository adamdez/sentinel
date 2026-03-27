import { describe, expect, it } from "vitest";
import { deriveTinaSourceFactsFromReading } from "@/tina/lib/source-facts";
import type { TinaDocumentReading, TinaStoredDocument } from "@/tina/types";

describe("deriveTinaSourceFactsFromReading", () => {
  it("keeps meaningful extracted facts and drops spreadsheet bookkeeping facts", () => {
    const document: TinaStoredDocument = {
      id: "doc-1",
      name: "2024-return.pdf",
      size: 2048,
      mimeType: "application/pdf",
      storagePath: "user/2025/doc-1.pdf",
      category: "prior_return",
      requestId: "prior-return",
      requestLabel: "Last year's tax return",
      uploadedAt: "2026-03-26T21:20:00.000Z",
    };

    const reading: TinaDocumentReading = {
      documentId: document.id,
      status: "complete",
      kind: "pdf",
      summary: "Tina found a few useful facts in this return.",
      nextStep: "Review the facts before deeper prep starts.",
      facts: [
        { id: "paper-type", label: "Paper type", value: "PDF", confidence: "high" },
        { id: "business-name", label: "Business name", value: "Tina Test LLC", confidence: "high" },
      ],
      detailLines: [],
      rowCount: null,
      headers: [],
      sheetNames: [],
      lastReadAt: "2026-03-26T21:20:00.000Z",
    };

    const sourceFacts = deriveTinaSourceFactsFromReading(document, reading);

    expect(sourceFacts).toHaveLength(1);
    expect(sourceFacts[0]?.label).toBe("Business name");
  });
});
