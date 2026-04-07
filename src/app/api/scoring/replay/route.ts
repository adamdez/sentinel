import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireUserOrCron } from "@/lib/api-auth";
import { replayAllScores } from "@/lib/scoring-persistence";

export const maxDuration = 120;

/**
 * POST /api/scoring/replay
 *
 * Trigger a full scoring replay.
 * Reads all properties + distress_events, recomputes scores
 * using the current model version, writes new scoring_records.
 *
 * Auth: authenticated user session or CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient();
    const auth = await requireUserOrCron(req, sb);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await replayAllScores();

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      leadsUpdated: result.leadsUpdated,
      tierMigration: result.tierMigration,
      auditSample: result.audit.slice(0, 50),
      auditTotal: result.audit.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Scoring] Replay error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
