import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaReturnPackageArtifacts } from "@/tina/lib/return-package-artifacts";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("return-package-artifacts", () => {
  it("carries companion-form field payloads into rendered return artifacts", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Artifact Ready LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
      },
      documents: [
        {
          id: "doc-income",
          name: "income-summary.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/income.pdf",
          category: "supporting_document" as const,
          requestId: "income",
          requestLabel: "Income summary",
          uploadedAt: "2026-04-03T12:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-income",
          sourceDocumentId: "doc-income",
          label: "Income support",
          value: "Gross receipts support is complete.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T12:02:00.000Z",
        },
      ],
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
            summary: "Ready",
            sourceDocumentIds: ["doc-income"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
          },
        ],
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 22000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-income"],
          },
        ],
        notes: [],
      },
    };

    const snapshot = buildTinaReturnPackageArtifacts(draft);
    const scheduleCArtifact = snapshot.renderedForms.find((item) => item.formId === "f1040sc");
    const form1040Artifact = snapshot.renderedForms.find((item) => item.formId === "f1040");
    const scheduleSEArtifact = snapshot.renderedForms.find((item) => item.formId === "f1040sse");

    expect(scheduleCArtifact?.renderMode).toBe("official_blank_fill_ready");
    expect(scheduleCArtifact?.downloadPath).toBe("/api/tina/rendered-form?formId=f1040sc");
    expect(form1040Artifact?.renderMode).toBe("official_blank_fill_ready");
    expect(form1040Artifact?.status).toBe("ready");
    expect(form1040Artifact?.downloadPath).toBe("/api/tina/rendered-form?formId=f1040");
    expect(form1040Artifact?.directPdfFieldCount).toBeGreaterThan(0);
    expect(form1040Artifact?.appendixFieldCount).toBe(0);
    expect(form1040Artifact?.fieldValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Schedule C line 31 carryover amount",
        }),
      ])
    );
    expect(scheduleSEArtifact?.renderMode).toBe("official_blank_fill_ready");
    expect(scheduleSEArtifact?.downloadPath).toBe("/api/tina/rendered-form?formId=f1040sse");
    expect(scheduleSEArtifact?.directPdfFieldCount).toBeGreaterThan(0);
    expect(scheduleSEArtifact?.appendixFieldCount).toBe(0);
    expect(scheduleSEArtifact?.fieldValues.length).toBeGreaterThan(0);
  });

  it("carries explicit entity-return package items for non-Schedule-C lanes", () => {
    const snapshot = buildTinaReturnPackageArtifacts(
      TINA_SKILL_REVIEW_DRAFTS["uneven-multi-owner"]
    );

    expect(snapshot.entityPackageItems.some((item) => item.formId === "f1065")).toBe(true);
    expect(
      snapshot.entityPackageItems.some((item) => /schedule k-1/i.test(item.title))
    ).toBe(true);
    expect(
      snapshot.entitySupportArtifacts.some((item) => item.kind === "k1_package")
    ).toBe(true);
    expect(
      snapshot.entityScheduleFamilyArtifacts.some((item) => item.kind === "schedule_k1_family")
    ).toBe(true);
    expect(
      snapshot.entityScheduleFamilyFinalizationArtifacts.some(
        (item) => item.kind === "schedule_k1_family"
      )
    ).toBe(true);
    expect(
      snapshot.entityScheduleFamilyPayloadArtifacts.some(
        (item) => item.kind === "schedule_k1_family"
      )
    ).toBe(true);
  });

  it("carries a provisional rendered 1065 artifact once reviewer-controlled partnership values exist", () => {
    const snapshot = buildTinaReturnPackageArtifacts(
      TINA_SKILL_REVIEW_DRAFTS["uneven-multi-owner"]
    );
    const form1065Artifact = snapshot.renderedForms.find((item) => item.formId === "f1065");

    expect(form1065Artifact?.status).toBe("blocked");
    expect(form1065Artifact?.renderMode).toBe("companion_preview");
    expect(form1065Artifact?.appendixFieldCount).toBeGreaterThan(0);
    expect(form1065Artifact?.fieldValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Likely partner count",
          value: "2",
        }),
      ])
    );
    expect(snapshot.entitySupportArtifacts.some((item) => item.status === "blocked")).toBe(true);
    expect(
      snapshot.entityScheduleFamilyArtifacts.some((item) => item.kind === "schedule_l_family")
    ).toBe(true);
    expect(
      snapshot.entityScheduleFamilyFinalizationArtifacts.some(
        (item) => item.kind === "schedule_l_family"
      )
    ).toBe(true);
    expect(
      snapshot.entityScheduleFamilyPayloadArtifacts.some(
        (item) => item.kind === "schedule_l_family"
      )
    ).toBe(true);
  });
});
