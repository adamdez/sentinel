import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/dossiers/queue
 *
 * Returns proposed dossiers with joined lead + property context for the review queue.
 * Ordered by created_at DESC (most recent first).
 *
 * Query params:
 *   status   = "proposed" (default) | "reviewed" | "flagged" | "promoted" | "all"
 *   limit    = number (default 25, max 50)
 *   offset   = number (default 0)
 *
 * Returns:
 *   {
 *     items: DossierQueueItem[],
 *     total: number,
 *     limit: number,
 *     offset: number,
 *   }
 */
export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status") ?? "proposed";
    const limit = Math.min(Number(searchParams.get("limit") ?? "25"), 50);
    const offset = Number(searchParams.get("offset") ?? "0");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (sb.from("dossiers") as any)
      .select(`
        id,
        lead_id,
        property_id,
        status,
        situation_summary,
        likely_decision_maker,
        top_facts,
        recommended_call_angle,
        verification_checklist,
        source_links,
        ai_run_id,
        reviewed_by,
        reviewed_at,
        review_notes,
        created_at,
        updated_at,
        leads!inner (
          id,
          first_name,
          last_name,
          phone,
          stage,
          status,
          notes,
          decision_maker_note,
          monetizability_score,
          dispo_friction_level,
          source,
          assigned_to,
          created_at
        ),
        properties (
          id,
          address,
          city,
          state,
          zip,
          county
        )
      `, { count: "exact" });

    if (statusParam !== "all") {
      query = query.eq("status", statusParam);
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      items: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[API/dossiers/queue] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
