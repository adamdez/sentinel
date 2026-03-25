import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/buyers/[id] — get single buyer
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("buyers") as any).select("*").eq("id", id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });

    return NextResponse.json({ buyer: data });
  } catch (err) {
    console.error("[API/buyers/id] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/buyers/[id] — update buyer fields
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    const allowed = [
      "contact_name", "company_name", "phone", "email", "preferred_contact_method",
      "markets", "asset_types", "price_range_low", "price_range_high",
      "funding_type", "proof_of_funds", "pof_verified_at", "rehab_tolerance",
      "buyer_strategy", "occupancy_pref", "tags", "notes", "status",
      // SLAUD Phase 1 rollout fields
      "arv_max", "close_speed_days", "reliability_score", "deals_closed",
      "last_contacted_at", "do_not_contact",
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) update[key] = body[key];
    }

    // Auto-set pof_verified_at when proof_of_funds changes to verified
    if (body.proof_of_funds === "verified" && !body.pof_verified_at) {
      update.pof_verified_at = new Date().toISOString();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("buyers") as any)
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ buyer: data });
  } catch (err) {
    console.error("[API/buyers/id] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/buyers/[id] — permanently remove buyer (deal_buyers rows cascade)
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from("buyers") as any).delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[API/buyers/id] DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
