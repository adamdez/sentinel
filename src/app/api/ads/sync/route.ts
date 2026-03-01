import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  refreshAccessToken,
  getGoogleAdsConfig,
  fetchCampaignPerformance,
  fetchAdPerformance,
  fetchKeywordPerformance,
} from "@/lib/google-ads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ads/sync
 *
 * Pulls latest performance data from Google Ads API and stores
 * snapshots in ad_snapshots table. Called by cron or manually.
 *
 * Body: { startDate?: string, endDate?: string }
 * Defaults to last 7 days.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();

  // Auth check
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;

  // Allow either user auth or cron secret
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const { data: { user }, error } = await sb.auth.getUser(token ?? "");
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Get Google Ads refresh token from env or user profile
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!refreshToken) {
    return NextResponse.json(
      { error: "GOOGLE_ADS_REFRESH_TOKEN not configured" },
      { status: 503 },
    );
  }

  let body: { startDate?: string; endDate?: string } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch { /* empty body is fine */ }

  const endDate = body.endDate ?? new Date().toISOString().split("T")[0];
  const startDate = body.startDate ?? new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  try {
    // Refresh OAuth token
    const accessToken = await refreshAccessToken(refreshToken);
    const config = getGoogleAdsConfig(accessToken);

    // Pull data in parallel
    const [campaigns, ads, keywords] = await Promise.all([
      fetchCampaignPerformance(config, startDate, endDate),
      fetchAdPerformance(config, startDate, endDate),
      fetchKeywordPerformance(config, startDate, endDate),
    ]);

    const snapshotDate = new Date().toISOString();
    const rows: Record<string, unknown>[] = [];

    // Campaign-level snapshots
    for (const c of campaigns) {
      rows.push({
        campaign_id: c.campaignId,
        campaign_name: c.campaignName,
        impressions: c.impressions,
        clicks: c.clicks,
        ctr: c.ctr,
        avg_cpc: c.avgCpc,
        conversions: c.conversions,
        cost: c.cost,
        roas: c.roas,
        snapshot_date: snapshotDate,
        raw_json: c,
      });
    }

    // Ad-level snapshots
    for (const a of ads) {
      rows.push({
        campaign_id: a.campaignId,
        campaign_name: a.campaignName,
        ad_group_id: a.adGroupId,
        ad_group_name: a.adGroupName,
        ad_id: a.adId,
        headline1: a.headline1,
        headline2: a.headline2,
        headline3: a.headline3,
        description1: a.description1,
        description2: a.description2,
        impressions: a.impressions,
        clicks: a.clicks,
        ctr: a.ctr,
        avg_cpc: a.avgCpc,
        conversions: a.conversions,
        cost: a.cost,
        snapshot_date: snapshotDate,
        raw_json: a,
      });
    }

    // Insert all snapshots
    if (rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertErr } = await (sb.from("ad_snapshots") as any).insert(rows);
      if (insertErr) {
        console.error("[Ads/Sync] Insert error:", insertErr);
        return NextResponse.json({ error: "Failed to store snapshots" }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      synced: {
        campaigns: campaigns.length,
        ads: ads.length,
        keywords: keywords.length,
        totalRows: rows.length,
      },
      dateRange: { startDate, endDate },
    });
  } catch (err) {
    console.error("[Ads/Sync]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
