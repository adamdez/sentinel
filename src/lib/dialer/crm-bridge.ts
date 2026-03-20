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
      last_contact_at,
      next_action,
      next_action_due_at
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
  let propertyOwnerName: string | null = null;
  if (lead.property_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property } = await (sb.from("properties") as any)
      .select("address, city, state, owner_name")
      .eq("id", lead.property_id)
      .maybeSingle();

    if (property) {
      address = [property.address, property.city, property.state]
        .filter(Boolean)
        .join(", ") || null;
      propertyOwnerName = property.owner_name ?? null;
    }
  }

  // ── 3. Owner name and phone from contacts ──────────────────
  // Falls back to property.owner_name when no contact is linked.
  let ownerName: string | null = propertyOwnerName;
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
        propertyOwnerName;
      phone = contact.phone ?? null;
    }
  }

  // ── 4. Last call disposition + content from calls_log ──────
  // Read-only cross — calls_log is CRM-owned, we only read the most recent row.
  // We also capture:
  //   notes:      operator-published summary (written by publish-manager) — highest trust
  //   ai_summary: raw AI output from /summarize route — lower trust, labeled in UI if used
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lastCall } = await (sb.from("calls_log") as any)
    .select("disposition, started_at, notes, ai_summary")
    .eq("lead_id", leadId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── 5. Open follow-up / appointment task ──────────────────
  // Reads the most recently created pending task for this lead.
  // This is the operator's (or publish-manager's) commitment from the last call.
  // Only fetch status=pending tasks — completed tasks are not actionable memory.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: openTask } = await (sb.from("tasks") as any)
    .select("title, due_at")
    .eq("lead_id", leadId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── 6. Assemble context snapshot ───────────────────────────
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

    // Operator-published notes take priority. AI summary used only as fallback.
    // Both are null on first contact — the panel handles the empty state.
    lastCallNotes: lastCall?.notes ?? null,
    lastCallAiSummary: lastCall?.ai_summary ?? null,

    // Most recently created pending task for this lead (operator or publish-manager created).
    // Null if no pending task exists.
    openTaskTitle: openTask?.title ?? null,
    openTaskDueAt: openTask?.due_at ?? null,

    // PR-1: next_action captures the operator's committed next step for this lead.
    // Sourced from leads table — written by publish-manager or update_next_action MCP tool.
    nextAction: lead.next_action ?? null,
    nextActionDueAt: lead.next_action_due_at ?? null,
  };

  return ctx;
}
