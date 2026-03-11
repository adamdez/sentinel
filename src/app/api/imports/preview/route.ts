export const maxDuration = 60; // 1 minute for preview parsing

const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

import { NextRequest, NextResponse } from "next/server";
import {
  buildTemplateSignature,
  inferFieldMappings,
  normalizeImportedRow,
  parseImportWorkbook,
  scoreTemplateMatch,
  type ImportTargetField,
  type NormalizationDefaults,
} from "@/lib/import-normalization";
import { createServerClient } from "@/lib/supabase";
import { findDuplicateCandidate, loadImportTemplates, requireImportUser } from "@/lib/imports-server";

function parseJson<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== "string" || value.trim().length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function defaultsFromInput(value: Partial<NormalizationDefaults>): NormalizationDefaults {
  return {
    sourceChannel: value.sourceChannel ?? "csv_import",
    sourceVendor: value.sourceVendor ?? "",
    sourceListName: value.sourceListName ?? "",
    sourcePullDate: value.sourcePullDate ?? "",
    county: value.county ?? "",
    nicheTag: value.nicheTag ?? "",
    importBatchId: value.importBatchId ?? "",
    outreachType: value.outreachType ?? "cold_call",
    skipTraceStatus: value.skipTraceStatus ?? "not_started",
    templateName: value.templateName ?? "",
    templateId: value.templateId ?? "",
  };
}

export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireImportUser(req.headers.get("authorization"), sb);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A .csv or .xlsx file is required" }, { status: 400 });
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      return NextResponse.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 25 MB.` }, { status: 413 });
    }
    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "csv" && ext !== "xlsx") {
      return NextResponse.json({ error: "Only .csv and .xlsx files are supported" }, { status: 400 });
    }

    const workbook = await parseImportWorkbook(file);
    const requestedSheet = typeof formData.get("sheet_name") === "string" ? String(formData.get("sheet_name")) : workbook.chosenSheet;
    const sheet = workbook.sheets.find((item) => item.name === requestedSheet) ?? workbook.sheets[0];
    if (!sheet) {
      return NextResponse.json({ error: "No readable sheet found in file" }, { status: 400 });
    }

    const inputDefaults = defaultsFromInput(parseJson<Partial<NormalizationDefaults>>(formData.get("defaults"), {}));
    const explicitMapping = parseJson<Partial<Record<ImportTargetField, string>>>(formData.get("mapping"), {});
    const inference = inferFieldMappings(sheet.headers, sheet.sampleRows);
    const templates = await loadImportTemplates(sb);
    const signature = buildTemplateSignature(sheet.headers, sheet.name);
    const templateMatch = templates
      .map((template) => ({ template, score: scoreTemplateMatch(sheet.headers, sheet.name, template) }))
      .sort((a, b) => b.score - a.score)[0];

    const hasExplicitMapping = Object.keys(explicitMapping).length > 0;
    const templateMapping = templateMatch && templateMatch.score >= 0.82 ? templateMatch.template.mapping : {};
    const effectiveMapping = hasExplicitMapping ? explicitMapping : { ...inference.mapped, ...templateMapping };
    const effectiveDefaults = templateMatch && templateMatch.score >= 0.82
      ? defaultsFromInput({ ...(templateMatch.template.defaults as Partial<NormalizationDefaults>), ...inputDefaults, templateId: templateMatch.template.id })
      : inputDefaults;

    const duplicateCache = new Map<string, Awaited<ReturnType<typeof findDuplicateCandidate>>>();
    const previewRows = [];
    for (let index = 0; index < Math.min(sheet.sampleRows.length, 25); index += 1) {
      const row = sheet.sampleRows[index];
      const preliminary = normalizeImportedRow({
        row,
        rowNumber: sheet.headerRowIndex + index + 2,
        mapping: effectiveMapping,
        defaults: effectiveDefaults,
        lowConfidenceFields: inference.lowConfidenceFields,
      });
      const duplicate = await findDuplicateCandidate(sb, preliminary, duplicateCache);
      previewRows.push(
        normalizeImportedRow({
          row,
          rowNumber: sheet.headerRowIndex + index + 2,
          mapping: effectiveMapping,
          defaults: effectiveDefaults,
          duplicate,
          lowConfidenceFields: inference.lowConfidenceFields,
        }),
      );
    }

    const reviewCounts = previewRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.reviewStatus] = (acc[row.reviewStatus] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      workbook: {
        kind: workbook.kind,
        fileName: workbook.fileName,
        chosenSheet: sheet.name,
        sheetNames: workbook.sheetNames,
        sheets: workbook.sheets.map((item) => ({
          name: item.name,
          rowCount: item.rowCount,
          headerRowIndex: item.headerRowIndex,
          headers: item.headers,
        })),
      },
      mappingSuggestions: inference.suggestions,
      effectiveMapping,
      unmappedHeaders: inference.unmappedHeaders.filter((header) => !Object.values(effectiveMapping).includes(header)),
      lowConfidenceFields: inference.lowConfidenceFields,
      previewRows,
      reviewCounts,
      requiresReview: inference.lowConfidenceFields.length > 0 || previewRows.some((row) => row.mappingWarnings.length > 0),
      templateMatch: templateMatch && templateMatch.score >= 0.62 ? {
        id: templateMatch.template.id,
        name: templateMatch.template.name,
        score: templateMatch.score,
        defaults: templateMatch.template.defaults,
        autoApplied: !hasExplicitMapping && templateMatch.score >= 0.82,
      } : null,
      templateSignature: signature,
      defaults: effectiveDefaults,
    });
  } catch (error) {
    console.error("[Import Preview] Failed:", error);
    return NextResponse.json({ error: "Failed to analyze import file" }, { status: 500 });
  }
}
