import { describe, expect, it } from "vitest";
import { buildTinaScheduleCPdfExport } from "@/tina/lib/schedule-c-pdf";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaScheduleCPdfExport", () => {
  it("builds a printable pdf export for the supported lane", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
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
            amount: 22000,
            status: "ready" as const,
            summary: "Approved income",
            sourceDocumentIds: ["doc-income"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: ["ai-income"],
            cleanupSuggestionIds: ["cleanup-income"],
            taxAdjustmentIds: ["tax-income"],
          },
          {
            id: "rf-expense",
            kind: "expense" as const,
            layer: "reviewer_final" as const,
            label: "Business expense candidate",
            amount: 4000,
            status: "ready" as const,
            summary: "Approved expense",
            sourceDocumentIds: ["doc-expense"],
            sourceFactIds: ["fact-expense"],
            issueIds: [],
            derivedFromLineIds: ["ai-expense"],
            cleanupSuggestionIds: ["cleanup-expense"],
            taxAdjustmentIds: ["tax-expense"],
          },
        ],
      },
    };

    const exportFile = buildTinaScheduleCPdfExport(draft);
    expect(exportFile.mimeType).toBe("application/pdf");
    expect(exportFile.fileName).toContain("tina-sole-prop");
    expect(exportFile.bytes[0]).toBe(37); // %
    expect(exportFile.renderMode).toBe("tina_schedule_c_draft");
    expect(exportFile.officialTemplateId).toBe("f1040sc");
    expect(exportFile.snapshot.fields.find((field) => field.formKey === "netProfitOrLoss")?.amount)
      .toBe(18000);
  });

  it("marks blocked non-schedule-c routes as filing-path notices instead of quiet schedule c drafts", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Hydra Exit Partners LLC",
        taxYear: "2025",
        principalBusinessActivity: "Liquidation consulting",
        naicsCode: "541611",
        entityType: "multi_member_llc" as const,
        ownerCount: 3,
        hasOwnershipChangeDuringYear: true,
        hasOwnerBuyoutOrRedemption: true,
        hasFormerOwnerPayments: true,
      },
      sourceFacts: [
        {
          id: "paper-hint-1065",
          sourceDocumentId: "doc-1065",
          label: "Return hint",
          value: "Form 1065 partnership return draft",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:00:00.000Z",
        },
      ],
    };

    const exportFile = buildTinaScheduleCPdfExport(draft);
    const decoded = new TextDecoder().decode(exportFile.bytes);

    expect(exportFile.fileName).toContain("start-path-blocked");
    expect(exportFile.renderMode).toBe("blocked_route_notice");
    expect(exportFile.officialTemplateId).toBe("f1065");
    expect(decoded).toContain("Tina Filing Path Blocked Notice");
    expect(decoded).toContain("This is not a Schedule C form draft.");
    expect(decoded).toContain("Official blank form foundation stored locally: 2025 Form 1065.");
    expect(decoded).toContain("Route: blocked");
    expect(decoded).toContain("Start path blocks Schedule C return output");
  });
});
