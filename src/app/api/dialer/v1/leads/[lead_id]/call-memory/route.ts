/**
 * GET /api/dialer/v1/leads/[lead_id]/call-memory
 *
 * Returns rich repeat-call memory for a lead — last 3 calls, decision-maker
 * context, and staleness signals. Fetched on-demand by SellerMemoryPanel
 * before or during a call.
 *
 * This route is a dialer read-path endpoint. It reads CRM tables via the
 * dialer client (same as crm-bridge), but is a separate route so the panel
 * can fetch fresh data without relying on the frozen context_snapshot.
 *
 * BOUNDARY:
 *   - Reads: calls_log, leads (decision_maker_note, decision_maker_confirmed)
 *   - Never writes anything
 *   - Auth via getDialerUser (dialer auth path)
 *
 * Response: RepeatCallMemory (from @/lib/dialer/types)
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import type { RepeatCallMemory, CallMemoryEntry, MemorySource } from "@/lib/dialer/types";
import { buildSellerMemoryBullets } from "@/lib/dialer/post-call-structure";

type RouteContext = { params: Promise<{ lead_id: string }> };

// Dispositions that represent a live conversation
const LIVE_ANSWER_DISPOS = new Set([
  "completed", "follow_up", "appointment", "offer_made", "not_interested",
]);

export async function GET(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lead_id } = await params;
  const sb = createDialerClient();

  // ── 1. Last 3 calls from calls_log ──────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: callRows, error: callErr } = await (sb.from("calls_log") as any)
    .select("id, disposition, duration_sec, notes, ai_summary, started_at")
    .eq("lead_id", lead_id)
    .order("started_at", { ascending: false })
    .limit(3);

  if (callErr) {
    console.error("[call-memory] calls_log fetch failed:", callErr.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  // ── 2. Decision-maker note from leads ───────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (sb.from("leads") as any)
    .select("decision_maker_note, decision_maker_confirmed")
    .eq("id", lead_id)
    .maybeSingle();

  // ── 2b. Most recent structured post-call data ─────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pcs } = await (sb.from("post_call_structures") as any)
    .select("summary_line, promises_made, objection, next_task_suggestion, callback_timing_hint, deal_temperature")
    .eq("lead_id", lead_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── 3. Assemble ──────────────────────────────────────────────────────────

  const rows = (callRows ?? []) as Array<{
    id: string;
    disposition: string | null;
    duration_sec: number | null;
    notes: string | null;
    ai_summary: string | null;
    started_at: string;
  }>;

  const recentCalls: CallMemoryEntry[] = rows.map((row) => ({
    callLogId:   row.id,
    date:        row.started_at,
    disposition: row.disposition ?? null,
    durationSec: row.duration_sec ?? null,
    notes:       row.notes ?? null,
    aiSummary:   row.ai_summary ?? null,
    // Prefer operator notes; fall back to AI summary; null if neither
    preferSource: row.notes ? "notes" : row.ai_summary ? "ai" : null,
  }));

  // Staleness: find most recent live answer
  const now = Date.now();
  let daysSinceLastLiveAnswer: number | null = null;
  let daysSinceLastContact: number | null = null;

  for (const row of rows) {
    const callMs = new Date(row.started_at).getTime();
    const daysAgo = Math.floor((now - callMs) / 86_400_000);

    if (daysSinceLastContact === null) {
      daysSinceLastContact = daysAgo; // most recent call (rows sorted desc)
    }

    if (
      daysSinceLastLiveAnswer === null &&
      row.disposition &&
      LIVE_ANSWER_DISPOS.has(row.disposition)
    ) {
      daysSinceLastLiveAnswer = daysAgo;
    }
  }

  // Decision-maker provenance
  const dmNote      = (lead?.decision_maker_note as string | null) ?? null;
  const dmConfirmed = (lead?.decision_maker_confirmed as boolean)  ?? false;
  const dmSource: MemorySource | null = dmNote
    ? dmConfirmed ? "operator" : "ai"
    : null;
  const fallbackSummary = recentCalls[0]?.notes ?? recentCalls[0]?.aiSummary ?? null;
  const lastCallSummary = (pcs?.summary_line as string | null) ?? fallbackSummary;
  const lastCallBullets = buildSellerMemoryBullets({
    summaryLine: (pcs?.summary_line as string | null) ?? null,
    promisesMade: (pcs?.promises_made as string | null) ?? null,
    objection: (pcs?.objection as string | null) ?? null,
    nextTaskSuggestion: (pcs?.next_task_suggestion as string | null) ?? null,
    callbackTimingHint: (pcs?.callback_timing_hint as string | null) ?? null,
    dealTemperature: (pcs?.deal_temperature as string | null) ?? null,
    fallbackText: fallbackSummary,
  });

  const memory: RepeatCallMemory = {
    leadId:                  lead_id,
    decisionMakerNote:       dmNote,
    decisionMakerSource:     dmSource,
    decisionMakerConfirmed:  dmConfirmed,
    recentCalls,
    daysSinceLastLiveAnswer,
    daysSinceLastContact,
    lastCallSummary,
    lastCallBullets,
    lastCallPromises:        (pcs?.promises_made as string) ?? null,
    lastCallObjection:       (pcs?.objection as string) ?? null,
    lastCallNextAction:      (pcs?.next_task_suggestion as string) ?? null,
    lastCallCallbackTiming:  (pcs?.callback_timing_hint as string) ?? null,
    lastCallDealTemperature: (pcs?.deal_temperature as string) ?? null,
  };

  return NextResponse.json({ memory });
}
