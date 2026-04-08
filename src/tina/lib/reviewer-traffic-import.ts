import type {
  TinaReviewerOutcomeCaseTag,
  TinaReviewerOutcomePhase,
  TinaReviewerOutcomeRecord,
  TinaReviewerOutcomeVerdict,
  TinaReviewerOverrideRecord,
  TinaReviewerOverrideSeverity,
  TinaReviewerOverrideTargetType,
} from "@/tina/types";
import {
  createTinaReviewerOutcomeRecord,
  createTinaReviewerOverrideRecord,
} from "@/tina/lib/reviewer-outcomes";

export type TinaReviewerTrafficImportFormat = "json" | "csv";

export interface TinaReviewerTrafficImportInput {
  content: string;
  format?: TinaReviewerTrafficImportFormat;
  defaultDecidedBy?: string | null;
}

export interface TinaReviewerTrafficImportResult {
  overrides: TinaReviewerOverrideRecord[];
  outcomes: TinaReviewerOutcomeRecord[];
  warnings: string[];
}

type RawReviewerTrafficRecord = Record<string, unknown>;

const VALID_TARGET_TYPES: TinaReviewerOverrideTargetType[] = [
  "review_item",
  "cleanup_suggestion",
  "tax_adjustment",
  "reviewer_final_line",
  "schedule_c_field",
  "authority_work_item",
  "package_readiness_item",
  "cpa_handoff_artifact",
];

const VALID_OVERRIDE_SEVERITIES: TinaReviewerOverrideSeverity[] = [
  "minor",
  "material",
  "blocking",
];

const VALID_OUTCOME_PHASES: TinaReviewerOutcomePhase[] = [
  "intake",
  "cleanup",
  "tax_review",
  "package",
];

const VALID_OUTCOME_VERDICTS: TinaReviewerOutcomeVerdict[] = [
  "accepted",
  "revised",
  "rejected",
];

const VALID_CASE_TAGS: TinaReviewerOutcomeCaseTag[] = [
  "clean_books",
  "messy_books",
  "authority_heavy",
  "commingled_entity",
  "schedule_c",
  "s_corp",
  "partnership",
  "state_scope",
];

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function splitList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
  }

  if (typeof value !== "string") return [];

  return value
    .split(/[|;,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown): string | null {
  const normalized = asString(value);
  return normalized.length > 0 ? normalized : null;
}

function pickValue(record: RawReviewerTrafficRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
}

function normalizeTargetType(value: unknown): TinaReviewerOverrideTargetType | null {
  const normalized = normalizeToken(asString(value));
  return VALID_TARGET_TYPES.find((item) => item === normalized) ?? null;
}

function normalizeSeverity(value: unknown): TinaReviewerOverrideSeverity | null {
  const normalized = normalizeToken(asString(value));
  return VALID_OVERRIDE_SEVERITIES.find((item) => item === normalized) ?? null;
}

function normalizeVerdict(value: unknown): TinaReviewerOutcomeVerdict | null {
  const normalized = normalizeToken(asString(value));
  return VALID_OUTCOME_VERDICTS.find((item) => item === normalized) ?? null;
}

function normalizePhase(value: unknown): TinaReviewerOutcomePhase | null {
  const normalized = normalizeToken(asString(value));
  return VALID_OUTCOME_PHASES.find((item) => item === normalized) ?? null;
}

function normalizeCaseTags(value: unknown): TinaReviewerOutcomeCaseTag[] {
  return Array.from(
    new Set(
      splitList(value)
        .map((item) => normalizeToken(item))
        .filter((item): item is TinaReviewerOutcomeCaseTag =>
          VALID_CASE_TAGS.includes(item as TinaReviewerOutcomeCaseTag)
        )
    )
  );
}

function parseTimestamp(value: unknown): string | null {
  const normalized = asString(value);
  if (normalized.length === 0) return null;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function inferRecordType(record: RawReviewerTrafficRecord): "override" | "outcome" | null {
  const recordType = normalizeToken(
    asString(pickValue(record, ["recordType", "record_type", "type"]))
  );

  if (recordType === "override" || recordType === "reviewer_override") {
    return "override";
  }

  if (recordType === "outcome" || recordType === "reviewer_outcome") {
    return "outcome";
  }

  if (normalizeVerdict(pickValue(record, ["verdict"]))) {
    return "outcome";
  }

  if (normalizeSeverity(pickValue(record, ["severity"]))) {
    return "override";
  }

  return null;
}

function normalizeOverrideRecord(
  record: RawReviewerTrafficRecord,
  defaultDecidedBy: string | null,
  rowLabel: string,
  warnings: string[]
): TinaReviewerOverrideRecord | null {
  const targetType = normalizeTargetType(pickValue(record, ["targetType", "target_type"]));
  const targetId = asString(pickValue(record, ["targetId", "target_id"]));
  const severity = normalizeSeverity(pickValue(record, ["severity"]));
  const decidedAt =
    parseTimestamp(pickValue(record, ["decidedAt", "decided_at", "timestamp"])) ??
    new Date().toISOString();

  if (!targetType || targetId.length === 0 || !severity) {
    warnings.push(`${rowLabel} is missing override target, severity, or target id and was skipped.`);
    return null;
  }

  const created = createTinaReviewerOverrideRecord({
    targetType,
    targetId,
    severity,
    reason: asString(pickValue(record, ["reason", "summary"])),
    beforeState: asString(pickValue(record, ["beforeState", "before_state"])),
    afterState: asString(pickValue(record, ["afterState", "after_state"])),
    lesson: asString(pickValue(record, ["lesson", "lessons"])),
    sourceDocumentIds: splitList(
      pickValue(record, ["sourceDocumentIds", "source_document_ids", "documentIds", "document_ids"])
    ),
    decidedAt,
    decidedBy: asNullableString(pickValue(record, ["decidedBy", "decided_by"])) ?? defaultDecidedBy,
  });

  const explicitId = asString(pickValue(record, ["id"]));
  return explicitId.length > 0 ? { ...created, id: explicitId } : created;
}

function normalizeOutcomeRecord(
  record: RawReviewerTrafficRecord,
  defaultDecidedBy: string | null,
  rowLabel: string,
  warnings: string[]
): TinaReviewerOutcomeRecord | null {
  const targetType = normalizeTargetType(pickValue(record, ["targetType", "target_type"]));
  const targetId = asString(pickValue(record, ["targetId", "target_id"]));
  const phase = normalizePhase(pickValue(record, ["phase"]));
  const verdict = normalizeVerdict(pickValue(record, ["verdict"]));
  const decidedAt =
    parseTimestamp(pickValue(record, ["decidedAt", "decided_at", "timestamp"])) ??
    new Date().toISOString();

  if (!targetType || targetId.length === 0 || !phase || !verdict) {
    warnings.push(`${rowLabel} is missing outcome target, phase, verdict, or target id and was skipped.`);
    return null;
  }

  const created = createTinaReviewerOutcomeRecord({
    title:
      asString(pickValue(record, ["title"])) ||
      `${targetType.replace(/_/g, " ")} ${verdict} review`,
    phase,
    verdict,
    targetType,
    targetId,
    summary: asString(pickValue(record, ["summary"])),
    lessons: splitList(pickValue(record, ["lessons", "lesson"])),
    caseTags: normalizeCaseTags(pickValue(record, ["caseTags", "case_tags", "tags"])),
    overrideIds: splitList(pickValue(record, ["overrideIds", "override_ids"])),
    decidedAt,
    decidedBy: asNullableString(pickValue(record, ["decidedBy", "decided_by"])) ?? defaultDecidedBy,
  });

  const explicitId = asString(pickValue(record, ["id"]));
  return explicitId.length > 0 ? { ...created, id: explicitId } : created;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsvRecords(content: string): RawReviewerTrafficRecord[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return headers.reduce<RawReviewerTrafficRecord>((record, header, index) => {
      record[header] = cells[index] ?? "";
      return record;
    }, {});
  });
}

function parseJsonRecords(content: string): RawReviewerTrafficRecord[] {
  const parsed = JSON.parse(content) as unknown;

  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is RawReviewerTrafficRecord => typeof item === "object" && item !== null);
  }

  if (typeof parsed !== "object" || parsed === null) {
    return [];
  }

  const envelope = parsed as Record<string, unknown>;
  if (Array.isArray(envelope.records)) {
    return envelope.records.filter(
      (item): item is RawReviewerTrafficRecord => typeof item === "object" && item !== null
    );
  }

  const overrides = Array.isArray(envelope.overrides)
    ? envelope.overrides.filter(
        (item): item is RawReviewerTrafficRecord => typeof item === "object" && item !== null
      )
    : [];
  const outcomes = Array.isArray(envelope.outcomes)
    ? envelope.outcomes.filter(
        (item): item is RawReviewerTrafficRecord => typeof item === "object" && item !== null
      )
    : [];

  return [
    ...overrides.map((record) => ({ recordType: "override", ...record })),
    ...outcomes.map((record) => ({ recordType: "outcome", ...record })),
  ];
}

function inferFormat(content: string): TinaReviewerTrafficImportFormat {
  const trimmed = content.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[") ? "json" : "csv";
}

export function importTinaReviewerTraffic(
  input: TinaReviewerTrafficImportInput
): TinaReviewerTrafficImportResult {
  const warnings: string[] = [];
  const format = input.format ?? inferFormat(input.content);
  const records =
    format === "json" ? parseJsonRecords(input.content) : parseCsvRecords(input.content);
  const overrides: TinaReviewerOverrideRecord[] = [];
  const outcomes: TinaReviewerOutcomeRecord[] = [];

  records.forEach((record, index) => {
    const rowLabel = format === "csv" ? `CSV row ${index + 2}` : `JSON record ${index + 1}`;
    const recordType = inferRecordType(record);

    if (recordType === "override") {
      const normalized = normalizeOverrideRecord(
        record,
        input.defaultDecidedBy ?? null,
        rowLabel,
        warnings
      );
      if (normalized) overrides.push(normalized);
      return;
    }

    if (recordType === "outcome") {
      const normalized = normalizeOutcomeRecord(
        record,
        input.defaultDecidedBy ?? null,
        rowLabel,
        warnings
      );
      if (normalized) outcomes.push(normalized);
      return;
    }

    warnings.push(`${rowLabel} did not look like an override or outcome and was skipped.`);
  });

  return {
    overrides,
    outcomes,
    warnings,
  };
}
