/**
 * Dialer CRM Bridge — PR1
 *
 * This is EXTRACTION POINT 3. It is the ONLY file in the dialer domain
 * that reads from CRM-owned tables (leads, properties, contacts, calls_log).
 *
 * BOUNDARY RULES — strictly enforced:
 *   - This file MAY read: leads, properties, contacts, calls_log
 *   - This file MUST NOT write to any CRM table (that is publish-manager.ts, PR3)
 *   - This file MUST NOT be imported by any CRM route or component
 *   - No other dialer file may query leads, properties, contacts, or calls_log
 *
 * The return type (CRMLeadContext) is a clean interface — no raw DB row types
 * are exposed to callers. Column names are internal to this file only.
 *
 * Future extraction (Stage 3):
 *   Replace the DB queries with a single fetch() call to a CRM API endpoint.
 *   Zero callers change — they all receive CRMLeadContext regardless.
 *
 * ASSUMPTION: properties table has street_address, city, state columns.
 * ASSUMPTION: contacts table has first_name, last_name, phone columns.
 * ASSUMPTION: leads.contact_id links to contacts (nullable).
 * If these assumptions are wrong, adjust the select() calls below.
 */

import { createDialerClient } from "./db";
import type { CRMLeadContext } from "./types";

/**
 * Builds a read-only CRM context snapshot for the dialer.
 * Called before a call session is created to populate context_snapshot.
 *
 * Makes 4 sequential DB queries. Acceptable at current call volume (<100/day).
 * In Phase 2: consolidate into a single SQL JOIN or a CRM-provided endpoint.
 *
 * Returns null if the lead does not exist.
 */
export async function getCRMLeadContext(
  leadId: string,
): Promise<CRMLeadContext | null> {
  const sb = createDialerClient();

  // ── 1. Lead core fields ────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead, error: leadErr } = await (sb.from("leads") as any)
    .select(
      `
      id,
      property_id,
      contact_id,
      total_calls,
      live_answers,
      next_call_scheduled_at,
      motivation_level,
      seller_timeline,
      qualification_route,
      last_contact_at
    `,
    )
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr) {
    console.error("[Dialer/crm-bridge] Failed to fetch lead:", leadErr.message);
    return null;
  }

  if (!lead) return null;

  // ── 2. Property address ────────────────────────────────────
  let address: string | null = null;
  if (lead.property_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property } = await (sb.from("properties") as any)
      .select("street_address, city, state")
      .eq("id", lead.property_id)
      .maybeSingle();

    if (property) {
      address = [property.street_address, property.city, property.state]
        .filter(Boolean)
        .join(", ") || null;
    }
  }

  // ── 3. Owner name and phone from contacts ──────────────────
  let ownerName: string | null = null;
  let phone: string | null = null;

  if (lead.contact_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contact } = await (sb.from("contacts") as any)
      .select("first_name, last_name, phone")
      .eq("id", lead.contact_id)
      .maybeSingle();

    if (contact) {
      ownerName =
        [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
        null;
      phone = contact.phone ?? null;
    }
  }

  // ── 4. Last call disposition from calls_log ────────────────
  // Read-only cross — calls_log is CRM-owned, we only read the most recent row.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lastCall } = await (sb.from("calls_log") as any)
    .select("disposition, started_at")
    .eq("lead_id", leadId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── 5. Assemble context snapshot ───────────────────────────
  const ctx: CRMLeadContext = {
    leadId: lead.id,
    ownerName,
    phone,
    address,

    motivationLevel: lead.motivation_level ?? null,
    sellerTimeline: lead.seller_timeline ?? null,
    qualificationRoute: lead.qualification_route ?? null,

    totalCalls: lead.total_calls ?? 0,
    liveAnswers: lead.live_answers ?? 0,

    lastCallDisposition: lastCall?.disposition ?? null,
    lastCallDate: lastCall?.started_at ?? null,
    nextCallScheduledAt: lead.next_call_scheduled_at ?? null,
  };

  return ctx;
}
