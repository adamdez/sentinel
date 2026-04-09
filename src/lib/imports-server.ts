import { createServerClient } from "@/lib/supabase";
import type { DuplicateCandidate, ImportTemplateRecord, NormalizedImportRecord } from "@/lib/import-normalization";

const TEMPLATE_ACTION = "import.template.saved";
type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike | undefined };

type SupabaseLike = ReturnType<typeof createServerClient>;

export async function requireImportUser(authHeader: string | null, sb: SupabaseLike) {
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function loadImportTemplates(sb: SupabaseLike): Promise<ImportTemplateRecord[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("event_log") as any)
    .select("entity_id, details, created_at, user_id")
    .eq("entity_type", "import_template")
    .eq("action", TEMPLATE_ACTION)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !Array.isArray(data)) {
    return [];
  }

  const seen = new Set<string>();
  const templates: ImportTemplateRecord[] = [];
  for (const row of data as Array<{ entity_id: string; details: unknown; created_at: string | null; user_id: string | null }>) {
    if (!row.entity_id || seen.has(row.entity_id)) continue;
    const details = asObject(row.details);
    const mapping = asObject(details?.mapping) as ImportTemplateRecord["mapping"] | null;
    const defaults = asObject(details?.defaults) ?? {};
    const headerSignature = asString(details?.header_signature);
    if (!mapping || !headerSignature) continue;
    seen.add(row.entity_id);
    templates.push({
      id: row.entity_id,
      name: asString(details?.name) ?? row.entity_id,
      vendorKey: asString(details?.vendor_key),
      sheetName: asString(details?.sheet_name),
      headerSignature,
      mapping,
      defaults: defaults as Record<string, JsonLike>,
      createdAt: row.created_at,
      updatedAt: row.created_at,
      updatedBy: row.user_id,
    });
  }

  return templates;
}

export async function saveImportTemplate(args: {
  sb: SupabaseLike;
  templateId: string;
  userId: string | null;
  name: string;
  vendorKey: string | null;
  sheetName: string | null;
  headerSignature: string;
  mapping: Partial<Record<string, string>>;
  defaults: Record<string, unknown>;
}) {
  const { sb, templateId, userId, name, vendorKey, sheetName, headerSignature, mapping, defaults } = args;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: userId,
    action: TEMPLATE_ACTION,
    entity_type: "import_template",
    entity_id: templateId,
    details: {
      name,
      vendor_key: vendorKey,
      sheet_name: sheetName,
      header_signature: headerSignature,
      mapping,
      defaults,
    },
  });
}

function mergeReasons(level: DuplicateCandidate["level"], reasons: string[], propertyId?: string | null, leadId?: string | null): DuplicateCandidate {
  return { level, reasons, propertyId, leadId };
}

function cleanPhoneForQuery(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length >= 10 ? digits.slice(-10) : null;
}

const IMPORT_PHONE_FIELDS = [
  "phone",
  "phone2",
  "phone3",
  "phone4",
  "phone5",
  "phone6",
  "phone7",
  "phone8",
  "phone9",
  "phone10",
] as const;

type ImportedPhoneField = (typeof IMPORT_PHONE_FIELDS)[number];
type ImportedPhoneRecord = Pick<NormalizedImportRecord, ImportedPhoneField>;

function formatLeadPhoneValue(digits: string): string {
  return `+1${digits}`;
}

function normalizeLeadPhoneSource(value: string): string {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned || "csv_import";
}

export function extractImportedPhoneCandidates(record: ImportedPhoneRecord): string[] {
  const seen = new Set<string>();
  const phones: string[] = [];

  for (const field of IMPORT_PHONE_FIELDS) {
    const normalized = cleanPhoneForQuery(record[field]);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    phones.push(normalized);
  }

  return phones;
}

export async function findDuplicateCandidate(
  sb: SupabaseLike,
  record: NormalizedImportRecord,
  cache: Map<string, DuplicateCandidate>
): Promise<DuplicateCandidate> {
  const sentinelLeadId = asString(record.sentinelLeadId);
  if (sentinelLeadId) {
    const cacheKey = `lead:${sentinelLeadId}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: matchedLead } = await (sb.from("leads") as any)
      .select("id, property_id")
      .eq("id", sentinelLeadId)
      .maybeSingle();

    if (matchedLead?.id && matchedLead?.property_id) {
      const duplicate = mergeReasons("high", ["Matched Sentinel Lead ID"], matchedLead.property_id, matchedLead.id);
      cache.set(cacheKey, duplicate);
      return duplicate;
    }
  }

  const apnKey = record.apn && record.county ? `apn:${record.apn.toLowerCase()}::${record.county}` : null;
  if (apnKey && cache.has(apnKey)) return cache.get(apnKey)!;

  if (record.apn && record.county) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb.from("properties") as any)
      .select("id")
      .eq("apn", record.apn)
      .eq("county", record.county)
      .maybeSingle();
    if (data?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lead } = await (sb.from("leads") as any)
        .select("id")
        .eq("property_id", data.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const duplicate = mergeReasons("high", ["Matched existing APN + county"], data.id, lead?.id ?? null);
      if (apnKey) cache.set(apnKey, duplicate);
      return duplicate;
    }
  }

  const phone = cleanPhoneForQuery(record.phone);
  if (phone) {
    const cacheKey = `phone:${phone}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb.from("properties") as any)
      .select("id, owner_phone")
      .eq("owner_phone", phone)
      .limit(1);
    if (Array.isArray(data) && data[0]?.id) {
      const duplicate = mergeReasons("possible", ["Matched existing phone"], data[0].id, null);
      cache.set(cacheKey, duplicate);
      return duplicate;
    }
  }

  if (record.email) {
    const cacheKey = `email:${record.email}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb.from("properties") as any)
      .select("id")
      .eq("owner_email", record.email)
      .limit(1);
    if (Array.isArray(data) && data[0]?.id) {
      const duplicate = mergeReasons("high", ["Matched existing email"], data[0].id, null);
      cache.set(cacheKey, duplicate);
      return duplicate;
    }
  }

  if (record.propertyAddress && record.county) {
    const cacheKey = `address:${record.propertyAddress.toLowerCase()}::${record.county}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb.from("properties") as any)
      .select("id, owner_name")
      .eq("address", record.propertyAddress)
      .eq("county", record.county)
      .limit(3);
    if (Array.isArray(data) && data.length > 0) {
      const ownerMatch = record.ownerName
        ? data.some((row) => asString(row.owner_name)?.toLowerCase() === record.ownerName?.toLowerCase())
        : false;
      const duplicate = mergeReasons(
        ownerMatch ? "high" : "possible",
        [ownerMatch ? "Matched existing owner + property address" : "Matched existing property address"],
        data[0].id,
        null,
      );
      cache.set(cacheKey, duplicate);
      return duplicate;
    }
  }

  return { level: "none", reasons: [] };
}

async function promoteImportedPhonesToExistingLead(args: {
  sb: SupabaseLike;
  leadId: string;
  propertyId: string;
  record: ImportedPhoneRecord;
  existingPropertyOwnerPhone: string | null;
  desiredPrimaryPhone: string | null;
  sourceLabel: string;
}) {
  const { sb, leadId, propertyId, record, existingPropertyOwnerPhone, desiredPrimaryPhone, sourceLabel } = args;
  const importedPhones = extractImportedPhoneCandidates(record);
  if (importedPhones.length === 0) return 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingLeadPhones } = await (sb.from("lead_phones") as any)
    .select("phone, position, is_primary, status")
    .eq("lead_id", leadId)
    .order("position", { ascending: true });

  const existingRows = Array.isArray(existingLeadPhones) ? existingLeadPhones as Array<{
    phone: string | null;
    position: number | null;
    is_primary: boolean | null;
    status: string | null;
  }> : [];

  const knownPhoneDigits = new Set<string>();
  const existingPropertyPhoneDigits = cleanPhoneForQuery(existingPropertyOwnerPhone);
  if (existingPropertyPhoneDigits) knownPhoneDigits.add(existingPropertyPhoneDigits);

  for (const row of existingRows) {
    const normalized = cleanPhoneForQuery(asString(row.phone));
    if (normalized) knownPhoneDigits.add(normalized);
  }

  const desiredPrimaryDigits = cleanPhoneForQuery(desiredPrimaryPhone) ?? importedPhones[0] ?? null;
  const hasPrimaryLeadPhone = existingRows.some((row) => row.is_primary === true);
  let primaryInserted = false;
  let nextPosition = Math.max(
    -1,
    ...existingRows.map((row) => typeof row.position === "number" ? row.position : -1),
  ) + 1;
  let inserted = 0;

  for (const digits of importedPhones) {
    if (knownPhoneDigits.has(digits)) continue;

    const isPrimary = !hasPrimaryLeadPhone && !primaryInserted && digits === desiredPrimaryDigits;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from("lead_phones") as any).insert({
      lead_id: leadId,
      property_id: propertyId,
      phone: formatLeadPhoneValue(digits),
      label: isPrimary ? "primary" : "mobile",
      source: sourceLabel,
      status: "active",
      is_primary: isPrimary,
      position: nextPosition,
    });

    if (error?.code === "23505") {
      knownPhoneDigits.add(digits);
      continue;
    }
    if (error) {
      throw error;
    }

    knownPhoneDigits.add(digits);
    inserted += 1;
    nextPosition += 1;
    if (isPrimary) {
      primaryInserted = true;
    }
  }

  return inserted;
}

export async function updateExistingRecordFromImport(args: {
  sb: SupabaseLike;
  duplicate: DuplicateCandidate;
  record: NormalizedImportRecord;
  defaults: {
    sourceChannel: string;
    sourceVendor: string;
    sourceListName: string;
    sourcePullDate: string;
    nicheTag: string;
    importBatchId: string;
    templateId: string;
    skipTraceStatus: string;
    outreachType: string;
  };
}) {
  const { sb, duplicate, record, defaults } = args;
  if (!duplicate.propertyId) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: property } = await (sb.from("properties") as any)
    .select("owner_flags, owner_phone, owner_email, owner_name, city, state, zip")
    .eq("id", duplicate.propertyId)
    .single();

  const ownerFlags = asObject(property?.owner_flags) ?? {};
  const prospecting = asObject(ownerFlags.prospecting_intake) ?? {};
  const outbound = asObject(ownerFlags.outbound_intake) ?? {};
  const importedPhoneCandidates = extractImportedPhoneCandidates(record);
  const primaryImportedPhone = importedPhoneCandidates[0] ?? null;

  const propertyPatch: Record<string, unknown> = {
    owner_flags: {
      ...ownerFlags,
      co_owner_name: record.coOwnerName ?? ownerFlags.co_owner_name,
      mailing_address: ownerFlags.mailing_address ?? (
        record.mailingAddress
          ? {
            street: record.mailingAddress,
            city: record.mailingCity,
            state: record.mailingState,
            zip: record.mailingZip,
          }
          : null
      ),
      prospecting_intake: {
        ...prospecting,
        source_channel: prospecting.source_channel ?? defaults.sourceChannel,
        source_vendor: prospecting.source_vendor ?? record.sourceVendor ?? defaults.sourceVendor,
        source_list_name: prospecting.source_list_name ?? record.sourceListName ?? defaults.sourceListName,
        source_pull_date: prospecting.source_pull_date ?? defaults.sourcePullDate,
        niche_tag: prospecting.niche_tag ?? defaults.nicheTag,
        import_batch_id: defaults.importBatchId,
        raw_source_metadata: {
          latest_duplicate_append: {
            row_number: record.rowNumber,
            template_id: defaults.templateId || null,
            raw_row_payload: record.rawRowPayload,
            warnings: [...record.warnings, ...record.mappingWarnings, ...record.duplicate.reasons],
          },
        },
      },
      outbound_intake: {
        ...outbound,
        outreach_type: outbound.outreach_type ?? defaults.outreachType,
        skip_trace_status: outbound.skip_trace_status ?? defaults.skipTraceStatus,
        outbound_status: outbound.outbound_status ?? "needs_review",
      },
    },
  };

  if (!property?.owner_phone && primaryImportedPhone) propertyPatch.owner_phone = primaryImportedPhone;
  if (!property?.owner_email && record.email) propertyPatch.owner_email = record.email;
  if ((!property?.owner_name || property.owner_name === "Unknown Owner") && record.ownerName) propertyPatch.owner_name = record.ownerName;
  if (!property?.city && record.propertyCity) propertyPatch.city = record.propertyCity;
  if (!property?.state && record.propertyState) propertyPatch.state = record.propertyState;
  if (!property?.zip && record.propertyZip) propertyPatch.zip = record.propertyZip;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("properties") as any).update(propertyPatch).eq("id", duplicate.propertyId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (sb.from("leads") as any)
    .select("id, tags, notes, source")
    .eq("property_id", duplicate.propertyId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lead?.id) {
    const existingTags: string[] = Array.isArray(lead.tags) ? lead.tags : [];
    const nextTags = Array.from(new Set([...existingTags, ...record.distressTags]));
    const hasNewTags = nextTags.length > existingTags.length;
    const noteAppend = [`Import append from ${defaults.importBatchId || "batch import"}`, record.notes]
      .filter(Boolean)
      .join(" - ");
    const desiredPrimaryPhone =
      typeof propertyPatch.owner_phone === "string"
        ? propertyPatch.owner_phone
        : asString(property?.owner_phone);

    const leadPatch: Record<string, unknown> = {
      tags: nextTags,
      source: lead.source ?? defaults.sourceChannel,
      notes: noteAppend
        ? [lead.notes, noteAppend].filter(Boolean).join("\n")
        : lead.notes,
    };

    // Rescore if new distress tags were added (stacking bonus may change)
    if (hasNewTags) {
      try {
        const { computeScore } = await import("@/lib/scoring");
        const DISTRESS_TYPES = new Set([
          "probate", "pre_foreclosure", "tax_lien", "code_violation",
          "vacant", "divorce", "bankruptcy", "fsbo", "absentee",
          "inherited", "water_shutoff", "condemned", "tired_landlord", "underwater",
        ]);
        const signals = nextTags
          .filter((t) => DISTRESS_TYPES.has(t))
          .map((t) => ({
            type: t as import("@/lib/types").DistressType,
            severity: 5 as number,
            daysSinceEvent: 30,
            status: "active" as const,
          }));
        const scoreResult = computeScore({
          signals,
          ownerFlags: {
            absentee: nextTags.includes("absentee"),
            inherited: nextTags.includes("inherited"),
          },
          equityPercent: 0,
          compRatio: 0,
          historicalConversionRate: 0,
        });
        leadPatch.priority = scoreResult.composite;
        console.log(`[Import] Rescored lead ${lead.id}: ${existingTags.length} → ${nextTags.length} tags, score ${scoreResult.composite} (${scoreResult.label})`);
      } catch (scoreErr) {
        console.error("[Import] Rescore failed (non-fatal):", scoreErr);
      }
    }

    const importSource = normalizeLeadPhoneSource(record.sourceVendor ?? defaults.sourceVendor ?? defaults.sourceChannel);
    await promoteImportedPhonesToExistingLead({
      sb,
      leadId: lead.id,
      propertyId: duplicate.propertyId,
      record,
      existingPropertyOwnerPhone: asString(property?.owner_phone),
      desiredPrimaryPhone,
      sourceLabel: `import:${importSource}`,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("leads") as any)
      .update(leadPatch)
      .eq("id", lead.id);
  }

  return true;
}
