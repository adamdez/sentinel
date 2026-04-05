/**
 * Server-only Tina official-form renderer.
 * Produces real PDF bytes on demand from stored IRS blanks.
 */
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { TinaRenderedFormBinaryArtifact } from "@/tina/lib/acceleration-contracts";
import { getTinaOfficialPdfFieldNameForValue } from "@/tina/lib/official-form-pdf-fields";
import { buildTinaOfficialFormRenderPlan } from "@/tina/lib/official-form-render-plan";
import { readTinaOfficialFederalFormTemplateAsset } from "@/tina/lib/official-form-templates-server";
import { buildTinaOfficialFormFill } from "@/tina/lib/official-form-fill";
import type { TinaOfficialFederalFormId, TinaWorkspaceDraft } from "@/tina/types";

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const PAGE_MARGIN = 42;
const binaryArtifactCache = new WeakMap<
  TinaWorkspaceDraft,
  Map<string, Promise<TinaRenderedFormBinaryArtifact | null>>
>();

function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function wrapText(value: string, width: number): string[] {
  if (value.length <= width) return [value];

  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
      return;
    }

    if (current) {
      lines.push(current);
      current = word;
      return;
    }

    lines.push(word.slice(0, width));
    current = word.slice(width);
  });

  if (current) lines.push(current);
  return lines;
}

function annotationLine(value: {
  label: string;
  value: string;
  supportLevel: "supported" | "derived" | "missing";
}): string {
  const renderedValue = value.value.trim() || "Pending reviewer value";
  return `${value.label}: ${renderedValue} (${value.supportLevel})`;
}

async function renderScheduleCBlank(
  draft: TinaWorkspaceDraft,
  templateBytes: Uint8Array
): Promise<{ appendixPageCount: number; bytes: Uint8Array }> {
  const officialFormFill = buildTinaOfficialFormFill(draft);
  const pdf = await PDFDocument.load(templateBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const form = pdf.getForm();
  const pages = pdf.getPages();

  officialFormFill.placements.forEach((placement) => {
    const value = placement.value.trim();
    if (!value) return;
    if (placement.pdfFieldName) {
      const field = form.getTextField(placement.pdfFieldName);
      field.setText(value);
      return;
    }

    const page = pages[Math.max(0, placement.pageNumber - 1)];
    if (!page) return;

    page.drawText(value, {
      x: placement.x,
      y: placement.y,
      size: placement.fontSize,
      font: /\$/.test(value) ? mono : font,
      color:
        placement.status === "needs_review"
          ? rgb(0.73, 0.45, 0.04)
          : placement.status === "blocked"
            ? rgb(0.68, 0.12, 0.12)
            : rgb(0.06, 0.06, 0.06),
    });
  });
  form.updateFieldAppearances(font);

  const footerPage = pages[0];
  footerPage?.drawText("Tina rendered draft overlay. Reviewer signoff required before filing.", {
    x: 36,
    y: 18,
    size: 7,
    font,
    color: rgb(0.32, 0.32, 0.32),
  });

  return {
    appendixPageCount: 0,
    bytes: await pdf.save(),
  };
}

function fillTextFieldByName(args: {
  pdf: PDFDocument;
  fieldName: string;
  value: string;
}) {
  const form = args.pdf.getForm();
  const field = form.getTextField(args.fieldName);
  field.setText(args.value);
}

async function renderCompanionBlank(args: {
  artifact: ReturnType<typeof buildTinaOfficialFormRenderPlan>[number];
  templateBytes: Uint8Array;
}): Promise<{ appendixPageCount: number; bytes: Uint8Array }> {
  const { artifact, templateBytes } = args;
  const pdf = await PDFDocument.load(templateBytes);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const mappedFieldValues = artifact.fieldValues.filter((fieldValue) =>
    Boolean(getTinaOfficialPdfFieldNameForValue({ formId: artifact.formId, fieldValue }))
  );
  const appendixFieldValues = artifact.fieldValues.filter(
    (fieldValue) =>
      !getTinaOfficialPdfFieldNameForValue({ formId: artifact.formId, fieldValue })
  );

  mappedFieldValues.forEach((fieldValue) => {
    const pdfFieldName = getTinaOfficialPdfFieldNameForValue({
      formId: artifact.formId,
      fieldValue,
    });
    const value = fieldValue.value.trim();
    if (!pdfFieldName || !value) return;
    fillTextFieldByName({
      pdf,
      fieldName: pdfFieldName,
      value,
    });
  });
  pdf.getForm().updateFieldAppearances(font);

  let appendixPageCount = 0;
  if (appendixFieldValues.length > 0) {
    let page = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
    let y = LETTER_HEIGHT - PAGE_MARGIN;
    appendixPageCount = 1;

    const startNewPage = () => {
      page = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
      y = LETTER_HEIGHT - PAGE_MARGIN;
      appendixPageCount += 1;
    };

    page.drawText(`${artifact.title} - Tina structured appendix`, {
      x: PAGE_MARGIN,
      y,
      size: 16,
      font: bold,
      color: rgb(0.07, 0.07, 0.07),
    });
    y -= 28;
    page.drawText(
      "This artifact uses the stored official IRS blank as the package base and appends any still-unmapped Tina field payloads here until exact field placement maps are complete.",
      {
        x: PAGE_MARGIN,
        y,
        size: 10,
        font,
        color: rgb(0.18, 0.18, 0.18),
        maxWidth: LETTER_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 13,
      }
    );
    y -= 48;

    appendixFieldValues.forEach((fieldValue, index) => {
      const lines = wrapText(annotationLine(fieldValue), 92);
      const requiredHeight = lines.length * 12 + 10;
      if (y - requiredHeight < PAGE_MARGIN) {
        startNewPage();
      }

      page.drawText(`${index + 1}. ${lines[0]}`, {
        x: PAGE_MARGIN,
        y,
        size: 9,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= 12;

      lines.slice(1).forEach((line) => {
        page.drawText(line, {
          x: PAGE_MARGIN + 18,
          y,
          size: 9,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= 12;
      });

      const traceText = `Docs: ${fieldValue.relatedDocumentIds.length} | Lines: ${
        fieldValue.relatedLineNumbers.join(", ") || "n/a"
      }`;
      page.drawText(traceText, {
        x: PAGE_MARGIN + 18,
        y,
        size: 8,
        font,
        color: rgb(0.38, 0.38, 0.38),
      });
      y -= 10;
    });
  }

  return {
    appendixPageCount,
    bytes: await pdf.save(),
  };
}

async function buildRenderedArtifact(
  draft: TinaWorkspaceDraft,
  formId: TinaOfficialFederalFormId
): Promise<TinaRenderedFormBinaryArtifact | null> {
  const artifacts = buildTinaOfficialFormRenderPlan(draft);
  const artifact = artifacts.find((item) => item.formId === formId) ?? null;
  if (
    !artifact ||
    artifact.renderMode === "blocked" ||
    artifact.renderMode === "official_overlay_preview" ||
    artifact.renderMode === "companion_preview"
  ) {
    return null;
  }

  const templateBytes = readTinaOfficialFederalFormTemplateAsset(
    formId,
    draft.profile.taxYear || "2025"
  );
  if (!templateBytes) return null;

  const rendered =
    formId === "f1040sc"
      ? await renderScheduleCBlank(draft, templateBytes)
      : await renderCompanionBlank({ artifact, templateBytes });
  const renderedAt = new Date().toISOString();

  return {
    artifactId: artifact.id,
    formId,
    renderMode: artifact.renderMode,
    fileName: artifact.fileName,
    mimeType: artifact.mimeType,
    renderedAt,
    byteLength: rendered.bytes.byteLength,
    sha256: hashBytes(rendered.bytes),
    appendixPageCount: rendered.appendixPageCount,
    bytes: rendered.bytes,
  };
}

export async function renderTinaOfficialFormArtifact(
  draft: TinaWorkspaceDraft,
  formId: TinaOfficialFederalFormId
): Promise<TinaRenderedFormBinaryArtifact | null> {
  let cache = binaryArtifactCache.get(draft);
  if (!cache) {
    cache = new Map<string, Promise<TinaRenderedFormBinaryArtifact | null>>();
    binaryArtifactCache.set(draft, cache);
  }

  const cacheKey = formId;
  const existing = cache.get(cacheKey);
  if (existing) return existing;

  const buildPromise = buildRenderedArtifact(draft, formId);
  cache.set(cacheKey, buildPromise);
  return buildPromise;
}
