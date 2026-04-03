import { describe, expect, it } from "vitest";
import { buildTinaBooksNormalization } from "@/tina/lib/books-normalization";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("books-normalization", () => {
  it("flags owner-flow, mixed-use, and multi-entity normalization risks", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      sourceFacts: [
        {
          id: "owner-flow",
          sourceDocumentId: "doc-owner",
          label: "Owner draw clue",
          value: "Owner draw transfer",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:00:00.000Z",
        },
        {
          id: "mixed-use",
          sourceDocumentId: "doc-card",
          label: "Mixed personal/business clue",
          value: "Personal and business charges are mixed",
          confidence: "medium" as const,
          capturedAt: "2026-03-27T05:01:00.000Z",
        },
        {
          id: "ein-a",
          sourceDocumentId: "doc-ein-a",
          label: "EIN clue",
          value: "12-3456789",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:02:00.000Z",
        },
        {
          id: "ein-b",
          sourceDocumentId: "doc-ein-b",
          label: "EIN clue",
          value: "98-7654321",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:03:00.000Z",
        },
      ],
    };

    const normalization = buildTinaBooksNormalization(draft);

    expect(normalization.status).toBe("complete");
    expect(normalization.issues.some((issue) => issue.id === "owner-flow-normalization")).toBe(
      true
    );
    expect(normalization.issues.some((issue) => issue.id === "mixed-use-normalization")).toBe(
      true
    );
    expect(normalization.issues.some((issue) => issue.id === "multi-entity-normalization")).toBe(
      true
    );
  });
});
