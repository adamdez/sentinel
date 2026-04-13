import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import {
  appendOfferEventLog,
  applyOfferTerminalStatus,
  createOfferRecord,
} from "@/lib/offer-manager";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId");
  const leadId = searchParams.get("leadId");

  if (!dealId && !leadId) {
    return NextResponse.json({ error: "dealId or leadId query param required" }, { status: 400 });
  }

  let dealIds: string[] = [];
  if (dealId) {
    dealIds = [dealId];
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: deals, error: dealsError } = await (sb.from("deals") as any)
      .select("id")
      .eq("lead_id", leadId);

    if (dealsError) return NextResponse.json({ error: dealsError.message }, { status: 500 });
    dealIds = (deals ?? []).map((deal: { id: string }) => deal.id);
  }

  if (dealIds.length === 0) {
    return NextResponse.json({ offers: [] });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("offers") as any)
    .select("*")
    .in("deal_id", dealIds)
    .order("offered_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const offerIds = (data ?? []).map((offer: { id: string }) => offer.id);
  let executionsByOffer = new Map<string, unknown[]>();

  if (offerIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: executions } = await (sb.from("offer_executions") as any)
      .select("*")
      .in("offer_id", offerIds)
      .order("created_at", { ascending: false });

    executionsByOffer = new Map<string, unknown[]>();
    for (const execution of executions ?? []) {
      const key = String((execution as { offer_id?: string }).offer_id ?? "");
      if (!executionsByOffer.has(key)) executionsByOffer.set(key, []);
      executionsByOffer.get(key)?.push(execution);
    }
  }

  return NextResponse.json({
    offers: (data ?? []).map((offer: { id: string }) => ({
      ...offer,
      executions: executionsByOffer.get(offer.id) ?? [],
    })),
  });
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

  const validTypes = ["initial", "counter", "final", "verbal"];
  if (!validTypes.includes(offerType)) {
    return NextResponse.json({ error: `Invalid offerType. Must be: ${validTypes.join(", ")}` }, { status: 400 });
  }

  let offer;
  try {
    offer = await createOfferRecord(sb, {
      dealId,
      offerType,
      amount,
      terms: terms ?? null,
      expiresAt: expiresAt ?? null,
      offeredBy: user.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create offer" },
      { status: 500 },
    );
  }

  const warnings: string[] = [];
  try {
    await appendOfferEventLog(sb, {
      userId: user.id,
      action: "offer.created",
      entityType: "deal",
      entityId: dealId,
      details: { offerType, amount, offerId: offer.id },
    });
  } catch (error) {
    console.error("[offers] Audit log failed:", error);
    warnings.push("offer_event_log_failed");
  }

  return NextResponse.json({ offer, ...(warnings.length > 0 && { warnings }) }, { status: 201 });
}

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

  const validStatuses = ["accepted", "rejected", "countered", "expired", "withdrawn"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be: ${validStatuses.join(", ")}` }, { status: 400 });
  }

  let offer;
  try {
    offer = await applyOfferTerminalStatus(sb, {
      offerId,
      status: status as "accepted" | "rejected" | "countered" | "expired" | "withdrawn",
      response: response ?? null,
      eventUserId: user.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update offer" },
      { status: 500 },
    );
  }

  const warnings: string[] = [];
  try {
    await appendOfferEventLog(sb, {
      userId: user.id,
      action: `offer.${status}`,
      entityType: "deal",
      entityId: offer.deal_id,
      details: { offerId, status, amount: offer.amount },
    });
  } catch (error) {
    console.error("[offers] Audit log failed:", error);
    warnings.push("offer_event_log_failed");
  }

  return NextResponse.json({ offer, ...(warnings.length > 0 && { warnings }) });
}
