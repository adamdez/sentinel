import type { SupabaseClient } from "@supabase/supabase-js";
import { unifiedPhoneLookup, type PhoneMatchSource } from "@/lib/dialer/phone-lookup";
import { normalizePhone } from "@/lib/upsert-contact";

export interface ResolvedSmsLead {
  leadId: string | null;
  assignedTo: string | null;
  ownerName: string | null;
  propertyAddress: string | null;
  propertyId: string | null;
  status: string | null;
  priority: number | null;
  tags: string[];
  matchSource: PhoneMatchSource;
  normalizedPhone: string | null;
}

export async function resolveSmsLead(
  sb: SupabaseClient,
  phone: string,
): Promise<ResolvedSmsLead> {
  const match = await unifiedPhoneLookup(phone, sb);
  const normalizedPhone = normalizePhone(phone);

  if (!match.leadId) {
    return {
      leadId: null,
      assignedTo: null,
      ownerName: match.ownerName,
      propertyAddress: match.propertyAddress,
      propertyId: match.propertyId,
      status: null,
      priority: null,
      tags: [],
      matchSource: match.matchSource,
      normalizedPhone,
    };
  }

  // Keep the lead hydrate lightweight but enough for SMS UI + routing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (sb.from("leads") as any)
    .select("id, property_id, assigned_to, priority, tags, status")
    .eq("id", match.leadId)
    .maybeSingle();

  const propertyId = (match.propertyId as string | null) ?? (lead?.property_id as string | null) ?? null;
  let ownerName = match.ownerName;
  let propertyAddress = match.propertyAddress;

  if (propertyId && (!ownerName || !propertyAddress)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property } = await (sb.from("properties") as any)
      .select("owner_name, address")
      .eq("id", propertyId)
      .maybeSingle();

    ownerName = ownerName ?? property?.owner_name ?? null;
    propertyAddress = propertyAddress ?? property?.address ?? null;
  }

  return {
    leadId: match.leadId,
    assignedTo: lead?.assigned_to ?? null,
    ownerName,
    propertyAddress,
    propertyId,
    status: lead?.status ?? null,
    priority: lead?.priority ?? null,
    tags: Array.isArray(lead?.tags) ? lead.tags : [],
    matchSource: match.matchSource,
    normalizedPhone,
  };
}

export async function backfillSmsLeadForPhone(
  sb: SupabaseClient,
  phone: string,
  leadId: string | null,
  assignedTo?: string | null,
): Promise<void> {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone || !leadId) return;

  const payload: Record<string, unknown> = { lead_id: leadId };
  if (assignedTo) payload.user_id = assignedTo;

  // Backfill any orphaned rows for this thread so old data heals forward.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("sms_messages") as any)
    .update(payload)
    .eq("phone", normalizedPhone)
    .is("lead_id", null);
}
