import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

const STALE_DAYS = 90;

/**
 * GET /api/buyers/stale
 *
 * Returns active buyers who are stale — either:
 *   - last_contacted_at IS NULL (never contacted since being added), or
 *   - last_contacted_at < NOW() - 90 days
 *
 * Also excludes do_not_contact = true buyers (they are intentionally dormant).
 *
 * Returns:
 *   { buyers: StaleBuyerRow[], count: number, stale_threshold_days: number }
 *
 * Used by:
 *   - BuyerStalePanel on /buyers page
 *   - /dialer/review stale count badge
 */
export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - STALE_DAYS);
    const cutoffIso = cutoff.toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("buyers") as any)
      .select(
        "id, contact_name, company_name, phone, markets, status, last_contacted_at, do_not_contact, tags, reliability_score, updated_at"
      )
      .eq("status", "active")
      .eq("do_not_contact", false)
      .or(`last_contacted_at.is.null,last_contacted_at.lt.${cutoffIso}`)
      .order("last_contacted_at", { ascending: true, nullsFirst: true })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      buyers: data ?? [],
      count: (data ?? []).length,
      stale_threshold_days: STALE_DAYS,
    });
  } catch (err) {
    console.error("[API/buyers/stale] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
