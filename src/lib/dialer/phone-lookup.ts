/**
 * Unified Phone Lookup — searches ALL phone-bearing tables in priority order.
 *
 * Single source of truth for "given a phone number, who is this?"
 * Used by inbound call handlers, search, and the dialer workspace.
 *
 * BOUNDARY:
 *   - Read-only cross-domain query (same character as crm-bridge.ts)
 *   - Imports only from @supabase/supabase-js and local db.ts
 *   - Never writes to any table
 *
 * Priority cascade (first match with a lead_id wins):
 *   1. contacts.phone       → leads via contact_id  (direct)
 *   2. lead_phones.phone    → lead_phones.lead_id    (direct)
 *   3. properties.owner_phone → leads via property_id (indirect)
 *   4. intake_leads.owner_phone                       (indirect, pending intake)
 *   5. calls_log.phone_dialed → calls_log.lead_id    (indirect, historical)
 *   6. call_sessions.phone_dialed → call_sessions.lead_id (indirect, session history)
 *   7. dialer_auto_cycle_phones.phone → lead_id       (indirect, auto-cycle history)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createDialerClient } from "./db";

// ── Types ────────────────────────────────────────────────────────────

export type PhoneMatchSource =
  | "contacts"
  | "lead_phones"
  | "properties"
  | "intake_leads"
  | "calls_log"
  | "call_sessions"
  | "sms_messages"
  | "auto_cycle"
  | null;

export type PhoneMatchConfidence = "direct" | "indirect" | "none";

export interface PhoneLookupResult {
  /** Best-match lead ID, null if truly unknown */
  leadId: string | null;
  /** How we found the match */
  matchSource: PhoneMatchSource;
  /** direct = contacts/lead_phones, indirect = property/history, none = unknown */
  matchConfidence: PhoneMatchConfidence;
  /** Owner/contact name if available */
  ownerName: string | null;
  /** Property address if available */
  propertyAddress: string | null;
  /** Contact ID if matched via contacts table */
  contactId: string | null;
  /** Property ID if matched via properties table */
  propertyId: string | null;
  /** If matched via intake_leads, the intake_lead ID */
  intakeLeadId: string | null;
  /** Recent call count for this number across calls_log */
  recentCallCount: number;
  /** Last call date for this number (ISO string) */
  lastCallDate: string | null;
}

export interface PhoneSearchCandidate extends PhoneLookupResult {
  matchedPhone: string | null;
  matchReason: string;
  exact: boolean;
  phoneStatus: string | null;
}

type CandidateSeed = Partial<PhoneLookupResult> & {
  matchedPhone: string | null;
  phoneStatus?: string | null;
};

// ── Phone normalization ──────────────────────────────────────────────

function normalizeDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Strip leading country code 1 for US numbers
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Build an OR filter that matches common phone storage formats.
 * Handles: +15091234567, 15091234567, 5091234567, +1 509-123-4567
 */
function phoneOrFilter(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  const withCountry = `1${last10}`;
  return [
    `phone.eq.${raw}`,
    `phone.eq.+${withCountry}`,
    `phone.eq.${withCountry}`,
    `phone.eq.${last10}`,
  ].join(",");
}

function phoneIlike(digits: string): string {
  return `%${digits.slice(-10)}`;
}

function isExactPhoneMatch(queryDigits: string, candidatePhone: string | null): boolean {
  if (!candidatePhone) return false;
  const normalizedCandidate = normalizeDigits(candidatePhone);
  const normalizedQuery = normalizeDigits(queryDigits);
  if (normalizedQuery.length < 7) return false;
  return normalizedCandidate.endsWith(normalizedQuery);
}

function sourceRank(source: PhoneMatchSource, phoneStatus?: string | null): number {
  if (source === "contacts") return 100;
  if (source === "lead_phones") return phoneStatus === "active" ? 95 : 72;
  if (source === "properties") return 90;
  if (source === "sms_messages") return 68;
  if (source === "calls_log") return 64;
  if (source === "call_sessions") return 62;
  if (source === "auto_cycle") return 58;
  if (source === "intake_leads") return 40;
  return 0;
}

export function phoneMatchReason(
  source: PhoneMatchSource,
  options?: { phoneStatus?: string | null },
): string {
  if (source === "contacts") return "Direct phone";
  if (source === "lead_phones") {
    return options?.phoneStatus && options.phoneStatus !== "active"
      ? "Old lead phone"
      : "Direct phone";
  }
  if (source === "properties") return "Direct phone";
  if (source === "sms_messages") return "SMS thread";
  if (source === "calls_log" || source === "call_sessions") return "Historical call";
  if (source === "auto_cycle") return "Historical dial";
  if (source === "intake_leads") return "Intake phone";
  return "Phone match";
}

// ── The unified lookup ───────────────────────────────────────────────

export async function unifiedPhoneLookup(
  phone: string,
  sb?: SupabaseClient,
): Promise<PhoneLookupResult> {
  const client = sb ?? createDialerClient();
  const digits = normalizeDigits(phone);

  if (digits.length < 7) {
    return emptyResult();
  }

  const ilike = phoneIlike(digits);

  // ── Tier 1: High-confidence direct matches (parallel) ────────────
  const [contactMatch, leadPhoneMatch, propertyMatch] = await Promise.all([
    lookupViaContacts(client, phone, digits),
    lookupViaLeadPhones(client, ilike),
    lookupViaProperties(client, ilike),
  ]);

  // Contacts is highest priority
  if (contactMatch.leadId) {
    const history = await callHistory(client, ilike);
    return { ...contactMatch, ...history };
  }

  // lead_phones is next
  if (leadPhoneMatch.leadId) {
    const history = await callHistory(client, ilike);
    return { ...leadPhoneMatch, ...history };
  }

  // properties match (indirect but still strong)
  if (propertyMatch.leadId) {
    const history = await callHistory(client, ilike);
    return { ...propertyMatch, ...history };
  }

  // If properties found a property but no lead, keep that info
  const partialProperty = propertyMatch.propertyId ? propertyMatch : null;

  // ── Tier 2: Lower-confidence matches (sequential, only if Tier 1 missed) ──
  const intakeMatch = await lookupViaIntakeLeads(client, ilike);
  if (intakeMatch.intakeLeadId) {
    const history = await callHistory(client, ilike);
    return {
      ...intakeMatch,
      propertyId: partialProperty?.propertyId ?? null,
      propertyAddress: partialProperty?.propertyAddress ?? intakeMatch.propertyAddress,
      ...history,
    };
  }

  const callsLogMatch = await lookupViaCallsLog(client, ilike);
  if (callsLogMatch.leadId) {
    const history = await callHistory(client, ilike);
    return {
      ...callsLogMatch,
      propertyId: partialProperty?.propertyId ?? null,
      propertyAddress: partialProperty?.propertyAddress ?? null,
      ...history,
    };
  }

  const sessionMatch = await lookupViaCallSessions(client, ilike);
  if (sessionMatch.leadId) {
    const history = await callHistory(client, ilike);
    return {
      ...sessionMatch,
      propertyId: partialProperty?.propertyId ?? null,
      propertyAddress: partialProperty?.propertyAddress ?? null,
      ...history,
    };
  }

  const autoCycleMatch = await lookupViaAutoCycle(client, ilike);
  if (autoCycleMatch.leadId) {
    const history = await callHistory(client, ilike);
    return {
      ...autoCycleMatch,
      propertyId: partialProperty?.propertyId ?? null,
      propertyAddress: partialProperty?.propertyAddress ?? null,
      ...history,
    };
  }

  // ── No match at all ───────────────────────────────────────────────
  const history = await callHistory(client, ilike);
  return {
    ...emptyResult(),
    propertyId: partialProperty?.propertyId ?? null,
    propertyAddress: partialProperty?.propertyAddress ?? null,
    ownerName: partialProperty?.ownerName ?? null,
    ...history,
  };
}

export async function searchPhoneCandidates(
  phone: string,
  sb?: SupabaseClient,
  options?: { limit?: number },
): Promise<PhoneSearchCandidate[]> {
  const client = sb ?? createDialerClient();
  const digits = normalizeDigits(phone);

  if (digits.length < 4) {
    return [];
  }

  const ilike = phoneIlike(digits);
  const limitPerSource = Math.max(3, options?.limit ?? 8);

  const [
    contactSeeds,
    leadPhoneSeeds,
    propertySeeds,
    intakeSeeds,
    callSeeds,
    sessionSeeds,
    smsSeeds,
    autoCycleSeeds,
    directMatch,
  ] = await Promise.all([
    findContactCandidates(client, digits, limitPerSource),
    findLeadPhoneCandidates(client, ilike, limitPerSource),
    findPropertyCandidates(client, ilike, limitPerSource),
    findIntakeCandidates(client, ilike, limitPerSource),
    findCallsLogCandidates(client, ilike, limitPerSource),
    findCallSessionCandidates(client, ilike, limitPerSource),
    findSmsThreadCandidates(client, ilike, limitPerSource),
    findAutoCycleCandidates(client, ilike, limitPerSource),
    digits.length >= 7 ? unifiedPhoneLookup(phone, client) : Promise.resolve(null),
  ]);

  const combinedSeeds: CandidateSeed[] = [
    ...(directMatch?.matchSource
      ? [{
          ...directMatch,
          matchedPhone: phone,
          phoneStatus: directMatch.matchSource === "lead_phones" ? "active" : null,
        }]
      : []),
    ...contactSeeds,
    ...leadPhoneSeeds,
    ...propertySeeds,
    ...intakeSeeds,
    ...callSeeds,
    ...sessionSeeds,
    ...smsSeeds,
    ...autoCycleSeeds,
  ];

  const hydrated = await hydratePhoneCandidates(client, combinedSeeds, digits);
  const deduped = dedupePhoneCandidates(hydrated, digits);

  return deduped.slice(0, options?.limit ?? 8);
}

// ── Individual lookup functions ──────────────────────────────────────

async function lookupViaContacts(
  sb: SupabaseClient,
  rawPhone: string,
  digits: string,
): Promise<PhoneLookupResult> {
  const orFilter = phoneOrFilter(rawPhone);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("contacts") as any)
    .select("id, first_name, last_name, phone, leads!contact_id(id)")
    .or(orFilter)
    .limit(1);

  if (data && data.length > 0) {
    const c = data[0];
    const leadId = Array.isArray(c.leads) && c.leads.length > 0 ? c.leads[0].id : null;
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
    return {
      leadId,
      matchSource: "contacts",
      matchConfidence: "direct",
      ownerName: name,
      propertyAddress: null,
      contactId: c.id,
      propertyId: null,
      intakeLeadId: null,
      recentCallCount: 0,
      lastCallDate: null,
    };
  }

  // Also try ilike for partial format mismatches
  const last10 = digits.slice(-10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: fuzzy } = await (sb.from("contacts") as any)
    .select("id, first_name, last_name, phone, leads!contact_id(id)")
    .ilike("phone", `%${last10}`)
    .limit(1);

  if (fuzzy && fuzzy.length > 0) {
    const c = fuzzy[0];
    const leadId = Array.isArray(c.leads) && c.leads.length > 0 ? c.leads[0].id : null;
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
    return {
      leadId,
      matchSource: "contacts",
      matchConfidence: "direct",
      ownerName: name,
      propertyAddress: null,
      contactId: c.id,
      propertyId: null,
      intakeLeadId: null,
      recentCallCount: 0,
      lastCallDate: null,
    };
  }

  return emptyResult();
}

async function lookupViaLeadPhones(
  sb: SupabaseClient,
  ilike: string,
): Promise<PhoneLookupResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("lead_phones") as any)
    .select("id, phone, lead_id, label, status")
    .ilike("phone", ilike)
    .eq("status", "active")
    .limit(1);

  if (data && data.length > 0) {
    return {
      leadId: data[0].lead_id,
      matchSource: "lead_phones",
      matchConfidence: "direct",
      ownerName: null,
      propertyAddress: null,
      contactId: null,
      propertyId: null,
      intakeLeadId: null,
      recentCallCount: 0,
      lastCallDate: null,
    };
  }
  return emptyResult();
}

async function lookupViaProperties(
  sb: SupabaseClient,
  ilike: string,
): Promise<PhoneLookupResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("properties") as any)
    .select("id, owner_name, owner_phone, address, leads(id)")
    .ilike("owner_phone", ilike)
    .limit(1);

  if (data && data.length > 0) {
    const p = data[0];
    const leadId = Array.isArray(p.leads) && p.leads.length > 0 ? p.leads[0].id : null;
    return {
      leadId,
      matchSource: "properties",
      matchConfidence: "indirect",
      ownerName: p.owner_name ?? null,
      propertyAddress: p.address ?? null,
      contactId: null,
      propertyId: p.id,
      intakeLeadId: null,
      recentCallCount: 0,
      lastCallDate: null,
    };
  }
  return emptyResult();
}

async function lookupViaIntakeLeads(
  sb: SupabaseClient,
  ilike: string,
): Promise<PhoneLookupResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("intake_leads") as any)
    .select("id, owner_name, owner_phone, property_address, status")
    .ilike("owner_phone", ilike)
    .order("created_at", { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    return {
      leadId: null,
      matchSource: "intake_leads",
      matchConfidence: "indirect",
      ownerName: data[0].owner_name ?? null,
      propertyAddress: data[0].property_address ?? null,
      contactId: null,
      propertyId: null,
      intakeLeadId: data[0].id,
      recentCallCount: 0,
      lastCallDate: null,
    };
  }
  return emptyResult();
}

async function lookupViaCallsLog(
  sb: SupabaseClient,
  ilike: string,
): Promise<PhoneLookupResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("calls_log") as any)
    .select("id, lead_id, phone_dialed, created_at")
    .ilike("phone_dialed", ilike)
    .not("lead_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    return {
      leadId: data[0].lead_id,
      matchSource: "calls_log",
      matchConfidence: "indirect",
      ownerName: null,
      propertyAddress: null,
      contactId: null,
      propertyId: null,
      intakeLeadId: null,
      recentCallCount: 0,
      lastCallDate: null,
    };
  }
  return emptyResult();
}

async function lookupViaCallSessions(
  sb: SupabaseClient,
  ilike: string,
): Promise<PhoneLookupResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("call_sessions") as any)
    .select("id, lead_id, phone_dialed, created_at")
    .ilike("phone_dialed", ilike)
    .not("lead_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    return {
      leadId: data[0].lead_id,
      matchSource: "call_sessions",
      matchConfidence: "indirect",
      ownerName: null,
      propertyAddress: null,
      contactId: null,
      propertyId: null,
      intakeLeadId: null,
      recentCallCount: 0,
      lastCallDate: null,
    };
  }
  return emptyResult();
}

async function lookupViaAutoCycle(
  sb: SupabaseClient,
  ilike: string,
): Promise<PhoneLookupResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("dialer_auto_cycle_phones") as any)
    .select("id, lead_id, phone")
    .ilike("phone", ilike)
    .limit(1);

  if (data && data.length > 0 && data[0].lead_id) {
    return {
      leadId: data[0].lead_id,
      matchSource: "auto_cycle",
      matchConfidence: "indirect",
      ownerName: null,
      propertyAddress: null,
      contactId: null,
      propertyId: null,
      intakeLeadId: null,
      recentCallCount: 0,
      lastCallDate: null,
    };
  }
  return emptyResult();
}

// ── Call history summary ─────────────────────────────────────────────

async function findContactCandidates(
  sb: SupabaseClient,
  digits: string,
  limit: number,
): Promise<CandidateSeed[]> {
  const normalizedDigits = normalizeDigits(digits);
  const last10 = normalizedDigits.slice(-10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("contacts") as any)
    .select("id, first_name, last_name, phone, leads!contact_id(id)")
    .ilike("phone", `%${last10}`)
    .limit(limit);

  return (data ?? []).map((contact: Record<string, unknown>) => {
    const leads = Array.isArray(contact.leads) ? contact.leads as Array<{ id?: string | null }> : [];
    const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null;
    return {
      leadId: leads[0]?.id ?? null,
      matchSource: "contacts" as const,
      matchConfidence: "direct" as const,
      ownerName: name,
      contactId: (contact.id as string | null) ?? null,
      matchedPhone: (contact.phone as string | null) ?? null,
      phoneStatus: "active",
    };
  });
}

async function findLeadPhoneCandidates(
  sb: SupabaseClient,
  ilike: string,
  limit: number,
): Promise<CandidateSeed[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("lead_phones") as any)
    .select("phone, lead_id, status")
    .ilike("phone", ilike)
    .limit(limit);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    leadId: (row.lead_id as string | null) ?? null,
    matchSource: "lead_phones" as const,
    matchConfidence: (row.status as string | null) === "active" ? "direct" as const : "indirect" as const,
    matchedPhone: (row.phone as string | null) ?? null,
    phoneStatus: (row.status as string | null) ?? null,
  }));
}

async function findPropertyCandidates(
  sb: SupabaseClient,
  ilike: string,
  limit: number,
): Promise<CandidateSeed[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("properties") as any)
    .select("id, owner_name, owner_phone, address, leads(id)")
    .ilike("owner_phone", ilike)
    .limit(limit);

  return (data ?? []).map((property: Record<string, unknown>) => {
    const leads = Array.isArray(property.leads) ? property.leads as Array<{ id?: string | null }> : [];
    return {
      leadId: leads[0]?.id ?? null,
      matchSource: "properties" as const,
      matchConfidence: "direct" as const,
      ownerName: (property.owner_name as string | null) ?? null,
      propertyAddress: (property.address as string | null) ?? null,
      propertyId: (property.id as string | null) ?? null,
      matchedPhone: (property.owner_phone as string | null) ?? null,
      phoneStatus: "active",
    };
  });
}

async function findIntakeCandidates(
  sb: SupabaseClient,
  ilike: string,
  limit: number,
): Promise<CandidateSeed[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("intake_leads") as any)
    .select("id, owner_name, owner_phone, property_address")
    .ilike("owner_phone", ilike)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    leadId: null,
    matchSource: "intake_leads" as const,
    matchConfidence: "indirect" as const,
    ownerName: (row.owner_name as string | null) ?? null,
    propertyAddress: (row.property_address as string | null) ?? null,
    intakeLeadId: (row.id as string | null) ?? null,
    matchedPhone: (row.owner_phone as string | null) ?? null,
    phoneStatus: "active",
  }));
}

async function findCallsLogCandidates(
  sb: SupabaseClient,
  ilike: string,
  limit: number,
): Promise<CandidateSeed[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("calls_log") as any)
    .select("lead_id, phone_dialed, created_at")
    .ilike("phone_dialed", ilike)
    .not("lead_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    leadId: (row.lead_id as string | null) ?? null,
    matchSource: "calls_log" as const,
    matchConfidence: "indirect" as const,
    matchedPhone: (row.phone_dialed as string | null) ?? null,
    recentCallCount: 1,
    lastCallDate: (row.created_at as string | null) ?? null,
    phoneStatus: "historical",
  }));
}

async function findCallSessionCandidates(
  sb: SupabaseClient,
  ilike: string,
  limit: number,
): Promise<CandidateSeed[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("call_sessions") as any)
    .select("lead_id, phone_dialed, created_at")
    .ilike("phone_dialed", ilike)
    .not("lead_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    leadId: (row.lead_id as string | null) ?? null,
    matchSource: "call_sessions" as const,
    matchConfidence: "indirect" as const,
    matchedPhone: (row.phone_dialed as string | null) ?? null,
    lastCallDate: (row.created_at as string | null) ?? null,
    phoneStatus: "historical",
  }));
}

async function findSmsThreadCandidates(
  sb: SupabaseClient,
  ilike: string,
  limit: number,
): Promise<CandidateSeed[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("sms_messages") as any)
    .select("phone, lead_id, created_at")
    .ilike("phone", ilike)
    .not("lead_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    leadId: (row.lead_id as string | null) ?? null,
    matchSource: "sms_messages" as const,
    matchConfidence: "indirect" as const,
    matchedPhone: (row.phone as string | null) ?? null,
    lastCallDate: (row.created_at as string | null) ?? null,
    phoneStatus: "historical",
  }));
}

async function findAutoCycleCandidates(
  sb: SupabaseClient,
  ilike: string,
  limit: number,
): Promise<CandidateSeed[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("dialer_auto_cycle_phones") as any)
    .select("lead_id, phone")
    .ilike("phone", ilike)
    .not("lead_id", "is", null)
    .limit(limit);

  return (data ?? []).map((row: Record<string, unknown>) => ({
    leadId: (row.lead_id as string | null) ?? null,
    matchSource: "auto_cycle" as const,
    matchConfidence: "indirect" as const,
    matchedPhone: (row.phone as string | null) ?? null,
    phoneStatus: "historical",
  }));
}

async function hydratePhoneCandidates(
  sb: SupabaseClient,
  seeds: CandidateSeed[],
  queryDigits: string,
): Promise<PhoneSearchCandidate[]> {
  const leadIds = [...new Set(seeds.map((seed) => seed.leadId).filter(Boolean))] as string[];
  const directPropertyIds = [...new Set(seeds.map((seed) => seed.propertyId).filter(Boolean))] as string[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leadsPromise = leadIds.length > 0
    ? (sb.from("leads") as any)
        .select("id, property_id")
        .in("id", leadIds)
    : Promise.resolve({ data: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propertiesPromise = directPropertyIds.length > 0
    ? (sb.from("properties") as any)
        .select("id, owner_name, address")
        .in("id", directPropertyIds)
    : Promise.resolve({ data: [] });

  const [{ data: leads }, { data: directProperties }] = await Promise.all([leadsPromise, propertiesPromise]);

  const leadMap = new Map(
    ((leads ?? []) as Array<{ id: string; property_id: string | null }>).map((lead) => [lead.id, lead]),
  );
  const propertyMap = new Map(
    ((directProperties ?? []) as Array<{ id: string; owner_name: string | null; address: string | null }>).map((property) => [property.id, property]),
  );

  const propertyIdsFromLeads = [...new Set(
    seeds
      .map((seed) => {
        if (seed.propertyId) return seed.propertyId;
        if (!seed.leadId) return null;
        return leadMap.get(seed.leadId)?.property_id ?? null;
      })
      .filter(Boolean),
  )].filter((propertyId) => !propertyMap.has(propertyId as string)) as string[];

  if (propertyIdsFromLeads.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leadProperties } = await (sb.from("properties") as any)
      .select("id, owner_name, address")
      .in("id", propertyIdsFromLeads);

    for (const property of (leadProperties ?? []) as Array<{ id: string; owner_name: string | null; address: string | null }>) {
      propertyMap.set(property.id, property);
    }
  }

  return seeds
    .map((seed) => {
      const propertyId = seed.propertyId ?? (seed.leadId ? leadMap.get(seed.leadId)?.property_id ?? null : null);
      const property = propertyId ? propertyMap.get(propertyId) : null;
      const matchedPhone = seed.matchedPhone ?? null;
      const matchSource = seed.matchSource ?? null;

      return {
        leadId: seed.leadId ?? null,
        matchSource,
        matchConfidence: seed.matchConfidence ?? "none",
        ownerName: seed.ownerName ?? property?.owner_name ?? null,
        propertyAddress: seed.propertyAddress ?? property?.address ?? null,
        contactId: seed.contactId ?? null,
        propertyId,
        intakeLeadId: seed.intakeLeadId ?? null,
        recentCallCount: seed.recentCallCount ?? 0,
        lastCallDate: seed.lastCallDate ?? null,
        matchedPhone,
        matchReason: phoneMatchReason(matchSource, { phoneStatus: seed.phoneStatus ?? null }),
        exact: isExactPhoneMatch(queryDigits, matchedPhone),
        phoneStatus: seed.phoneStatus ?? null,
      } satisfies PhoneSearchCandidate;
    })
    .filter((candidate) => candidate.matchSource);
}

function dedupePhoneCandidates(
  candidates: PhoneSearchCandidate[],
  queryDigits: string,
): PhoneSearchCandidate[] {
  const byKey = new Map<string, PhoneSearchCandidate>();

  for (const candidate of candidates) {
    const key = candidate.leadId
      ? `lead:${candidate.leadId}`
      : candidate.intakeLeadId
        ? `intake:${candidate.intakeLeadId}`
        : candidate.contactId
          ? `contact:${candidate.contactId}`
          : `${candidate.matchSource}:${normalizeDigits(candidate.matchedPhone ?? "")}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }

    const existingScore = sourceRank(existing.matchSource, existing.phoneStatus) + (existing.exact ? 20 : 0);
    const candidateScore = sourceRank(candidate.matchSource, candidate.phoneStatus) + (candidate.exact ? 20 : 0);
    if (candidateScore > existingScore) {
      byKey.set(key, candidate);
    }
  }

  return [...byKey.values()].sort((a, b) => {
    const exactDelta = Number(b.exact) - Number(a.exact);
    if (exactDelta !== 0) return exactDelta;

    const rankDelta = sourceRank(b.matchSource, b.phoneStatus) - sourceRank(a.matchSource, a.phoneStatus);
    if (rankDelta !== 0) return rankDelta;

    const recentDelta = (b.recentCallCount ?? 0) - (a.recentCallCount ?? 0);
    if (recentDelta !== 0) return recentDelta;

    const lastCallA = a.lastCallDate ? new Date(a.lastCallDate).getTime() : 0;
    const lastCallB = b.lastCallDate ? new Date(b.lastCallDate).getTime() : 0;
    if (lastCallB !== lastCallA) return lastCallB - lastCallA;

    const aEndsWith = normalizeDigits(a.matchedPhone ?? "").endsWith(queryDigits);
    const bEndsWith = normalizeDigits(b.matchedPhone ?? "").endsWith(queryDigits);
    return Number(bEndsWith) - Number(aEndsWith);
  });
}

async function callHistory(
  sb: SupabaseClient,
  ilike: string,
): Promise<{ recentCallCount: number; lastCallDate: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, count } = await (sb.from("calls_log") as any)
    .select("created_at", { count: "exact", head: false })
    .ilike("phone_dialed", ilike)
    .order("created_at", { ascending: false })
    .limit(1);

  return {
    recentCallCount: count ?? 0,
    lastCallDate: data && data.length > 0 ? data[0].created_at : null,
  };
}

// ── Empty result factory ─────────────────────────────────────────────

function emptyResult(): PhoneLookupResult {
  return {
    leadId: null,
    matchSource: null,
    matchConfidence: "none",
    ownerName: null,
    propertyAddress: null,
    contactId: null,
    propertyId: null,
    intakeLeadId: null,
    recentCallCount: 0,
    lastCallDate: null,
  };
}
