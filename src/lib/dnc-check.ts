/**
 * DNC (Do Not Call) Check Utility
 *
 * Central suppression check used before any outbound call or SMS.
 * Checks both the dnc_list table and contacts.dnc_status.
 *
 * Usage:
 *   const blocked = await isDnc("+15551234567");
 *   if (blocked.isDnc) { skip the call; }
 */

import { createServerClient } from "@/lib/supabase";

export interface DncCheckResult {
  isDnc: boolean;
  isLitigator: boolean;
  reason: string | null;
  source: "dnc_list" | "contacts" | null;
}

/**
 * Check if a phone number is on the DNC list or flagged in contacts.
 * Returns quickly — safe to call in hot paths.
 */
export async function isDnc(phone: string): Promise<DncCheckResult> {
  if (!phone) return { isDnc: false, isLitigator: false, reason: null, source: null };

  const sb = createServerClient();
  const normalized = phone.replace(/\D/g, "");

  // Check dnc_list table first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dncEntry } = await (sb.from("dnc_list") as any)
    .select("reason")
    .or(`phone.eq.${phone},phone.eq.+${normalized},phone.eq.${normalized}`)
    .limit(1);

  if (dncEntry && dncEntry.length > 0) {
    return {
      isDnc: true,
      isLitigator: dncEntry[0].reason === "litigator",
      reason: dncEntry[0].reason,
      source: "dnc_list",
    };
  }

  // Check contacts table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contact } = await (sb.from("contacts") as any)
    .select("dnc_status, litigant_flag")
    .or(`phone.eq.${phone},phone.eq.+${normalized},phone.eq.${normalized}`)
    .limit(1);

  if (contact && contact.length > 0) {
    const c = contact[0];
    if (c.dnc_status || c.litigant_flag) {
      return {
        isDnc: true,
        isLitigator: c.litigant_flag === true,
        reason: c.litigant_flag ? "litigator" : "contact_dnc",
        source: "contacts",
      };
    }
  }

  return { isDnc: false, isLitigator: false, reason: null, source: null };
}

/**
 * Batch DNC check — returns set of blocked phone numbers.
 * More efficient for campaign lead loading.
 */
export async function batchDncCheck(phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set();

  const sb = createServerClient();
  const blocked = new Set<string>();

  // Check dnc_list
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dncEntries } = await (sb.from("dnc_list") as any)
    .select("phone")
    .in("phone", phones);

  for (const entry of dncEntries ?? []) {
    blocked.add(entry.phone);
  }

  // Check contacts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dncContacts } = await (sb.from("contacts") as any)
    .select("phone")
    .in("phone", phones)
    .or("dnc_status.eq.true,litigant_flag.eq.true");

  for (const contact of dncContacts ?? []) {
    if (contact.phone) blocked.add(contact.phone);
  }

  return blocked;
}
