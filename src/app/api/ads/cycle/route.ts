import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  refreshAccessToken,
  getGoogleAdsConfig,
} from "@/lib/google-ads";
import { runNormalizedSync } from "@/lib/ads/sync";
import { analyzeWithClaude, extractJsonObject } from "@/lib/claude-client";
import { runAdversarialReview } from "@/lib/ads/adversarial-review";
import { convertIntelToRecommendations } from "@/lib/ads/intel-to-recommendations";
import { insertValidatedRecommendations } from "@/lib/ads/recommendations";
import { loadAdsSystemPrompt } from "@/lib/ads/ads-system-prompt";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

// ── Intelligence system prompt (compact version for cron context) ────
const INTELLIGENCE_SYSTEM_PROMPT = `You are a senior Google Ads analyst for Dominion Home Deals, a cash home buyer in Spokane County WA (primary) and Kootenai County ID (secondary). They wholesale residential properties off-market.

Key benchmarks: target CPC under $15, target CPL under $150, target CTR above 5%. Zero conversions in the data almost always means conversion tracking is broken or the account is too new — flag this as the top priority if present.

Your job is to extract and rank intelligence from the provided account data. Be specific and dollar-grounded. Flag waste before opportunities. Respond ONLY with the exact JSON format requested — no commentary, no markdown, no preamble.`;

/**
 * GET /api/ads/cycle
 *
 * Vercel Cron endpoint — runs daily or weekly.
 *
 * Daily (?mode=daily):
 *   1. Normalized sync (all 8 stages)
 *   2. Full dual-model intelligence extraction → ads_intelligence_briefings + ads_recommendations
 *
 * Weekly (?mode=weekly):
 *   1. Everything daily does
 *   2. Copy-lab generation → copy_suggestion recommendations in ads_recommendations
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!refreshToken) {
    return NextResponse.json({ error: "GOOGLE_ADS_REFRESH_TOKEN not configured" }, { status: 503 });
  }

  const results: Record<string, unknown> = { mode, steps: [] };

  try {
    // ── Step 1: Normalized sync ──────────────────────────────────────
    const endDate = new Date().toISOString().split("T")[0];
    const daysBack = mode === "weekly" ? 7 : 1;
    const startDate = new Date(Date.now() - daysBack * 86400000).toISOString().split("T")[0];

    const accessToken = await refreshAccessToken(refreshToken);
    const config = getGoogleAdsConfig(accessToken);

    const syncResult = await runNormalizedSync(sb, config, startDate, endDate);
    (results.steps as unknown[]).push({ step: "sync", ...syncResult });

    // ── Step 2: Intelligence extraction ──────────────────────────────
    if (apiKey) {
      try {
        const intelResult = await runIntelligenceExtraction(sb, apiKey, openaiKey, mode);
        (results.steps as unknown[]).push({ step: "intelligence", ...intelResult });
      } catch (intelErr) {
        console.error("[Ads/Cycle] Intelligence extraction failed (non-blocking):", intelErr);
        (results.steps as unknown[]).push({
          step: "intelligence",
          error: intelErr instanceof Error ? intelErr.message : "Intelligence extraction failed",
        });
      }
    } else {
      (results.steps as unknown[]).push({ step: "intelligence", skipped: "ANTHROPIC_API_KEY not configured" });
    }

    // ── Step 3: Copy-lab generation (weekly only) ────────────────────
    if (mode === "weekly" && apiKey) {
      try {
        const copyResult = await runCopyLabGeneration(sb, apiKey, openaiKey);
        (results.steps as unknown[]).push({ step: "copy_lab", ...copyResult });
      } catch (copyErr) {
        console.error("[Ads/Cycle] Copy-lab generation failed (non-blocking):", copyErr);
        (results.steps as unknown[]).push({
          step: "copy_lab",
          error: copyErr instanceof Error ? copyErr.message : "Copy-lab generation failed",
        });
      }
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

// ── Intelligence extraction (inlined from /api/ads/intelligence POST) ──
async function runIntelligenceExtraction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  apiKey: string,
  openaiKey: string | undefined,
  mode: string,
) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [campaignsRes, keywordsRes, searchTermsRes, metrics30Res, metrics7Res] = await Promise.all([
    (sb.from("ads_campaigns") as any).select("*"),
    (sb.from("ads_keywords") as any).select("*, ads_ad_groups(name, campaign_id, ads_campaigns(name, market))"),
    (sb.from("ads_search_terms") as any).select("*").order("clicks", { ascending: false }).limit(200),
    (sb.from("ads_daily_metrics") as any).select("*, ads_campaigns(name, market)").gte("report_date", thirtyDaysAgo),
    (sb.from("ads_daily_metrics") as any).select("*, ads_campaigns(name, market)").gte("report_date", sevenDaysAgo),
  ]);

  const campaigns = campaignsRes.data ?? [];
  const keywords = keywordsRes.data ?? [];
  const searchTerms = searchTermsRes.data ?? [];
  const metrics30 = metrics30Res.data ?? [];
  const metrics7 = metrics7Res.data ?? [];

  // Fetch latest review for context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: latestReview } = await (sb.from("ad_reviews") as any)
    .select("summary, findings, suggestions, adversarial_review, review_type, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Aggregate metrics
  const agg = (rows: Record<string, unknown>[]) => ({
    spend: rows.reduce((s, r) => s + Number(r.cost_micros ?? 0), 0) / 1_000_000,
    clicks: rows.reduce((s, r) => s + Number(r.clicks ?? 0), 0),
    impressions: rows.reduce((s, r) => s + Number(r.impressions ?? 0), 0),
    conversions: rows.reduce((s, r) => s + Number(r.conversions ?? 0), 0),
  });

  const last30 = agg(metrics30);
  const last7 = agg(metrics7);

  const rawDataContext = [
    "## CAMPAIGNS",
    JSON.stringify(campaigns.map((c: Record<string, unknown>) => ({
      id: c.id, name: c.name, market: c.market, status: c.status,
    })), null, 2),
    "",
    "## AGGREGATE METRICS",
    `Last 7 days: $${last7.spend.toFixed(2)} spend | ${last7.clicks} clicks | ${last7.conversions} conversions | ${last7.impressions} impressions`,
    `Last 30 days: $${last30.spend.toFixed(2)} spend | ${last30.clicks} clicks | ${last30.conversions} conversions | ${last30.impressions} impressions`,
    "",
    "## KEYWORDS (with ad group/campaign context)",
    JSON.stringify(keywords.slice(0, 150).map((k: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ag = k.ads_ad_groups as any;
      return {
        id: k.id, text: k.text, matchType: k.match_type, status: k.status,
        adGroup: ag?.name ?? null, campaign: ag?.ads_campaigns?.name ?? null,
        market: ag?.ads_campaigns?.market ?? null,
      };
    }), null, 2),
    "",
    "## SEARCH TERMS (top 200 by clicks)",
    JSON.stringify(searchTerms.slice(0, 150).map((st: Record<string, unknown>) => ({
      term: st.search_term, impressions: st.impressions, clicks: st.clicks,
      costDollars: Number(st.cost_micros ?? 0) / 1_000_000, conversions: st.conversions,
      isWaste: st.is_waste, isOpportunity: st.is_opportunity, market: st.market,
    })), null, 2),
    "",
    "## DAILY METRICS (last 30 days, sample)",
    JSON.stringify(metrics30.slice(0, 60).map((m: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const camp = m.ads_campaigns as any;
      return {
        date: m.report_date, campaign: camp?.name ?? null, market: camp?.market ?? null,
        impressions: m.impressions, clicks: m.clicks,
        costDollars: Number(m.cost_micros ?? 0) / 1_000_000, conversions: m.conversions,
      };
    }), null, 2),
    "",
    latestReview ? `## LATEST AI REVIEW (${latestReview.review_type}, ${latestReview.created_at})\n${latestReview.summary}` : "",
  ].join("\n");

  // ── Primary intelligence extraction (Opus 4.6) ──────────────────
  const intelligencePrompt = `## KEY INTELLIGENCE EXTRACTION

Extract and rank the TOP 10-12 most important data points from the account data below. This is a prioritized intelligence briefing, not a review.

Categories: waste, opportunity, competitive, trend, quality, attribution, structural, market, creative, risk.

Rank by dollar impact (highest first). Stop at 12 data points maximum. Keep all string values concise (1-2 sentences max).

Respond with a single JSON object (no markdown fences):
{
  "briefing_date": "${new Date().toISOString().split("T")[0]}",
  "account_status": "healthy|caution|warning|critical",
  "executive_summary": "<2-3 sentences — what the owner needs to know NOW>",
  "total_estimated_monthly_waste": <number>,
  "total_estimated_monthly_opportunity": <number>,
  "data_points": [
    {
      "rank": <1-12>,
      "category": "waste|opportunity|competitive|trend|quality|attribution|structural|market|creative|risk",
      "signal": "<1 sentence: what the data shows>",
      "why_it_matters": "<1 sentence: business impact>",
      "confidence": "confirmed|inferred|uncertain",
      "urgency": "act_now|this_week|monitor|fyi",
      "dollar_impact": "<estimated monthly $ or 'unquantifiable'>",
      "market": "spokane|kootenai|both",
      "entity": "<entity name if applicable>",
      "entity_id": "<id if applicable>",
      "recommended_action": "<1 sentence: specific next step>"
    }
  ]
}

DATA:
${rawDataContext}`;

  const rawResponse = await analyzeWithClaude({
    prompt: intelligencePrompt,
    systemPrompt: INTELLIGENCE_SYSTEM_PROMPT,
    apiKey,
    maxTokens: 6000,
    model: "claude-opus-4-6",
  });

  // Parse response
  const jsonStr = extractJsonObject(rawResponse);
  if (!jsonStr) {
    throw new Error("Intelligence extraction returned non-JSON output");
  }

  const parsed: Record<string, unknown> = JSON.parse(jsonStr);

  // ── Adversarial challenge (GPT-5.4 Pro) ─────────────────────────
  let adversarialResult = null;
  if (openaiKey) {
    try {
      adversarialResult = await runAdversarialReview({
        rawData: rawDataContext,
        primaryAnalysis: JSON.stringify(parsed, null, 2),
        openaiKey,
      });
    } catch (advErr) {
      console.error("[Ads/Cycle] Adversarial review failed (non-blocking):", advErr);
    }
  }

  // ── Persist briefing ────────────────────────────────────────────
  const adversarialPayload = adversarialResult ? {
    verdict: adversarialResult.verdict,
    grade: adversarialResult.adversarialGrade,
    assessment: adversarialResult.overallAssessment,
    challenges: adversarialResult.challenges,
    missedOpportunities: adversarialResult.missedOpportunities,
    overconfidentClaims: adversarialResult.overconfidentClaims,
    finalInstruction: adversarialResult.finalInstruction,
  } : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataPoints = (parsed.data_points ?? []) as any[];
  const trigger = mode === "weekly" ? "weekly_cron" : "daily_cron";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: savedBriefing, error: saveErr } = await (sb.from("ads_intelligence_briefings") as any)
    .insert({
      briefing_date: parsed.briefing_date ?? new Date().toISOString().split("T")[0],
      account_status: parsed.account_status ?? "caution",
      executive_summary: parsed.executive_summary ?? "",
      total_estimated_monthly_waste: parsed.total_estimated_monthly_waste ?? 0,
      total_estimated_monthly_opportunity: parsed.total_estimated_monthly_opportunity ?? 0,
      data_points: dataPoints,
      adversarial_result: adversarialPayload,
      trigger,
    })
    .select("id, created_at")
    .single();

  if (saveErr) {
    console.error("[Ads/Cycle] Failed to save briefing:", saveErr);
  }

  const briefingId = savedBriefing?.id ?? null;

  // ── Convert actionable intel to recommendations ──────────────────
  let recommendations = { created: 0, skipped: 0, total: 0 };
  if (briefingId && dataPoints.length > 0) {
    try {
      recommendations = await convertIntelToRecommendations(sb, dataPoints, briefingId);
    } catch (recErr) {
      console.error("[Ads/Cycle] Recommendation conversion failed (non-blocking):", recErr);
    }
  }

  // ── Create alert for act_now items ──────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const actNowPoints = dataPoints.filter((dp: any) => dp.urgency === "act_now");
  if (actNowPoints.length > 0 && briefingId) {
    try {
      const alertMessage = actNowPoints.length === 1
        ? `Critical intel: ${actNowPoints[0].signal}`
        : `${actNowPoints.length} critical signals require immediate action`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("ads_alerts") as any).insert({
        briefing_id: briefingId,
        severity: "critical",
        message: alertMessage,
      });
    } catch (alertErr) {
      console.error("[Ads/Cycle] Alert creation failed (non-blocking):", alertErr);
    }
  }

  return {
    briefingId,
    dataPoints: dataPoints.length,
    actNowCount: actNowPoints.length,
    recommendations,
    hasAdversarial: !!adversarialResult,
  };
}

// ── Copy-lab generation (inlined from /api/ads/copy-lab POST) ──────
async function runCopyLabGeneration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  apiKey: string,
  openaiKey: string | undefined,
) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [campaignsRes, keywordsRes, searchTermsRes, metricsRes, adsRes] = await Promise.all([
    (sb.from("ads_campaigns") as any).select("*"),
    (sb.from("ads_keywords") as any).select("*, ads_ad_groups(name, campaign_id, ads_campaigns(name, market))"),
    (sb.from("ads_search_terms") as any).select("*").order("clicks", { ascending: false }).limit(100),
    (sb.from("ads_daily_metrics") as any).select("*, ads_campaigns(name, market)").gte("report_date", sevenDaysAgo),
    Promise.resolve((sb.from("ads_ads") as any).select("*").limit(50)).catch(() => ({ data: null })),
  ]);

  const campaigns = campaignsRes.data ?? [];
  const keywords = keywordsRes.data ?? [];
  const searchTerms = searchTermsRes.data ?? [];
  const dailyMetrics = metricsRes.data ?? [];
  const existingAds = adsRes?.data ?? [];

  if (searchTerms.length === 0 && keywords.length === 0) {
    return { skipped: "No search term or keyword data found" };
  }

  // Aggregate metrics for system prompt context
  const totalSpendMicros = dailyMetrics.reduce((s: number, r: Record<string, unknown>) => s + Number(r.cost_micros ?? 0), 0);
  const totalSpend = totalSpendMicros / 1_000_000;
  const totalClicks = dailyMetrics.reduce((s: number, r: Record<string, unknown>) => s + Number(r.clicks ?? 0), 0);
  const totalImpressions = dailyMetrics.reduce((s: number, r: Record<string, unknown>) => s + Number(r.impressions ?? 0), 0);
  const totalConversions = dailyMetrics.reduce((s: number, r: Record<string, unknown>) => s + Number(r.conversions ?? 0), 0);

  const systemPrompt = await loadAdsSystemPrompt({
    totalSpend,
    totalConversions,
    avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    avgCtr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
    campaignCount: campaigns.length,
  });

  // Build context objects
  const searchTermContext = searchTerms.map((st: Record<string, unknown>) => ({
    term: st.search_term,
    impressions: st.impressions,
    clicks: st.clicks,
    costDollars: Number(st.cost_micros ?? 0) / 1_000_000,
    conversions: st.conversions,
    isWaste: st.is_waste,
    isOpportunity: st.is_opportunity,
    market: st.market,
  }));

  const keywordContext = keywords.slice(0, 80).map((k: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ag = k.ads_ad_groups as any;
    return {
      text: k.text,
      matchType: k.match_type,
      status: k.status,
      adGroup: ag?.name ?? null,
      campaign: ag?.ads_campaigns?.name ?? null,
      market: ag?.ads_campaigns?.market ?? null,
    };
  });

  const campaignContext = campaigns.map((c: Record<string, unknown>) => ({
    id: c.id, name: c.name, market: c.market, status: c.status,
  }));

  const existingAdContext = existingAds.length > 0
    ? existingAds.slice(0, 30).map((a: Record<string, unknown>) => ({
        headlines: a.headlines,
        descriptions: a.descriptions,
        status: a.status,
      }))
    : [];

  // ── Build the ad generation prompt ──────────────────────────────
  const generationPrompt = [
    "## AD COPY LAB — GENERATE NEW RSA CONCEPTS",
    "",
    "You are generating new Responsive Search Ad (RSA) concepts for Dominion Home Deals.",
    "Analyze the search term data to discover intent clusters, then generate complete RSAs tailored to each cluster.",
    "",
    "INSTRUCTIONS:",
    "1. Identify the top intent clusters from the search term data (group related search terms by seller motivation/situation).",
    "2. For each cluster, generate a complete RSA with:",
    "   - 15 headlines (30 characters MAX each — this is a hard limit, count carefully)",
    "   - 4 descriptions (90 characters MAX each — hard limit)",
    "   - Target intent cluster name",
    "   - Evidence supporting this angle from the data",
    "   - Economic rationale (why this cluster matters for revenue)",
    "   - Confidence level: exploratory, moderate, or high",
    "   - Best landing page match",
    "3. For each ad family, also generate 2-3 variant concepts with different angles/hooks.",
    "4. Each variant needs its own set of 5 headlines and 2 descriptions.",
    "",
    "QUALITY RULES:",
    "- Write for motivated sellers in Spokane/Kootenai, not generic audiences",
    "- Use local trust signals where appropriate",
    "- Include specific numbers (14 days, 24 hours, etc.)",
    "- Lead with value props: cash, speed, no repairs, no commissions",
    "- Make each ad family meaningfully different, not superficial rewrites",
    "- Repel junk clicks: do NOT attract buyers, agents, or retail sellers",
    "- Match ad language to the search intent cluster",
    "",
    existingAdContext.length > 0
      ? `EXISTING ADS (avoid duplicating these angles):\n${JSON.stringify(existingAdContext, null, 2)}\n`
      : "",
    "SEARCH TERMS (top 100 by clicks):",
    JSON.stringify(searchTermContext, null, 2),
    "",
    "KEYWORDS:",
    JSON.stringify(keywordContext, null, 2),
    "",
    "CAMPAIGNS:",
    JSON.stringify(campaignContext, null, 2),
    "",
    "─── REQUIRED OUTPUT FORMAT (strict JSON) ───",
    "",
    "Respond with a single JSON object. No markdown fences, no commentary outside the JSON.",
    "",
    JSON.stringify({
      intent_clusters: [
        {
          name: "<cluster name>",
          search_terms: ["<matching terms>"],
          volume_signal: "high|medium|low",
          economic_potential: "<why this cluster matters>",
        },
      ],
      ad_families: [
        {
          target_cluster: "<cluster name>",
          evidence: "<data-backed rationale>",
          confidence: "exploratory|moderate|high",
          test_type: "<what kind of test this represents>",
          rsa: {
            headlines: ["<15 headlines, 30 char max each>"],
            descriptions: ["<4 descriptions, 90 char max each>"],
          },
          variants: [
            {
              angle: "<different hook/approach>",
              headlines: ["<5 headlines, 30 char max>"],
              descriptions: ["<2 descriptions, 90 char max>"],
            },
          ],
          landing_page_match: "<best page/section>",
          success_metric: "<how to measure if this works>",
        },
      ],
    }, null, 2),
  ].join("\n");

  // ── Call Opus 4.6 ────────────────────────────────────────────────
  const rawResponse = await analyzeWithClaude({
    prompt: generationPrompt,
    systemPrompt,
    apiKey,
    maxTokens: 12288,
  });

  // Parse response
  const jsonStr = extractJsonObject(rawResponse);
  if (!jsonStr) {
    throw new Error("Copy-lab generation returned non-JSON output");
  }

  const parsed: { intent_clusters: unknown[]; ad_families: unknown[] } = JSON.parse(jsonStr);

  // ── Adversarial review ──────────────────────────────────────────
  let adversarialResult = null;
  if (openaiKey) {
    try {
      adversarialResult = await runAdversarialReview({
        rawData: generationPrompt,
        primaryAnalysis: JSON.stringify(parsed, null, 2),
        openaiKey,
      });
      if (adversarialResult) {
        console.log("[Ads/Cycle] Copy-lab adversarial verdict:", adversarialResult.verdict, "| Grade:", adversarialResult.adversarialGrade);
      }
    } catch (advErr) {
      console.error("[Ads/Cycle] Copy-lab adversarial review failed (non-blocking):", advErr);
    }
  }

  // ── Convert ad families to copy_suggestion recommendations ──────
  const adFamilies = (parsed.ad_families ?? []) as Array<Record<string, unknown>>;
  let recsCreated = 0;

  if (adFamilies.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const copyRecs: any[] = adFamilies.map((family) => ({
      recommendation_type: "copy_suggestion",
      risk_level: "green",
      expected_impact: `New RSA for "${family.target_cluster}" cluster — ${family.confidence} confidence`,
      reason: typeof family.evidence === "string" ? family.evidence : "Generated from search term intent analysis",
    }));

    try {
      const result = await insertValidatedRecommendations(sb, copyRecs);
      recsCreated = result.inserted;
    } catch (recErr) {
      console.error("[Ads/Cycle] Copy-lab recommendation insert failed (non-blocking):", recErr);
    }
  }

  return {
    intentClusters: (parsed.intent_clusters ?? []).length,
    adFamilies: adFamilies.length,
    recsCreated,
    hasAdversarial: !!adversarialResult,
  };
}
