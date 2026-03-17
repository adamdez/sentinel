import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
      created_at,
      metadata,
      ads_keywords(text, google_keyword_id),
      ads_ad_groups:related_ad_group_id(name, google_ad_group_id),
      ads_campaigns:related_campaign_id(name, google_campaign_id)
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
  // Builder-mode recs (keyword_add, ad_group_create, negative_add) use metadata to distinguish
  // unique recommendations that share the same entity FKs.
  const dedupeMap = new Map<string, typeof recs[0]>();
  for (const rec of recs) {
    // Generate a composite key for deduplication
    const entityKey = rec.related_keyword_id
      ? `kw_${rec.related_keyword_id}`
      : rec.related_ad_group_id
        ? `ag_${rec.related_ad_group_id}`
        : `camp_${rec.related_campaign_id}`;

    const actionKey = rec.recommendation_type;

    // For builder types with metadata, include the keyword/entity text to avoid
    // collapsing distinct recommendations that share the same campaign/ad group FK
    let metadataSuffix = "";
    if (rec.metadata) {
      if (rec.metadata.keyword_text) {
        metadataSuffix = `_${rec.metadata.keyword_text}`;
      } else if (rec.metadata.ad_group_name) {
        metadataSuffix = `_${rec.metadata.ad_group_name}`;
      }
    }

    const compositeKey = `${entityKey}_${actionKey}${metadataSuffix}`;

    // Map uses first-seen (newest due to ORDER BY created_at DESC)
    if (!dedupeMap.has(compositeKey)) {
      dedupeMap.set(compositeKey, rec);
    }
  }

  const finalActionableRecs = Array.from(dedupeMap.values());

  // Enrich with entity names and executability flag
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = finalActionableRecs.map((rec: any) => {
    // Determine entity name from joined data
    const kw = rec.ads_keywords;
    const ag = rec.ads_ad_groups;
    const camp = rec.ads_campaigns;

    let entityName = "Unknown";
    let executable = true;

    if (rec.related_keyword_id) {
      entityName = kw?.text || "Unknown keyword";
      // Can't execute if keyword or its ad group has no Google Ads ID
      if (!kw?.google_keyword_id) executable = false;
    } else if (rec.related_ad_group_id) {
      entityName = ag?.name || "Unknown ad group";
      if (!ag?.google_ad_group_id) executable = false;
    } else if (rec.related_campaign_id) {
      entityName = camp?.name || "Unknown campaign";
      if (!camp?.google_campaign_id) executable = false;
    }

    // Non-mutating types don't need Google IDs
    const nonMutating = ["waste_flag", "opportunity_flag", "copy_suggestion"];
    if (nonMutating.includes(rec.recommendation_type)) {
      executable = true; // These are informational, not executed in Google Ads
    }

    // Builder types with metadata are always executable (they create new entities)
    const builderTypes = ["keyword_add", "ad_group_create"];
    if (builderTypes.includes(rec.recommendation_type) && rec.metadata) {
      executable = true;
    }

    return {
      id: rec.id,
      recommendation_type: rec.recommendation_type,
      risk_level: rec.risk_level,
      expected_impact: rec.expected_impact,
      reason: rec.reason,
      market: rec.market,
      related_campaign_id: rec.related_campaign_id,
      related_ad_group_id: rec.related_ad_group_id,
      related_keyword_id: rec.related_keyword_id,
      created_at: rec.created_at,
      entity_name: entityName,
      campaign_name: camp?.name ?? null,
      executable,
      metadata: rec.metadata ?? null,
    };
  });

  return NextResponse.json({ data: enriched });
}

/**
 * POST /api/ads/approvals
 *
 * Batch approve or reject recommendations by filter or explicit IDs.
 * Supports:
 *   { ids: string[], decision: "approved" | "rejected" }
 *   { filter: { risk_level?: string, recommendation_type?: string }, decision: "approved" | "rejected" }
 */
export async function POST(req: NextRequest) {
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

  const { ids, filter, decision } = body;
  if (!["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'" }, { status: 400 });
  }
  if (!ids && !filter) {
    return NextResponse.json({ error: "Provide 'ids' (string[]) or 'filter' ({ risk_level?, recommendation_type? })" }, { status: 400 });
  }

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recStatus = decision === "rejected" ? "ignored" : decision;

  // Build query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("ads_recommendations") as any)
    .update({ status: recStatus })
    .eq("status", "pending")
    .gte("created_at", sevenDaysAgo.toISOString());

  if (ids && Array.isArray(ids) && ids.length > 0) {
    query = query.in("id", ids);
  } else if (filter) {
    if (filter.risk_level) query = query.eq("risk_level", filter.risk_level);
    if (filter.recommendation_type) query = query.eq("recommendation_type", filter.recommendation_type);
  }

  const { data: updated, error: updateErr } = await query.select("id");

  if (updateErr) {
    console.error("[Ads/Approvals POST] Batch update error:", updateErr);
    return NextResponse.json({ error: "Database error during batch update" }, { status: 500 });
  }

  const count = updated?.length ?? 0;

  // Log to ledger
  if (count > 0) {
    const ledgerRows = updated.map((r: { id: string }) => ({
      recommendation_id: r.id,
      decided_by: user.id,
      decision,
      decided_at: new Date().toISOString(),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: ledgerErr } = await (sb.from("ads_approvals") as any).insert(ledgerRows);
    if (ledgerErr) {
      console.error("[Ads/Approvals POST] Ledger insert failed:", ledgerErr);
    }
  }

  return NextResponse.json({ ok: true, count, decision });
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
