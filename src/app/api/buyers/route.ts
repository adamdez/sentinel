import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

async function requireAuth(req: NextRequest, sb: ReturnType<typeof createServerClient>) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

/**
 * GET /api/buyers — list buyers with optional filters
 * Query params: status, market, asset_type, strategy, tag, pof, search
 */
export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const market = url.searchParams.get("market");
    const assetType = url.searchParams.get("asset_type");
    const strategy = url.searchParams.get("strategy");
    const tag = url.searchParams.get("tag");
    const pof = url.searchParams.get("pof");
    const search = url.searchParams.get("search");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (sb.from("buyers") as any).select("*").order("contact_name");

    if (status && status !== "all") query = query.eq("status", status);
    if (market) query = query.contains("markets", [market]);
    if (assetType) query = query.contains("asset_types", [assetType]);
    if (strategy) query = query.eq("buyer_strategy", strategy);
    if (tag) query = query.contains("tags", [tag]);
    if (pof) query = query.eq("proof_of_funds", pof);
    if (search) query = query.or(`contact_name.ilike.%${search}%,company_name.ilike.%${search}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ buyers: data ?? [] });
  } catch (err) {
    console.error("[API/buyers] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/buyers — create a new buyer
 */
export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { contact_name } = body;
    if (!contact_name?.trim()) {
      return NextResponse.json({ error: "contact_name is required" }, { status: 400 });
    }

    const record = {
      contact_name: body.contact_name,
      company_name: body.company_name || null,
      phone: body.phone || null,
      email: body.email || null,
      preferred_contact_method: body.preferred_contact_method || "phone",
      markets: body.markets || [],
      asset_types: body.asset_types || [],
      price_range_low: body.price_range_low || null,
      price_range_high: body.price_range_high || null,
      funding_type: body.funding_type || null,
      proof_of_funds: body.proof_of_funds || "not_submitted",
      pof_verified_at: body.proof_of_funds === "verified" ? new Date().toISOString() : null,
      rehab_tolerance: body.rehab_tolerance || null,
      buyer_strategy: body.buyer_strategy || null,
      occupancy_pref: body.occupancy_pref || "either",
      tags: body.tags || [],
      notes: body.notes || null,
      status: body.status || "active",
      created_by: user.id,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("buyers") as any).insert(record).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ buyer: data }, { status: 201 });
  } catch (err) {
    console.error("[API/buyers] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
