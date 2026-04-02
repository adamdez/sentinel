import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { getWeeklyFounderScorecard } from "@/lib/weekly-scorecard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/analytics/weekly-scorecard?window_days=7
 *
 * True-north weekly operating scorecard:
 * - current rolling week vs previous week
 * - founder leverage metrics
 * - Jeff influence and funnel outcomes
 * - exception callouts for operator review
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawWindowDays = Number(req.nextUrl.searchParams.get("window_days") ?? "7");
  const windowDays = Number.isFinite(rawWindowDays) ? Math.round(rawWindowDays) : 7;

  try {
    const scorecard = await getWeeklyFounderScorecard({ windowDays });
    return NextResponse.json(scorecard);
  } catch (error) {
    console.error("[analytics/weekly-scorecard] failed:", error);
    return NextResponse.json(
      { error: "Failed to load weekly scorecard" },
      { status: 500 },
    );
  }
}
