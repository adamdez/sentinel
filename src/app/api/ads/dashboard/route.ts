import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdsMarket = "spokane" | "kootenai";
type MarketKey = "all" | AdsMarket;

interface DashboardSummary {
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  avgCpc: number;
  avgCtr: number;
  costPerLead: number;
  rowCount: number;
  campaignCount: number;
}

interface DashboardCampaignRow {
  id: number;
  name: string;
  market: AdsMarket | null;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

interface LandingReview {
  id: string;
  review_type: string;
  summary: string;
  findings: Array<{ severity: string; title: string; detail: string }>;
  suggestions: Array<{
    action: string;
    target: string;
    target_id: string;
    old_value: string;
    new_value: string;
    reason: string;
  }>;
  ai_engine: string;
  created_at: string;
}

interface LandingAdGroupMetrics {
  name: string;
  clicks: number;
  impressions: number;
  cost: number;
  conversions: number;
}

const DASHBOARD_CACHE_TTL_MS = 60_000;
const METRICS_ROW_CAP = 5_000;
const responseCache = new Map<string, { expiresAt: number; payload: unknown }>();

function createSummary(): DashboardSummary {
  return {
    spend: 0,
    clicks: 0,
    impressions: 0,
    conversions: 0,
    avgCpc: 0,
    avgCtr: 0,
    costPerLead: 0,
    rowCount: 0,
    campaignCount: 0,
  };
}

function finalizeSummary(summary: DashboardSummary): DashboardSummary {
  return {
    ...summary,
    avgCpc: summary.clicks > 0 ? summary.spend / summary.clicks : 0,
    avgCtr: summary.impressions > 0 ? summary.clicks / summary.impressions : 0,
    costPerLead: summary.conversions > 0 ? summary.spend / summary.conversions : 0,
  };
}

function parseDays(rawDays: string | null): number {
  const days = Number(rawDays ?? 30);
  return [1, 7, 14, 30].includes(days) ? days : 30;
}

function normalizeMarket(value: unknown): AdsMarket | null {
  return value === "spokane" || value === "kootenai" ? value : null;
}

async function loadDashboardData(sb: ReturnType<typeof createServerClient>, days: number) {
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [metricsRes, campaignsRes, syncRes] = await Promise.all([
    (sb.from("ads_daily_metrics") as any)
      .select("campaign_id, market, impressions, clicks, cost_micros, conversions")
      .gte("report_date", sinceDate)
      .is("ad_group_id", null)
      .is("keyword_id", null)
      .order("report_date", { ascending: false })
      .limit(METRICS_ROW_CAP),
    (sb.from("ads_campaigns") as any)
      .select("id, name, market, status")
      .neq("status", "REMOVED"),
    (sb.from("ads_sync_logs") as any)
      .select("completed_at")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (metricsRes.error) {
    throw new Error(metricsRes.error.message);
  }
  if (campaignsRes.error) {
    throw new Error(campaignsRes.error.message);
  }
  if (syncRes.error) {
    throw new Error(syncRes.error.message);
  }

  const metricsData = (metricsRes.data ?? []) as Array<Record<string, unknown>>;
  const campaignsData = (campaignsRes.data ?? []) as Array<Record<string, unknown>>;

  const campaignMap = new Map<number, { name: string; market: AdsMarket | null }>();
  for (const campaign of campaignsData) {
    const id = Number(campaign.id);
    if (Number.isNaN(id)) continue;
    campaignMap.set(id, {
      name: typeof campaign.name === "string" ? campaign.name : `Campaign ${id}`,
      market: normalizeMarket(campaign.market),
    });
  }

  const marketTotals: Record<MarketKey, DashboardSummary> = {
    all: createSummary(),
    spokane: createSummary(),
    kootenai: createSummary(),
  };
  const campaignAgg = new Map<number, DashboardCampaignRow>();

  for (const row of metricsData) {
    const campaignId = Number(row.campaign_id);
    if (Number.isNaN(campaignId)) continue;

    const fallbackCampaign = campaignMap.get(campaignId);
    const market = normalizeMarket(row.market) ?? fallbackCampaign?.market ?? null;
    const spend = Number(row.cost_micros ?? 0) / 1_000_000;
    const clicks = Number(row.clicks ?? 0);
    const impressions = Number(row.impressions ?? 0);
    const conversions = Number(row.conversions ?? 0);

    const aggregate = (summary: DashboardSummary) => {
      summary.spend += spend;
      summary.clicks += clicks;
      summary.impressions += impressions;
      summary.conversions += conversions;
      summary.rowCount += 1;
    };

    aggregate(marketTotals.all);
    if (market) {
      aggregate(marketTotals[market]);
    }

    const campaignRow = campaignAgg.get(campaignId) ?? {
      id: campaignId,
      name: fallbackCampaign?.name ?? `Campaign ${campaignId}`,
      market,
      spend: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
    };
    campaignRow.market = campaignRow.market ?? market;
    campaignRow.spend += spend;
    campaignRow.clicks += clicks;
    campaignRow.impressions += impressions;
    campaignRow.conversions += conversions;
    campaignAgg.set(campaignId, campaignRow);
  }

  const campaignRows = Array.from(campaignAgg.values()).sort((a, b) => b.spend - a.spend);
  marketTotals.all.campaignCount = campaignRows.length;
  marketTotals.spokane.campaignCount = campaignRows.filter((row) => row.market === "spokane").length;
  marketTotals.kootenai.campaignCount = campaignRows.filter((row) => row.market === "kootenai").length;

  return {
    dashboard: {
      marketTotals: {
        all: finalizeSummary(marketTotals.all),
        spokane: finalizeSummary(marketTotals.spokane),
        kootenai: finalizeSummary(marketTotals.kootenai),
      },
      campaignRows,
      lastSyncAt: syncRes.data?.completed_at ?? null,
      truncated: metricsData.length >= METRICS_ROW_CAP,
      hasData: metricsData.length > 0,
    },
  };
}

async function loadLandingData(sb: ReturnType<typeof createServerClient>) {
  const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [reviewRes, adGroupsRes, metricsRes] = await Promise.all([
    (sb.from("ad_reviews") as any)
      .select("id, review_type, summary, findings, suggestions, ai_engine, created_at")
      .eq("review_type", "landing_page")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (sb.from("ads_ad_groups") as any)
      .select("id, name")
      .eq("status", "ENABLED"),
    (sb.from("ads_daily_metrics") as any)
      .select("ad_group_id, impressions, clicks, cost_micros, conversions")
      .gte("report_date", sinceDate)
      .not("ad_group_id", "is", null),
  ]);

  if (reviewRes.error) {
    throw new Error(reviewRes.error.message);
  }
  if (adGroupsRes.error) {
    throw new Error(adGroupsRes.error.message);
  }
  if (metricsRes.error) {
    throw new Error(metricsRes.error.message);
  }

  const adGroups = (adGroupsRes.data ?? []) as Array<Record<string, unknown>>;
  const metrics = (metricsRes.data ?? []) as Array<Record<string, unknown>>;
  const metricAgg = new Map<number, LandingAdGroupMetrics>();

  for (const row of metrics) {
    const adGroupId = Number(row.ad_group_id);
    if (Number.isNaN(adGroupId)) continue;
    const current = metricAgg.get(adGroupId) ?? {
      name: "",
      clicks: 0,
      impressions: 0,
      cost: 0,
      conversions: 0,
    };
    current.clicks += Number(row.clicks ?? 0);
    current.impressions += Number(row.impressions ?? 0);
    current.cost += Number(row.cost_micros ?? 0) / 1_000_000;
    current.conversions += Number(row.conversions ?? 0);
    metricAgg.set(adGroupId, current);
  }

  const adGroupMetrics: LandingAdGroupMetrics[] = adGroups
    .map((adGroup) => {
      const id = Number(adGroup.id);
      const metricsForGroup = metricAgg.get(id) ?? {
        name: "",
        clicks: 0,
        impressions: 0,
        cost: 0,
        conversions: 0,
      };
      return {
        name: typeof adGroup.name === "string" ? adGroup.name : `Ad Group ${id}`,
        clicks: metricsForGroup.clicks,
        impressions: metricsForGroup.impressions,
        cost: metricsForGroup.cost,
        conversions: metricsForGroup.conversions,
      };
    })
    .sort((a, b) => b.cost - a.cost);

  return {
    landing: {
      review: (reviewRes.data ?? null) as LandingReview | null,
      adGroupMetrics,
    },
  };
}

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const view = req.nextUrl.searchParams.get("view") === "landing" ? "landing" : "dashboard";
  const days = parseDays(req.nextUrl.searchParams.get("days"));
  const force = req.nextUrl.searchParams.get("force") === "1";
  const cacheKey = `${view}:${days}`;

  if (!force) {
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload);
    }
  }

  try {
    const payload = view === "landing"
      ? await loadLandingData(sb)
      : await loadDashboardData(sb, days);

    responseCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
    });

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[Ads/Dashboard]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load ads dashboard data" },
      { status: 500 },
    );
  }
}
