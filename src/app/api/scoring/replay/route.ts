import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { replayAllScores } from "@/lib/scoring-persistence";

export const maxDuration = 120;

type SbResult<T> = { data: T | null; error: { message: string } | null };

const ADMIN_EMAILS = [
  "adam@dominionhomedeals.com",
  "nathan@dominionhomedeals.com",
  "logan@dominionhomedeals.com",
];

/**
 * POST /api/scoring/replay
 *
 * Trigger a full scoring replay. Admin-only.
 * Reads all properties + distress_events, recomputes scores
 * using the current model version, writes new scoring_records.
 *
 * Auth: Admin session, CRON_SECRET, or admin email.
 */
export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient();

    // Auth: CRON_SECRET or admin session
    const cronSecret = req.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET;
    let authorized = false;

    if (expectedSecret && cronSecret === `Bearer ${expectedSecret}`) {
      authorized = true;
    } else {
      const { data: { user } } = await sb.auth.getUser();
      if (user?.email && ADMIN_EMAILS.includes(user.email)) {
        authorized = true;
      } else if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profile } = await (sb.from("user_profiles") as any)
          .select("role")
          .eq("id", user.id)
          .single() as SbResult<{ role: string }>;
        if (profile?.role === "admin") authorized = true;
      }
    }

    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 401 });
    }

    const result = await replayAllScores();

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      leadsUpdated: result.leadsUpdated,
      tierMigration: result.tierMigration,
      auditSample: result.audit.slice(0, 50), // First 50 for response size
      auditTotal: result.audit.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Scoring] Replay error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
