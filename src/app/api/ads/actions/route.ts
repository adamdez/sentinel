import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  refreshAccessToken,
  getGoogleAdsConfig,
  updateKeywordBid,
  setKeywordStatus,
  updateCampaignBudget,
} from "@/lib/google-ads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/ads/actions
 *
 * List pending/applied actions. Optional ?status=suggested|approved|applied|rejected
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("ad_actions") as any)
    .select("*, ad_reviews(review_type, summary, ai_engine)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: "Failed to fetch actions" }, { status: 500 });
  }

  return NextResponse.json({ actions: data ?? [] });
}

/**
 * PATCH /api/ads/actions
 *
 * Approve or reject an action. If approved, execute it via Google Ads API.
 *
 * Body: { actionId: string, decision: 'approved' | 'rejected' }
 */
export async function PATCH(req: NextRequest) {
  const sb = createServerClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { actionId: string; decision: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.actionId || !["approved", "rejected"].includes(body.decision)) {
    return NextResponse.json({ error: "actionId and decision (approved|rejected) required" }, { status: 400 });
  }

  // Fetch the action
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: action, error: fetchErr } = await (sb.from("ad_actions") as any)
    .select("*")
    .eq("id", body.actionId)
    .single();

  if (fetchErr || !action) {
    return NextResponse.json({ error: "Action not found" }, { status: 404 });
  }

  if (action.status !== "suggested") {
    return NextResponse.json({ error: `Action already ${action.status}` }, { status: 400 });
  }

  if (body.decision === "rejected") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("ad_actions") as any)
      .update({ status: "rejected" })
      .eq("id", body.actionId);

    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // Approved — execute via Google Ads API
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!refreshToken) {
    // Mark approved but can't apply yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("ad_actions") as any)
      .update({ status: "approved" })
      .eq("id", body.actionId);

    return NextResponse.json({
      ok: true,
      status: "approved",
      note: "Google Ads credentials not configured — marked approved but not applied.",
    });
  }

  try {
    const accessToken = await refreshAccessToken(refreshToken);
    const config = getGoogleAdsConfig(accessToken);

    const actionType = action.action_type as string;
    const targetId = action.target_id as string;

    if (actionType === "bid_adjust" && action.new_value) {
      const newBidMicros = Math.round(parseFloat(action.new_value) * 1_000_000);
      const [adGroupId, keywordId] = targetId.split("~");
      await updateKeywordBid(config, adGroupId, keywordId, newBidMicros);
    } else if (actionType === "pause_keyword") {
      const [adGroupId, keywordId] = targetId.split("~");
      await setKeywordStatus(config, adGroupId, keywordId, "PAUSED");
    } else if (actionType === "enable_keyword") {
      const [adGroupId, keywordId] = targetId.split("~");
      await setKeywordStatus(config, adGroupId, keywordId, "ENABLED");
    } else if (actionType === "budget_adjust" && action.new_value) {
      const newBudgetMicros = Math.round(parseFloat(action.new_value) * 1_000_000);
      await updateCampaignBudget(config, targetId, newBudgetMicros);
    }

    // Mark as applied
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("ad_actions") as any)
      .update({ status: "applied", applied_at: new Date().toISOString() })
      .eq("id", body.actionId);

    // Log to event_log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: user.id,
      action: `ads_action_${actionType}`,
      entity_type: "ad_action",
      entity_id: body.actionId,
      details: {
        action_type: actionType,
        target: action.target_entity,
        target_id: targetId,
        old_value: action.old_value,
        new_value: action.new_value,
      },
    });

    return NextResponse.json({ ok: true, status: "applied" });
  } catch (err) {
    console.error("[Ads/Actions] Apply error:", err);

    // Mark approved even if apply failed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("ad_actions") as any)
      .update({ status: "approved" })
      .eq("id", body.actionId);

    return NextResponse.json({
      ok: true,
      status: "approved",
      applyError: err instanceof Error ? err.message : "Apply failed",
    });
  }
}
