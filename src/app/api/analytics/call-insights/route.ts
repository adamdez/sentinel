/**
 * GET /api/analytics/call-insights
 *
 * AI-powered call insights. Fetches raw metrics from the call-metrics endpoint,
 * sends them to Claude for analysis, and returns 3-5 actionable bullet points.
 *
 * Results are cached in-memory for 6 hours to avoid redundant LLM calls.
 *
 * Query params (all optional — passed through to call-metrics):
 *   ?from=2026-03-01
 *   ?to=2026-03-20
 *   ?market=spokane
 *   ?force=true          Bypass the 6-hour cache and regenerate.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { analyzeWithClaude, extractJsonObject } from "@/lib/claude-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── In-memory cache ─────────────────────────────────────────────────
interface CachedInsight {
  key: string;
  generated_at: string;
  insights: InsightBullet[];
  expires_at: number; // epoch ms
}

interface InsightBullet {
  headline: string;
  detail: string;
  category: "timing" | "volume" | "performance" | "staffing" | "trend";
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const insightCache = new Map<string, CachedInsight>();

function cacheKey(from: string, to: string, market: string | null): string {
  return `${from}|${to}|${market ?? "all"}`;
}

// ── System prompt for call insights ─────────────────────────────────
const CALL_INSIGHTS_SYSTEM_PROMPT = `You are a senior call operations analyst for a small cash home-buying company (Dominion Home Deals) in Spokane, WA and Coeur d'Alene, ID.

You are given raw call metrics from the company's dialer. Your job is to produce 3-5 concise, actionable insights that help the team:
- Know the best times and days to call sellers
- Spot missed inbound calls (lost opportunities)
- Understand operator performance differences
- Identify trends (improving or declining contact rates)
- Recommend specific scheduling or staffing changes

Rules:
- Be specific: use actual numbers, percentages, times, and days from the data.
- Be actionable: each insight must tell them what to DO, not just what happened.
- Reference Pacific time for all time-of-day mentions.
- Keep each insight to 1-2 sentences.
- Use a direct, practical tone. No fluff.
- If the data is insufficient (< 10 calls), say so honestly and provide what you can.

Return valid JSON in this exact format:
{
  "insights": [
    {
      "headline": "Short title (under 10 words)",
      "detail": "1-2 sentence actionable insight with specific numbers.",
      "category": "timing|volume|performance|staffing|trend"
    }
  ]
}`;

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const market = params.get("market") ?? null;
  const forceRefresh = params.get("force") === "true";

  const key = cacheKey(from, to, market);

  // ── Check cache ───────────────────────────────────────────────────
  if (!forceRefresh) {
    const cached = insightCache.get(key);
    if (cached && cached.expires_at > Date.now()) {
      return NextResponse.json({
        generated_at: cached.generated_at,
        cached: true,
        cache_expires_at: new Date(cached.expires_at).toISOString(),
        date_range: { from, to },
        market_filter: market,
        insights: cached.insights,
      });
    }
  }

  try {
    // ── Fetch raw metrics internally ────────────────────────────────
    // Build the internal URL to call-metrics. We call the handler directly
    // by constructing the same query and fetching from ourselves.
    const metricsUrl = new URL("/api/analytics/call-metrics", req.nextUrl.origin);
    if (from) metricsUrl.searchParams.set("from", from);
    if (to) metricsUrl.searchParams.set("to", to);
    if (market) metricsUrl.searchParams.set("market", market);

    // Forward the auth header
    const authHeader = req.headers.get("authorization") ?? "";
    const metricsRes = await fetch(metricsUrl.toString(), {
      headers: { authorization: authHeader },
    });

    if (!metricsRes.ok) {
      const errBody = await metricsRes.text();
      console.error("[CallInsights] Failed to fetch call-metrics:", metricsRes.status, errBody);
      return NextResponse.json(
        { error: "Failed to fetch underlying call metrics" },
        { status: 502 }
      );
    }

    const metrics = await metricsRes.json();

    // ── Guard: not enough data ──────────────────────────────────────
    if ((metrics.summary?.total_calls ?? 0) === 0) {
      return NextResponse.json({
        generated_at: new Date().toISOString(),
        cached: false,
        date_range: { from, to },
        market_filter: market,
        insights: [
          {
            headline: "No call data in range",
            detail: "There are no calls logged in the selected date range. Adjust the date filter or start logging calls to get insights.",
            category: "volume" as const,
          },
        ],
      });
    }

    // ── Build prompt with raw metrics ───────────────────────────────
    const prompt = [
      "Here are the call metrics for Dominion Home Deals.",
      "",
      `Date range: ${metrics.date_range?.from ?? "?"} to ${metrics.date_range?.to ?? "?"}`,
      market ? `Market filter: ${market}` : "Market filter: all",
      "",
      "## Summary",
      JSON.stringify(metrics.summary, null, 2),
      "",
      "## Time of Day (Pacific)",
      JSON.stringify(
        (metrics.time_of_day ?? []).filter((h: { total_calls: number }) => h.total_calls > 0),
        null,
        2
      ),
      "",
      "## Day of Week (Pacific)",
      JSON.stringify(metrics.day_of_week, null, 2),
      "",
      "## Disposition Breakdown",
      JSON.stringify(metrics.disposition_breakdown, null, 2),
      "",
      "## Daily Trend (last entries)",
      JSON.stringify((metrics.daily_trend ?? []).slice(-14), null, 2),
      "",
      "## Per Operator",
      JSON.stringify(metrics.per_operator, null, 2),
      "",
      "Analyze this data and return 3-5 actionable insights as JSON.",
    ].join("\n");

    // ── Call Claude ──────────────────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const rawResponse = await analyzeWithClaude({
      prompt,
      systemPrompt: CALL_INSIGHTS_SYSTEM_PROMPT,
      apiKey,
      temperature: 0.3,
      maxTokens: 2048,
    });

    // ── Parse JSON from Claude's response ───────────────────────────
    const jsonStr = extractJsonObject(rawResponse);
    let insights: InsightBullet[] = [];

    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed.insights)) {
          insights = parsed.insights.map((i: Record<string, unknown>) => ({
            headline: String(i.headline ?? ""),
            detail: String(i.detail ?? ""),
            category: ["timing", "volume", "performance", "staffing", "trend"].includes(
              String(i.category ?? "")
            )
              ? i.category
              : "performance",
          }));
        }
      } catch {
        console.error("[CallInsights] Failed to parse Claude JSON:", jsonStr.slice(0, 200));
      }
    }

    // Fallback if parsing failed
    if (insights.length === 0) {
      insights = [
        {
          headline: "Analysis could not be parsed",
          detail: rawResponse.slice(0, 300),
          category: "performance",
        },
      ];
    }

    // ── Cache the result ────────────────────────────────────────────
    const generated_at = new Date().toISOString();
    insightCache.set(key, {
      key,
      generated_at,
      insights,
      expires_at: Date.now() + CACHE_TTL_MS,
    });

    return NextResponse.json({
      generated_at,
      cached: false,
      cache_expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      date_range: { from, to },
      market_filter: market,
      insights,
    });
  } catch (err) {
    console.error("[Analytics/CallInsights] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate call insights" },
      { status: 500 }
    );
  }
}
