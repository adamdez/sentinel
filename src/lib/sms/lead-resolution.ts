import type { SupabaseClient } from "@supabase/supabase-js";
import {
  phoneMatchReason,
  searchPhoneCandidates,
  unifiedPhoneLookup,
  type PhoneMatchConfidence,
  type PhoneMatchSource,
  type PhoneSearchCandidate,
} from "@/lib/dialer/phone-lookup";
import { normalizePhone } from "@/lib/upsert-contact";

export type SmsResolutionState = "direct" | "suggested" | "unresolved";

export interface SmsLeadCandidate {
  leadId: string;
  assignedTo: string | null;
  ownerName: string | null;
  propertyAddress: string | null;
  propertyId: string | null;
  status: string | null;
  priority: number | null;
  tags: string[];
  matchSource: PhoneMatchSource;
  matchConfidence: PhoneMatchConfidence;
  matchReason: string;
  matchedPhone: string | null;
  recentCallCount: number;
  lastCallDate: string | null;
}

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
  resolutionState: SmsResolutionState;
  matchReason: string | null;
  suggestedMatch: SmsLeadCandidate | null;
  candidateMatches: SmsLeadCandidate[];
  searchDigits: {
    last4: string | null;
    last7: string | null;
  };
}

interface HydratedLeadFacts {
  leadId: string | null;
  assignedTo: string | null;
  ownerName: string | null;
  propertyAddress: string | null;
  propertyId: string | null;
  status: string | null;
  priority: number | null;
  tags: string[];
  matchSource: PhoneMatchSource;
  matchConfidence: PhoneMatchConfidence;
  matchReason: string;
  matchedPhone: string | null;
  recentCallCount: number;
  lastCallDate: string | null;
}

function searchDigitsForPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return {
    last4: digits.length >= 4 ? digits.slice(-4) : null,
    last7: digits.length >= 7 ? digits.slice(-7) : null,
  };
}

function isDirectSmsSource(source: PhoneMatchSource): boolean {
  return source === "contacts" || source === "lead_phones" || source === "properties";
}

function isSuggestedSmsCandidate(candidate: PhoneSearchCandidate): boolean {
  if (!candidate.leadId || !candidate.matchSource) return false;
  if (candidate.matchSource === "lead_phones") {
    return candidate.phoneStatus !== "active";
  }
  return candidate.matchSource === "calls_log"
    || candidate.matchSource === "call_sessions"
    || candidate.matchSource === "sms_messages"
    || candidate.matchSource === "auto_cycle";
}

async function hydrateLeadFacts(
  sb: SupabaseClient,
  input: {
    leadId: string | null;
    ownerName: string | null;
    propertyAddress: string | null;
    propertyId: string | null;
    matchSource: PhoneMatchSource;
    matchConfidence: PhoneMatchConfidence;
    matchedPhone: string | null;
    matchReason: string;
    recentCallCount?: number | null;
    lastCallDate?: string | null;
  },
): Promise<HydratedLeadFacts> {
  let lead:
    | {
        id: string;
        property_id: string | null;
        assigned_to: string | null;
        priority: number | null;
        tags: string[] | null;
        status: string | null;
      }
    | null = null;

  if (input.leadId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb.from("leads") as any)
      .select("id, property_id, assigned_to, priority, tags, status")
      .eq("id", input.leadId)
      .maybeSingle();
    lead = data ?? null;
  }

  const propertyId = input.propertyId ?? lead?.property_id ?? null;
  let ownerName = input.ownerName;
  let propertyAddress = input.propertyAddress;

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
    leadId: input.leadId,
    assignedTo: lead?.assigned_to ?? null,
    ownerName,
    propertyAddress,
    propertyId,
    status: lead?.status ?? null,
    priority: lead?.priority ?? null,
    tags: Array.isArray(lead?.tags) ? lead.tags : [],
    matchSource: input.matchSource,
    matchConfidence: input.matchConfidence,
    matchReason: input.matchReason,
    matchedPhone: input.matchedPhone,
    recentCallCount: input.recentCallCount ?? 0,
    lastCallDate: input.lastCallDate ?? null,
  };
}

function toSmsLeadCandidate(input: HydratedLeadFacts): SmsLeadCandidate | null {
  if (!input.leadId) return null;
  return {
    leadId: input.leadId,
    assignedTo: input.assignedTo,
    ownerName: input.ownerName,
    propertyAddress: input.propertyAddress,
    propertyId: input.propertyId,
    status: input.status,
    priority: input.priority,
    tags: input.tags,
    matchSource: input.matchSource,
    matchConfidence: input.matchConfidence,
    matchReason: input.matchReason,
    matchedPhone: input.matchedPhone,
    recentCallCount: input.recentCallCount,
    lastCallDate: input.lastCallDate,
  };
}

export async function resolveSmsLead(
  sb: SupabaseClient,
  phone: string,
): Promise<ResolvedSmsLead> {
  const normalizedPhone = normalizePhone(phone);
  const digits = searchDigitsForPhone(phone);
  const directMatch = await unifiedPhoneLookup(phone, sb);

  if (directMatch.leadId && isDirectSmsSource(directMatch.matchSource)) {
    const hydratedDirect = await hydrateLeadFacts(sb, {
      leadId: directMatch.leadId,
      ownerName: directMatch.ownerName,
      propertyAddress: directMatch.propertyAddress,
      propertyId: directMatch.propertyId,
      matchSource: directMatch.matchSource,
      matchConfidence: directMatch.matchConfidence,
      matchedPhone: normalizedPhone,
      matchReason: phoneMatchReason(directMatch.matchSource, { phoneStatus: "active" }),
      recentCallCount: directMatch.recentCallCount,
      lastCallDate: directMatch.lastCallDate,
    });

    return {
      leadId: hydratedDirect.leadId,
      assignedTo: hydratedDirect.assignedTo,
      ownerName: hydratedDirect.ownerName,
      propertyAddress: hydratedDirect.propertyAddress,
      propertyId: hydratedDirect.propertyId,
      status: hydratedDirect.status,
      priority: hydratedDirect.priority,
      tags: hydratedDirect.tags,
      matchSource: hydratedDirect.matchSource,
      normalizedPhone,
      resolutionState: "direct",
      matchReason: hydratedDirect.matchReason,
      suggestedMatch: null,
      candidateMatches: [],
      searchDigits: digits,
    };
  }

  const candidates = await searchPhoneCandidates(phone, sb, { limit: 6 });
  const hydratedCandidates = await Promise.all(
    candidates
      .filter(isSuggestedSmsCandidate)
      .map(async (candidate) => {
        const hydrated = await hydrateLeadFacts(sb, {
          leadId: candidate.leadId,
          ownerName: candidate.ownerName,
          propertyAddress: candidate.propertyAddress,
          propertyId: candidate.propertyId,
          matchSource: candidate.matchSource,
          matchConfidence: candidate.matchConfidence,
          matchedPhone: candidate.matchedPhone,
          matchReason: candidate.matchReason,
          recentCallCount: candidate.recentCallCount,
          lastCallDate: candidate.lastCallDate,
        });

        return toSmsLeadCandidate(hydrated);
      }),
  );

  const candidateMatches = hydratedCandidates.filter(Boolean) as SmsLeadCandidate[];
  const suggestedMatch = candidateMatches[0] ?? null;

  return {
    leadId: null,
    assignedTo: null,
    ownerName: suggestedMatch?.ownerName ?? directMatch.ownerName,
    propertyAddress: suggestedMatch?.propertyAddress ?? directMatch.propertyAddress,
    propertyId: suggestedMatch?.propertyId ?? directMatch.propertyId,
    status: null,
    priority: null,
    tags: [],
    matchSource: suggestedMatch?.matchSource ?? directMatch.matchSource,
    normalizedPhone,
    resolutionState: suggestedMatch ? "suggested" : "unresolved",
    matchReason: suggestedMatch?.matchReason ?? null,
    suggestedMatch,
    candidateMatches,
    searchDigits: digits,
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

export async function attachSmsThreadToLead(
  sb: SupabaseClient,
  input: {
    phone: string;
    leadId: string;
    actorUserId?: string | null;
    reason?: string | null;
    addPhoneFact?: boolean;
  },
): Promise<SmsLeadCandidate | null> {
  const normalizedPhone = normalizePhone(input.phone);
  if (!normalizedPhone) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (sb.from("leads") as any)
    .select("id, property_id, assigned_to, priority, tags, status")
    .eq("id", input.leadId)
    .maybeSingle();

  if (!lead?.id) return null;

  await backfillSmsLeadForPhone(sb, normalizedPhone, input.leadId, lead.assigned_to ?? null);

  if (input.addPhoneFact !== false) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLeadPhones } = await (sb.from("lead_phones") as any)
      .select("phone, position")
      .eq("lead_id", input.leadId)
      .order("position", { ascending: true });

    const normalizedDigits = normalizedPhone.replace(/\D/g, "").slice(-10);
    const hasPhone = (existingLeadPhones ?? []).some((row: { phone?: string | null }) => {
      const phoneDigits = (row.phone ?? "").replace(/\D/g, "").slice(-10);
      return phoneDigits === normalizedDigits;
    });

    if (!hasPhone) {
      const nextPosition = Math.max(
        -1,
        ...((existingLeadPhones ?? []) as Array<{ position?: number | null }>).map((row) => row.position ?? -1),
      ) + 1;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("lead_phones") as any).insert({
        lead_id: input.leadId,
        property_id: lead.property_id ?? null,
        phone: normalizedPhone,
        label: "unknown",
        source: "sms_attach",
        status: "active",
        is_primary: nextPosition === 0,
        position: nextPosition,
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: input.actorUserId ?? lead.assigned_to ?? null,
    action: "sms.thread_attached",
    entity_type: "sms_thread",
    entity_id: normalizedPhone,
    details: {
      phone: `***${normalizedPhone.slice(-4)}`,
      lead_id: input.leadId,
      reason: input.reason ?? "manual_attach",
      add_phone_fact: input.addPhoneFact !== false,
      attached_at: new Date().toISOString(),
    },
  });

  const hydrated = await hydrateLeadFacts(sb, {
    leadId: input.leadId,
    ownerName: null,
    propertyAddress: null,
    propertyId: lead.property_id ?? null,
    matchSource: "sms_messages",
    matchConfidence: "indirect",
    matchedPhone: normalizedPhone,
    matchReason: "SMS thread",
  });

  return toSmsLeadCandidate(hydrated);
}
