import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { streamClaudeChat, type ClaudeMessage } from "@/lib/claude-client";
import { loadAdsSystemPrompt } from "@/lib/ads/ads-system-prompt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ads/chat
 *
 * Streaming chat endpoint for asking Claude about your Google Ads.
 * Pre-loaded with campaign context from normalized ads_* tables.
 *
 * Body: { messages: ClaudeMessage[] }
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { messages: ClaudeMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages array required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Fetch context from normalized ads_* tables ──────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [
    campaignsRes, metricsRes, searchTermsRes,
    negKeywordsRes, budgetsRes, convActionsRes,
    deviceRes, geoRes, briefingRes,
    pendingRecsRes, recentDecisionsRes, keywordQualityRes,
  ] = await Promise.all([
    (sb.from("ads_campaigns") as any).select("id, name, market, status"),
    (sb.from("ads_daily_metrics") as any)
      .select("campaign_id, impressions, clicks, cost_micros, conversions, report_date, ads_campaigns(name, market)")
      .gte("report_date", thirtyDaysAgo)
      .order("report_date", { ascending: false })
      .limit(50),
    (sb.from("ads_search_terms") as any)
      .select("search_term, impressions, clicks, cost_micros, conversions, market, is_waste, is_opportunity")
      .order("clicks", { ascending: false })
      .limit(30),
    (sb.from("ads_negative_keywords") as any)
      .select("keyword_text, match_type, level, campaign_id")
      .limit(100),
    (sb.from("ads_campaign_budgets") as any)
      .select("campaign_id, daily_budget_micros, delivery_method"),
    (sb.from("ads_conversion_actions") as any)
      .select("name, type, status, counting_type, category"),
    (sb.from("ads_device_metrics") as any)
      .select("campaign_id, device, impressions, clicks, cost_micros, conversions")
      .gte("report_date", thirtyDaysAgo)
      .limit(50),
    (sb.from("ads_geo_metrics") as any)
      .select("campaign_id, geo_name, impressions, clicks, cost_micros, conversions")
      .gte("report_date", thirtyDaysAgo)
      .order("cost_micros", { ascending: false })
      .limit(50),
    (sb.from("ads_intelligence_briefings") as any)
      .select("executive_summary, account_status, data_points, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    (sb.from("ads_recommendations") as any)
      .select("recommendation_type, risk_level, reason, market, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20),
    (sb.from("ads_recommendations") as any)
      .select("recommendation_type, status, market, created_at")
      .in("status", ["approved", "ignored"])
      .order("created_at", { ascending: false })
      .limit(20),
    (sb.from("ads_keywords") as any)
      .select("text, match_type, quality_score, expected_ctr, ad_relevance, landing_page_experience, status")
      .not("quality_score", "is", null)
      .limit(50),
  ]);

  const campaigns = campaignsRes.data ?? [];
  const dailyMetrics = metricsRes.data ?? [];
  const searchTerms = searchTermsRes.data ?? [];
  const negativeKeywords = negKeywordsRes.data ?? [];
  const campaignBudgets = budgetsRes.data ?? [];
  const conversionActions = convActionsRes.data ?? [];
  const deviceMetrics = deviceRes.data ?? [];
  const geoMetrics = geoRes.data ?? [];
  const latestBriefing = briefingRes.data ?? null;
  const pendingRecs = pendingRecsRes.data ?? [];
  const recentDecisions = recentDecisionsRes.data ?? [];
  const keywordQuality = keywordQualityRes.data ?? [];

  const totalSpendMicros = dailyMetrics.reduce((s: number, r: Record<string, unknown>) => s + Number(r.cost_micros ?? 0), 0);
  const totalSpend = totalSpendMicros / 1_000_000;
  const totalClicks = dailyMetrics.reduce((s: number, r: Record<string, unknown>) => s + Number(r.clicks ?? 0), 0);
  const totalImpressions = dailyMetrics.reduce((s: number, r: Record<string, unknown>) => s + Number(r.impressions ?? 0), 0);
  const totalConversions = dailyMetrics.reduce((s: number, r: Record<string, unknown>) => s + Number(r.conversions ?? 0), 0);

  let systemPrompt = await loadAdsSystemPrompt({
    totalSpend,
    totalConversions,
    avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    avgCtr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
    campaignCount: campaigns.length,
  });

  // Append campaign and performance data as context
  if (dailyMetrics.length > 0) {
    const metricsContext = dailyMetrics.slice(0, 20).map((m: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const camp = m.ads_campaigns as any;
      return {
        date: m.report_date,
        campaign: camp?.name ?? null,
        market: camp?.market ?? null,
        impressions: m.impressions,
        clicks: m.clicks,
        costDollars: Number(m.cost_micros ?? 0) / 1_000_000,
        conversions: m.conversions,
      };
    });
    systemPrompt += "\n\n## Recent Campaign Data (last 30 days)\n```json\n" +
      JSON.stringify(metricsContext, null, 2) +
      "\n```";
  }

  if (searchTerms.length > 0) {
    const termsContext = searchTerms.map((st: Record<string, unknown>) => ({
      term: st.search_term,
      clicks: st.clicks,
      costDollars: Number(st.cost_micros ?? 0) / 1_000_000,
      conversions: st.conversions,
      isWaste: st.is_waste,
    }));
    systemPrompt += "\n\n## Top Search Terms\n```json\n" +
      JSON.stringify(termsContext, null, 2) +
      "\n```";
  }

  // ── Append additional context sections ──────────────────────────

  if (negativeKeywords.length > 0) {
    const ctx = negativeKeywords.map((nk: Record<string, unknown>) => ({
      keyword_text: nk.keyword_text,
      match_type: nk.match_type,
      level: nk.level,
    }));
    systemPrompt += "\n\n## Negative Keywords\n```json\n" + JSON.stringify(ctx, null, 2) + "\n```";
  }

  if (campaignBudgets.length > 0) {
    const ctx = campaignBudgets.map((b: Record<string, unknown>) => ({
      campaign_id: b.campaign_id,
      daily_budget_dollars: Number(b.daily_budget_micros ?? 0) / 1_000_000,
      delivery_method: b.delivery_method,
    }));
    systemPrompt += "\n\n## Campaign Budgets\n```json\n" + JSON.stringify(ctx, null, 2) + "\n```";
  }

  if (conversionActions.length > 0) {
    const ctx = conversionActions.map((ca: Record<string, unknown>) => ({
      name: ca.name,
      type: ca.type,
      status: ca.status,
      category: ca.category,
    }));
    systemPrompt += "\n\n## Conversion Actions\n```json\n" + JSON.stringify(ctx, null, 2) + "\n```";
  }

  if (deviceMetrics.length > 0) {
    const ctx = deviceMetrics.map((d: Record<string, unknown>) => ({
      device: d.device,
      impressions: d.impressions,
      clicks: d.clicks,
      costDollars: Number(d.cost_micros ?? 0) / 1_000_000,
      conversions: d.conversions,
    }));
    systemPrompt += "\n\n## Device Performance (last 30 days)\n```json\n" + JSON.stringify(ctx, null, 2) + "\n```";
  }

  if (geoMetrics.length > 0) {
    const ctx = geoMetrics.map((g: Record<string, unknown>) => ({
      geo_name: g.geo_name,
      impressions: g.impressions,
      clicks: g.clicks,
      costDollars: Number(g.cost_micros ?? 0) / 1_000_000,
      conversions: g.conversions,
    }));
    systemPrompt += "\n\n## Geographic Performance (last 30 days)\n```json\n" + JSON.stringify(ctx, null, 2) + "\n```";
  }

  if (latestBriefing) {
    systemPrompt += "\n\n## Latest Intelligence Briefing\n```json\n" + JSON.stringify({
      executive_summary: latestBriefing.executive_summary,
      account_status: latestBriefing.account_status,
      data_points: latestBriefing.data_points,
    }, null, 2) + "\n```";

    // Use the briefing as the latest AI review
    systemPrompt += `\n\n## Latest AI Review\n${latestBriefing.executive_summary}`;
  }

  if (pendingRecs.length > 0) {
    const ctx = pendingRecs.map((r: Record<string, unknown>) => ({
      type: r.recommendation_type,
      risk: r.risk_level,
      reason: r.reason,
      market: r.market,
    }));
    systemPrompt += "\n\n## Pending Recommendations\n```json\n" + JSON.stringify(ctx, null, 2) + "\n```";
  }

  if (recentDecisions.length > 0) {
    const ctx = recentDecisions.map((r: Record<string, unknown>) => ({
      type: r.recommendation_type,
      status: r.status,
      market: r.market,
    }));
    systemPrompt += "\n\n## Recent Decisions\n```json\n" + JSON.stringify(ctx, null, 2) + "\n```";
  }

  if (keywordQuality.length > 0) {
    const ctx = keywordQuality.map((k: Record<string, unknown>) => ({
      text: k.text,
      match_type: k.match_type,
      quality_score: k.quality_score,
      expected_ctr: k.expected_ctr,
      ad_relevance: k.ad_relevance,
      landing_page_experience: k.landing_page_experience,
    }));
    systemPrompt += "\n\n## Keyword Quality Scores\n```json\n" + JSON.stringify(ctx, null, 2) + "\n```";
  }

  // ── Recommendation creation instructions ──────────────────────
  systemPrompt += `

## Creating Recommendations

When the operator asks you to propose a change (pause a keyword, add a negative, adjust a bid, suggest new copy, etc.), include this exact JSON block in your response:

<RECOMMENDATION>
[{ "recommendation_type": "keyword_pause", "related_keyword_id": 123, "risk_level": "yellow", "expected_impact": "$50/mo saved", "reason": "Keyword burning budget with 0 conversions" }]
</RECOMMENDATION>

Valid recommendation_types: keyword_pause, bid_adjust, negative_add, budget_adjust, copy_suggestion, waste_flag, opportunity_flag
Valid risk_levels: green, yellow, red

Always use real entity IDs from the data above. The system will validate entity IDs and insert into the Approvals queue.`;

  try {
    const stream = await streamClaudeChat({
      messages: body.messages.slice(-20),
      systemPrompt,
      apiKey,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Ads/Chat] Stream creation failed:", errMsg, err);
    return new Response(
      JSON.stringify({ error: `Chat failed: ${errMsg}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
