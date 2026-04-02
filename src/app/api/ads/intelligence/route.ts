import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { analyzeWithClaude, extractJsonObject } from "@/lib/claude-client";
import { runAdversarialReview } from "@/lib/ads/adversarial-review";
import { convertIntelToRecommendations } from "@/lib/ads/intel-to-recommendations";
import { convertBuilderToRecommendations } from "@/lib/ads/builder-to-recommendations";

// Compact system prompt for intelligence extraction only.
// The full 500-line ops prompt is too large for this route — it pushes
// total input tokens past ~12k which makes Opus take 90–120s to respond.
const INTELLIGENCE_SYSTEM_PROMPT = `You are a senior Google Ads analyst for Dominion Home Deals, a cash home buyer in Spokane County WA (primary) and Kootenai County ID (secondary). They wholesale residential properties off-market.

Key benchmarks: target CPC under $15, target CPL under $150, target CTR above 5%. Zero conversions in the data almost always means conversion tracking is broken or the account is too new — flag this as the top priority if present.

Your job is to extract and rank intelligence from the provided account data. Be specific and dollar-grounded. Flag waste before opportunities. Respond ONLY with the exact JSON format requested — no commentary, no markdown, no preamble.`;

const BUILDER_SYSTEM_PROMPT = `You are a senior Google Ads campaign architect for Dominion Home Deals, a cash home buyer in Spokane County WA (primary) and Kootenai County ID (secondary). They wholesale residential properties off-market.

You deeply understand the Google Ads hierarchy: Account → Campaigns → Ad Groups → Keywords/Ads. Each ad group should be tightly themed around a specific seller intent cluster. Match types control precision: EXACT for high-intent, PHRASE for coverage, BROAD only with strong negatives.

Your job is to BUILD campaign structure from scratch — ad groups, keywords, and negative keywords. The account is new or thin. Do NOT analyze performance (there isn't enough). Instead, create the foundation.

Target seller intent: people who want to sell their house fast for cash. NOT buyers looking to purchase homes. NOT agents. NOT general real estate searches.

Respond ONLY with the exact JSON format requested — no commentary, no markdown, no preamble.`;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/ads/intelligence
 *
 * Returns the latest saved intelligence briefing from the database.
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: briefing, error: fetchErr } = await (sb.from("ads_intelligence_briefings") as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) {
      console.error("[Intelligence/GET] Fetch error:", fetchErr);
      return NextResponse.json({ error: "Failed to load briefing" }, { status: 500 });
    }

    if (!briefing) {
      return NextResponse.json({ ok: true, intelligence: null, savedAt: null });
    }

    return NextResponse.json({
      ok: true,
      intelligence: {
        briefing_date: briefing.briefing_date,
        account_status: briefing.account_status,
        executive_summary: briefing.executive_summary,
        total_estimated_monthly_waste: briefing.total_estimated_monthly_waste,
        total_estimated_monthly_opportunity: briefing.total_estimated_monthly_opportunity,
        data_points: briefing.data_points,
      },
      adversarial: briefing.adversarial_result,
      savedAt: briefing.created_at,
      briefingId: briefing.id,
    });
  } catch (err) {
    console.error("[Intelligence/GET]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load briefing" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/ads/intelligence
 *
 * Dual-model intelligence extraction:
 * 1. Opus 4.6 identifies and ranks the top 30-50 actionable data points
 * 2. GPT-5.4 Pro challenges rankings, flags blind spots, re-scores confidence
 *
 * Returns a reconciled intelligence briefing, saved to the database.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Safely parse optional request body (client may send empty body)
  const body = await req.json().catch(() => ({}));
  const trigger = (body?.trigger === "daily_cron" || body?.trigger === "weekly_cron")
    ? body.trigger
    : "manual";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  try {
    // ── Pull comprehensive data ──────────────────────────────────────
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

    // Also fetch latest review for context
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

    // ── Account maturity detection ──────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [negativeRes, conversionRes] = await Promise.all([
      (sb.from("ads_negative_keywords") as any).select("id", { count: "exact", head: true }),
      (sb.from("ads_conversion_actions") as any).select("id", { count: "exact", head: true }),
    ]);

    const realKeywords = keywords.filter((k: Record<string, unknown>) =>
      k.text && k.text !== "" && k.google_keyword_id && k.google_keyword_id !== ""
    );
    const negativeCount = negativeRes.count ?? 0;
    const conversionCount = conversionRes.count ?? 0;
    const isBuilderMode = realKeywords.length < 5 || negativeCount < 3;

    // Build context
    const systemPrompt = INTELLIGENCE_SYSTEM_PROMPT;

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
      JSON.stringify(keywords.slice(0, 75).map((k: Record<string, unknown>) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ag = k.ads_ad_groups as any;
        return {
          id: k.id, text: k.text, matchType: k.match_type, status: k.status,
          qualityScore: k.quality_score ?? null,
          adGroup: ag?.name ?? null, campaign: ag?.ads_campaigns?.name ?? null,
          market: ag?.ads_campaigns?.market ?? null,
        };
      }), null, 2),
      "",
      "## SEARCH TERMS (top by clicks)",
      JSON.stringify(searchTerms.slice(0, 75).map((st: Record<string, unknown>) => ({
        term: st.search_term, impressions: st.impressions, clicks: st.clicks,
        costDollars: Number(st.cost_micros ?? 0) / 1_000_000, conversions: st.conversions,
        isWaste: st.is_waste, isOpportunity: st.is_opportunity, market: st.market,
      })), null, 2),
      "",
      "## DAILY METRICS (last 30 days)",
      JSON.stringify(metrics30.slice(0, 45).map((m: Record<string, unknown>) => {
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

    // ── Primary AI analysis ────────────────────────────────────────
    let parsed: Record<string, unknown>;
    let isBuilderResponse = false;

    if (isBuilderMode) {
      // ── Builder mode: generate campaign structure ──────────────────
      console.log(`[Intelligence] Builder mode activated: ${realKeywords.length} real keywords, ${negativeCount} negatives, ${conversionCount} conversion actions`);

      const builderPrompt = `## CAMPAIGN BUILDER

This Google Ads account is NEW or THIN. It needs structure built, not optimization.

Current state:
- ${campaigns.length} campaigns: ${campaigns.map((c: Record<string, unknown>) => `${c.name} (${c.market}, ${c.status})`).join(", ")}
- ${realKeywords.length} real keywords (with Google Ads IDs)
- ${negativeCount} negative keywords
- ${conversionCount} conversion actions
- ${searchTerms.length} search terms observed so far
- $${last30.spend.toFixed(2)} spent in 30 days, ${last30.clicks} clicks, ${last30.conversions} conversions

${searchTerms.length > 0 ? `Search terms people actually typed (showing what traffic you're getting):
${searchTerms.slice(0, 30).map((st: Record<string, unknown>) => `- "${st.search_term}" (${st.clicks} clicks, $${(Number(st.cost_micros ?? 0) / 1_000_000).toFixed(2)})`).join("\n")}` : "No search term data yet."}

## YOUR TASK

Build the campaign structure for a cash home buyer in Spokane/Kootenai:

1. Suggest 2-4 ad groups organized by seller situation (e.g., "Fast Cash Sale", "Inherited Property", "Distressed/As-Is", "Foreclosure/Pre-Foreclosure"). Each ad group should target a distinct seller intent cluster.
2. Generate 15-25 seller-intent keywords across those ad groups. Use EXACT and PHRASE match. Bid suggestion $8-15 per keyword.
3. Generate 20-30 negative keywords to block buyer intent, agent searches, and irrelevant traffic. Use PHRASE match for broad blocks, EXACT for specific terms.

Respond with a single JSON object:
{
  "account_assessment": "<1-2 sentences: current state and what's needed>",
  "ad_groups": [
    { "name": "<ad group name>", "purpose": "<1 sentence>", "campaign_name": "<target campaign>" }
  ],
  "keywords": [
    { "keyword_text": "<the keyword>", "match_type": "EXACT|PHRASE", "ad_group_name": "<target ad group>", "bid_dollars": <number>, "rationale": "<1 sentence>" }
  ],
  "negatives": [
    { "keyword_text": "<term to block>", "match_type": "PHRASE|EXACT", "level": "campaign", "rationale": "<1 sentence>" }
  ]
}`;

      const rawResponse = await analyzeWithClaude({
        prompt: builderPrompt,
        systemPrompt: BUILDER_SYSTEM_PROMPT,
        apiKey,
        maxTokens: 6000,
        model: "claude-sonnet-4-6",
      });

      const jsonStr = extractJsonObject(rawResponse);
      if (!jsonStr) {
        console.error("[Intelligence/Builder] Non-JSON response:", rawResponse.slice(0, 500));
        return NextResponse.json({ error: "Builder response could not be parsed. Please try again." }, { status: 422 });
      }
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        console.error("[Intelligence/Builder] JSON.parse failed:", parseErr);
        return NextResponse.json({ error: "Builder response could not be parsed. Please try again." }, { status: 422 });
      }
      isBuilderResponse = true;

    } else {
      // ── Normal optimization mode ──────────────────────────────────
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
        systemPrompt,
        apiKey,
        maxTokens: 6000,
        model: "claude-sonnet-4-6",
      });

      const jsonStr = extractJsonObject(rawResponse);
      if (!jsonStr) {
        console.error("[Intelligence] Claude returned non-JSON output. First 500 chars:", rawResponse.slice(0, 500));
        return NextResponse.json({ error: "AI response could not be parsed. The model may have been truncated. Please try again." }, { status: 422 });
      }
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        console.error("[Intelligence] JSON.parse failed:", parseErr, "First 500 chars:", rawResponse.slice(0, 500));
        return NextResponse.json({ error: "AI response could not be parsed. The model may have been truncated. Please try again." }, { status: 422 });
      }
    }

    // ── Adversarial challenge (GPT-5.4 Pro) ─────────────────────────
    let adversarialResult = null;
    if (!isBuilderResponse && openaiKey) {
      try {
        adversarialResult = await runAdversarialReview({
          rawData: rawDataContext,
          primaryAnalysis: JSON.stringify(parsed, null, 2),
          openaiKey,
        });
      } catch (advErr) {
        console.error("[Intelligence] Adversarial review failed (non-blocking):", advErr);
      }
    }

    // ── Persist briefing to database ────────────────────────────────
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
    const dataPoints = isBuilderResponse ? [] : ((parsed.data_points ?? []) as any[]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: savedBriefing, error: saveErr } = await (sb.from("ads_intelligence_briefings") as any)
      .insert({
        briefing_date: parsed.briefing_date ?? new Date().toISOString().split("T")[0],
        account_status: isBuilderResponse ? "building" : (parsed.account_status ?? "caution"),
        executive_summary: isBuilderResponse
          ? ((parsed.account_assessment as string) ?? "Account is in builder mode — generating campaign structure.")
          : (parsed.executive_summary ?? ""),
        total_estimated_monthly_waste: isBuilderResponse ? 0 : (parsed.total_estimated_monthly_waste ?? 0),
        total_estimated_monthly_opportunity: isBuilderResponse ? 0 : (parsed.total_estimated_monthly_opportunity ?? 0),
        data_points: isBuilderResponse
          ? [{ rank: 1, category: "structural", signal: parsed.account_assessment, urgency: "act_now", confidence: "confirmed", market: "both", recommended_action: "Review and approve the builder recommendations in the Approvals tab." }]
          : dataPoints,
        adversarial_result: isBuilderResponse ? null : adversarialPayload,
        trigger,
      })
      .select("id, created_at")
      .single();

    if (saveErr) {
      console.error("[Intelligence] Failed to save briefing:", saveErr);
      // Non-blocking — still return the intelligence data
    }

    const briefingId = savedBriefing?.id ?? null;
    const savedAt = savedBriefing?.created_at ?? new Date().toISOString();

    // ── Convert to recommendations ──────────────────────────────────
    let recommendations = { created: 0, skipped: 0, total: 0 };
    if (briefingId && isBuilderResponse) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recommendations = await convertBuilderToRecommendations(sb, parsed as any, briefingId);
      } catch (recErr) {
        console.error("[Intelligence] Builder recommendation conversion failed:", recErr);
      }
    } else if (briefingId && dataPoints.length > 0) {
      try {
        recommendations = await convertIntelToRecommendations(sb, dataPoints, briefingId);
      } catch (recErr) {
        console.error("[Intelligence] Recommendation conversion failed (non-blocking):", recErr);
      }
    }

    // ── Auto-approve green-risk negative keywords ───────────────────
    // Blocking bad search terms is safe — it prevents waste, not spend.
    let autoApproved = 0;
    if (recommendations.created > 0) {
      try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: greenNegs, error: autoErr } = await (sb.from("ads_recommendations") as any)
          .update({ status: "approved" })
          .eq("status", "pending")
          .eq("risk_level", "green")
          .eq("recommendation_type", "negative_add")
          .gte("created_at", fiveMinAgo)
          .select("id");

        if (!autoErr && greenNegs) {
          autoApproved = greenNegs.length;
          // Log auto-approvals to ledger
          if (autoApproved > 0) {
            const ledgerRows = greenNegs.map((r: { id: string }) => ({
              recommendation_id: r.id,
              decided_by: user.id,
              decision: "approved",
              decided_at: new Date().toISOString(),
            }));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (sb.from("ads_approvals") as any).insert(ledgerRows);
          }
        }
      } catch (autoErr) {
        console.error("[Intelligence] Auto-approve failed (non-blocking):", autoErr);
      }
    }

    // ── Create alert if any act_now urgency data points ─────────────
    const actNowPoints = dataPoints.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (dp: any) => dp.urgency === "act_now"
    );
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
        console.error("[Intelligence] Alert creation failed (non-blocking):", alertErr);
      }
    }

    return NextResponse.json({
      ok: true,
      intelligence: parsed,
      adversarial: adversarialPayload,
      savedAt,
      briefingId,
      recommendations,
      autoApproved,
    });
  } catch (err) {
    if (err instanceof Error) {
      console.error("[Intelligence]", err.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiErr = err as any;
      if (apiErr.status) console.error("[Intelligence] Status:", apiErr.status);
      if (apiErr.error) console.error("[Intelligence] Body:", JSON.stringify(apiErr.error));
    } else {
      console.error("[Intelligence]", err);
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Intelligence extraction failed" },
      { status: 500 },
    );
  }
}
