import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/source-costs
 *
 * List all source cost records. Supports ?source_key= filter.
 *
 * POST /api/dashboard/source-costs
 *
 * Upsert a monthly cost record for a prospect engine.
 * Body: { source_key, period_start, period_end, subscription_cost, per_record_cost, ad_spend, other_cost, notes }
 */

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sourceKey = req.nextUrl.searchParams.get("source_key");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (sb.from("source_costs") as any)
      .select("*")
      .order("period_start", { ascending: false });

    if (sourceKey) {
      query = query.eq("source_key", sourceKey);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ ok: true, costs: data ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      source_key,
      period_start,
      period_end,
      subscription_cost = 0,
      per_record_cost = 0,
      ad_spend = 0,
      other_cost = 0,
      notes,
    } = body;

    if (!source_key || !period_start || !period_end) {
      return NextResponse.json(
        { ok: false, error: "source_key, period_start, and period_end are required" },
        { status: 400 },
      );
    }

    // Upsert: if a record for this source+period exists, update it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("source_costs") as any)
      .upsert(
        {
          source_key,
          period_start,
          period_end,
          subscription_cost,
          per_record_cost,
          ad_spend,
          other_cost,
          notes,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "source_key,period_start" },
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, cost: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
