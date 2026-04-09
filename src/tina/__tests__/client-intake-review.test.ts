import { describe, expect, it } from "vitest";
import { buildTinaClientIntakeReviewReport } from "@/tina/lib/client-intake-review";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaWorkspaceDraft } from "@/tina/types";

function buildDraft(overrides?: Partial<TinaWorkspaceDraft>): TinaWorkspaceDraft {
  return {
    ...createDefaultTinaWorkspaceDraft(),
    ...overrides,
    profile: {
      ...createDefaultTinaWorkspaceDraft().profile,
      ...(overrides?.profile ?? {}),
    },
  };
}

describe("buildTinaClientIntakeReviewReport", () => {
  it("blocks when the packet points to an unsupported 1120-S lane", () => {
    const draft = buildDraft({
      profile: {
        businessName: "North Ridge Home Services LLC",
        taxYear: "2025",
        entityType: "s_corp",
      },
      sourceFacts: [
        {
          id: "return-type-hint-1",
          sourceDocumentId: "prior-doc",
          label: "Return type hint",
          value: "1120-S",
          confidence: "high",
          capturedAt: "2026-04-08T18:00:00.000Z",
        },
      ],
      documents: [
        {
          id: "prior-doc",
          name: "prior-year-return.csv",
          size: 1200,
          mimeType: "text/csv",
          storagePath: "local/prior-year-return.csv",
          category: "prior_return",
          requestId: "prior-return",
          requestLabel: "Prior-year filed return",
          uploadedAt: "2026-04-08T18:00:00.000Z",
        },
      ],
    });

    const report = buildTinaClientIntakeReviewReport(draft);

    expect(report.status).toBe("blocked");
    expect(report.likelyLaneByDocuments).toBe("1120_s");
    expect(report.blockers.some((item) => item.id === "intake-lane-support")).toBe(true);
  });

  it("surfaces missing required intake support and messy signals for the current lane", () => {
    const draft = buildDraft({
      profile: {
        businessName: "Simple Shell LLC",
        taxYear: "2025",
        entityType: "single_member_llc",
        hasPayroll: true,
      },
      sourceFacts: [
        {
          id: "payroll-clue-1",
          sourceDocumentId: "gl-doc",
          label: "Payroll clue",
          value: "Monthly payroll",
          confidence: "high",
          capturedAt: "2026-04-08T18:00:00.000Z",
        },
      ],
      documents: [
        {
          id: "gl-doc",
          name: "gl.csv",
          size: 1200,
          mimeType: "text/csv",
          storagePath: "local/gl.csv",
          category: "supporting_document",
          requestId: "general-ledger",
          requestLabel: "General ledger export",
          uploadedAt: "2026-04-08T18:00:00.000Z",
        },
        {
          id: "bank-doc",
          name: "bank.csv",
          size: 1200,
          mimeType: "text/csv",
          storagePath: "local/bank.csv",
          category: "supporting_document",
          requestId: "bank-support",
          requestLabel: "Business bank statements",
          uploadedAt: "2026-04-08T18:00:00.000Z",
        },
      ],
    });

    const report = buildTinaClientIntakeReviewReport(draft);

    expect(report.status).toBe("blocked");
    expect(report.missingRequired.some((item) => item.id === "prior-return")).toBe(true);
    expect(report.missingRequired.some((item) => item.id === "profit-loss")).toBe(true);
    expect(report.missingRequired.some((item) => item.id === "payroll")).toBe(true);
    expect(report.messySignals.some((item) => item.id === "payroll")).toBe(true);
  });
});
