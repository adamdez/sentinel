import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { replayAllScores } from "@/lib/scoring-persistence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { weights, model_version } = body ?? {};

    const sb = createServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: "system",
      action: "scoring_retrain_triggered",
      entity_type: "scoring_model",
      entity_id: model_version ?? "pred-v2.1",
      details: {
        weights: weights ?? null,
        triggered_at: new Date().toISOString(),
      },
    });

    const result = await replayAllScores();

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
    });
  } catch (err: unknown) {
    console.error("[Retrain]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
