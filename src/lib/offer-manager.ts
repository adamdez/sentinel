import { randomUUID } from "crypto";

type SupabaseLike = {
  from: (table: string) => any;
};

export type OfferTerminalStatus = "accepted" | "rejected" | "countered" | "expired" | "withdrawn";

export async function ensureDealForLead(sb: SupabaseLike, input: { leadId: string; propertyId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: existingError } = await (sb.from("deals") as any)
    .select("*")
    .eq("lead_id", input.leadId)
    .neq("status", "closed")
    .neq("status", "dead")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && !existingError) return existing;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created, error: createError } = await (sb.from("deals") as any)
    .insert({
      lead_id: input.leadId,
      property_id: input.propertyId,
      status: "negotiating",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (createError || !created) {
    throw new Error(createError?.message || "Could not create deal for offer");
  }

  return created;
}

export async function createOfferRecord(
  sb: SupabaseLike,
  input: {
    offerId?: string;
    dealId: string;
    offerType: string;
    amount: number;
    terms: string | null;
    expiresAt: string | null;
    offeredBy: string;
  },
) {
  const offerId = input.offerId ?? randomUUID();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("offers") as any)
    .insert({
      id: offerId,
      deal_id: input.dealId,
      offer_type: input.offerType,
      amount: input.amount,
      terms: input.terms,
      status: "pending",
      offered_by: input.offeredBy,
      offered_at: new Date().toISOString(),
      expires_at: input.expiresAt,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not create offer record");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("deals") as any)
    .update({
      offer_price: input.amount,
      status: "negotiating",
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.dealId);

  return data;
}

export async function insertOfferExecution(
  sb: SupabaseLike,
  input: {
    offerId: string;
    provider: string;
    templateKey: string | null;
    envelopeId: string | null;
    senderViewUrl: string | null;
    providerStatus: string;
    lastProviderPayload?: unknown;
  },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("offer_executions") as any)
    .insert({
      offer_id: input.offerId,
      provider: input.provider,
      template_key: input.templateKey,
      envelope_id: input.envelopeId,
      sender_view_url: input.senderViewUrl,
      provider_status: input.providerStatus,
      last_provider_payload: input.lastProviderPayload ?? {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Could not create offer execution record");
  }

  return data;
}

export async function syncOfferStatusSnapshot(
  sb: SupabaseLike,
  input: {
    propertyId: string;
    amount: number | null;
    status:
      | "offer_discussed"
      | "offer_sent"
      | "seller_reviewing"
      | "counter_needs_revision"
      | "accepted"
      | "passed_not_moving_forward";
    updatedBy: string;
    sellerResponseNote?: string | null;
  },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: property } = await (sb.from("properties") as any)
    .select("owner_flags")
    .eq("id", input.propertyId)
    .single();

  const nextOwnerFlags = {
    ...(property?.owner_flags ?? {}),
    offer_status_snapshot: {
      ...((property?.owner_flags as Record<string, unknown> | null)?.offer_status_snapshot as Record<string, unknown> | undefined),
      status: input.status,
      amount: input.amount,
      seller_response_note: input.sellerResponseNote ?? null,
      updated_at: new Date().toISOString(),
      updated_by: input.updatedBy,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("properties") as any)
    .update({
      owner_flags: nextOwnerFlags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.propertyId);

  if (error) {
    throw new Error(error.message || "Could not sync offer status snapshot");
  }
}

export async function applyOfferTerminalStatus(
  sb: SupabaseLike,
  input: {
    offerId: string;
    status: OfferTerminalStatus;
    response?: string | null;
    eventUserId?: string | null;
  },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: offer, error: offerError } = await (sb.from("offers") as any)
    .update({
      status: input.status,
      response: input.response ?? null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", input.offerId)
    .select("*, deals(id, lead_id, property_id)")
    .single();

  if (offerError || !offer) {
    throw new Error(offerError?.message || "Could not update offer status");
  }

  if (input.status === "accepted" && offer.deals) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("deals") as any)
      .update({
        status: "under_contract",
        contract_price: offer.amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", offer.deal_id);

    if (offer.deals.lead_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any)
        .update({
          status: "disposition",
          next_action: "Begin dispo - find end buyer",
          updated_at: new Date().toISOString(),
        })
        .eq("id", offer.deals.lead_id);
    }
  }

  return offer;
}

export async function appendOfferEventLog(
  sb: SupabaseLike,
  input: {
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    details?: Record<string, unknown>;
  },
) {
  if (!input.userId) return false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb.from("event_log") as any).insert({
    user_id: input.userId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    details: input.details ?? {},
  });

  if (error) {
    throw new Error(error.message || "Could not append offer event log");
  }

  return true;
}
