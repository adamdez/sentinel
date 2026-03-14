import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { analyzeWithClaude, buildAdsSystemPrompt } from "@/lib/claude-client";
import { insertValidatedRecommendations } from "@/lib/ads/recommendations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/ads/review
 *
 * Triggers Claude to analyze the latest synced ads data from
 * normalized ads_* tables and produce a review with findings
 * and actionable suggestions.
 *
 * Body: { reviewType?: 'copy' | 'performance' | 'strategy' }
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  let body: { reviewType?: string } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch { /* default */ }

  const reviewType = (body.reviewType ?? "performance") as "copy" | "performance" | "strategy";

  try {
    // ── Fetch from normalized ads_* tables (populated by sync) ──────
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [campaignsRes, keywordsRes, searchTermsRes, metricsRes] = await Promise.all([
      (sb.from("ads_campaigns") as any).select("*"),
      (sb.from("ads_keywords") as any).select("*, ads_ad_groups(name, campaign_id, ads_campaigns(name, market))"),
      (sb.from("ads_search_terms") as any).select("*").order("clicks", { ascending: false }).limit(100),
      (sb.from("ads_daily_metrics") as any).select("*, ads_campaigns(name, market)").gte("report_date", sevenDaysAgo),
    ]);

    const campaigns = campaignsRes.data ?? [];
    const keywords = keywordsRes.data ?? [];
    const searchTerms = searchTermsRes.data ?? [];
    const dailyMetrics = metricsRes.data ?? [];

    if (campaigns.length === 0 && dailyMetrics.length === 0) {
      return NextResponse.json({
        error: "No ads data found. Run a sync first (POST /api/ads/sync).",
      }, { status: 404 });
    }

    // Aggregate metrics for system prompt context
    const totalSpendMicros = dailyMetrics.reduce((s: number, r: Record<string, unknown>) => s + Number(r.cost_micros ?? 0), 0);
    const totalSpend = totalSpendMicros / 1_000_000;
    const totalClicks = dailyMetrics.reduce((s: number, r: Record<string, unknown>) => s + Number(r.clicks ?? 0), 0);
    const totalImpressions = dailyMetrics.reduce((s: number, r: Record<string, unknown>) => s + Number(r.impressions ?? 0), 0);
    const totalConversions = dailyMetrics.reduce((s: number, r: Record<string, unknown>) => s + Number(r.conversions ?? 0), 0);

    const systemPrompt = buildAdsSystemPrompt({
      totalSpend,
      totalConversions,
      avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      avgCtr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
      campaignCount: campaigns.length,
    });

    // Build analysis context from normalized tables
    const adsContext = {
      campaigns: campaigns.map((c: Record<string, unknown>) => ({
        id: c.id,
        googleId: c.google_campaign_id,
        name: c.name,
        market: c.market,
        status: c.status,
      })),
      keywords: keywords.slice(0, 80).map((k: Record<string, unknown>) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ag = k.ads_ad_groups as any;
        return {
          id: k.id,
          text: k.text,
          matchType: k.match_type,
          status: k.status,
          adGroup: ag?.name ?? null,
          campaign: ag?.ads_campaigns?.name ?? null,
          market: ag?.ads_campaigns?.market ?? null,
        };
      }),
      searchTerms: searchTerms.slice(0, 50).map((st: Record<string, unknown>) => ({
        term: st.search_term,
        impressions: st.impressions,
        clicks: st.clicks,
        costDollars: Number(st.cost_micros ?? 0) / 1_000_000,
        conversions: st.conversions,
        isWaste: st.is_waste,
        isOpportunity: st.is_opportunity,
        market: st.market,
      })),
      dailyMetrics: dailyMetrics.slice(0, 50).map((m: Record<string, unknown>) => {
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
      }),
    };

    // Build the analysis prompt based on review type
    let analysisPrompt: string;
    const jsonInstructions = [
      "",
      "Respond with JSON: { \"summary\": \"...\", \"findings\": [...], \"suggestions\": [...], \"structured_recommendations\": [...] }",
      "Each finding: { \"severity\": \"info|warning|critical\", \"title\": \"...\", \"detail\": \"...\" }",
      "Each suggestion: { \"action\": \"bid_adjust|pause_keyword|enable_keyword|update_copy|add_keyword|budget_adjust\", \"target\": \"...\", \"target_id\": \"...\", \"old_value\": \"...\", \"new_value\": \"...\", \"reason\": \"...\" }",
      "Each structured_recommendation: { \"recommendation_type\": \"bid_adjust|waste_flag|opportunity_flag|keyword_pause|copy_suggestion|budget_adjust\", \"risk_level\": \"green|yellow|red\", \"expected_impact\": \"...\", \"reason\": \"...\", \"related_campaign_id\": <number|null>, \"related_ad_group_id\": <number|null>, \"related_keyword_id\": <number|null> }",
    ].join("\n");

    if (reviewType === "copy") {
      analysisPrompt = [
        "Review the following Google Ads keywords and search terms for Dominion Home Deals (cash home buyers in Spokane/CDA).",
        "Analyze keyword selection quality, match type strategy, and suggest copy improvements for ad groups.",
        "",
        "Keywords:", JSON.stringify(adsContext.keywords, null, 2),
        "",
        "Top Search Terms:", JSON.stringify(adsContext.searchTerms, null, 2),
        jsonInstructions,
      ].join("\n");
    } else if (reviewType === "strategy") {
      analysisPrompt = [
        "Provide a strategic review of our Google Ads performance for Dominion Home Deals.",
        "",
        "Campaigns:", JSON.stringify(adsContext.campaigns, null, 2),
        "",
        "Daily Metrics (last 7 days):", JSON.stringify(adsContext.dailyMetrics, null, 2),
        "",
        "Search Terms:", JSON.stringify(adsContext.searchTerms, null, 2),
        "",
        "Analyze: budget allocation, campaign structure, market coverage (Spokane vs Kootenai), keyword strategy, wasted spend.",
        jsonInstructions,
      ].join("\n");
    } else {
      analysisPrompt = [
        "Analyze the following Google Ads performance data for Dominion Home Deals (last 7 days).",
        "",
        "Campaigns:", JSON.stringify(adsContext.campaigns, null, 2),
        "",
        "Daily Metrics:", JSON.stringify(adsContext.dailyMetrics, null, 2),
        "",
        "Keywords:", JSON.stringify(adsContext.keywords.slice(0, 40), null, 2),
        "",
        "Search Terms:", JSON.stringify(adsContext.searchTerms, null, 2),
        "",
        "Identify: top performers, underperformers, wasted spend, optimization opportunities.",
        jsonInstructions,
      ].join("\n");
    }

    const rawResponse = await analyzeWithClaude({
      prompt: analysisPrompt,
      systemPrompt,
      apiKey,
    });

    // Parse Claude's JSON response
    let parsed: { summary: string; findings: unknown[]; suggestions: unknown[]; structured_recommendations?: unknown[] };
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: rawResponse, findings: [], suggestions: [], structured_recommendations: [] };
    } catch {
      parsed = { summary: rawResponse, findings: [], suggestions: [], structured_recommendations: [] };
    }

    // Store the review
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: review, error: reviewErr } = await (sb.from("ad_reviews") as any)
      .insert({
        snapshot_date: new Date().toISOString(),
        review_type: reviewType,
        summary: parsed.summary,
        findings: parsed.findings,
        suggestions: parsed.suggestions,
        ai_engine: "claude",
        model_used: "claude-sonnet-4",
      })
      .select("*")
      .single();

    if (reviewErr) {
      console.error("[Ads/Review] Insert error:", reviewErr);
      return NextResponse.json({ error: "Failed to store review" }, { status: 500 });
    }

    // Create action suggestions from the review
    const actionRows = (parsed.suggestions ?? []).map((s: unknown) => {
      const sug = s as Record<string, string>;
      return {
        review_id: review.id,
        action_type: sug.action ?? "bid_adjust",
        target_entity: sug.target ?? "unknown",
        target_id: sug.target_id ?? "unknown",
        old_value: sug.old_value ?? null,
        new_value: sug.new_value ?? null,
        status: "suggested",
      };
    });

    if (actionRows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("ad_actions") as any).insert(actionRows);
    }

    // Phase 5 Slice 1: Process structured recommendations purely for validation and data capture
    // This is entirely non-blocking for the legacy flow.
    try {
      if (Array.isArray(parsed.structured_recommendations) && parsed.structured_recommendations.length > 0) {
        await insertValidatedRecommendations(sb, parsed.structured_recommendations, review.id);
      }
    } catch (recErr) {
      console.error("[Ads/Review] Failed to process structured recommendations:", recErr);
      // We do not return an error here so the operator still gets their legacy review output
    }

    return NextResponse.json({
      ok: true,
      review: {
        id: review.id,
        reviewType,
        summary: parsed.summary,
        findingsCount: parsed.findings.length,
        suggestionsCount: parsed.suggestions.length,
      },
    });
  } catch (err) {
    // Log full error details for debugging Anthropic API issues
    if (err instanceof Error) {
      console.error("[Ads/Review]", err.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiErr = err as any;
      if (apiErr.status) console.error("[Ads/Review] Status:", apiErr.status);
      if (apiErr.error) console.error("[Ads/Review] Body:", JSON.stringify(apiErr.error));
    } else {
      console.error("[Ads/Review]", err);
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Review failed" },
      { status: 500 },
    );
  }
}
