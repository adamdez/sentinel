/**
 * POST /api/dialer/v1/sessions/[id]/analyze
 *
 * Triggers AI post-call analysis for a completed session.
 * Extracts promises, objections, deal temperature, callback timing
 * from transcript/notes and writes to post_call_structures.
 *
 * Can be called:
 *   - Manually by the operator to re-run analysis
 *   - By a webhook after call completion
 *   - Automatically by the publish route (when no manual structure provided)
 *
 * Input (optional):
 *   { transcript?: string }  — override transcript text. If omitted,
 *                               fetches from session_notes.
 *
 * BOUNDARY:
 *   - Reads/writes post_call_structures (dialer-domain table)
 *   - Never touches leads, calls_log, or CRM-owned tables
 *   - Auth via getDialerUser
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { getSession } from "@/lib/dialer/session-manager";
import { runPostCallAnalysis } from "@/lib/dialer/post-call-analysis";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;

  // ── Parse optional body ─────────────────────────────────────────
  let transcript: string | undefined;
  try {
    const body = await req.json() as Record<string, unknown>;
    if (typeof body.transcript === "string") {
      transcript = body.transcript.trim() || undefined;
    }
  } catch {
    // No body or invalid JSON — that's fine, we'll fetch from notes
  }

  // ── Session ownership gate ──────────────────────────────────────
  const sb = createDialerClient();
  const sessionResult = await getSession(sb, sessionId, user.id);
  if (sessionResult.error || !sessionResult.data) {
    const status =
      sessionResult.code === "NOT_FOUND" ? 404 :
      sessionResult.code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: sessionResult.error }, { status });
  }

  const session = sessionResult.data;

  // Look up the calls_log_id for this session (may not exist if unpublished)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: callLog } = await (sb.from("calls_log") as any)
    .select("id")
    .eq("session_id", sessionId)
    .maybeSingle();

  // ── Run analysis ────────────────────────────────────────────────
  const result = await runPostCallAnalysis(sb, {
    sessionId,
    transcript,
    callsLogId: callLog?.id ?? null,
    leadId: session.lead_id ?? null,
    publishedBy: user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Analysis failed", run_id: result.run_id },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    run_id: result.run_id,
    summary_line: result.summary_line,
    promises_made: result.promises_made,
    objection: result.objection,
    deal_temperature: result.deal_temperature,
    callback_timing_hint: result.callback_timing_hint,
    next_task_suggestion: result.next_task_suggestion,
  });
}
