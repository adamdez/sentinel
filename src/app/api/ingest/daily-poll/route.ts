import { NextResponse } from "next/server";

/**
 * GET /api/ingest/daily-poll
 *
 * Vercel Cron ready — call this every 4 hours.
 *
 * Phase 2 stub: triggers the Elite Seed top10 pull for both target
 * counties, then logs completion. When Vercel Cron is configured,
 * add to vercel.json:
 *
 *   { "crons": [{ "path": "/api/ingest/daily-poll", "schedule": "0 *\/4 * * *" }] }
 *
 * Future enhancements (Phase 3):
 *   - Incremental scoring (only re-score changed properties)
 *   - FSBO / Obituary adapters
 *   - Bulk PropertyRadar import with pagination
 *   - Predictive scoring model refresh
 */
export async function GET(req: Request) {
  const cronSecret = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  console.log("[DailyPoll] === DAILY POLL STARTED ===", new Date().toISOString());

  const counties = ["Spokane", "Kootenai"];
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  let result: Record<string, unknown> = {};
  let success = false;

  try {
    const res = await fetch(`${baseUrl}/api/ingest/propertyradar/top10`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ counties }),
    });

    result = await res.json();
    success = res.ok && result.success === true;

    console.log("[DailyPoll] Top10 result:", {
      success,
      count: result.count,
      newInserts: result.newInserts,
      updated: result.updated,
      elapsed_ms: result.elapsed_ms,
    });
  } catch (err) {
    console.error("[DailyPoll] Top10 call failed:", err);
    result = { error: String(err) };
  }

  const elapsed = Date.now() - startTime;
  console.log(`[DailyPoll] === DAILY POLL COMPLETE in ${elapsed}ms ===`);

  return NextResponse.json({
    success,
    message: success
      ? `Daily poll complete — ${result.count ?? 0} prospects processed`
      : "Daily poll encountered errors — check server logs",
    counties,
    top10Result: {
      count: result.count ?? 0,
      newInserts: result.newInserts ?? 0,
      updated: result.updated ?? 0,
      prCost: result.prCost ?? "?",
    },
    elapsed_ms: elapsed,
    timestamp: new Date().toISOString(),
  });
}
