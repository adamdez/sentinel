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
  const [campaignsRes, metricsRes, searchTermsRes] = await Promise.all([
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
  ]);

  const campaigns = campaignsRes.data ?? [];
  const dailyMetrics = metricsRes.data ?? [];
  const searchTerms = searchTermsRes.data ?? [];

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

  // Also include latest review if available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: latestReview } = await (sb.from("ad_reviews") as any)
    .select("summary, findings, suggestions, review_type")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (latestReview) {
    systemPrompt += `\n\n## Latest AI Review (${latestReview.review_type})\n${latestReview.summary}`;
  }

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
  } catch (err) {
    console.error("[Ads/Chat]", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
