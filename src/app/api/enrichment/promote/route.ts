import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireUserOrCron } from "@/lib/api-auth";
import { promoteByTier, getStagingSummary } from "@/lib/enrichment-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/enrichment/promote
 *
 * Pulls enriched leads from staging to prospect by score tier.
 * Staging acts as a reservoir: leads are enriched automatically, but only
 * become visible in prospect once an operator explicitly promotes them.
 *
 * Body: { tier: "platinum" | "gold" | "silver" | "bronze" | "all", limit?: number }
 *
 * Auth: authenticated user session or CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const auth = await requireUserOrCron(req, sb);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const tier = body.tier ?? "all";
    const limit = body.limit ?? 500;
    const requiredTags: string[] = body.requiredTags ?? [];
    const anyOfTags: string[] = body.anyOfTags ?? [];

    const validTiers = ["platinum", "gold", "silver", "bronze", "all"];
    if (!validTiers.includes(tier)) {
      return NextResponse.json(
        { error: `Invalid tier: "${tier}". Must be one of: ${validTiers.join(", ")}` },
        { status: 400 },
      );
    }

    const tagInfo = [
      requiredTags.length > 0 ? `requiredTags=[${requiredTags.join(",")}]` : "",
      anyOfTags.length > 0 ? `anyOfTags=[${anyOfTags.join(",")}]` : "",
    ].filter(Boolean).join(", ");
    console.log(`[Enrichment/Promote] Request: tier=${tier}, limit=${limit}${tagInfo ? `, ${tagInfo}` : ""}`);

    const result = await promoteByTier({ tier, limit, requiredTags, anyOfTags });

    return NextResponse.json({
      success: true,
      message: `${result.promoted} ${tier} leads promoted to prospect`,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Enrichment/Promote] Error:", err);
    return NextResponse.json(
      { error: "Promote failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * GET /api/enrichment/promote
 *
 * Returns a summary of the staging reservoir: how many enriched leads
 * are available in each tier, ready to be pulled.
 *
 * Auth: authenticated user session or CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const auth = await requireUserOrCron(req, sb);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await getStagingSummary();
    return NextResponse.json({ success: true, ...summary });
  } catch (err) {
    console.error("[Enrichment/Promote] Summary error:", err);
    return NextResponse.json(
      { error: "Failed to get staging summary", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
