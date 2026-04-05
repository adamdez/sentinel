import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaOfficialFormRenderPlan } from "@/tina/lib/official-form-render-plan";
import { renderTinaOfficialFormArtifact } from "@/tina/lib/official-form-render-server";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

function createRenderReadyDraft() {
  const baseDraft = createDefaultTinaWorkspaceDraft();

  return {
    ...baseDraft,
    profile: {
      ...baseDraft.profile,
      businessName: "Rendered Blank LLC",
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
      ...baseDraft.reviewerFinal,
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
      ...baseDraft.scheduleCDraft,
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
}

function createAttachmentRenderDraft() {
  const baseDraft = createDefaultTinaWorkspaceDraft();

  return {
    ...baseDraft,
    profile: {
      ...baseDraft.profile,
      businessName: "Rendered Attachments LLC",
      taxYear: "2025",
      principalBusinessActivity: "Consulting",
      naicsCode: "541611",
      entityType: "sole_prop" as const,
      hasFixedAssets: true,
      notes: "Home office deduction likely applies.",
    },
    documents: [
      {
        id: "doc-asset",
        name: "fixed-asset-register.pdf",
        size: 100,
        mimeType: "application/pdf",
        storagePath: "tina/assets.pdf",
        category: "supporting_document" as const,
        requestId: "asset-register",
        requestLabel: "Asset register",
        uploadedAt: "2026-04-03T12:10:00.000Z",
      },
      {
        id: "doc-home-office",
        name: "home-office-support.pdf",
        size: 100,
        mimeType: "application/pdf",
        storagePath: "tina/home-office.pdf",
        category: "supporting_document" as const,
        requestId: "home-office",
        requestLabel: "Home office support",
        uploadedAt: "2026-04-03T12:11:00.000Z",
      },
    ],
    sourceFacts: [
      {
        id: "fact-home-office",
        sourceDocumentId: "doc-home-office",
        label: "Home office facts",
        value:
          "Office square footage 180, home square footage 1800, rent 18000, utilities 2400, exclusive use confirmed.",
        confidence: "high" as const,
        capturedAt: "2026-04-03T12:12:00.000Z",
      },
    ],
    reviewerFinal: {
      ...baseDraft.reviewerFinal,
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
          sourceDocumentIds: ["doc-home-office"],
          sourceFactIds: ["fact-home-office"],
          issueIds: [],
          derivedFromLineIds: [],
          cleanupSuggestionIds: [],
          taxAdjustmentIds: [],
        },
        {
          id: "rf-depreciation",
          kind: "expense" as const,
          layer: "reviewer_final" as const,
          label: "Business expense candidate",
          amount: 3200,
          status: "ready" as const,
          summary: "Depreciation on equipment",
          sourceDocumentIds: ["doc-asset"],
          sourceFactIds: [],
          issueIds: [],
          derivedFromLineIds: [],
          cleanupSuggestionIds: [],
          taxAdjustmentIds: [],
        },
      ],
    },
    scheduleCDraft: {
      ...baseDraft.scheduleCDraft,
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
          sourceDocumentIds: ["doc-home-office"],
        },
        {
          id: "line-13-depreciation",
          lineNumber: "Line 13",
          label: "Depreciation and section 179 expense deduction",
          amount: 3200,
          status: "ready" as const,
          summary: "Ready",
          reviewerFinalLineIds: ["rf-depreciation"],
          taxAdjustmentIds: [],
          sourceDocumentIds: ["doc-asset"],
        },
      ],
      notes: [],
    },
  };
}

describe("official-form-render-server", () => {
  it("marks supported schedule c and companion forms as render-ready artifacts", () => {
    const draft = createRenderReadyDraft();
    const plan = buildTinaOfficialFormRenderPlan(draft);
    const scheduleC = plan.find((item) => item.formId === "f1040sc");
    const form1040 = plan.find((item) => item.formId === "f1040");
    const scheduleSE = plan.find((item) => item.formId === "f1040sse");

    expect(scheduleC?.renderMode).toBe("official_blank_fill_ready");
    expect(scheduleC?.downloadPath).toBe("/api/tina/rendered-form?formId=f1040sc");
    expect(scheduleC?.directPdfFieldCount).toBeGreaterThan(0);
    expect(scheduleC?.appendixFieldCount).toBe(0);
    expect(form1040?.renderMode).toBe("official_blank_fill_ready");
    expect(form1040?.appendixPageCount).toBe(0);
    expect(form1040?.directPdfFieldCount).toBeGreaterThan(0);
    expect(scheduleSE?.renderMode).toBe("official_blank_fill_ready");
    expect(scheduleSE?.appendixPageCount).toBe(0);
    expect(scheduleSE?.directPdfFieldCount).toBeGreaterThan(0);
  });

  it("renders real PDF bytes from the stored IRS blanks on demand", async () => {
    const draft = createRenderReadyDraft();
    const scheduleC = await renderTinaOfficialFormArtifact(draft, "f1040sc");
    const form1040 = await renderTinaOfficialFormArtifact(draft, "f1040");
    const scheduleSE = await renderTinaOfficialFormArtifact(draft, "f1040sse");

    expect(scheduleC).not.toBeNull();
    expect(scheduleC?.renderMode).toBe("official_blank_fill_ready");
    expect(scheduleC?.byteLength).toBeGreaterThan(1000);
    expect(Buffer.from(scheduleC?.bytes ?? []).subarray(0, 4).toString()).toBe("%PDF");

    expect(form1040).not.toBeNull();
    expect(form1040?.renderMode).toBe("official_blank_fill_ready");
    expect(form1040?.appendixPageCount).toBe(0);
    expect(Buffer.from(form1040?.bytes ?? []).subarray(0, 4).toString()).toBe("%PDF");

    expect(scheduleSE).not.toBeNull();
    expect(scheduleSE?.renderMode).toBe("official_blank_fill_ready");
    expect(scheduleSE?.appendixPageCount).toBe(0);
    expect(Buffer.from(scheduleSE?.bytes ?? []).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("fills known Schedule C IRS form fields directly when Tina has exact mappings", async () => {
    const draft = createRenderReadyDraft();
    const scheduleC = await renderTinaOfficialFormArtifact(draft, "f1040sc");
    const scheduleCPdf = await PDFDocument.load(scheduleC?.bytes ?? new Uint8Array());

    expect(
      scheduleCPdf
        .getForm()
        .getTextField("topmostSubform[0].Page1[0].f1_1[0]")
        .getText()
    ).toBe("Rendered Blank LLC");
    expect(
      scheduleCPdf
        .getForm()
        .getTextField("topmostSubform[0].Page1[0].f1_10[0]")
        .getText()
    ).toBe("$22,000");
  });

  it("fills known companion IRS form fields directly when Tina has exact mappings", async () => {
    const draft = createRenderReadyDraft();
    const form1040 = await renderTinaOfficialFormArtifact(draft, "f1040");
    const scheduleSE = await renderTinaOfficialFormArtifact(draft, "f1040sse");
    const form1040Pdf = await PDFDocument.load(form1040?.bytes ?? new Uint8Array());
    const scheduleSEPdf = await PDFDocument.load(scheduleSE?.bytes ?? new Uint8Array());

    expect(
      form1040Pdf
        .getForm()
        .getTextField("topmostSubform[0].Page1[0].f1_55[0]")
        .getText()
    ).toBe("$22,000");
    expect(
      scheduleSEPdf
        .getForm()
        .getTextField("topmostSubform[0].Page1[0].Line5a_ReadOrder[0].f1_10[0]")
        .getText()
    ).toBe("$20,317");
  });

  it("renders attachment forms with direct field fills plus appendix support when Tina has partial exact mappings", async () => {
    const draft = createAttachmentRenderDraft();
    const plan = buildTinaOfficialFormRenderPlan(draft);
    const form4562Plan = plan.find((item) => item.formId === "f4562");
    const form8829Plan = plan.find((item) => item.formId === "f8829");

    expect(form4562Plan?.renderMode).toBe("official_blank_annotated_ready");
    expect(form4562Plan?.directPdfFieldCount).toBeGreaterThan(0);
    expect(form8829Plan?.renderMode).toBe("official_blank_annotated_ready");
    expect(form8829Plan?.directPdfFieldCount).toBeGreaterThan(0);

    const form4562 = await renderTinaOfficialFormArtifact(draft, "f4562");
    const form8829 = await renderTinaOfficialFormArtifact(draft, "f8829");
    const form4562Pdf = await PDFDocument.load(form4562?.bytes ?? new Uint8Array());
    const form8829Pdf = await PDFDocument.load(form8829?.bytes ?? new Uint8Array());

    expect(
      form4562Pdf
        .getForm()
        .getTextField("topmostSubform[0].Page1[0].f1_2[0]")
        .getText()
    ).toBe("Consulting");
    expect(
      form4562Pdf
        .getForm()
        .getTextField("topmostSubform[0].Page1[0].f1_24[0]")
        .getText()
    ).toBe("$3,200");

    expect(
      form8829Pdf
        .getForm()
        .getTextField("topmostSubform[0].Page1[0].f1_03[0]")
        .getText()
    ).toBe("180");
    expect(
      form8829Pdf
        .getForm()
        .getTextField("topmostSubform[0].Page1[0].f1_04[0]")
        .getText()
    ).toBe("1,800");
    expect(
      form8829Pdf
        .getForm()
        .getTextField("topmostSubform[0].Page1[0].f1_09[0]")
        .getText()
    ).toBe("10.00");
    expect(
      form8829Pdf
        .getForm()
        .getTextField("topmostSubform[0].Page1[0].Table_Lines16-23[0].Line19[0].f1_29[0]")
        .getText()
    ).toBe("$18,000");
    expect(
      form8829Pdf
        .getForm()
        .getTextField("topmostSubform[0].Page1[0].Table_Lines16-23[0].Line21[0].f1_33[0]")
        .getText()
    ).toBe("$2,400");
  });

  it("renders reviewer-controlled partnership forms as official blanks with a structured appendix", async () => {
    const draft = TINA_SKILL_REVIEW_DRAFTS["uneven-multi-owner"];
    const plan = buildTinaOfficialFormRenderPlan(draft);
    const form1065Plan = plan.find((item) => item.formId === "f1065");
    const form1065 = await renderTinaOfficialFormArtifact(draft, "f1065");

    expect(form1065Plan?.renderMode).toBe("companion_preview");
    expect(form1065Plan?.appendixFieldCount).toBeGreaterThan(0);
    expect(form1065Plan?.directPdfFieldCount).toBe(0);
    expect(form1065).toBeNull();
  });
});
