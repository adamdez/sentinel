export const maxDuration = 300; // 5 minutes for large imports

const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildProspectPayload,
  buildTemplateSignature,
  inferFieldMappings,
  normalizeImportedRow,
  parseImportRows,
  type ImportTargetField,
  type NormalizationDefaults,
} from "@/lib/import-normalization";
import { createServerClient } from "@/lib/supabase";
import {
  findDuplicateCandidate,
  requireImportUser,
  saveImportTemplate,
  updateExistingRecordFromImport,
} from "@/lib/imports-server";

function parseJson<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== "string" || value.trim().length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeDefaults(value: Partial<NormalizationDefaults>, fileName: string): NormalizationDefaults {
  const fallbackBatch = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
  return {
    sourceChannel: value.sourceChannel ?? "csv_import",
    sourceVendor: value.sourceVendor ?? "",
    sourceListName: value.sourceListName ?? "",
    sourcePullDate: value.sourcePullDate ?? "",
    county: value.county ?? "",
    nicheTag: value.nicheTag ?? "",
    importBatchId: value.importBatchId?.trim() || `batch_${fallbackBatch}_${new Date().toISOString().slice(0, 10)}`,
    outreachType: value.outreachType ?? "cold_call",
    skipTraceStatus: value.skipTraceStatus ?? "not_started",
    templateName: value.templateName ?? "",
    templateId: value.templateId ?? "",
  };
}

export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient();
    const authHeader = req.headers.get("authorization");
    const user = await requireImportUser(authHeader, sb);
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

    const sheetName = typeof formData.get("sheet_name") === "string" ? String(formData.get("sheet_name")) : undefined;
    const mapping = parseJson<Partial<Record<ImportTargetField, string>>>(formData.get("mapping"), {});
    const defaults = normalizeDefaults(parseJson<Partial<NormalizationDefaults>>(formData.get("defaults"), {}), file.name);
    const duplicateStrategy = typeof formData.get("duplicate_strategy") === "string" ? String(formData.get("duplicate_strategy")) : "update_missing";
    const forceCommit = formData.get("force_commit") === "true";
    const saveTemplate = formData.get("save_template") === "true" && defaults.templateName.trim().length > 0;

    const parsed = await parseImportRows(file, sheetName);
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: "The selected file has no importable rows" }, { status: 400 });
    }

    const inference = inferFieldMappings(parsed.headers, parsed.rows.slice(0, 5));
    const lowConfidenceFields = inference.lowConfidenceFields.filter((field) => mapping[field]);
    if (lowConfidenceFields.length > 0 && !forceCommit) {
      return NextResponse.json({
        error: "Low-confidence mappings require operator confirmation before import",
        requires_review: true,
        low_confidence_fields: lowConfidenceFields,
      }, { status: 400 });
    }

    if (saveTemplate) {
      const templateId = defaults.templateId || `import_template_${randomUUID()}`;
      await saveImportTemplate({
        sb,
        templateId,
        userId: user.id,
        name: defaults.templateName,
        vendorKey: defaults.sourceVendor || null,
        sheetName: parsed.sheetName,
        headerSignature: buildTemplateSignature(parsed.headers, parsed.sheetName),
        mapping,
        defaults: defaults as unknown as Record<string, unknown>,
      });
      defaults.templateId = templateId;
    }

    const duplicateCache = new Map<string, Awaited<ReturnType<typeof findDuplicateCandidate>>>();
    const batchWarnings = new Set<string>();
    const skippedRows: Array<{ rowNumber: number; status: string; reason: string }> = [];
    const errorRows: Array<{ rowNumber: number; error: string }> = [];
    const importedStatusCounts: Record<string, number> = {};

    let imported = 0;
    let updated = 0;
    let duplicateReviews = 0;

    for (let index = 0; index < parsed.rows.length; index += 1) {
      const row = parsed.rows[index];
      const preliminary = normalizeImportedRow({
        row,
        rowNumber: parsed.headerRowIndex + index + 2,
        mapping,
        defaults,
        lowConfidenceFields,
      });
      const duplicate = await findDuplicateCandidate(sb, preliminary, duplicateCache);
      const record = normalizeImportedRow({
        row,
        rowNumber: parsed.headerRowIndex + index + 2,
        mapping,
        defaults,
        duplicate,
        lowConfidenceFields,
      });

      record.warnings.forEach((warning) => batchWarnings.add(warning));
      record.mappingWarnings.forEach((warning) => batchWarnings.add(warning));
      record.duplicate.reasons.forEach((warning) => batchWarnings.add(warning));

      if (record.reviewStatus === "missing_property_address") {
        skippedRows.push({ rowNumber: record.rowNumber, status: record.reviewStatus, reason: "Property address is required for Sentinel intake" });
        continue;
      }

      if (duplicate.level === "high") {
        if (duplicateStrategy === "update_missing") {
          const didUpdate = await updateExistingRecordFromImport({
            sb,
            duplicate,
            record,
            defaults,
          });
          if (didUpdate) {
            updated += 1;
            continue;
          }
        }
        skippedRows.push({ rowNumber: record.rowNumber, status: "duplicate", reason: duplicate.reasons.join("; ") || "Matched existing record" });
        continue;
      }

      if (duplicate.level === "possible") {
        duplicateReviews += 1;
        skippedRows.push({ rowNumber: record.rowNumber, status: "possible_duplicate", reason: duplicate.reasons.join("; ") || "Possible duplicate needs review" });
        continue;
      }

      try {
        const prospectPayload = buildProspectPayload(record, defaults);
        const response = await fetch(new URL("/api/prospects", req.nextUrl.origin), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
          body: JSON.stringify(prospectPayload),
          cache: "no-store",
        });

        const data = await response.json();
        if (!response.ok || !data?.success) {
          throw new Error((data?.error as string | undefined) ?? `HTTP ${response.status}`);
        }

        imported += 1;
        importedStatusCounts[record.reviewStatus] = (importedStatusCounts[record.reviewStatus] ?? 0) + 1;
      } catch (error) {
        errorRows.push({
          rowNumber: record.rowNumber,
          error: error instanceof Error ? error.message : "Unknown import failure",
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: batchAuditError } = await (sb.from("event_log") as any).insert({
      user_id: user.id,
      action: "import.batch.completed",
      entity_type: "import_batch",
      entity_id: defaults.importBatchId,
      details: {
        file_name: file.name,
        file_kind: parsed.kind,
        sheet_name: parsed.sheetName,
        imported_at: new Date().toISOString(),
        operator_id: user.id,
        mapping_template_id: defaults.templateId || null,
        source_channel: defaults.sourceChannel,
        source_vendor: defaults.sourceVendor || null,
        source_list_name: defaults.sourceListName || null,
        niche_tag: defaults.nicheTag || null,
        county: defaults.county || null,
        duplicate_strategy: duplicateStrategy,
        total_rows: parsed.rows.length,
        imported,
        updated_existing: updated,
        duplicate_review_rows: duplicateReviews,
        skipped: skippedRows.length,
        errors: errorRows.length,
        status_counts: importedStatusCounts,
        unmapped_headers: parsed.headers.filter((header) => !Object.values(mapping).includes(header)),
        warnings: [...batchWarnings],
        skipped_rows: skippedRows.slice(0, 75),
        error_rows: errorRows.slice(0, 75),
      },
    });
    if (batchAuditError) {
      console.error("[Import Commit] Failed to write batch audit log:", batchAuditError);
    }

    return NextResponse.json({
      success: errorRows.length === 0,
      batchId: defaults.importBatchId,
      fileName: file.name,
      sheetName: parsed.sheetName,
      totalRows: parsed.rows.length,
      imported,
      updated,
      duplicateReviewRows: duplicateReviews,
      skipped: skippedRows.length,
      errors: errorRows.length,
      importedStatusCounts,
      warnings: [...batchWarnings],
      skippedRows: skippedRows.slice(0, 30),
      errorRows: errorRows.slice(0, 30),
      templateId: defaults.templateId || null,
    });
  } catch (error) {
    console.error("[Import Commit] Failed:", error);
    return NextResponse.json({ error: "Failed to complete import" }, { status: 500 });
  }
}
