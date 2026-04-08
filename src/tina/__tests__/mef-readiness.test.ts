import { describe, expect, it } from "vitest";
import { buildTinaMefReadinessReport } from "@/tina/lib/mef-readiness";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaMefReadinessReport", () => {
  it("blocks unsupported non-Schedule C lanes", () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "Entity Inc",
        entityType: "s_corp" as const,
      },
    };

    const report = buildTinaMefReadinessReport(draft);

    expect(report.status).toBe("blocked");
    expect(report.checks.find((check) => check.id === "mef_lane")?.status).toBe("blocked");
  });

  it("builds an MeF-aligned 1040 Schedule C handoff with attachment guidance", () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "Ready Review LLC",
        taxYear: "2025",
        entityType: "single_member_llc" as const,
      },
      documents: [
        {
          id: "prior-doc",
          name: "2024-return.pdf",
          size: 1300,
          mimeType: "application/pdf",
          storagePath: "tina/2024-return.pdf",
          category: "prior_return" as const,
          requestId: "prior-return",
          requestLabel: "Last year's return",
          uploadedAt: "2026-04-07T07:59:00.000Z",
        },
        {
          id: "support-doc",
          name: "asset-support.pdf",
          size: 900,
          mimeType: "application/pdf",
          storagePath: "tina/asset-support.pdf",
          category: "supporting_document" as const,
          requestId: "asset-support",
          requestLabel: "Asset support",
          uploadedAt: "2026-04-07T08:00:00.000Z",
        },
      ],
      scheduleCDraft: {
        ...baseDraft.scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-1",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "ready" as const,
            summary: "Supported.",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["support-doc"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...baseDraft.packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        summary: "Ready",
      },
    };

    const report = buildTinaMefReadinessReport(draft);

    expect(report.status).toBe("ready_for_mef_handoff");
    expect(report.returnType).toBe("1040");
    expect(report.schedules).toEqual(["Schedule C"]);
    expect(report.attachments.find((item) => item.documentId === "support-doc")?.disposition).toBe(
      "binary_attachment_candidate"
    );
    expect(report.attachments.find((item) => item.documentId === "support-doc")?.mefFileName).toContain(
      ".pdf"
    );
  });

  it("keeps non-PDF source papers as support-only instead of pretending they are binary attachments", () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "Ready Review LLC",
        taxYear: "2025",
        entityType: "single_member_llc" as const,
      },
      documents: [
        {
          id: "doc-1",
          name: "qb-export.csv",
          size: 1200,
          mimeType: "text/csv",
          storagePath: "tina/qb-export.csv",
          category: "supporting_document" as const,
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-04-07T08:00:00.000Z",
        },
      ],
      scheduleCDraft: {
        ...baseDraft.scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-1",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "ready" as const,
            summary: "Supported.",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...baseDraft.packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        summary: "Ready",
      },
    };

    const report = buildTinaMefReadinessReport(draft);

    expect(report.status).toBe("ready_for_mef_handoff");
    expect(report.checks.find((check) => check.id === "binary_attachments")?.status).toBe("ready");
    expect(report.attachments[0]?.disposition).toBe("support_only");
  });
});
