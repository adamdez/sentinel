import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  refreshAccessToken,
  getGoogleAdsConfig,
  fetchCampaignPerformance,
  fetchAdPerformance,
  fetchKeywordPerformance,
} from "@/lib/google-ads";
import { analyzeWithClaude, buildAdsSystemPrompt } from "@/lib/claude-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/ads/cycle
 *
 * Vercel Cron endpoint — runs weekly (Sundays 8am) for full review,
 * or daily for quick health checks.
 *
 * vercel.json: { "crons": [
 *   { "path": "/api/ads/cycle?mode=daily", "schedule": "0 8 * * *" },
 *   { "path": "/api/ads/cycle?mode=weekly", "schedule": "0 8 * * 0" }
 * ]}
 *
 * Query: ?mode=daily|weekly (defaults to daily)
 */
export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = req.nextUrl.searchParams.get("mode") ?? "daily";
  const sb = createServerClient();

  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!refreshToken) {
    return NextResponse.json({ error: "GOOGLE_ADS_REFRESH_TOKEN not configured" }, { status: 503 });
  }

  const results: Record<string, unknown> = { mode, steps: [] };

  try {
    // Step 1: Sync latest data
    const endDate = new Date().toISOString().split("T")[0];
    const daysBack = mode === "weekly" ? 7 : 1;
    const startDate = new Date(Date.now() - daysBack * 86400000).toISOString().split("T")[0];

    const accessToken = await refreshAccessToken(refreshToken);
    const config = getGoogleAdsConfig(accessToken);

    const [campaigns, ads, keywords] = await Promise.all([
      fetchCampaignPerformance(config, startDate, endDate),
      fetchAdPerformance(config, startDate, endDate),
      fetchKeywordPerformance(config, startDate, endDate),
    ]);

    const snapshotDate = new Date().toISOString();
    const rows: Record<string, unknown>[] = [];

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

    if (rows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("ad_snapshots") as any).insert(rows);
    }

    (results.steps as unknown[]).push({ step: "sync", campaigns: campaigns.length, ads: ads.length, keywords: keywords.length });

    // Step 2: Quick health check (daily) — flag budget burners
    const budgetBurners = keywords.filter((k) => k.cost > 10 && k.conversions === 0);
    if (budgetBurners.length > 0) {
      const burnerActions = budgetBurners.map((k) => ({
        action_type: "pause_keyword",
        target_entity: `${k.adGroupName}: ${k.keywordText}`,
        target_id: `${k.adGroupId}~${k.keywordId}`,
        old_value: `$${k.cost.toFixed(2)} spent, 0 conversions`,
        new_value: "PAUSED",
        status: "suggested",
      }));

      // Create a quick review
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: quickReview } = await (sb.from("ad_reviews") as any)
        .insert({
          snapshot_date: snapshotDate,
          review_type: "performance",
          summary: `Daily health check: ${budgetBurners.length} keywords burning budget with 0 conversions.`,
          findings: budgetBurners.map((k) => ({
            severity: "warning",
            title: `${k.keywordText} — $${k.cost.toFixed(2)} spent, 0 conversions`,
            detail: `Ad group: ${k.adGroupName}, CPC: $${k.avgCpc.toFixed(2)}, ${k.clicks} clicks`,
          })),
          suggestions: [],
          ai_engine: "system",
          model_used: "heuristic",
        })
        .select("id")
        .single();

      if (quickReview) {
        const actionsWithReview = burnerActions.map((a) => ({ ...a, review_id: quickReview.id }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("ad_actions") as any).insert(actionsWithReview);
      }

      (results.steps as unknown[]).push({ step: "health_check", budgetBurners: budgetBurners.length });
    }

    // Step 3: Full Claude review (weekly only)
    if (mode === "weekly" && anthropicKey) {
      const totalSpend = campaigns.reduce((s, c) => s + c.cost, 0);
      const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
      const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
      const totalConversions = campaigns.reduce((s, c) => s + c.conversions, 0);

      const systemPrompt = buildAdsSystemPrompt({
        totalSpend,
        totalConversions,
        avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
        avgCtr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
        campaignCount: campaigns.length,
      });

      const prompt = [
        "Weekly Google Ads performance review for Dominion Home Deals.",
        "",
        "Campaign data (last 7 days):",
        JSON.stringify(campaigns, null, 2),
        "",
        "Top keywords by spend:",
        JSON.stringify(keywords.slice(0, 30), null, 2),
        "",
        "Provide a comprehensive review with findings and suggestions.",
        "Respond with JSON: { \"summary\": \"...\", \"findings\": [...], \"suggestions\": [...] }",
      ].join("\n");

      const rawResponse = await analyzeWithClaude({ prompt, systemPrompt, apiKey: anthropicKey });

      let parsed: { summary: string; findings: unknown[]; suggestions: unknown[] };
      try {
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: rawResponse, findings: [], suggestions: [] };
      } catch {
        parsed = { summary: rawResponse, findings: [], suggestions: [] };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: review } = await (sb.from("ad_reviews") as any)
        .insert({
          snapshot_date: snapshotDate,
          review_type: "performance",
          summary: parsed.summary,
          findings: parsed.findings,
          suggestions: parsed.suggestions,
          ai_engine: "claude",
          model_used: "claude-sonnet-4",
        })
        .select("id")
        .single();

      if (review && Array.isArray(parsed.suggestions)) {
        const actionRows = parsed.suggestions.map((s: unknown) => {
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
      }

      (results.steps as unknown[]).push({
        step: "claude_review",
        findings: parsed.findings.length,
        suggestions: parsed.suggestions.length,
      });
    }

    return NextResponse.json({ ok: true, ...results });
  } catch (err) {
    console.error("[Ads/Cycle]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cycle failed", ...results },
      { status: 500 },
    );
  }
}
