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
