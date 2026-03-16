/**
 * GET /api/dialer/v1/eval-ratings/summary
 *
 * Returns aggregated eval summary per workflow+prompt_version.
 * Used by the eval surface to show pass rates and top failure dimensions.
 *
 * Query params:
 *   ?days=90   — look-back window (default 90)
 *   ?workflow  — filter to one workflow
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient }        from "@/lib/supabase";
import { deriveVersionSummaries }    from "@/lib/eval-ratings";
import type { EvalRatingRow }        from "@/lib/eval-ratings";

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const { searchParams } = new URL(req.url);

  const days     = Math.min(parseInt(searchParams.get("days") ?? "90"), 365);
  const workflow = searchParams.get("workflow");
  const since    = new Date(Date.now() - days * 86_400_000).toISOString();

  let query = (sb as any)
    .from("eval_ratings")
    .select("*")
    .gte("reviewed_at", since)
    .order("reviewed_at", { ascending: false });

  if (workflow) query = query.eq("workflow", workflow);

  const { data, error } = await query;
  if (error) {
    console.error("[eval-ratings/summary GET]", error);
    return NextResponse.json({ error: "Failed to fetch ratings" }, { status: 500 });
  }

  const rows = (data ?? []) as EvalRatingRow[];
  const summaries = deriveVersionSummaries(rows);

  return NextResponse.json({ summaries, total_ratings: rows.length, days });
}
