// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export type CanonicalPhoneDisposition =
  | "wrong_number"
  | "disconnected"
  | "do_not_call"
  | "interested"
  | "appointment"
  | "callback"
  | "follow_up";

type LeadPhoneRow = {
  id: string;
  lead_id: string;
  property_id: string | null;
  phone: string;
  status: "active" | "dead" | "dnc";
  is_primary: boolean;
  position: number | null;
  dead_reason: string | null;
};

export type SyncLeadPhoneOutcomeParams = {
  sb: SupabaseClient;
  leadId: string;
  userId: string;
  disposition: string | null | undefined;
  phoneId?: string | null;
  phoneNumber?: string | null;
};

export type SyncLeadPhoneOutcomeResult = {
  handled: boolean;
  applied: boolean;
  phoneId: string | null;
  previousStatus: string | null;
  newStatus: "active" | "dead" | "dnc" | null;
  newPrimaryPhone: string | null;
  allPhonesDead: boolean | null;
  reason: string | null;
};

const DEAD_REASONS = new Set(["wrong_number", "disconnected"]);
const POSITIVE_PRIMARY_DISPOSITIONS = new Set(["interested", "appointment", "callback", "follow_up"]);

function normalizePhoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "").slice(-10);
}

function mapDispositionToAction(disposition: string | null | undefined): {
  status: "dead" | "dnc" | "active";
  deadReason: "wrong_number" | "disconnected" | null;
  markPrimary: boolean;
} | null {
  const normalized = (disposition ?? "").trim().toLowerCase();
  if (normalized === "wrong_number") {
    return { status: "dead", deadReason: "wrong_number", markPrimary: false };
  }
  if (normalized === "disconnected") {
    return { status: "dead", deadReason: "disconnected", markPrimary: false };
  }
  if (normalized === "do_not_call") {
    return { status: "dnc", deadReason: null, markPrimary: false };
  }
  if (POSITIVE_PRIMARY_DISPOSITIONS.has(normalized)) {
    return { status: "active", deadReason: null, markPrimary: true };
  }
  return null;
}

async function loadLeadPhones(sb: SupabaseClient, leadId: string): Promise<LeadPhoneRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("lead_phones") as any)
    .select("id, lead_id, property_id, phone, status, is_primary, position, dead_reason")
    .eq("lead_id", leadId)
    .order("is_primary", { ascending: false })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load lead phones: ${error.message}`);
  }

  return Array.isArray(data) ? (data as LeadPhoneRow[]) : [];
}

function resolveTargetPhone(
  phones: LeadPhoneRow[],
  action: { markPrimary: boolean },
  params: { phoneId?: string | null; phoneNumber?: string | null },
): LeadPhoneRow | null {
  if (params.phoneId) {
    return phones.find((phone) => phone.id === params.phoneId) ?? null;
  }

  const targetDigits = normalizePhoneDigits(params.phoneNumber);
  if (targetDigits) {
    return phones.find((phone) => normalizePhoneDigits(phone.phone) === targetDigits) ?? null;
  }

  if (!action.markPrimary) {
    return phones.find((phone) => phone.is_primary && phone.status === "active")
      ?? phones.find((phone) => phone.status === "active")
      ?? null;
  }

  return phones.find((phone) => phone.is_primary)
    ?? phones.find((phone) => phone.status === "active")
    ?? null;
}

async function syncPropertyOwnerPhone(
  sb: SupabaseClient,
  propertyId: string | null,
  phone: string | null,
): Promise<void> {
  if (!propertyId) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("properties") as any)
    .update({ owner_phone: phone })
    .eq("id", propertyId);
  if (error) {
    throw new Error(`Failed to sync owner_phone mirror: ${error.message}`);
  }
}

export async function syncLeadPhoneOutcome(
  params: SyncLeadPhoneOutcomeParams,
): Promise<SyncLeadPhoneOutcomeResult> {
  const action = mapDispositionToAction(params.disposition);
  if (!action) {
    return {
      handled: false,
      applied: false,
      phoneId: null,
      previousStatus: null,
      newStatus: null,
      newPrimaryPhone: null,
      allPhonesDead: null,
      reason: "irrelevant_disposition",
    };
  }

  const phones = await loadLeadPhones(params.sb, params.leadId);
  if (phones.length === 0) {
    return {
      handled: true,
      applied: false,
      phoneId: null,
      previousStatus: null,
      newStatus: null,
      newPrimaryPhone: null,
      allPhonesDead: null,
      reason: "no_canonical_phones",
    };
  }

  const targetPhone = resolveTargetPhone(phones, action, params);
  if (!targetPhone) {
    return {
      handled: true,
      applied: false,
      phoneId: null,
      previousStatus: null,
      newStatus: null,
      newPrimaryPhone: null,
      allPhonesDead: phones.every((phone) => phone.status !== "active"),
      reason: "no_matching_phone",
    };
  }

  const nowIso = new Date().toISOString();
  const updateFields: Record<string, unknown> = {
    status: action.status,
    updated_at: nowIso,
  };

  if (action.status === "dead" || action.status === "dnc") {
    updateFields.dead_reason = action.deadReason;
    updateFields.dead_marked_by = params.userId;
    updateFields.dead_marked_at = nowIso;
  } else {
    updateFields.dead_reason = null;
    updateFields.dead_marked_by = null;
    updateFields.dead_marked_at = null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (params.sb.from("lead_phones") as any)
    .update(updateFields)
    .eq("id", targetPhone.id);

  if (updateErr) {
    throw new Error(`Failed to update lead phone: ${updateErr.message}`);
  }

  let newPrimaryPhone: string | null = null;

  if (action.markPrimary) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (params.sb.from("lead_phones") as any)
      .update({ is_primary: false })
      .eq("lead_id", params.leadId)
      .neq("id", targetPhone.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (params.sb.from("lead_phones") as any)
      .update({ is_primary: true })
      .eq("id", targetPhone.id);
    newPrimaryPhone = targetPhone.phone;
    await syncPropertyOwnerPhone(params.sb, targetPhone.property_id, targetPhone.phone);
  } else if (targetPhone.is_primary && action.status !== "active") {
    const refreshedPhones = await loadLeadPhones(params.sb, params.leadId);
    const nextActive = refreshedPhones.find((phone) => phone.id !== targetPhone.id && phone.status === "active") ?? null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (params.sb.from("lead_phones") as any)
      .update({ is_primary: false })
      .eq("id", targetPhone.id);

    if (nextActive) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (params.sb.from("lead_phones") as any)
        .update({ is_primary: true })
        .eq("id", nextActive.id);
      newPrimaryPhone = nextActive.phone;
      await syncPropertyOwnerPhone(params.sb, targetPhone.property_id, nextActive.phone);
    } else {
      await syncPropertyOwnerPhone(params.sb, targetPhone.property_id, null);
    }
  }

  if (action.status === "dnc") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (params.sb.from("dnc_list") as any).upsert(
      {
        phone: targetPhone.phone,
        reason: targetPhone.dead_reason || "marked_dnc",
        source: "operator",
        added_by: params.userId,
        added_at: nowIso,
      },
      { onConflict: "phone" },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (params.sb.from("event_log") as any).insert({
    user_id: params.userId,
    action: action.markPrimary ? "phone.primary_promoted" : `phone.${action.status}`,
    entity_type: "lead_phone",
    entity_id: targetPhone.id,
    details: {
      lead_id: params.leadId,
      phone: targetPhone.phone,
      previous_status: targetPhone.status,
      new_status: action.status,
      dead_reason: action.deadReason,
      was_primary: targetPhone.is_primary,
      marked_primary: action.markPrimary,
      new_primary: newPrimaryPhone,
    },
  });

  const finalPhones = await loadLeadPhones(params.sb, params.leadId);
  const allPhonesDead = finalPhones.every((phone) => phone.status !== "active");

  return {
    handled: true,
    applied: true,
    phoneId: targetPhone.id,
    previousStatus: targetPhone.status,
    newStatus: action.status,
    newPrimaryPhone,
    allPhonesDead,
    reason: null,
  };
}

export function isPhoneDispositionRelevant(disposition: string | null | undefined): boolean {
  return mapDispositionToAction(disposition) != null;
}

