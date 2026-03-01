import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { streamClaudeChat, buildAdsSystemPrompt, type ClaudeMessage } from "@/lib/claude-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ads/chat
 *
 * Streaming chat endpoint for asking Claude about your Google Ads.
 * Pre-loaded with campaign context from latest snapshots.
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

  // Fetch latest snapshot metrics for context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: snapshots } = await (sb.from("ad_snapshots") as any)
    .select("campaign_id, campaign_name, impressions, clicks, ctr, avg_cpc, conversions, cost")
    .gte("snapshot_date", new Date(Date.now() - 7 * 86400000).toISOString())
    .order("snapshot_date", { ascending: false })
    .limit(50);

  const snaps = snapshots ?? [];
  const totalSpend = snaps.reduce((s: number, r: Record<string, unknown>) => s + Number(r.cost ?? 0), 0);
  const totalClicks = snaps.reduce((s: number, r: Record<string, unknown>) => s + Number(r.clicks ?? 0), 0);
  const totalImpressions = snaps.reduce((s: number, r: Record<string, unknown>) => s + Number(r.impressions ?? 0), 0);
  const totalConversions = snaps.reduce((s: number, r: Record<string, unknown>) => s + Number(r.conversions ?? 0), 0);

  let systemPrompt = buildAdsSystemPrompt({
    totalSpend,
    totalConversions,
    avgCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
    avgCtr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
    campaignCount: new Set(snaps.map((s: Record<string, unknown>) => s.campaign_id)).size,
  });

  // Append recent snapshot data as context
  if (snaps.length > 0) {
    systemPrompt += "\n\n## Recent Campaign Data (last 7 days)\n```json\n" +
      JSON.stringify(snaps.slice(0, 20), null, 2) +
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
