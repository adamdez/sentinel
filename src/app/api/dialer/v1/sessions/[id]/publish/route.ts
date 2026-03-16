/**
 * POST /api/dialer/v1/sessions/[id]/publish
 *
 * Writes post-call outcomes (disposition + qualification) for a completed
 * dialer session back to calls_log and leads.
 *
 * Session must be in a terminal state (ended or failed).
 * All writes are conservative — see publish-manager.ts for overwrite rules.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import {
  publishSession,
  PUBLISH_DISPOSITIONS,
  SELLER_TIMELINES,
  QUALIFICATION_ROUTES,
} from "@/lib/dialer/publish-manager";
import { updateAiTraceReview } from "@/lib/dialer/ai-trace-writer";
import type { PublishDisposition, SellerTimeline, QualificationRoute } from "@/lib/dialer/types";
import type { SessionErrorCode } from "@/lib/dialer/types";

type RouteContext = { params: Promise<{ id: string }> };

function errorStatus(code?: SessionErrorCode): number {
  if (code === "FORBIDDEN")           return 403;
  if (code === "NOT_FOUND")           return 404;
  if (code === "INVALID_TRANSITION")  return 409;
  return 500;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Validate disposition (required) ──────────────────────
  const disposition = body.disposition as string | undefined;
  if (!disposition || !(PUBLISH_DISPOSITIONS as readonly string[]).includes(disposition)) {
    return NextResponse.json(
      { error: `Invalid disposition: "${disposition ?? ""}"` },
      { status: 400 },
    );
  }

  // ── Validate optional enum fields ────────────────────────
  const sellerTimeline = body.seller_timeline as string | undefined;
  if (sellerTimeline !== undefined && !(SELLER_TIMELINES as readonly string[]).includes(sellerTimeline)) {
    return NextResponse.json(
      { error: `Invalid seller_timeline: "${sellerTimeline}"` },
      { status: 400 },
    );
  }

  const qualificationRoute = body.qualification_route as string | undefined;
  if (qualificationRoute !== undefined && !(QUALIFICATION_ROUTES as readonly string[]).includes(qualificationRoute)) {
    return NextResponse.json(
      { error: `Invalid qualification_route: "${qualificationRoute}"` },
      { status: 400 },
    );
  }

  // ── Validate optional numeric fields ─────────────────────
  const motivationLevel = body.motivation_level;
  if (
    motivationLevel !== undefined &&
    (!Number.isInteger(motivationLevel) || (motivationLevel as number) < 1 || (motivationLevel as number) > 5)
  ) {
    return NextResponse.json(
      { error: "motivation_level must be an integer between 1 and 5" },
      { status: 400 },
    );
  }

  const durationSec = body.duration_sec;
  if (durationSec !== undefined && (typeof durationSec !== "number" || durationSec < 0)) {
    return NextResponse.json(
      { error: "duration_sec must be a non-negative number" },
      { status: 400 },
    );
  }

  // ── Validate optional string fields ──────────────────────
  const summary = body.summary;
  if (summary !== undefined && typeof summary !== "string") {
    return NextResponse.json({ error: "summary must be a string" }, { status: 400 });
  }

  // ── Validate callback_at ──────────────────────────────────
  const callbackAt = body.callback_at;
  if (callbackAt !== undefined) {
    if (typeof callbackAt !== "string" || isNaN(new Date(callbackAt).getTime())) {
      return NextResponse.json(
        { error: "callback_at must be a valid ISO8601 datetime string" },
        { status: 400 },
      );
    }
  }

  const taskAssignedTo = body.task_assigned_to;
  if (taskAssignedTo !== undefined && typeof taskAssignedTo !== "string") {
    return NextResponse.json({ error: "task_assigned_to must be a string" }, { status: 400 });
  }

  // ── Review signal fields (optional) ──────────────────────
  // extract_run_id: the run_id returned by the extract route in this session.
  // summary_flagged: operator explicitly marked the AI output as bad.
  // ai_corrections: which AI-suggested fields the operator overrode.
  const extractRunId = body.extract_run_id;
  if (extractRunId !== undefined && typeof extractRunId !== "string") {
    return NextResponse.json({ error: "extract_run_id must be a string" }, { status: 400 });
  }

  const summaryFlagged = body.summary_flagged;
  if (summaryFlagged !== undefined && typeof summaryFlagged !== "boolean") {
    return NextResponse.json({ error: "summary_flagged must be a boolean" }, { status: 400 });
  }

  // ── Publish ───────────────────────────────────────────────
  const sb = createDialerClient();
  const result = await publishSession(sb, sessionId, user.id, {
    disposition:          disposition as PublishDisposition,
    duration_sec:         typeof durationSec === "number" ? durationSec : undefined,
    motivation_level:     typeof motivationLevel === "number" ? motivationLevel as 1|2|3|4|5 : undefined,
    seller_timeline:      sellerTimeline as SellerTimeline | undefined,
    qualification_route:  qualificationRoute as QualificationRoute | undefined,
    summary:              typeof summary === "string" ? summary : undefined,
    callback_at:          typeof callbackAt === "string" ? callbackAt : undefined,
    task_assigned_to:     typeof taskAssignedTo === "string" ? taskAssignedTo : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: errorStatus(result.code) },
    );
  }

  // ── Review signal: update dialer_ai_traces row ────────────
  // If the operator reached Step 3 and published, they have reviewed the
  // AI extraction. Write their review signal to the trace row now.
  // Fire-and-forget — never fails the publish response.
  if (typeof extractRunId === "string") {
    const aiCorrections = body.ai_corrections as
      | { motivation_corrected?: boolean; timeline_corrected?: boolean }
      | undefined;

    updateAiTraceReview(sb, {
      run_id:      extractRunId,
      review_flag: summaryFlagged === true,
      review_note_data: {
        reviewed_at:           new Date().toISOString(),
        reviewer_id:           user.id,
        motivation_corrected:  aiCorrections?.motivation_corrected ?? false,
        timeline_corrected:    aiCorrections?.timeline_corrected   ?? false,
        flagged:               summaryFlagged === true,
      },
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    calls_log_id: result.calls_log_id,
    lead_id:      result.lead_id,
    task_id:      result.task_id ?? null,
  });
}
