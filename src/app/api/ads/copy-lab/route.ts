import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { analyzeWithClaude } from "@/lib/claude-client";
import { loadAdsSystemPrompt } from "@/lib/ads/ads-system-prompt";
import { runAdversarialReview } from "@/lib/ads/adversarial-review";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/ads/copy-lab
 *
 * Uses Opus 4.6 to generate ad copy based on search term intent clusters,
 * then sends the output to GPT-5.4 Pro for adversarial review.
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

  try {
    // ── Fetch data from normalized ads_* tables ──────────────────────
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [campaignsRes, keywordsRes, searchTermsRes, metricsRes, adsRes] = await Promise.all([
      (sb.from("ads_campaigns") as any).select("*"),
      (sb.from("ads_keywords") as any).select("*, ads_ad_groups(name, campaign_id, ads_campaigns(name, market))"),
      (sb.from("ads_search_terms") as any).select("*").order("clicks", { ascending: false }).limit(100),
      (sb.from("ads_daily_metrics") as any).select("*, ads_campaigns(name, market)").gte("report_date", sevenDaysAgo),
      (sb.from("ads_ads") as any).select("*").limit(50).catch(() => ({ data: null })),
    ]);

    const campaigns = campaignsRes.data ?? [];
    const keywords = keywordsRes.data ?? [];
    const searchTerms = searchTermsRes.data ?? [];
    const dailyMetrics = metricsRes.data ?? [];
    const existingAds = adsRes?.data ?? [];

    if (searchTerms.length === 0 && keywords.length === 0) {
      return NextResponse.json({
        error: "No search term or keyword data found. Run a sync first (POST /api/ads/sync).",
      }, { status: 404 });
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

    // ── Build context objects ────────────────────────────────────────
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
      id: c.id,
      name: c.name,
      market: c.market,
      status: c.status,
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
    let parsed: { intent_clusters: unknown[]; ad_families: unknown[] };
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      parsed = jsonMatch
        ? JSON.parse(jsonMatch[0])
        : { intent_clusters: [], ad_families: [] };
    } catch {
      parsed = { intent_clusters: [], ad_families: [] };
    }

    // ── Adversarial review (GPT-5.4 Pro challenges the ad concepts) ─
    let adversarialResult = null;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        adversarialResult = await runAdversarialReview({
          rawData: generationPrompt,
          primaryAnalysis: rawResponse,
          openaiKey,
        });
        if (adversarialResult) {
          console.log("[Ads/CopyLab] Adversarial verdict:", adversarialResult.verdict, "| Grade:", adversarialResult.adversarialGrade);
        }
      } catch (advErr) {
        console.error("[Ads/CopyLab] Adversarial review failed (non-blocking):", advErr);
      }
    }

    return NextResponse.json({
      ok: true,
      generated: parsed,
      adversarial: adversarialResult ? {
        verdict: adversarialResult.verdict,
        grade: adversarialResult.adversarialGrade,
        assessment: adversarialResult.overallAssessment,
        challenges: adversarialResult.challenges,
        missedOpportunities: adversarialResult.missedOpportunities,
        overconfidentClaims: adversarialResult.overconfidentClaims,
        agreesWithPrimary: adversarialResult.agreesWithPrimary,
        requiredChanges: adversarialResult.requiredChanges,
        finalInstruction: adversarialResult.finalInstruction,
      } : null,
    });
  } catch (err) {
    if (err instanceof Error) {
      console.error("[Ads/CopyLab]", err.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiErr = err as any;
      if (apiErr.status) console.error("[Ads/CopyLab] Status:", apiErr.status);
      if (apiErr.error) console.error("[Ads/CopyLab] Body:", JSON.stringify(apiErr.error));
    } else {
      console.error("[Ads/CopyLab]", err);
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ad generation failed" },
      { status: 500 },
    );
  }
}
