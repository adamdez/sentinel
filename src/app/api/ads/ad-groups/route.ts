import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  refreshAccessToken,
  getGoogleAdsConfig,
  fetchAllAdGroups,
  setAdGroupStatus,
} from "@/lib/google-ads";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/ad-groups
 *
 * Returns all ad groups from the database (synced from Google Ads).
 * Includes performance metrics from the last sync.
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch ad groups from DB with campaign info and keyword counts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: adGroups, error: agErr } = await (sb
    .from("ads_ad_groups") as any)
    .select("id, google_ad_group_id, name, status, impressions, clicks, cost, conversions, ctr, avg_cpc, ads_campaigns(name)")
    .order("name");

  if (agErr) {
    return NextResponse.json({ error: agErr.message }, { status: 500 });
  }

  // Also fetch keyword counts per ad group
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: keywords } = await (sb
    .from("ads_keywords") as any)
    .select("ad_group_id, status");

  const keywordCounts: Record<string, { total: number; enabled: number; paused: number }> = {};
  for (const kw of keywords ?? []) {
    if (!keywordCounts[kw.ad_group_id]) {
      keywordCounts[kw.ad_group_id] = { total: 0, enabled: 0, paused: 0 };
    }
    keywordCounts[kw.ad_group_id].total++;
    if (kw.status === "ENABLED") keywordCounts[kw.ad_group_id].enabled++;
    else keywordCounts[kw.ad_group_id].paused++;
  }

  const result = (adGroups ?? []).map((ag: Record<string, unknown>) => ({
    id: ag.id,
    googleAdGroupId: ag.google_ad_group_id,
    name: ag.name,
    status: ag.status,
    campaignName: (ag.ads_campaigns as Record<string, unknown>)?.name ?? null,
    impressions: ag.impressions ?? 0,
    clicks: ag.clicks ?? 0,
    cost: ag.cost ?? 0,
    conversions: ag.conversions ?? 0,
    ctr: ag.ctr ?? 0,
    avgCpc: ag.avg_cpc ?? 0,
    keywords: keywordCounts[ag.id as string] ?? { total: 0, enabled: 0, paused: 0 },
  }));

  return NextResponse.json({ adGroups: result });
}

/**
 * PATCH /api/ads/ad-groups
 *
 * Directly pause or enable an ad group in Google Ads.
 * Body: { googleAdGroupId: string, action: "pause" | "enable" }
 *
 * This is a direct control endpoint — no recommendation workflow needed.
 * All mutations are logged.
 */
export async function PATCH(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { googleAdGroupId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { googleAdGroupId, action } = body;
  if (!googleAdGroupId || !action || !["pause", "enable"].includes(action)) {
    return NextResponse.json(
      { error: "Required: { googleAdGroupId: string, action: 'pause' | 'enable' }" },
      { status: 400 },
    );
  }

  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!refreshToken) {
    return NextResponse.json({ error: "GOOGLE_ADS_REFRESH_TOKEN not configured" }, { status: 503 });
  }

  try {
    const accessToken = await refreshAccessToken(refreshToken);
    const config = getGoogleAdsConfig(accessToken);
    const newStatus = action === "pause" ? "PAUSED" : "ENABLED";

    const result = await setAdGroupStatus(config, googleAdGroupId, newStatus as "ENABLED" | "PAUSED");

    // Update local DB to reflect the change immediately
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("ads_ad_groups") as any)
      .update({ status: newStatus })
      .eq("google_ad_group_id", googleAdGroupId);

    // Log the mutation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("ads_implementation_logs") as any).insert({
      implemented_by: user.id,
      result: "SUCCESS",
      action_taken: `ad_group_${action}`,
      notes: JSON.stringify({ googleAdGroupId, newStatus, apiResult: result }),
      implemented_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, googleAdGroupId, newStatus });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Ads/AdGroups]", errMsg);

    // Log failure
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("ads_implementation_logs") as any).insert({
        implemented_by: user.id,
        result: "FAILED",
        action_taken: `ad_group_${action}`,
        notes: JSON.stringify({ googleAdGroupId, error: errMsg }),
        implemented_at: new Date().toISOString(),
      });
    } catch (logErr) {
      console.error("[Ads/AdGroups] Failed to log:", logErr);
    }

    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}

/**
 * POST /api/ads/ad-groups/refresh
 *
 * Force-refresh ad groups from Google Ads API (bypass sync schedule).
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!refreshToken) {
    return NextResponse.json({ error: "GOOGLE_ADS_REFRESH_TOKEN not configured" }, { status: 503 });
  }

  try {
    const accessToken = await refreshAccessToken(refreshToken);
    const config = getGoogleAdsConfig(accessToken);
    const allGroups = await fetchAllAdGroups(config);

    return NextResponse.json({ ok: true, count: allGroups.length, adGroups: allGroups });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
