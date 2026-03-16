/**
 * GET  /api/dialer/v1/eval-ratings  — list ratings (filtered)
 * POST /api/dialer/v1/eval-ratings  — write or upsert a rating for a run_id
 *
 * Ratings are upserted by run_id — one verdict per AI run.
 * Re-reviewing an already-rated run updates the existing row.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient }        from "@/lib/supabase";
import type {
  EvalWorkflow,
  EvalVerdict,
  EvalRubricDimension,
  WriteEvalRatingInput,
  EvalRatingRow,
} from "@/lib/eval-ratings";
import {
  EVAL_WORKFLOWS,
  EVAL_VERDICTS,
  EVAL_RUBRIC_DIMENSIONS,
} from "@/lib/eval-ratings";

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const { searchParams } = new URL(req.url);

  const workflow      = searchParams.get("workflow") as EvalWorkflow | null;
  const promptVersion = searchParams.get("prompt_version");
  const verdict       = searchParams.get("verdict") as EvalVerdict | null;
  const leadId        = searchParams.get("lead_id");
  const limit         = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
  const offset        = parseInt(searchParams.get("offset") ?? "0");

  let query = (sb as any)
    .from("eval_ratings")
    .select("*")
    .order("reviewed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (workflow)      query = query.eq("workflow", workflow);
  if (promptVersion) query = query.eq("prompt_version", promptVersion);
  if (verdict)       query = query.eq("verdict", verdict);
  if (leadId)        query = query.eq("lead_id", leadId);

  const { data, error, count } = await query;
  if (error) {
    console.error("[eval-ratings GET]", error);
    return NextResponse.json({ error: "Failed to fetch ratings" }, { status: 500 });
  }

  return NextResponse.json({ ratings: (data ?? []) as EvalRatingRow[], count });
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const sb = createServerClient();

  let body: WriteEvalRatingInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    run_id, workflow, prompt_version, model,
    lead_id, call_log_id, session_id,
    verdict, rubric_dimension, reviewer_note, output_snapshot,
  } = body;

  // Validate required fields
  if (!run_id)        return NextResponse.json({ error: "run_id required" }, { status: 400 });
  if (!workflow || !EVAL_WORKFLOWS.includes(workflow))
    return NextResponse.json({ error: `workflow must be one of: ${EVAL_WORKFLOWS.join(", ")}` }, { status: 400 });
  if (!prompt_version) return NextResponse.json({ error: "prompt_version required" }, { status: 400 });
  if (!verdict || !EVAL_VERDICTS.includes(verdict))
    return NextResponse.json({ error: `verdict must be one of: ${EVAL_VERDICTS.join(", ")}` }, { status: 400 });
  if (rubric_dimension && !EVAL_RUBRIC_DIMENSIONS.includes(rubric_dimension as EvalRubricDimension))
    return NextResponse.json({ error: `invalid rubric_dimension` }, { status: 400 });

  const { data: { user } } = await sb.auth.getUser();

  const upsert = {
    run_id,
    workflow,
    prompt_version,
    model:             model            ?? null,
    lead_id:           lead_id          ?? null,
    call_log_id:       call_log_id      ?? null,
    session_id:        session_id       ?? null,
    verdict,
    rubric_dimension:  rubric_dimension ?? null,
    reviewer_note:     reviewer_note    ?? null,
    output_snapshot:   output_snapshot  ? output_snapshot.slice(0, 1000) : null,
    reviewed_by:       user?.id         ?? null,
    reviewed_at:       new Date().toISOString(),
  };

  // Upsert on run_id (unique constraint) — re-review updates existing row
  const { data, error } = await (sb as any)
    .from("eval_ratings")
    .upsert(upsert, { onConflict: "run_id" })
    .select()
    .single();

  if (error) {
    console.error("[eval-ratings POST]", error);
    return NextResponse.json({ error: "Failed to save rating" }, { status: 500 });
  }

  return NextResponse.json({ rating: data as EvalRatingRow }, { status: 201 });
}
