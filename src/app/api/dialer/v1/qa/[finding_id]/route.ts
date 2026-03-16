/**
 * PATCH /api/dialer/v1/qa/[finding_id]
 *
 * Update the review status of a single QA finding.
 * Used by Adam from the QA review surface.
 *
 * Body:
 *   {
 *     status:          "valid" | "invalid" | "corrected"
 *     correction_note?: string   (required when status = "corrected" or "invalid")
 *   }
 *
 * Rules:
 *   - Only status transitions from pending_review are allowed here
 *   - correction_note is optional for "valid", encouraged for "invalid"/"corrected"
 *   - reviewed_by and reviewed_at are set automatically
 *   - Never auto-updates CRM state from this endpoint
 *
 * BOUNDARY: writes only to call_qa_findings.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import type { WriteEvalRatingInput } from "@/lib/eval-ratings";

type RouteContext = { params: Promise<{ finding_id: string }> };

const VALID_STATUSES = new Set(["valid", "invalid", "corrected"]);

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { finding_id } = await params;
  const body = await req.json().catch(() => ({})) as {
    status?: string;
    correction_note?: string;
  };

  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json(
      { error: "status must be one of: valid, invalid, corrected" },
      { status: 400 },
    );
  }

  const sb = createDialerClient();

  const patch: Record<string, unknown> = {
    status:      body.status,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  };
  if (body.correction_note !== undefined) {
    patch.correction_note = body.correction_note.trim().slice(0, 500) || null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("call_qa_findings") as any)
    .update(patch)
    .eq("id", finding_id)
    .select("id, status, reviewed_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Finding not found" }, { status: 404 });

  // ── Best-effort eval rating side-effect ──────────────────────────────────────
  // When Adam reviews an AI-derived QA finding, write an eval rating.
  // verdict: valid → good, invalid → incorrect, corrected → needs_work
  // Failure is non-fatal — QA review has already succeeded.
  void (async () => {
    try {
      // Only write for AI-derived findings with a linked call log
      const { data: full } = await (sb.from("call_qa_findings") as any)
        .select("ai_derived, call_log_id, finding, check_type")
        .eq("id", finding_id)
        .maybeSingle();

      if (!full?.ai_derived) return; // deterministic findings — skip eval

      // Look up ai_run_id from dialer_ai_traces for this call log (qa_notes workflow)
      const { data: trace } = await (sb.from("dialer_ai_traces") as any)
        .select("run_id, prompt_version, model")
        .eq("call_log_id", full.call_log_id)
        .eq("workflow", "qa_notes")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!trace?.run_id) return;

      const verdictMap: Record<string, "good" | "needs_work" | "incorrect"> = {
        valid:     "good",
        invalid:   "incorrect",
        corrected: "needs_work",
      };

      const evalPayload: WriteEvalRatingInput = {
        run_id:          trace.run_id,
        workflow:        "qa_notes",
        prompt_version:  trace.prompt_version ?? "1.0.0",
        model:           trace.model ?? undefined,
        call_log_id:     full.call_log_id ?? undefined,
        verdict:         verdictMap[body.status!] ?? "needs_work",
        rubric_dimension: body.status === "valid" ? "useful_and_accurate" : "other",
        reviewer_note:   body.correction_note ?? undefined,
        output_snapshot: full.finding ? String(full.finding).slice(0, 500) : undefined,
      };

      await (sb.from("eval_ratings") as any)
        .upsert({ ...evalPayload, reviewed_by: user.id, reviewed_at: new Date().toISOString() }, { onConflict: "run_id" });
    } catch {
      // non-fatal
    }
  })();

  return NextResponse.json({ ok: true, finding: data });
}
