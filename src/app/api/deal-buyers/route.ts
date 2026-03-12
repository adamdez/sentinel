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
 * GET /api/deal-buyers — list deal-buyer links
 * Query: deal_id OR buyer_id (at least one required)
 */
export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const dealId = url.searchParams.get("deal_id");
    const buyerId = url.searchParams.get("buyer_id");

    if (!dealId && !buyerId) {
      return NextResponse.json({ error: "deal_id or buyer_id required" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (sb.from("deal_buyers") as any)
      .select("*, buyer:buyers(*)")
      .order("created_at", { ascending: false });

    if (dealId) query = query.eq("deal_id", dealId);
    if (buyerId) query = query.eq("buyer_id", buyerId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ deal_buyers: data ?? [] });
  } catch (err) {
    console.error("[API/deal-buyers] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/deal-buyers — link a buyer to a deal
 */
export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { deal_id, buyer_id } = body;

    if (!deal_id || !buyer_id) {
      return NextResponse.json({ error: "deal_id and buyer_id required" }, { status: 400 });
    }

    const record = {
      deal_id,
      buyer_id,
      status: body.status || "not_contacted",
      date_contacted: body.date_contacted || null,
      contact_method: body.contact_method || null,
      notes: body.notes || null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("deal_buyers") as any)
      .insert(record)
      .select("*, buyer:buyers(*)")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Buyer already linked to this deal" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deal_buyer: data }, { status: 201 });
  } catch (err) {
    console.error("[API/deal-buyers] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
