import {
  getTinaOfficialFormTemplate,
  type TinaOfficialFormTemplateField,
} from "@/tina/lib/official-form-templates";
import { getTinaOfficialFormPacketExportReadiness } from "@/tina/lib/official-form-coverage";
import { getTinaPacketFileTag } from "@/tina/lib/packet-identity";
import type { TinaOfficialFormDraft, TinaWorkspaceDraft } from "@/tina/types";

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export interface TinaOfficialFormPdfPayloadLine {
  lineNumber: string;
  label: string;
  value: string;
  state: "filled" | "review" | "blank";
  summary: string;
}

export interface TinaOfficialFormPdfPayloadPlacedField
  extends TinaOfficialFormPdfPayloadLine {
  fieldKey: string;
  reference: string;
  section: "income" | "expenses";
  pageNumber: number;
  labelX: number;
  labelY: number;
  labelWidth: number;
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
}

export interface TinaOfficialFormPdfPayloadSupportRow {
  label: string;
  amount: string;
  summary: string;
}

export interface TinaOfficialFormPdfPayloadSupportSchedule {
  title: string;
  summary: string;
  rows: TinaOfficialFormPdfPayloadSupportRow[];
}

export interface TinaOfficialFormPdfPayloadForm {
  formNumber: string;
  title: string;
  taxYear: string;
  status: "ready" | "needs_review" | "blocked";
  summary: string;
  nextStep: string;
  lines: TinaOfficialFormPdfPayloadLine[];
  templateId: string | null;
  pageWidth: number | null;
  pageHeight: number | null;
  placedFields: TinaOfficialFormPdfPayloadPlacedField[];
  unmatchedLines: TinaOfficialFormPdfPayloadLine[];
  supportSchedules: TinaOfficialFormPdfPayloadSupportSchedule[];
}

export interface TinaOfficialFormPdfPayload {
  businessName: string;
  taxYear: string;
  summary: string;
  nextStep: string;
  forms: TinaOfficialFormPdfPayloadForm[];
}

function mapPlacedField(
  line: TinaOfficialFormPdfPayloadLine,
  templateField: TinaOfficialFormTemplateField
): TinaOfficialFormPdfPayloadPlacedField {
  return {
    ...line,
    fieldKey: templateField.fieldKey,
    reference: templateField.reference,
    section: templateField.section,
    pageNumber: templateField.pageNumber,
    labelX: templateField.labelX,
    labelY: templateField.labelY,
    labelWidth: templateField.labelWidth,
    boxX: templateField.boxX,
    boxY: templateField.boxY,
    boxWidth: templateField.boxWidth,
    boxHeight: templateField.boxHeight,
  };
}

function mapForm(form: TinaOfficialFormDraft): TinaOfficialFormPdfPayloadForm {
  const lines = form.lines.map((line) => ({
    lineNumber: line.lineNumber,
    label: line.label,
    value: line.value,
    state: line.state,
    summary: line.summary,
  }));
  const template = getTinaOfficialFormTemplate(form);
  const lineByNumber = new Map(lines.map((line) => [line.lineNumber, line]));
  const placedFields = template
    ? template.fields
        .map((field) => {
          const line = lineByNumber.get(field.lineNumber);
          return line ? mapPlacedField(line, field) : null;
        })
        .filter((field): field is TinaOfficialFormPdfPayloadPlacedField => field !== null)
    : [];
  const matchedLineNumbers = new Set(placedFields.map((field) => field.lineNumber));
  const unmatchedLines = lines.filter((line) => !matchedLineNumbers.has(line.lineNumber));
  const supportSchedules = form.supportSchedules.map((schedule) => ({
    title: schedule.title,
    summary: schedule.summary,
    rows: schedule.rows.map((row) => ({
      label: row.label,
      amount:
        row.amount === null
          ? "Blank for now"
          : new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }).format(row.amount),
      summary: row.summary,
    })),
  }));

  return {
    formNumber: form.formNumber,
    title: form.title,
    taxYear: form.taxYear,
    status: form.status,
    summary: form.summary,
    nextStep: form.nextStep,
    lines,
    templateId: template?.id ?? null,
    pageWidth: template?.pageWidth ?? null,
    pageHeight: template?.pageHeight ?? null,
    placedFields,
    unmatchedLines,
    supportSchedules,
  };
}

export function getTinaOfficialFormPdfFileName(draft: TinaWorkspaceDraft): string {
  const businessName = draft.profile.businessName || "tina-business";
  const taxYear = draft.profile.taxYear || "tax-year";
  const slug = toSlug(businessName) || "tina-business";
  const packetTag = getTinaPacketFileTag(draft);
  return `tina-official-form-packet-${slug}-${taxYear}-${packetTag}.pdf`;
}

export function buildTinaOfficialFormPdfPayload(
  draft: TinaWorkspaceDraft
): TinaOfficialFormPdfPayload {
  const exportReadiness = getTinaOfficialFormPacketExportReadiness(draft);

  if (!exportReadiness.ready) {
    throw new Error(
      exportReadiness.reason ?? "Federal business form packet is not export-ready yet."
    );
  }

  return {
    businessName: draft.profile.businessName || "Unnamed business",
    taxYear: draft.profile.taxYear || "tax-year",
    summary: draft.officialFormPacket.summary,
    nextStep: draft.officialFormPacket.nextStep,
    forms: draft.officialFormPacket.forms.map((form) => mapForm(form)),
  };
}
