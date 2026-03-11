const POSITIVE_PRIORITY_TAGS = new Set([
  "inherited",
  "probate",
  "tax_delinquent",
  "absentee_owner",
  "tired_landlord",
  "vacant",
  "code_issue",
  "possible_developer",
]);

export const PROSPECTING_TAG_OPTIONS = [
  "inherited",
  "probate",
  "tax_delinquent",
  "absentee_owner",
  "tired_landlord",
  "vacant",
  "code_issue",
  "rural",
  "mobile_home",
  "possible_developer",
  "out_of_area",
  "do_not_call",
  "bad_data",
] as const;

export const NICHE_TAG_OPTIONS = [
  "inherited",
  "probate",
  "tax_delinquent",
  "absentee_owner",
  "tired_landlord",
  "vacant",
  "code_issue",
  "rural",
  "mobile_home",
  "possible_developer",
  "out_of_area",
] as const;

export const SOURCE_CHANNEL_OPTIONS = [
  "manual",
  "webform",
  "email_intake",
  "ppl",
  "vendor_inbound",
  "csv_import",
  "driving_for_dollars",
  "county_records",
  "propertyradar",
  "batch_skip_trace",
  "referral",
] as const;

export const OUTREACH_TYPE_OPTIONS = [
  "cold_call",
  "warm_call",
  "follow_up_call",
  "ringless_voicemail",
] as const;

export const SKIP_TRACE_STATUS_OPTIONS = [
  "not_started",
  "needs_skip_trace",
  "partial",
  "completed",
  "bad_data",
] as const;

export const OUTBOUND_STATUS_OPTIONS = [
  "new_import",
  "new_inbound",
  "needs_review",
  "possible_duplicate",
  "missing_phone",
  "missing_property_address",
  "ready_for_first_call",
  "ready_to_call",
  "ready_for_outreach",
  "working",
  "follow_up",
  "wrong_number",
  "do_not_call",
  "bad_record",
  "junk",
  "paused",
] as const;

export type ProspectingTag = (typeof PROSPECTING_TAG_OPTIONS)[number];

export interface ProspectingSnapshot {
  sourceChannel: string | null;
  sourceVendor: string | null;
  sourceListName: string | null;
  sourcePullDate: string | null;
  sourceCampaign: string | null;
  intakeMethod: string | null;
  rawSourceRef: string | null;
  duplicateStatus: string | null;
  receivedAt: string | null;
  county: string | null;
  nicheTag: string | null;
  importBatchId: string | null;
  outreachType: string | null;
  assignedAt: string | null;
  firstCallAt: string | null;
  lastCallAt: string | null;
  firstContactAt: string | null;
  attemptCount: number | null;
  skipTraceStatus: string | null;
  callOutcome: string | null;
  wrongNumber: boolean;
  doNotCall: boolean;
  badRecord: boolean;
  outboundStatus: string | null;
  rawSourceMetadata: Record<string, unknown> | null;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true" || value === "yes";
}

export function normalizeTagList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
        .filter(Boolean),
    ),
  );
}

export function scoringTagCount(tags: string[]): number {
  return tags.filter((tag) => POSITIVE_PRIORITY_TAGS.has(tag)).length;
}

export function tagLabel(tag: string): string {
  return tag
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function sourceChannelLabel(value: string | null | undefined): string {
  const normalized = (value ?? "manual").trim().toLowerCase();
  if (normalized === "csv_import") return "CSV Import";
  if (normalized === "email_intake") return "Email Intake";
  if (normalized === "vendor_inbound") return "Vendor Inbound";
  if (normalized === "driving_for_dollars") return "Driving for Dollars";
  if (normalized === "county_records") return "County Records";
  if (normalized === "batch_skip_trace") return "Batch Skip Trace";
  return tagLabel(normalized);
}

export function extractProspectingSnapshot(ownerFlags: unknown): ProspectingSnapshot {
  const flags = toObject(ownerFlags);
  const intake = toObject(flags?.prospecting_intake);
  const outbound = toObject(flags?.outbound_intake);

  return {
    sourceChannel: toStringOrNull(intake?.source_channel ?? flags?.source_channel),
    sourceVendor: toStringOrNull(intake?.source_vendor ?? flags?.source_vendor),
    sourceListName: toStringOrNull(intake?.source_list_name ?? flags?.source_list_name),
    sourcePullDate: toStringOrNull(intake?.source_pull_date ?? flags?.source_pull_date),
    sourceCampaign: toStringOrNull(intake?.source_campaign ?? flags?.source_campaign),
    intakeMethod: toStringOrNull(intake?.intake_method ?? flags?.intake_method),
    rawSourceRef: toStringOrNull(intake?.raw_source_ref ?? flags?.raw_source_ref),
    duplicateStatus: toStringOrNull(intake?.duplicate_status ?? flags?.duplicate_status),
    receivedAt: toStringOrNull(intake?.received_at ?? flags?.received_at),
    county: toStringOrNull(intake?.county ?? flags?.county),
    nicheTag: toStringOrNull(intake?.niche_tag ?? flags?.niche_tag),
    importBatchId: toStringOrNull(intake?.import_batch_id ?? flags?.import_batch_id),
    outreachType: toStringOrNull(outbound?.outreach_type ?? flags?.outreach_type),
    assignedAt: toStringOrNull(outbound?.assigned_at ?? flags?.assigned_at),
    firstCallAt: toStringOrNull(outbound?.first_call_at ?? flags?.first_call_at),
    lastCallAt: toStringOrNull(outbound?.last_call_at ?? flags?.last_call_at),
    firstContactAt: toStringOrNull(outbound?.first_contact_at ?? flags?.first_contact_at),
    attemptCount: toNumberOrNull(outbound?.attempt_count ?? flags?.attempt_count),
    skipTraceStatus: toStringOrNull(outbound?.skip_trace_status ?? flags?.skip_trace_status),
    callOutcome: toStringOrNull(outbound?.call_outcome ?? flags?.call_outcome),
    wrongNumber: toBoolean(outbound?.wrong_number ?? flags?.wrong_number),
    doNotCall: toBoolean(outbound?.do_not_call ?? flags?.do_not_call),
    badRecord: toBoolean(outbound?.bad_record ?? flags?.bad_record),
    outboundStatus: toStringOrNull(outbound?.outbound_status ?? flags?.outbound_status),
    rawSourceMetadata: toObject(intake?.raw_source_metadata ?? flags?.raw_source_metadata),
  };
}

export function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}
