import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/leads/score-queue
 *
 * Score-ranked lead queue for operator call prioritization.
 * Returns active leads sorted by a weighted combination of
 * opportunity_score, contactability_score, and confidence_score.
 *
 * Blueprint 3.1: "Every morning, Logan sees: top 10 priority leads."
 * Blueprint 9.2: "Three composite scores visible on every lead card."
 *
 * Query params:
 *   ?limit=20        — max results (default 20, max 100)
 *   ?status=lead     — filter by lead status (comma-separated)
 *   ?min_opportunity=30 — minimum opportunity score threshold
 *   ?assigned_to=uuid — filter by assigned operator
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10), 100);
  const statusFilter = req.nextUrl.searchParams.get("status");
  const minOpportunity = parseInt(req.nextUrl.searchParams.get("min_opportunity") ?? "0", 10);
  const assignedTo = req.nextUrl.searchParams.get("assigned_to");

  const statuses = statusFilter
    ? statusFilter.split(",").map((s) => s.trim())
    : ["prospect", "lead", "negotiation"];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("leads") as any)
    .select(`
      id, status, priority, source,
      motivation_level, seller_timeline, qualification_route,
      next_action, next_action_due_at,
      total_calls, live_answers, last_contact_at,
      opportunity_score, contactability_score, confidence_score,
      seller_situation_summary_short, recommended_call_angle,
      likely_decision_maker, decision_maker_confidence,
      top_fact_1, top_fact_2, top_fact_3,
      recommended_next_action,
      property_snapshot_status,
      assigned_to,
      created_at, updated_at,
      properties(id, address, city, state, zip, county, owner_name, estimated_value, equity_percent)
    `)
    .in("status", statuses)
    .not("next_action", "is", null);

  if (minOpportunity > 0) {
    query = query.gte("opportunity_score", minOpportunity);
  }

  if (assignedTo) {
    query = query.eq("assigned_to", assignedTo);
  }

  // Sort by opportunity_score DESC, then priority DESC, then motivation_level DESC
  query = query
    .order("opportunity_score", { ascending: false, nullsFirst: false })
    .order("priority", { ascending: false })
    .order("motivation_level", { ascending: false, nullsFirst: false })
    .limit(limit);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Compute a weighted rank score for display
  const ranked = (data ?? []).map((lead: Record<string, unknown>, idx: number) => {
    const opp = (lead.opportunity_score as number) ?? 0;
    const con = (lead.contactability_score as number) ?? 0;
    const conf = (lead.confidence_score as number) ?? 0;

    // Weighted: 50% opportunity, 30% contactability, 20% confidence
    const weightedScore = Math.round(opp * 0.5 + con * 0.3 + conf * 0.2);

    return {
      rank: idx + 1,
      weightedScore,
      ...lead,
    };
  });

  return NextResponse.json({
    ok: true,
    leads: ranked,
    count: ranked.length,
  });
}
