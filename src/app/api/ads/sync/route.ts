import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { refreshAccessToken, getGoogleAdsConfig } from "@/lib/google-ads";
import { runNormalizedSync } from "@/lib/ads/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/ads/sync
 *
 * Pulls latest data from Google Ads API and writes to normalized
 * ads_* tables via 5-stage idempotent sync.
 *
 * Body: { startDate?: string, endDate?: string }
 * Defaults to last 30 days.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();

  // Auth check — user token or cron secret
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const {
      data: { user },
      error,
    } = await sb.auth.getUser(token ?? "");
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
  } catch {
    /* empty body is fine */
  }

  const endDate = body.endDate ?? new Date().toISOString().split("T")[0];
  const startDate =
    body.startDate ??
    new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  try {
    const accessToken = await refreshAccessToken(refreshToken);
    const config = getGoogleAdsConfig(accessToken);

    const result = await runNormalizedSync(sb, config, startDate, endDate);

    return NextResponse.json({
      ok: true,
      synced: result,
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
