import { describe, expect, it } from "vitest";
import {
  buildTinaScheduleCExportContract,
  buildTinaScheduleCExportContractFile,
} from "@/tina/lib/schedule-c-export-contract";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaScheduleCExportContract", () => {
  it("builds a ready-for-mapping contract for a clean supported Schedule C packet", () => {
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
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["adj-1"],
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
        items: [],
      },
      reviewerFinal: {
        ...baseDraft.reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-1",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 18000,
            status: "ready" as const,
            summary: "Ready.",
            sourceDocumentIds: ["support-doc"],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["adj-1"],
          },
        ],
      },
    };

    const contract = buildTinaScheduleCExportContract(draft);

    expect(contract.status).toBe("ready_for_mapping");
    expect(contract.returnType).toBe("1040");
    expect(contract.schedules).toEqual(["Schedule C"]);
    expect(contract.fields[0]?.lineNumber).toBe("Line 1");
    expect(contract.attachmentManifest[0]?.disposition).toBe("binary_attachment_candidate");
  });

  it("keeps the export contract in review when unresolved issues remain", () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "Review Needed LLC",
        taxYear: "2025",
        entityType: "single_member_llc" as const,
      },
      scheduleCDraft: {
        ...baseDraft.scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-31",
            lineNumber: "Line 31",
            label: "Tentative net profit or loss",
            amount: 10000,
            status: "needs_attention" as const,
            summary: "Needs continuity review.",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: [],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        ...baseDraft.packageReadiness,
        status: "complete" as const,
        level: "needs_review" as const,
        items: [
          {
            id: "continuity-review-missing",
            title: "Continuity review missing",
            summary: "Carryover continuity is still open.",
            severity: "needs_attention" as const,
            relatedFieldIds: ["line-31"],
            relatedNoteIds: [],
            relatedReviewItemIds: [],
            sourceDocumentIds: [],
          },
        ],
      },
    };

    const contract = buildTinaScheduleCExportContract(draft);

    expect(contract.status).toBe("needs_review");
    expect(contract.unresolvedIssues).toHaveLength(1);
    expect(contract.fields[0]?.status).toBe("needs_attention");
  });

  it("exports the contract as JSON for CPA software mapping", () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "Json Export LLC",
        taxYear: "2025",
        entityType: "single_member_llc" as const,
      },
    };

    const file = buildTinaScheduleCExportContractFile(draft);

    expect(file.fileName).toContain("json-export-llc");
    expect(file.fileName).toContain("2025");
    expect(file.mimeType).toContain("application/json");
    expect(file.contents).toContain("\"contractVersion\": \"tina.schedule_c_export.v1\"");
  });
});
