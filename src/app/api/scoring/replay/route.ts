import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { replayAllScores } from "@/lib/scoring-persistence";

type SbResult<T> = { data: T | null; error: { message: string } | null };

/**
 * POST /api/scoring/replay
 *
 * Trigger a full scoring replay. Admin-only.
 * Reads all properties + distress_events, recomputes scores
 * using the current model version, writes new scoring_records.
 *
 * TODO: Move to background job with queue isolation.
 */
export async function POST() {
  try {
    const sb = createServerClient();

    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Replace `as any` when types are auto-generated via `supabase gen types`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (sb.from("user_profiles") as any)
      .select("role")
      .eq("id", user.id)
      .single() as SbResult<{ role: string }>;

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const result = await replayAllScores();

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Scoring] Replay error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
