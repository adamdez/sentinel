import { describe, expect, it } from "vitest";
import { buildTinaEntityReturnRunbook } from "@/tina/lib/entity-return-runbook";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("entity-return-runbook", () => {
  it("keeps the supported Schedule C lane on a Tina-supported execution path when records are clean", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Runbook Sole Prop LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
        ownerCount: 1,
      },
      documents: [
        {
          id: "doc-return",
          name: "prior-return-schedule-c.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/prior-return-schedule-c.pdf",
          category: "prior_return" as const,
          requestId: "prior-return",
          requestLabel: "Prior return package",
          uploadedAt: "2026-04-03T08:00:00.000Z",
        },
        {
          id: "doc-books",
          name: "quickbooks-profit-loss.xlsx",
          size: 100,
          mimeType: "application/vnd.ms-excel",
          storagePath: "tina/quickbooks-profit-loss.xlsx",
          category: "supporting_document" as const,
          requestId: "books",
          requestLabel: "QuickBooks books",
          uploadedAt: "2026-04-03T08:01:00.000Z",
        },
        {
          id: "doc-bank",
          name: "bank-statement.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/bank-statement.pdf",
          category: "supporting_document" as const,
          requestId: "bank-support",
          requestLabel: "Bank support",
          uploadedAt: "2026-04-03T08:02:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-return",
          sourceDocumentId: "doc-return",
          label: "Return type clue",
          value: "Schedule C and Form 1040 references are visible in the prior return.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:03:00.000Z",
        },
        {
          id: "fact-books",
          sourceDocumentId: "doc-books",
          label: "Books clue",
          value: "QuickBooks profit and loss and ledger support are available.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:04:00.000Z",
        },
        {
          id: "fact-bank",
          sourceDocumentId: "doc-bank",
          label: "Bank support clue",
          value: "Bank statement support is available for business-only deposits and charges.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:05:00.000Z",
        },
      ],
    };

    const runbook = buildTinaEntityReturnRunbook(draft);

    expect(runbook.executionMode).toBe("tina_supported");
    expect(runbook.overallStatus).toBe("ready");
    expect(runbook.steps.find((step) => step.id === "assemble-return-family")?.status).toBe("ready");
  });
});
