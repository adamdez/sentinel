/**
 * GET /api/dialer/v1/inbound/context?phone=+15095551234
 *
 * Returns the CRM lead context for an inbound caller by phone number,
 * plus the most recent inbound event (answered or missed) for that number.
 *
 * Used by the /dialer/inbound live page — Logan opens this after answering
 * to get instant context on the caller.
 *
 * Query params:
 *   ?phone=E164     — required; the caller's phone number
 *   ?event_id=UUID  — optional; the specific inbound event to surface
 *
 * Returns:
 *   { lead: CRMLeadContext | null, event: InboundEventMeta | null, from_number: string }
 *
 * BOUNDARY:
 *   - Auth via getDialerUser
 *   - CRM reads only via getCRMLeadContext (crm-bridge boundary intact)
 *   - Phone-to-lead lookup is a read-only cross, same character as crm-bridge
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { getCRMLeadContext } from "@/lib/dialer/crm-bridge";
import { unifiedPhoneLookup } from "@/lib/dialer/phone-lookup";
import type { CRMLeadContext } from "@/lib/dialer/types";
import type { PhoneMatchSource, PhoneMatchConfidence } from "@/lib/dialer/phone-lookup";

export interface InboundEventMeta {
  event_id:    string;
  event_type:  string;   // inbound.answered | inbound.missed
  from_number: string;
  call_sid:    string | null;
  occurred_at: string;   // ISO
  lead_matched: boolean;
  has_outcome: boolean;  // true if an inbound.outcome event exists for this event_id
}

export interface InboundContextResponse {
  from_number:      string;
  lead:             CRMLeadContext | null;
  event:            InboundEventMeta | null;
  dossier_snippet:  string | null;
  /** How the phone was matched — null if no match */
  match_source:     PhoneMatchSource;
  /** direct = contacts/lead_phones, indirect = property/history, none = unknown */
  match_confidence: PhoneMatchConfidence;
  /** Property address (may be available even without a lead match) */
  property_address: string | null;
  /** Owner name (may be available even without a lead match) */
  owner_name:       string | null;
  /** If matched via intake queue (not yet a lead) */
  intake_lead_id:   string | null;
  /** Recent call count for this number */
  recent_call_count: number;
}

export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const phone   = searchParams.get("phone")?.trim()    ?? "";
  const eventId = searchParams.get("event_id")?.trim() ?? null;

  if (!phone && !eventId) {
    return NextResponse.json({ error: "phone or event_id required" }, { status: 400 });
  }

  const sb = createDialerClient();

  // ── 1. Resolve event ──────────────────────────────────────────────────────
  let resolvedPhone = phone;
  let leadId: string | null = null;
  let event: InboundEventMeta | null = null;

  if (eventId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ev } = await (sb.from("dialer_events") as any)
      .select("id, event_type, lead_id, metadata, created_at")
      .eq("id", eventId)
      .in("event_type", ["inbound.answered", "inbound.missed"])
      .maybeSingle();

    if (ev) {
      const meta = ev.metadata ?? {};
      resolvedPhone = (meta.from_number as string) || phone;
      leadId = ev.lead_id ?? null;

      // Check if an outcome event already references this event_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: outcomeEv } = await (sb.from("dialer_events") as any)
        .select("id")
        .eq("event_type", "inbound.outcome")
        .filter("metadata->original_event_id", "eq", eventId)
        .limit(1)
        .maybeSingle();

      event = {
        event_id:     ev.id,
        event_type:   ev.event_type,
        from_number:  resolvedPhone,
        call_sid:     (meta.call_sid as string) ?? null,
        occurred_at:  (meta.answered_at as string) ?? (meta.missed_at as string) ?? ev.created_at,
        lead_matched: !!(meta.lead_matched),
        has_outcome:  !!outcomeEv,
      };
    }
  }

  // ── 2. Phone → lead lookup via unified search (if no event gave us a lead_id)
  let phoneLookup = resolvedPhone
    ? await unifiedPhoneLookup(resolvedPhone, sb)
    : null;

  if (!leadId && phoneLookup?.leadId) {
    leadId = phoneLookup.leadId;
  }

  // If we found no event from event_id, check for the most recent inbound event for this phone
  if (!event && resolvedPhone) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: recentEv } = await (sb.from("dialer_events") as any)
      .select("id, event_type, lead_id, metadata, created_at")
      .in("event_type", ["inbound.answered", "inbound.missed"])
      .filter("metadata->from_number", "eq", resolvedPhone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentEv) {
      const meta = recentEv.metadata ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: outcomeEv } = await (sb.from("dialer_events") as any)
        .select("id")
        .eq("event_type", "inbound.outcome")
        .filter("metadata->original_event_id", "eq", recentEv.id)
        .limit(1)
        .maybeSingle();

      event = {
        event_id:     recentEv.id,
        event_type:   recentEv.event_type,
        from_number:  resolvedPhone,
        call_sid:     (meta.call_sid as string) ?? null,
        occurred_at:  (meta.answered_at as string) ?? (meta.missed_at as string) ?? recentEv.created_at,
        lead_matched: !!(meta.lead_matched),
        has_outcome:  !!outcomeEv,
      };
    }
  }

  // ── 3. CRM context via crm-bridge ─────────────────────────────────────────
  let leadContext: CRMLeadContext | null = null;
  if (leadId) {
    leadContext = await getCRMLeadContext(leadId);
  }

  // ── 4. Dossier snippet — reviewed situation_summary if available ──────────
  let dossierSnippet: string | null = null;
  if (leadId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dossier } = await (sb.from("dossiers") as any)
      .select("situation_summary, status")
      .eq("lead_id", leadId)
      .in("status", ["reviewed", "promoted"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    dossierSnippet = dossier?.situation_summary ?? null;
  }

  const result: InboundContextResponse = {
    from_number:      resolvedPhone,
    lead:             leadContext,
    event,
    dossier_snippet:  dossierSnippet,
    match_source:     phoneLookup?.matchSource ?? null,
    match_confidence: phoneLookup?.matchConfidence ?? "none",
    property_address: phoneLookup?.propertyAddress ?? leadContext?.address ?? null,
    owner_name:       phoneLookup?.ownerName ?? leadContext?.ownerName ?? null,
    intake_lead_id:   phoneLookup?.intakeLeadId ?? null,
    recent_call_count: phoneLookup?.recentCallCount ?? 0,
  };

  return NextResponse.json(result);
}
