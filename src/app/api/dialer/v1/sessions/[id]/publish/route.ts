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
  OBJECTION_TAGS,
} from "@/lib/dialer/publish-manager";
import { updateAiTraceReview } from "@/lib/dialer/ai-trace-writer";
import { assemblePostCallStructure, type PostCallStructureInput } from "@/lib/dialer/post-call-structure";
import { runPostCallAnalysis } from "@/lib/dialer/post-call-analysis";
import type { WriteEvalRatingInput } from "@/lib/eval-ratings";
import type { PublishDisposition, SellerTimeline, QualificationRoute, ObjectionTag, PublishInput } from "@/lib/dialer/types";
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

  // ── Validate next_action + next_action_due_at ───────────
  const nextAction = body.next_action;
  if (nextAction !== undefined && typeof nextAction !== "string") {
    return NextResponse.json({ error: "next_action must be a string" }, { status: 400 });
  }

  const nextActionDueAt = body.next_action_due_at;
  if (nextActionDueAt !== undefined) {
    if (typeof nextActionDueAt !== "string" || isNaN(new Date(nextActionDueAt).getTime())) {
      return NextResponse.json(
        { error: "next_action_due_at must be a valid ISO8601 datetime string" },
        { status: 400 },
      );
    }
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

  const summaryRunId = body.summary_run_id;
  if (summaryRunId !== undefined && typeof summaryRunId !== "string") {
    return NextResponse.json({ error: "summary_run_id must be a string" }, { status: 400 });
  }

  const summaryFlagged = body.summary_flagged;
  if (summaryFlagged !== undefined && typeof summaryFlagged !== "boolean") {
    return NextResponse.json({ error: "summary_flagged must be a boolean" }, { status: 400 });
  }

  // ── Parse objection_tags (optional) ──────────────────────
  // Validate structure: array of { tag: ObjectionTag, note: string|null }
  // Invalid tags are silently dropped in publish-manager; we only validate shape here.
  const rawObjTags = body.objection_tags;
  let objectionTags: Array<{ tag: ObjectionTag; note: string | null }> | undefined;
  if (Array.isArray(rawObjTags)) {
    const allowed = new Set<string>(OBJECTION_TAGS);
    objectionTags = rawObjTags
      .filter(
        (t): t is { tag: ObjectionTag; note: string | null } =>
          t !== null &&
          typeof t === "object" &&
          typeof (t as Record<string, unknown>).tag === "string" &&
          allowed.has((t as Record<string, unknown>).tag as string),
      )
      .map((t) => ({
        tag:  t.tag,
        note: typeof t.note === "string" ? t.note : null,
      }));
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
    next_action:          typeof nextAction === "string" ? nextAction : undefined,
    next_action_due_at:   typeof nextActionDueAt === "string" ? nextActionDueAt : undefined,
    callback_at:          typeof callbackAt === "string" ? callbackAt : undefined,
    task_assigned_to:     typeof taskAssignedTo === "string" ? taskAssignedTo : undefined,
    objection_tags:       objectionTags,
    ...(body.qual_confirmed && typeof body.qual_confirmed === "object" ? {
      qual_confirmed: body.qual_confirmed as PublishInput["qual_confirmed"],
    } : {}),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: errorStatus(result.code) },
    );
  }

  // ── Review signal: update dialer_ai_traces rows ──────────
  // If the operator reached Step 3 and published, they have reviewed AI outputs.
  // Write their review signal to the relevant trace rows now.
  // Fire-and-forget — never fails the publish response.

  // Extract trace (motivation_level / seller_timeline)
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

  // Draft note trace — operator confirmed (or flagged) the structured draft
  const draftNoteRunId = body.draft_note_run_id;
  const draftFlagged   = body.draft_flagged;
  if (typeof draftNoteRunId === "string") {
    updateAiTraceReview(sb, {
      run_id:      draftNoteRunId,
      review_flag: draftFlagged === true,
      review_note_data: {
        reviewed_at: new Date().toISOString(),
        reviewer_id: user.id,
        flagged:     draftFlagged === true,
        source:      "draft_note",
      },
    }).catch(() => {});
  }

  // ── Post-call structure write ─────────────────────────────
  // Awaited — dialer-domain structured record. Written whenever the
  // client passes post_call_structure (from PostCallDraftPanel confirm or
  // operator-entered fields). Failure is non-fatal but surfaces a warning
  // so the operator knows seller memory won't be populated.
  const warnings: string[] = [];
  const pcsInput = body.post_call_structure as PostCallStructureInput | undefined;
  if (pcsInput && typeof pcsInput === "object") {
    // Operator provided explicit post-call structure — write it directly
    try {
      const row = assemblePostCallStructure({
        sessionId,
        callsLogId:       result.calls_log_id,
        leadId:           result.lead_id,
        publishedBy:      user.id,
        draftNoteRunId:   typeof draftNoteRunId === "string" ? draftNoteRunId : null,
        draftWasFlagged:  draftFlagged === true,
        input:            pcsInput,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("post_call_structures") as any)
        .upsert(row, { onConflict: "session_id" });
    } catch (err) {
      console.error("[publish] post-call structure write failed:", err);
      warnings.push("post_call_structure_failed");
    }
  } else {
    // No operator-provided structure — run AI analysis on session notes
    // Awaited with warning: extracts promises, objections, deal temperature,
    // callback timing from transcript and writes to post_call_structures.
    try {
      await runPostCallAnalysis(sb, {
        sessionId,
        callsLogId:  result.calls_log_id,
        leadId:      result.lead_id,
        publishedBy: user.id,
      });
    } catch (err) {
      console.error("[publish] post-call AI analysis failed:", err);
      warnings.push("post_call_analysis_failed");
    }
  }

  // ── Eval ratings side-effects ─────────────────────────────
  // Fire-and-forget — mirrors the pattern in dossier/review and qa/[finding_id].
  // Writes one eval_rating per AI workflow that passed through this publish.
  // Looks up prompt_version and model from dialer_ai_traces by run_id.

  void (async () => {
    try {
      const runIds: Array<{
        runId: string;
        workflow: WriteEvalRatingInput["workflow"];
        flagged: boolean;
      }> = [];

      if (typeof extractRunId === "string")   runIds.push({ runId: extractRunId,   workflow: "extract",    flagged: summaryFlagged === true });
      if (typeof summaryRunId === "string")    runIds.push({ runId: summaryRunId,   workflow: "summarize",  flagged: summaryFlagged === true });
      if (typeof draftNoteRunId === "string")  runIds.push({ runId: draftNoteRunId, workflow: "draft_note", flagged: draftFlagged === true });

      if (runIds.length === 0) return;

      const allIds = runIds.map(r => r.runId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: traces } = await (sb.from("dialer_ai_traces") as any)
        .select("run_id, prompt_version, model")
        .in("run_id", allIds);

      const traceMap = new Map<string, { prompt_version: string; model: string | null }>();
      for (const t of (traces ?? []) as Array<{ run_id: string; prompt_version: string | null; model: string | null }>) {
        traceMap.set(t.run_id, { prompt_version: t.prompt_version ?? "1.0.0", model: t.model });
      }

      for (const { runId, workflow, flagged } of runIds) {
        const trace = traceMap.get(runId);
        const verdict: WriteEvalRatingInput["verdict"] = flagged ? "needs_work" : "good";
        const evalPayload: WriteEvalRatingInput = {
          run_id:          runId,
          workflow,
          prompt_version:  trace?.prompt_version ?? "1.0.0",
          model:           trace?.model ?? undefined,
          lead_id:         result.lead_id ?? undefined,
          call_log_id:     result.calls_log_id ?? undefined,
          session_id:      sessionId,
          verdict,
          rubric_dimension: flagged ? "other" : "useful_and_accurate",
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("eval_ratings") as any)
          .upsert(
            { ...evalPayload, reviewed_by: user.id, reviewed_at: new Date().toISOString() },
            { onConflict: "run_id" },
          );
      }
    } catch {
      // non-fatal — never block publish
    }
  })();

  // ── Fetch QA findings for this call (if any were generated) ──
  // Returned in the publish response so the post-call panel can show
  // QA issues immediately without a separate fetch.
  let qaFindings: Array<{ check_type: string; severity: string; finding: string; ai_derived: boolean }> = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: findings } = await (sb.from("call_qa_findings") as any)
      .select("check_type, severity, finding, ai_derived")
      .eq("session_id", sessionId)
      .order("severity", { ascending: false });
    if (findings) qaFindings = findings;
  } catch {
    // Non-fatal — never block publish response for QA findings
  }

  return NextResponse.json({
    ok: true,
    calls_log_id: result.calls_log_id,
    lead_id:      result.lead_id,
    task_id:      result.task_id ?? null,
    intro_sop_active: typeof result.intro_sop_active === "boolean" ? result.intro_sop_active : undefined,
    intro_day_count: typeof result.intro_day_count === "number" ? result.intro_day_count : undefined,
    intro_exit_category: result.intro_exit_category ?? null,
    requires_exit_category: result.requires_exit_category === true,
    qaFindings,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}
