import { describe, expect, it } from "vitest";
import { buildTinaIndustryEvidenceMatrix } from "@/tina/lib/industry-evidence-matrix";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("industry-evidence-matrix", () => {
  it("tracks covered and missing industry-specific records", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Trade LLC",
        taxYear: "2025",
        principalBusinessActivity: "Electrical contractor",
        naicsCode: "238210",
        entityType: "sole_prop" as const,
      },
      documents: [
        {
          id: "doc-vehicle",
          name: "vehicle-log.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/vehicle-log.pdf",
          category: "supporting_document" as const,
          requestId: "vehicle",
          requestLabel: "Vehicle log",
          uploadedAt: "2026-04-03T09:00:00.000Z",
        },
        {
          id: "doc-worker",
          name: "subcontractor-agreement.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/subcontractor-agreement.pdf",
          category: "supporting_document" as const,
          requestId: "worker",
          requestLabel: "Worker agreement",
          uploadedAt: "2026-04-03T09:01:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-contractor",
          sourceDocumentId: "doc-worker",
          label: "Contractor clue",
          value: "Subcontractor support and worker agreement are present.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T09:02:00.000Z",
        },
      ],
    };

    const matrix = buildTinaIndustryEvidenceMatrix(draft);

    expect(matrix.primaryIndustryId).toBe("skilled_trades");
    expect(matrix.items.some((item) => item.requirement.includes("Vehicle logs"))).toBe(true);
    expect(
      matrix.items.find((item) => item.requirement.includes("Vehicle logs"))?.matchedDocumentIds
    ).toContain("doc-vehicle");
    expect(matrix.overallStatus).toBe("missing");
  });
});
