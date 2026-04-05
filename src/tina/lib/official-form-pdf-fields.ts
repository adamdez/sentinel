import type { TinaRenderedFormFieldValue } from "@/tina/lib/acceleration-contracts";
import type { TinaOfficialFederalFormId } from "@/tina/types";

interface TinaOfficialPdfFieldRegistryEntry {
  fieldValueLabel: string;
  pdfFieldName: string;
}

const TINA_OFFICIAL_PDF_FIELD_REGISTRY: Partial<
  Record<TinaOfficialFederalFormId, TinaOfficialPdfFieldRegistryEntry[]>
> = {
  f1040: [
    {
      fieldValueLabel: "Schedule C line 31 carryover amount",
      pdfFieldName: "topmostSubform[0].Page1[0].f1_55[0]",
    },
  ],
  f1040sse: [
    {
      fieldValueLabel: "Net earnings from self-employment",
      pdfFieldName: "topmostSubform[0].Page1[0].Line5a_ReadOrder[0].f1_10[0]",
    },
    {
      fieldValueLabel: "Estimated Schedule SE tax before wage interaction adjustments",
      pdfFieldName: "topmostSubform[0].Page1[0].f1_18[0]",
    },
    {
      fieldValueLabel: "Estimated deductible half of self-employment tax",
      pdfFieldName: "topmostSubform[0].Page1[0].f1_19[0]",
    },
  ],
  f4562: [
    {
      fieldValueLabel: "Business or activity to which this form relates",
      pdfFieldName: "topmostSubform[0].Page1[0].f1_2[0]",
    },
    {
      fieldValueLabel: "Current-year depreciation from Schedule C line 13",
      pdfFieldName: "topmostSubform[0].Page1[0].f1_24[0]",
    },
  ],
  f8829: [
    {
      fieldValueLabel: "Area used regularly and exclusively for business",
      pdfFieldName: "topmostSubform[0].Page1[0].f1_03[0]",
    },
    {
      fieldValueLabel: "Total area of home",
      pdfFieldName: "topmostSubform[0].Page1[0].f1_04[0]",
    },
    {
      fieldValueLabel: "Business-use percentage",
      pdfFieldName: "topmostSubform[0].Page1[0].f1_09[0]",
    },
    {
      fieldValueLabel: "Schedule C line 29 base income before home-office deduction",
      pdfFieldName: "topmostSubform[0].Page1[0].Line8_ReadOrder[0].f1_10[0]",
    },
    {
      fieldValueLabel: "Rent indirect expense",
      pdfFieldName: "topmostSubform[0].Page1[0].Table_Lines16-23[0].Line19[0].f1_29[0]",
    },
    {
      fieldValueLabel: "Utilities indirect expense",
      pdfFieldName: "topmostSubform[0].Page1[0].Table_Lines16-23[0].Line21[0].f1_33[0]",
    },
  ],
};

export function getTinaOfficialPdfFieldRegistry(
  formId: TinaOfficialFederalFormId | null
): TinaOfficialPdfFieldRegistryEntry[] {
  if (!formId) return [];
  return [...(TINA_OFFICIAL_PDF_FIELD_REGISTRY[formId] ?? [])];
}

export function getTinaOfficialPdfFieldNameForValue(args: {
  formId: TinaOfficialFederalFormId | null;
  fieldValue: TinaRenderedFormFieldValue;
}): string | null {
  const registry = getTinaOfficialPdfFieldRegistry(args.formId);
  return (
    registry.find((entry) => entry.fieldValueLabel === args.fieldValue.label)?.pdfFieldName ?? null
  );
}

export function countTinaDirectPdfFieldMatches(args: {
  formId: TinaOfficialFederalFormId | null;
  fieldValues: TinaRenderedFormFieldValue[];
}): number {
  return args.fieldValues.filter((fieldValue) =>
    Boolean(getTinaOfficialPdfFieldNameForValue({ formId: args.formId, fieldValue }))
  ).length;
}
