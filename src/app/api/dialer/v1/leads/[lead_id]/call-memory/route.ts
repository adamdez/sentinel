/**
 * GET /api/dialer/v1/leads/[lead_id]/call-memory
 *
 * Returns rich repeat-call memory for a lead, including a unified note timeline
 * built from operator session notes, published call summaries, and AI summaries.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import type { RepeatCallMemory, MemorySource } from "@/lib/dialer/types";
import { buildSellerMemoryBullets } from "@/lib/dialer/post-call-structure";
import { buildRecentCallMemoryEntries, fetchLeadNoteTimeline } from "@/lib/dialer/lead-note-timeline";
import { buildLeadNotesPreview } from "@/lib/dialer/note-preview";

type RouteContext = { params: Promise<{ lead_id: string }> };

const LIVE_ANSWER_DISPOS = new Set([
  "completed",
  "follow_up",
  "appointment",
  "offer_made",
  "not_interested",
]);

export async function GET(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lead_id } = await params;
  const sb = createDialerClient();

  let timelineData;
  try {
    timelineData = await fetchLeadNoteTimeline(sb, lead_id, { callLimit: 25, noteLimit: 40 });
  } catch (err) {
    console.error("[call-memory] note timeline fetch failed:", err);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (sb.from("leads") as any)
    .select("decision_maker_note, decision_maker_confirmed")
    .eq("id", lead_id)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pcs } = await (sb.from("post_call_structures") as any)
    .select("summary_line, promises_made, objection, next_task_suggestion, callback_timing_hint, deal_temperature")
    .eq("lead_id", lead_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const recentCalls = buildRecentCallMemoryEntries(timelineData.callRows, timelineData.noteTimeline, 3);

  const now = Date.now();
  let daysSinceLastLiveAnswer: number | null = null;
  let daysSinceLastContact: number | null = null;

  for (const row of timelineData.callRows) {
    if (row.disposition === "operator_note") continue;

    const callMs = new Date(row.started_at).getTime();
    const daysAgo = Math.floor((now - callMs) / 86_400_000);

    if (daysSinceLastContact === null) {
      daysSinceLastContact = daysAgo;
    }

    if (
      daysSinceLastLiveAnswer === null &&
      row.disposition &&
      LIVE_ANSWER_DISPOS.has(row.disposition)
    ) {
      daysSinceLastLiveAnswer = daysAgo;
    }
  }

  const dmNote = (lead?.decision_maker_note as string | null) ?? null;
  const dmConfirmed = (lead?.decision_maker_confirmed as boolean) ?? false;
  const dmSource: MemorySource | null = dmNote
    ? dmConfirmed ? "operator" : "ai"
    : null;

  const preferredTimelineSummary = recentCalls[0]?.notes
    ?? timelineData.noteTimeline.find((entry) =>
    (entry.sourceType === "operator_note" || entry.sourceType === "call_summary")
      && (entry.callLogId != null || entry.sessionId != null),
  )?.content
    ?? timelineData.noteTimeline.find((entry) =>
      entry.sourceType === "operator_note" || entry.sourceType === "call_summary",
    )?.content
    ?? null;
  const fallbackSummary = preferredTimelineSummary
    ?? timelineData.noteTimeline.find((entry) => entry.sourceType === "ai_summary")?.content
    ?? null;
  const lastCallSummary = preferredTimelineSummary
    ?? (pcs?.summary_line as string | null)
    ?? fallbackSummary;
  const lastCallBullets = buildSellerMemoryBullets({
    summaryLine: (pcs?.summary_line as string | null) ?? null,
    promisesMade: (pcs?.promises_made as string | null) ?? null,
    objection: (pcs?.objection as string | null) ?? null,
    nextTaskSuggestion: (pcs?.next_task_suggestion as string | null) ?? null,
    callbackTimingHint: (pcs?.callback_timing_hint as string | null) ?? null,
    dealTemperature: (pcs?.deal_temperature as string | null) ?? null,
    fallbackText: fallbackSummary,
  });
  const notesPreview = buildLeadNotesPreview(timelineData.noteTimeline);

  const memory: RepeatCallMemory = {
    leadId: lead_id,
    decisionMakerNote: dmNote,
    decisionMakerSource: dmSource,
    decisionMakerConfirmed: dmConfirmed,
    recentCalls,
    noteTimeline: timelineData.noteTimeline,
    notesPreview,
    daysSinceLastLiveAnswer,
    daysSinceLastContact,
    lastCallSummary,
    lastCallBullets,
    lastCallPromises: (pcs?.promises_made as string) ?? null,
    lastCallObjection: (pcs?.objection as string) ?? null,
    lastCallNextAction: (pcs?.next_task_suggestion as string) ?? null,
    lastCallCallbackTiming: (pcs?.callback_timing_hint as string) ?? null,
    lastCallDealTemperature: (pcs?.deal_temperature as string) ?? null,
  };

  return NextResponse.json({ memory });
}
