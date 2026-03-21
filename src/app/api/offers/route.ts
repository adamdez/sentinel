import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/offers?dealId=...
 * List offers for a deal.
 *
 * POST /api/offers
 * Create a new offer on a deal.
 * Body: { dealId, offerType, amount, terms?, expiresAt? }
 *
 * Offer types: "initial", "counter", "final", "verbal"
 * Status: "pending" → "accepted" | "rejected" | "countered" | "expired" | "withdrawn"
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId");

  if (!dealId) {
    return NextResponse.json({ error: "dealId query param required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("offers") as any)
    .select("*")
    .eq("deal_id", dealId)
    .order("offered_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ offers: data ?? [] });
}

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { dealId, offerType, amount, terms, expiresAt } = body as {
    dealId: string;
    offerType: string;
    amount: number;
    terms?: string;
    expiresAt?: string;
  };

  if (!dealId || !offerType || !amount) {
    return NextResponse.json({ error: "dealId, offerType, and amount required" }, { status: 400 });
  }

  const VALID_TYPES = ["initial", "counter", "final", "verbal"];
  if (!VALID_TYPES.includes(offerType)) {
    return NextResponse.json({ error: `Invalid offerType. Must be: ${VALID_TYPES.join(", ")}` }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("offers") as any)
    .insert({
      deal_id: dealId,
      offer_type: offerType,
      amount,
      terms: terms ?? null,
      status: "pending",
      offered_by: user.id,
      offered_at: new Date().toISOString(),
      expires_at: expiresAt ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update deal with latest offer price — critical state transition
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dealErr } = await (sb.from("deals") as any)
    .update({
      offer_price: amount,
      status: "negotiating",
      updated_at: new Date().toISOString(),
    })
    .eq("id", dealId);
  if (dealErr) {
    console.error("[offers] Deal status update failed:", dealErr.message);
    return NextResponse.json(
      { error: "Offer created but deal status update failed", offerId: data.id, detail: dealErr.message },
      { status: 500 },
    );
  }

  // Audit log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: logErr } = await (sb.from("event_log") as any).insert({
    user_id: user.id,
    action: "offer.created",
    entity_type: "deal",
    entity_id: dealId,
    details: { offerType, amount, offerId: data.id },
  });
  if (logErr) console.error("[offers] Audit log failed:", logErr.message);

  return NextResponse.json({ offer: data }, { status: 201 });
}

/**
 * PATCH /api/offers
 * Update offer status (accept, reject, counter, withdraw).
 * Body: { offerId, status, response? }
 */
export async function PATCH(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { offerId, status, response } = body as {
    offerId: string;
    status: string;
    response?: string;
  };

  if (!offerId || !status) {
    return NextResponse.json({ error: "offerId and status required" }, { status: 400 });
  }

  const VALID_STATUSES = ["accepted", "rejected", "countered", "expired", "withdrawn"];
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("offers") as any)
    .update({
      status,
      response: response ?? null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", offerId)
    .select("*, deals(id, lead_id)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If offer accepted, update deal to under_contract — most critical transition
  if (status === "accepted" && data.deals) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dealErr } = await (sb.from("deals") as any)
      .update({
        status: "under_contract",
        contract_price: data.amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.deal_id);
    if (dealErr) {
      console.error("[offers] CRITICAL: Deal under_contract transition failed:", dealErr.message);
      return NextResponse.json(
        { error: "Offer accepted but deal status update failed — manual intervention required", detail: dealErr.message },
        { status: 500 },
      );
    }

    // Move lead to disposition stage — hard failure if this breaks
    if (data.deals.lead_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: leadErr } = await (sb.from("leads") as any)
        .update({
          status: "disposition",
          next_action: "Begin dispo — find end buyer",
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.deals.lead_id);
      if (leadErr) {
        console.error("[offers] CRITICAL: Lead stage transition to disposition failed:", leadErr.message);
        return NextResponse.json(
          { error: "Deal updated but lead stage transition failed — manual intervention required", detail: leadErr.message },
          { status: 500 },
        );
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: patchLogErr } = await (sb.from("event_log") as any).insert({
    user_id: user.id,
    action: `offer.${status}`,
    entity_type: "deal",
    entity_id: data.deal_id,
    details: { offerId, status, amount: data.amount },
  });
  if (patchLogErr) console.error("[offers] Audit log failed:", patchLogErr.message);

  return NextResponse.json({ offer: data });
}
