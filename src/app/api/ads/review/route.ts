import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { analyzeWithClaude, buildAdsSystemPrompt } from "@/lib/claude-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/ads/review
 *
 * Triggers Claude to analyze the latest ad snapshots and produce
 * a review with findings and actionable suggestions.
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
    // Fetch latest snapshots (last 7 days)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: snapshots, error: snapErr } = await (sb.from("ad_snapshots") as any)
      .select("*")
      .gte("snapshot_date", new Date(Date.now() - 7 * 86400000).toISOString())
      .order("snapshot_date", { ascending: false })
      .limit(100);

    if (snapErr) {
      return NextResponse.json({ error: "Failed to fetch snapshots" }, { status: 500 });
    }

    if (!snapshots || snapshots.length === 0) {
      return NextResponse.json({
        error: "No snapshots found. Run a sync first (POST /api/ads/sync).",
      }, { status: 404 });
    }

    // Aggregate metrics for system prompt context
    const totalSpend = snapshots.reduce((s: number, r: Record<string, unknown>) => s + Number(r.cost ?? 0), 0);
    const totalClicks = snapshots.reduce((s: number, r: Record<string, unknown>) => s + Number(r.clicks ?? 0), 0);
    const totalImpressions = snapshots.reduce((s: number, r: Record<string, unknown>) => s + Number(r.impressions ?? 0), 0);
    const totalConversions = snapshots.reduce((s: number, r: Record<string, unknown>) => s + Number(r.conversions ?? 0), 0);

    const systemPrompt = buildAdsSystemPrompt({
      totalSpend,
      totalConversions,
      avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
      avgCtr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
      campaignCount: new Set(snapshots.map((s: Record<string, unknown>) => s.campaign_id)).size,
    });

    // Build the analysis prompt based on review type
    let analysisPrompt: string;

    if (reviewType === "copy") {
      const adRows = snapshots.filter((s: Record<string, unknown>) => s.ad_id);
      analysisPrompt = [
        "Review the following Google Ads copy for Dominion Home Deals (cash home buyers in Spokane/CDA).",
        "For each ad, score the copy quality (1-10) and provide specific improvement suggestions.",
        "",
        "Current ads:",
        JSON.stringify(adRows.map((a: Record<string, unknown>) => ({
          adId: a.ad_id,
          adGroup: a.ad_group_name,
          campaign: a.campaign_name,
          headlines: [a.headline1, a.headline2, a.headline3].filter(Boolean),
          descriptions: [a.description1, a.description2].filter(Boolean),
          impressions: a.impressions,
          clicks: a.clicks,
          ctr: a.ctr,
          conversions: a.conversions,
        })), null, 2),
        "",
        "Respond with JSON: { \"summary\": \"...\", \"findings\": [...], \"suggestions\": [...] }",
        "Each finding: { \"severity\": \"info|warning|critical\", \"title\": \"...\", \"detail\": \"...\" }",
        "Each suggestion: { \"action\": \"update_copy\", \"target\": \"<ad_group_name>\", \"target_id\": \"<ad_id>\", \"old_value\": \"<current>\", \"new_value\": \"<suggested>\", \"reason\": \"...\" }",
      ].join("\n");
    } else if (reviewType === "strategy") {
      analysisPrompt = [
        "Provide a strategic review of our Google Ads performance for Dominion Home Deals.",
        "",
        "Data (last 7 days):",
        JSON.stringify(snapshots.slice(0, 50), null, 2),
        "",
        "Analyze: budget allocation, campaign structure, audience targeting gaps, competitive positioning.",
        "Respond with JSON: { \"summary\": \"...\", \"findings\": [...], \"suggestions\": [...] }",
        "Each finding: { \"severity\": \"info|warning|critical\", \"title\": \"...\", \"detail\": \"...\" }",
        "Each suggestion: { \"action\": \"bid_adjust|budget_adjust|add_keyword|pause_keyword\", \"target\": \"...\", \"target_id\": \"...\", \"old_value\": \"...\", \"new_value\": \"...\", \"reason\": \"...\" }",
      ].join("\n");
    } else {
      analysisPrompt = [
        "Analyze the following Google Ads performance data for Dominion Home Deals (last 7 days).",
        "",
        "Data:",
        JSON.stringify(snapshots.slice(0, 50), null, 2),
        "",
        "Identify: top performers, underperformers, wasted spend, optimization opportunities.",
        "Respond with JSON: { \"summary\": \"...\", \"findings\": [...], \"suggestions\": [...] }",
        "Each finding: { \"severity\": \"info|warning|critical\", \"title\": \"...\", \"detail\": \"...\" }",
        "Each suggestion: { \"action\": \"bid_adjust|pause_keyword|enable_keyword|budget_adjust\", \"target\": \"...\", \"target_id\": \"...\", \"old_value\": \"...\", \"new_value\": \"...\", \"reason\": \"...\" }",
      ].join("\n");
    }

    const rawResponse = await analyzeWithClaude({
      prompt: analysisPrompt,
      systemPrompt,
      apiKey,
    });

    // Parse Claude's JSON response
    let parsed: { summary: string; findings: unknown[]; suggestions: unknown[] };
    try {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: rawResponse, findings: [], suggestions: [] };
    } catch {
      parsed = { summary: rawResponse, findings: [], suggestions: [] };
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
    console.error("[Ads/Review]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Review failed" },
      { status: 500 },
    );
  }
}
