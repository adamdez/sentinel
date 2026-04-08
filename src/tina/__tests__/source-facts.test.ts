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

  it("normalizes richer AI fact values before they reach downstream Tina layers", () => {
    const document: TinaStoredDocument = {
      id: "doc-2",
      name: "asset-schedule.pdf",
      size: 2048,
      mimeType: "application/pdf",
      storagePath: "user/2025/doc-2.pdf",
      category: "supporting_document",
      requestId: "assets",
      requestLabel: "Asset schedule",
      uploadedAt: "2026-03-26T21:20:00.000Z",
    };

    const reading: TinaDocumentReading = {
      documentId: document.id,
      status: "complete",
      kind: "pdf",
      summary: "Useful deeper facts.",
      nextStep: "Review them.",
      facts: [
        { id: "ownership", label: "Ownership percentage clue", value: "Owner interest: 50.0 %", confidence: "high" },
        { id: "carryover", label: "Carryover amount clue", value: "Carryover loss of $ 1,250.00", confidence: "medium" },
        { id: "pis", label: "Asset placed-in-service clue", value: "March 3, 2025", confidence: "medium" },
      ],
      detailLines: [],
      rowCount: null,
      headers: [],
      sheetNames: [],
      lastReadAt: "2026-03-26T21:20:00.000Z",
    };

    const sourceFacts = deriveTinaSourceFactsFromReading(document, reading);

    expect(sourceFacts.find((fact) => fact.label === "Ownership percentage clue")?.value).toBe("50.0%");
    expect(sourceFacts.find((fact) => fact.label === "Carryover amount clue")?.value).toBe("$1,250.00");
    expect(sourceFacts.find((fact) => fact.label === "Asset placed-in-service clue")?.value).toBe("2025-03-03");
  });
});
