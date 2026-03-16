import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import {
  scoreBuyers,
  computeMonetizabilityScore,
  MONETIZABILITY_GATE,
  type LeadContext,
  type BuyerWithPhase1,
  type ScorerResult,
} from "@/lib/buyer-fit";

/**
 * GET /api/buyers/radar?lead_id=X
 *
 * Returns a ranked buyer list for the given lead.
 * - All active buyers are scored against the lead's fit context.
 * - Hard-eliminated buyers are included at the bottom so operators can see
 *   why they were excluded.
 * - monetizabilityScore is only populated when activeBuyerCount >= 10.
 * - Logan should see ranked list + flags but NOT the monetizabilityScore.
 *   The UI enforces this — the component decides visibility based on isAdminView.
 *
 * Also returns existing deal_buyers rows for this lead's deal (if any),
 * so the UI can show which buyers are already contacted/queued/passed.
 */
export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const leadId = url.searchParams.get("lead_id");
    if (!leadId) {
      return NextResponse.json({ error: "lead_id is required" }, { status: 400 });
    }

    // ── 1. Fetch lead + property for fit context ──────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: leadErr } = await (sb.from("leads") as any)
      .select(`
        id,
        property_id,
        condition_level,
        seller_timeline,
        price_expectation,
        monetizability_score,
        dispo_friction_level,
        properties (
          zip,
          county,
          property_type,
          estimated_value,
          is_vacant
        )
      `)
      .eq("id", leadId)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: leadErr?.message ?? "Lead not found" }, { status: 404 });
    }

    const prop = lead.properties;

    // ── 2. Fetch deal for this lead (for dispo_prep occupancy + ARV) ──

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: deal } = await (sb.from("deals") as any)
      .select("id, arv, dispo_prep")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Prefer dispo_prep occupancy if set, then fall back to property is_vacant flag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dispoPrepOccupancy = (deal?.dispo_prep as any)?.occupancy_status ?? null;
    const isVacant: boolean =
      dispoPrepOccupancy === "vacant"
        ? true
        : dispoPrepOccupancy === "occupied"
        ? false
        : !!(prop?.is_vacant);

    // ── 3. Build fit context ───────────────────────────────────────────

    const fitContext: LeadContext = {
      market: prop?.county ?? null,
      zip: prop?.zip ?? null,
      propertyType: prop?.property_type ?? null,
      estimatedValue: prop?.estimated_value ?? deal?.arv ?? null,
      isVacant,
      conditionLevel: lead.condition_level ?? null,
      priceExpectation: lead.price_expectation ?? null,
    };

    // ── 4. Fetch existing deal_buyers for this deal (if any) ──────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let existingDealBuyers: any[] = [];
    if (deal?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: db } = await (sb.from("deal_buyers") as any)
        .select("id, buyer_id, status, date_contacted, offer_amount, notes")
        .eq("deal_id", deal.id);
      existingDealBuyers = db ?? [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingByBuyerId: Record<string, any> = Object.fromEntries(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      existingDealBuyers.map((r: any) => [r.buyer_id, r])
    );

    // Buyer IDs already actioned — excluded from main radar ranking
    const alreadyActioned = new Set<string>(existingDealBuyers.map((r) => r.buyer_id));

    // ── 5. Fetch all buyers with Phase 1 SLAUD fields ─────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: buyers, error: buyersErr } = await (sb.from("buyers") as any)
      .select(`
        id, contact_name, company_name, phone, email, preferred_contact_method,
        markets, asset_types, price_range_low, price_range_high,
        funding_type, proof_of_funds, pof_verified_at, rehab_tolerance,
        buyer_strategy, occupancy_pref, tags, notes, status, created_by,
        created_at, updated_at,
        arv_max, close_speed_days, reliability_score, deals_closed,
        last_contacted_at, do_not_contact
      `)
      .order("contact_name");

    if (buyersErr) {
      return NextResponse.json({ error: buyersErr.message }, { status: 500 });
    }

    // ── 6. Score and rank buyers ───────────────────────────────────────

    const scoredResults: ScorerResult[] = scoreBuyers(
      (buyers ?? []) as BuyerWithPhase1[],
      fitContext,
      alreadyActioned,
    );

    const activeBuyerCount = (buyers ?? []).filter(
      (b: BuyerWithPhase1) => b.status === "active" && !b.do_not_contact
    ).length;

    const monetizabilityVisible = activeBuyerCount >= MONETIZABILITY_GATE;
    const monetizabilityScore = monetizabilityVisible
      ? computeMonetizabilityScore(scoredResults, activeBuyerCount)
      : null;

    // Augment each result with existing deal_buyers status if present
    const resultsWithStatus = scoredResults.map((r) => ({
      ...r,
      existingDealBuyer: existingByBuyerId[r.buyer.id] ?? null,
    }));

    return NextResponse.json({
      leadId,
      dealId: deal?.id ?? null,
      fitContext,
      activeBuyerCount,
      monetizabilityVisible,
      monetizabilityScore,
      manualMonetizabilityScore: lead.monetizability_score ?? null,
      dispoFrictionLevel: lead.dispo_friction_level ?? null,
      results: resultsWithStatus,
    });
  } catch (err) {
    console.error("[API/buyers/radar] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
