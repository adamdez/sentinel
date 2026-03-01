import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { analyzeWithClaude, buildLandingPageReviewPrompt } from "@/lib/claude-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/ads/landing-page
 *
 * Fetches dominionhomedeals.com and asks Claude to review it
 * for conversion optimization. Stores review in ad_reviews.
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
    // Fetch the landing page
    const pageRes = await fetch("https://dominionhomedeals.com", {
      headers: {
        "User-Agent": "Sentinel-LandingPageReview/1.0",
      },
    });

    if (!pageRes.ok) {
      return NextResponse.json({ error: "Failed to fetch landing page" }, { status: 502 });
    }

    const html = await pageRes.text();

    // Strip HTML to get meaningful text content (basic extraction)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000); // Keep within token limits

    const systemPrompt = buildLandingPageReviewPrompt();

    const prompt = [
      "Here is the text content from dominionhomedeals.com:",
      "",
      textContent,
      "",
      "Provide your analysis as JSON:",
      "{ \"summary\": \"...\", \"findings\": [{ \"severity\": \"info|warning|critical\", \"title\": \"...\", \"detail\": \"...\" }], \"suggestions\": [{ \"action\": \"update_copy\", \"target\": \"<section>\", \"target_id\": \"landing_page\", \"old_value\": \"<current>\", \"new_value\": \"<suggested>\", \"reason\": \"...\" }] }",
    ].join("\n");

    const rawResponse = await analyzeWithClaude({
      prompt,
      systemPrompt,
      apiKey,
    });

    // Parse response
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
        review_type: "landing_page",
        summary: parsed.summary,
        findings: parsed.findings,
        suggestions: parsed.suggestions,
        ai_engine: "claude",
        model_used: "claude-sonnet-4",
      })
      .select("*")
      .single();

    if (reviewErr) {
      console.error("[Ads/LandingPage] Insert error:", reviewErr);
      return NextResponse.json({ error: "Failed to store review" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      review: {
        id: review.id,
        summary: parsed.summary,
        findingsCount: parsed.findings.length,
        suggestionsCount: parsed.suggestions.length,
      },
    });
  } catch (err) {
    console.error("[Ads/LandingPage]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Review failed" },
      { status: 500 },
    );
  }
}
