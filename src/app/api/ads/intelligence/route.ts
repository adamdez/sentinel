import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { analyzeWithClaude, extractJsonObject } from "@/lib/claude-client";
import { runAdversarialReview } from "@/lib/ads/adversarial-review";
import { convertIntelToRecommendations } from "@/lib/ads/intel-to-recommendations";

// Compact system prompt for intelligence extraction only.
// The full 500-line ops prompt is too large for this route — it pushes
// total input tokens past ~12k which makes Opus take 90–120s to respond.
const INTELLIGENCE_SYSTEM_PROMPT = `You are a senior Google Ads analyst for Dominion Home Deals, a cash home buyer in Spokane County WA (primary) and Kootenai County ID (secondary). They wholesale residential properties off-market.

Key benchmarks: target CPC under $15, target CPL under $150, target CTR above 5%. Zero conversions in the data almost always means conversion tracking is broken or the account is too new — flag this as the top priority if present.

Your job is to extract and rank intelligence from the provided account data. Be specific and dollar-grounded. Flag waste before opportunities. Respond ONLY with the exact JSON format requested — no commentary, no markdown, no preamble.`;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

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

You have access to the full account data below. Your job is to extract and rank the TOP 10-20 most important data points, signals, and insights that the operators need to see.

This is NOT a review. This is a prioritized intelligence briefing.

For each data point, provide:
- The signal (what the data shows)
- Why it matters (business impact)
- Confidence level (confirmed / inferred / uncertain)
- Urgency (act now / this week / monitor / FYI)
- Dollar impact estimate where possible
- Market (spokane / kootenai / both)

Categories to extract intelligence from:
1. WASTE SIGNALS — money being burned on non-converting or off-target traffic
2. OPPORTUNITY SIGNALS — converting patterns that could be expanded
3. COMPETITIVE SIGNALS — what CTR/impression data suggests about auction position
4. TREND SIGNALS — what's improving, declining, or shifting over time
5. QUALITY SIGNALS — search term quality, keyword relevance, intent alignment
6. ATTRIBUTION SIGNALS — gaps in tracking or conversion measurement
7. STRUCTURAL SIGNALS — campaign/ad group issues affecting performance
8. MARKET SIGNALS — Spokane vs Kootenai differences
9. CREATIVE SIGNALS — ad copy gaps or opportunities (based on search intent mismatches)
10. RISK SIGNALS — things that could go wrong or are already going wrong

Rank ALL data points by dollar impact (highest first). Stop at 20 data points maximum.

Respond with a single JSON object (no markdown fences):
{
  "briefing_date": "${new Date().toISOString().split("T")[0]}",
  "account_status": "healthy|caution|warning|critical",
  "executive_summary": "<3-4 sentences — what the owner needs to know RIGHT NOW>",
  "total_estimated_monthly_waste": <number>,
  "total_estimated_monthly_opportunity": <number>,
  "data_points": [
    {
      "rank": <1-50>,
      "category": "waste|opportunity|competitive|trend|quality|attribution|structural|market|creative|risk",
      "signal": "<what the data shows>",
      "why_it_matters": "<business impact>",
      "confidence": "confirmed|inferred|uncertain",
      "urgency": "act_now|this_week|monitor|fyi",
      "dollar_impact": "<estimated monthly $ impact or 'unquantifiable'>",
      "market": "spokane|kootenai|both",
      "entity": "<campaign/keyword/search term name if applicable>",
      "entity_id": "<id if applicable>",
      "recommended_action": "<specific next step>"
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
      model: "claude-opus-4-6",
    });

    // Parse Opus response
    let parsed: Record<string, unknown>;
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
    const dataPoints = (parsed.data_points ?? []) as any[];

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
      console.error("[Intelligence] Failed to save briefing:", saveErr);
      // Non-blocking — still return the intelligence data
    }

    const briefingId = savedBriefing?.id ?? null;
    const savedAt = savedBriefing?.created_at ?? new Date().toISOString();

    // ── Convert actionable intel to recommendations ──────────────────
    let recommendations = { created: 0, skipped: 0, total: 0 };
    if (briefingId && dataPoints.length > 0) {
      try {
        recommendations = await convertIntelToRecommendations(sb, dataPoints, briefingId);
      } catch (recErr) {
        console.error("[Intelligence] Recommendation conversion failed (non-blocking):", recErr);
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
