import type { TinaOfficialFormDraft } from "@/tina/types";

export interface TinaOfficialFormTemplateField {
  fieldKey: string;
  reference: string;
  section: "income" | "expenses";
  lineNumber: string;
  label: string;
  pageNumber: number;
  labelX: number;
  labelY: number;
  labelWidth: number;
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
}

export interface TinaOfficialFormTemplate {
  id: string;
  formNumber: string;
  title: string;
  taxYear: string;
  pageWidth: number;
  pageHeight: number;
  fields: TinaOfficialFormTemplateField[];
}

function scheduleCTemplate2025(): TinaOfficialFormTemplate {
  return {
    id: "schedule-c-2025-template",
    formNumber: "Schedule C (Form 1040)",
    title: "Profit or Loss From Business",
    taxYear: "2025",
    pageWidth: 612,
    pageHeight: 792,
    fields: [
      {
        fieldKey: "schedule_c.line_1.gross_receipts",
        reference: "2025 Schedule C, page 1, line 1",
        section: "income",
        lineNumber: "Line 1",
        label: "Gross receipts or sales",
        pageNumber: 1,
        labelX: 48,
        labelY: 170,
        labelWidth: 292,
        boxX: 446,
        boxY: 160,
        boxWidth: 118,
        boxHeight: 18,
      },
      {
        fieldKey: "schedule_c.line_2.returns_and_allowances",
        reference: "2025 Schedule C, page 1, line 2",
        section: "income",
        lineNumber: "Line 2",
        label: "Returns and allowances",
        pageNumber: 1,
        labelX: 48,
        labelY: 198,
        labelWidth: 292,
        boxX: 446,
        boxY: 188,
        boxWidth: 118,
        boxHeight: 18,
      },
      {
        fieldKey: "schedule_c.line_4.cogs",
        reference: "2025 Schedule C, page 1, line 4",
        section: "income",
        lineNumber: "Line 4",
        label: "Cost of goods sold",
        pageNumber: 1,
        labelX: 48,
        labelY: 226,
        labelWidth: 292,
        boxX: 446,
        boxY: 216,
        boxWidth: 118,
        boxHeight: 18,
      },
      {
        fieldKey: "schedule_c.line_5.gross_profit",
        reference: "2025 Schedule C, page 1, line 5",
        section: "income",
        lineNumber: "Line 5",
        label: "Gross profit",
        pageNumber: 1,
        labelX: 48,
        labelY: 254,
        labelWidth: 292,
        boxX: 446,
        boxY: 244,
        boxWidth: 118,
        boxHeight: 18,
      },
      {
        fieldKey: "schedule_c.line_7.gross_income",
        reference: "2025 Schedule C, page 1, line 7",
        section: "income",
        lineNumber: "Line 7",
        label: "Gross income",
        pageNumber: 1,
        labelX: 48,
        labelY: 282,
        labelWidth: 292,
        boxX: 446,
        boxY: 272,
        boxWidth: 118,
        boxHeight: 18,
      },
      {
        fieldKey: "schedule_c.line_11.contract_labor",
        reference: "2025 Schedule C, page 1, line 11",
        section: "expenses",
        lineNumber: "Line 11",
        label: "Contract labor",
        pageNumber: 1,
        labelX: 48,
        labelY: 356,
        labelWidth: 292,
        boxX: 446,
        boxY: 346,
        boxWidth: 118,
        boxHeight: 18,
      },
      {
        fieldKey: "schedule_c.line_26.wages",
        reference: "2025 Schedule C, page 1, line 26",
        section: "expenses",
        lineNumber: "Line 26",
        label: "Wages",
        pageNumber: 1,
        labelX: 48,
        labelY: 384,
        labelWidth: 292,
        boxX: 446,
        boxY: 374,
        boxWidth: 118,
        boxHeight: 18,
      },
      {
        fieldKey: "schedule_c.line_27a.other_expenses",
        reference: "2025 Schedule C, page 1, line 27a",
        section: "expenses",
        lineNumber: "Line 27a",
        label: "Other expenses",
        pageNumber: 1,
        labelX: 48,
        labelY: 412,
        labelWidth: 292,
        boxX: 446,
        boxY: 402,
        boxWidth: 118,
        boxHeight: 18,
      },
      {
        fieldKey: "schedule_c.line_28.total_expenses",
        reference: "2025 Schedule C, page 1, line 28",
        section: "expenses",
        lineNumber: "Line 28",
        label: "Total expenses",
        pageNumber: 1,
        labelX: 48,
        labelY: 440,
        labelWidth: 292,
        boxX: 446,
        boxY: 430,
        boxWidth: 118,
        boxHeight: 18,
      },
      {
        fieldKey: "schedule_c.line_29.tentative_profit",
        reference: "2025 Schedule C, page 1, line 29",
        section: "expenses",
        lineNumber: "Line 29",
        label: "Tentative profit or loss",
        pageNumber: 1,
        labelX: 48,
        labelY: 468,
        labelWidth: 292,
        boxX: 446,
        boxY: 458,
        boxWidth: 118,
        boxHeight: 18,
      },
      {
        fieldKey: "schedule_c.line_31.net_profit",
        reference: "2025 Schedule C, page 1, line 31",
        section: "expenses",
        lineNumber: "Line 31",
        label: "Net profit or loss",
        pageNumber: 1,
        labelX: 48,
        labelY: 496,
        labelWidth: 292,
        boxX: 446,
        boxY: 486,
        boxWidth: 118,
        boxHeight: 18,
      },
    ],
  };
}

export function getTinaOfficialFormTemplate(
  form: Pick<TinaOfficialFormDraft, "formNumber" | "taxYear" | "revisionYear">
): TinaOfficialFormTemplate | null {
  if (
    form.formNumber === "Schedule C (Form 1040)" &&
    (form.taxYear === "2025" || form.revisionYear === "2025")
  ) {
    return scheduleCTemplate2025();
  }

  return null;
}
