/**
 * GET  /api/dialer/v1/calls/[call_log_id]/qa  — list findings for a call
 * POST /api/dialer/v1/calls/[call_log_id]/qa  — run QA for a call
 *
 * POST triggers QA for the specified calls_log row:
 *   1. Runs all deterministic checks (qual gaps, missing task, objections, etc.)
 *   2. Optionally runs AI notes check if notes are long enough (uses Grok)
 *   3. Clears previous findings for this call, writes new ones
 *   4. Returns findings list
 *
 * POST body (optional):
 *   { run_ai?: boolean }   — default true; set false to skip AI notes check
 *
 * Idempotent: re-running QA on a call clears previous pending findings first.
 * Already-reviewed findings (valid/invalid/corrected) are preserved.
 *
 * BOUNDARY:
 *   - Reads: calls_log, leads, tasks, lead_objection_tags, contacts, properties
 *   - Writes: call_qa_findings only (never CRM tables)
 *   - Auth via getDialerUser
 */

export const dynamic = "force-dynamic";
export const runtime  = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { runDeterministicChecks, AI_CHECK_MIN_NOTES_LENGTH } from "@/lib/dialer/qa-checks";
import type { QaCheckResult } from "@/lib/dialer/qa-checks";
import { completeGrokChat, type GrokMessage } from "@/lib/grok-client";
import { writeAiTrace } from "@/lib/dialer/ai-trace-writer";
import { randomUUID } from "crypto";

type RouteContext = { params: Promise<{ call_log_id: string }> };

// ── AI QA prompt ─────────────────────────────────────────────────────────────

const QA_PROMPT_VERSION = "1.0.0";
const QA_SYSTEM_PROMPT = `You are a call quality reviewer for a real estate acquisitions team.
You review operator notes from seller calls to identify concerns.

You MUST respond with ONLY a JSON object. No markdown, no explanation, no code fences.

Schema:
{
  "trust_risk": string | null,      // 1 sentence if notes contain pushy/manipulative/misleading language; null if clean
  "weak_followup": string | null,   // 1 sentence if there is no clear outcome or next step visible in notes; null if clear
  "notes_quality": "good" | "acceptable" | "poor"  // overall assessment of note completeness
}

Rules:
- Base ONLY on the operator notes provided. Do not invent facts.
- "trust_risk" should only fire for genuinely problematic phrasing (fake urgency, misleading claims, pressure tactics).
- "weak_followup" fires when notes are vague about what was agreed or promised.
- If notes are short or absent, set notes_quality = "poor", others null.
- Respond ONLY with the JSON object.`;

interface AiQaOutput {
  trust_risk:    string | null;
  weak_followup: string | null;
  notes_quality: "good" | "acceptable" | "poor";
}

// ── GET — list findings ───────────────────────────────────────────────────────

export interface QaFindingRow {
  id:              string;
  check_type:      string;
  severity:        string;
  finding:         string;
  ai_derived:      boolean;
  status:          string;
  correction_note: string | null;
  reviewed_by:     string | null;
  reviewed_at:     string | null;
  created_at:      string;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { call_log_id } = await params;
  const sb = createDialerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("call_qa_findings") as any)
    .select("id, check_type, severity, finding, ai_derived, status, correction_note, reviewed_by, reviewed_at, created_at")
    .eq("call_log_id", call_log_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ findings: data ?? [] });
}

// ── POST — run QA ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { call_log_id } = await params;
  const body = await req.json().catch(() => ({})) as { run_ai?: boolean };
  const runAi = body.run_ai !== false; // default true

  const sb = createDialerClient();

  // ── 1. Fetch call data ─────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: callRow, error: callErr } = await (sb.from("calls_log") as any)
    .select("id, lead_id, disposition, duration_sec, notes, ai_summary")
    .eq("id", call_log_id)
    .maybeSingle();

  if (callErr || !callRow) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const leadId: string | null = callRow.lead_id ?? null;

  // ── 2. Fetch lead qual fields ──────────────────────────────────────────────
  type LeadRow = {
    motivation_level: number | null;
    seller_timeline:  string | null;
    condition_level:  number | null;
    occupancy_score:  number | null;
    decision_maker_confirmed: boolean;
  };

  let leadData: LeadRow | null = null;
  if (leadId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb.from("leads") as any)
      .select("motivation_level, seller_timeline, condition_level, occupancy_score, decision_maker_confirmed")
      .eq("id", leadId)
      .maybeSingle();
    leadData = data ?? null;
  }

  // ── 3. Check for pending task ──────────────────────────────────────────────
  let hasPendingTask = false;
  if (leadId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: taskRow } = await (sb.from("tasks") as any)
      .select("id")
      .eq("lead_id", leadId)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();
    hasPendingTask = !!taskRow;
  }

  // ── 4. Fetch open objection tags ───────────────────────────────────────────
  let openObjectionCount = 0;
  let openObjectionLabels: string[] = [];
  if (leadId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: objRows } = await (sb.from("lead_objection_tags") as any)
      .select("tag")
      .eq("lead_id", leadId)
      .eq("status", "open")
      .limit(5);
    if (objRows) {
      openObjectionCount  = objRows.length;
      openObjectionLabels = objRows.map((r: { tag: string }) => r.tag);
    }
  }

  // ── 5. Run deterministic checks ───────────────────────────────────────────
  const deterministicFindings = runDeterministicChecks({
    disposition:              callRow.disposition  ?? null,
    duration_sec:             callRow.duration_sec ?? null,
    notes:                    callRow.notes        ?? null,
    ai_summary:               callRow.ai_summary   ?? null,
    motivation_level:         leadData?.motivation_level         ?? null,
    seller_timeline:          leadData?.seller_timeline          ?? null,
    condition_level:          leadData?.condition_level          ?? null,
    occupancy_score:          leadData?.occupancy_score          ?? null,
    decision_maker_confirmed: leadData?.decision_maker_confirmed ?? false,
    has_pending_task:         hasPendingTask,
    open_objection_count:     openObjectionCount,
    open_objection_labels:    openObjectionLabels,
  });

  // ── 6. AI notes check (optional, non-blocking) ────────────────────────────
  const aiFindings: QaCheckResult[] = [];
  const notes: string | null = callRow.notes ?? null;
  const shouldRunAi = runAi && notes !== null && notes.trim().length >= AI_CHECK_MIN_NOTES_LENGTH;

  const grokApiKey = process.env.GROK_API_KEY ?? process.env.XAI_API_KEY;

  if (shouldRunAi && grokApiKey) {
    const runId = randomUUID();
    try {
      const messages: GrokMessage[] = [
        { role: "system", content: QA_SYSTEM_PROMPT },
        {
          role:    "user",
          content: `Review these operator call notes:\n\n"${(notes as string).trim().slice(0, 800)}"`,
        },
      ];

      const raw = await completeGrokChat({ messages, temperature: 0, apiKey: grokApiKey });
      let parsed: AiQaOutput | null = null;

      try {
        parsed = JSON.parse(raw) as AiQaOutput;
      } catch {
        // AI returned non-JSON — skip AI findings
      }

      if (parsed) {
        await writeAiTrace(sb, {
          run_id:         runId,
          workflow:       "qa_notes",
          prompt_version: QA_PROMPT_VERSION,
          lead_id:        leadId ?? undefined,
          call_log_id:    call_log_id,
          model:          "grok-3-mini",
          provider:       "xai",
          output_text:    raw.slice(0, 4000),
        });

        if (parsed.trust_risk) {
          aiFindings.push({
            check_type: "trust_risk",
            severity:   "flag",
            finding:    `AI review of operator notes: ${parsed.trust_risk} (based on notes only — not a full transcript)`,
            ai_derived: true,
            run_id:     runId,
          });
        }

        if (parsed.weak_followup && parsed.notes_quality !== "poor") {
          aiFindings.push({
            check_type: "ai_notes_flag",
            severity:   "warn",
            finding:    `AI review of operator notes: ${parsed.weak_followup} (based on notes only)`,
            ai_derived: true,
            run_id:     runId,
          });
        }
      }
    } catch (aiErr) {
      // AI check failed — log but never block QA run
      console.warn("[qa/route] AI notes check failed:", aiErr);
    }
  }

  const allFindings = [...deterministicFindings, ...aiFindings];

  // ── 7. Clear old pending findings, write new ones ─────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("call_qa_findings") as any)
    .delete()
    .eq("call_log_id", call_log_id)
    .eq("status", "pending_review");

  if (allFindings.length > 0) {
    const rows = allFindings.map((f) => ({
      call_log_id,
      lead_id:    leadId,
      check_type: f.check_type,
      severity:   f.severity,
      finding:    f.finding,
      ai_derived: f.ai_derived,
      run_id:     f.run_id ?? null,
      status:     "pending_review",
      run_by:     user.id,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertErr } = await (sb.from("call_qa_findings") as any)
      .insert(rows);

    if (insertErr) {
      console.error("[qa/route] Insert findings failed:", insertErr.message);
      return NextResponse.json({ error: "Failed to save findings" }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok:            true,
    finding_count: allFindings.length,
    findings:      allFindings,
    ran_ai:        !!shouldRunAi,
  });
}
