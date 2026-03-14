import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/approvals
 * 
 * Fetches all currently actionable recommendations (status = 'pending').
 * Enforces a strict 7-day hard expiry. Recommendations older than 7 days
 * are filtered out.
 * Server-side deduplication ensures the UI only ever sees the *most recent* 
 * pending recommendation for a specific entity/action pair.
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Enforce 7-day freshness policy server-side
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Allow fetching by status (pending or approved)
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "pending";
  if (!["pending", "approved"].includes(status)) {
    return NextResponse.json({ error: "Invalid status parameter" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recs, error: recErr } = await (sb.from("ads_recommendations") as any)
    .select(`
      id,
      recommendation_type,
      risk_level,
      expected_impact,
      reason,
      market,
      related_campaign_id,
      related_ad_group_id,
      related_keyword_id,
      created_at
    `)
    .eq("status", status)
    .gte("created_at", sevenDaysAgo.toISOString())
    .order("created_at", { ascending: false }); // Newest first for dedupe

  if (recErr) {
    console.error("[Ads/Approvals GET] Db Error:", recErr);
    return NextResponse.json({ error: "Failed to fetch approvals." }, { status: 500 });
  }

  if (!recs || recs.length === 0) {
    return NextResponse.json({ data: [] });
  }

  // Deduplication logic: Only show the newest recommendation for an entity/action pair
  // This prevents the UI from showing "Pause Keyword X" three times if the AI reviewed it thrice.
  const dedupeMap = new Map<string, typeof recs[0]>();
  for (const rec of recs) {
    // Generate a composite key for deduplication
    const entityKey = rec.related_keyword_id 
      ? `kw_${rec.related_keyword_id}`
      : rec.related_ad_group_id
        ? `ag_${rec.related_ad_group_id}`
        : `camp_${rec.related_campaign_id}`;
    
    const actionKey = rec.recommendation_type;
    const compositeKey = `${entityKey}_${actionKey}`;

    // Map uses first-seen (newest due to ORDER BY created_at DESC)
    if (!dedupeMap.has(compositeKey)) {
      dedupeMap.set(compositeKey, rec);
    }
  }

  const finalActionableRecs = Array.from(dedupeMap.values());

  return NextResponse.json({ data: finalActionableRecs });
}

/**
 * PATCH /api/ads/approvals
 * 
 * Securely enforces a one-time state transition from 'pending' to either 
 * 'approved' or 'rejected'.
 * Requires a valid authenticated operator context.
 * Cannot be replayed. Cannot execute on stale (>7 day) rows.
 * Does NOT execute any mutation in Google Ads.
 */
export async function PATCH(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { recommendationId, decision } = body;
  
  if (!recommendationId || !["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "Validation failed: requires recommendationId and decision ('approved' | 'rejected')" }, { status: 400 });
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Map decision to valid ads_recommendation_status enum values.
  // 'rejected' is not in the enum; use 'ignored' instead.
  const recStatus = decision === "rejected" ? "ignored" : decision;

  // 1. Opportunistic Atomic Guard
  // The query MUST match 'status = pending' AND freshness bounds.
  // If another operator already clicked it, or it expired, this affects 0 rows.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updatedRec, error: updateErr } = await (sb.from("ads_recommendations") as any)
    .update({ status: recStatus })
    .match({ id: recommendationId, status: "pending" })
    .gte("created_at", sevenDaysAgo.toISOString())
    .select("id")
    .maybeSingle();

  if (updateErr) {
    console.error("[Ads/Approvals PATCH] Update error:", updateErr);
    return NextResponse.json({ error: "Database error during state transition" }, { status: 500 });
  }

  // Enforce single-transition and freshness safety
  if (!updatedRec) {
    return NextResponse.json(
      { error: "Conflict: Recommendation is stale, already decided, or invalid." },
      { status: 409 } // Conflict
    );
  }

  // 2. Insert into the immuntable Approval Ledger
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: ledgerErr } = await (sb.from("ads_approvals") as any)
    .insert({
      recommendation_id: recommendationId,
      decided_by: user.id, // Authenticated server-side identity
      decision: decision,
      decided_at: new Date().toISOString()
    });

  if (ledgerErr) {
    // We log the ledger failure but do not undo the recommendation state.
    // In a pure ACID environment, this would be rolled back.
    // Here, recording the action state change is the primary goal.
    console.error("[Ads/Approvals PATCH] Ledger insert failed, but status was transitioned:", ledgerErr);
  }

  return NextResponse.json({ 
    ok: true, 
    id: recommendationId, 
    decision 
  });
}
