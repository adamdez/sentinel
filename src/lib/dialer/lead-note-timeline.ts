import type { SupabaseClient } from "@supabase/supabase-js";
import type { CallMemoryEntry, LeadNoteTimelineItem } from "./types";

type CallLogTimelineRow = {
  id: string;
  lead_id: string | null;
  dialer_session_id: string | null;
  disposition: string | null;
  notes: string | null;
  ai_summary: string | null;
  duration_sec: number | null;
  started_at: string;
  summary_timestamp?: string | null;
};

type SessionNoteTimelineRow = {
  id: string;
  session_id: string;
  note_type: string;
  content: string | null;
  is_ai_generated: boolean | null;
  is_confirmed: boolean | null;
  created_at: string;
};

type FetchLeadNoteTimelineOptions = {
  callLimit?: number;
  noteLimit?: number;
};

type LeadNoteTimelineData = {
  callRows: CallLogTimelineRow[];
  noteTimeline: LeadNoteTimelineItem[];
};

function trimmed(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}

function sourceLabelForSessionNote(row: SessionNoteTimelineRow): string {
  if (row.note_type === "operator_note") return "Operator note";
  if (row.note_type === "ai_suggestion") {
    return row.is_confirmed ? "AI note (confirmed)" : "AI note";
  }
  return row.is_ai_generated ? "AI note" : "Session note";
}

const FALLBACK_DISPOSITION_LABELS: Record<string, string> = {
  voicemail: "Left voicemail",
  no_answer: "No answer",
  wrong_number: "Marked number wrong",
  disconnected: "Marked line disconnected",
  do_not_call: "Marked do not call",
  dead_phone: "Marked phone dead",
  completed: "Completed call",
  follow_up: "Call completed, follow-up needed",
  appointment: "Set appointment",
  not_interested: "Seller not interested",
};

function formatFallbackCallDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDuration(durationSec: number | null | undefined): string | null {
  if (typeof durationSec !== "number" || !Number.isFinite(durationSec) || durationSec <= 0) {
    return null;
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function buildFallbackCallNote(row: CallLogTimelineRow): string | null {
  const disposition = row.disposition ?? null;
  if (!disposition) return null;

  const label = FALLBACK_DISPOSITION_LABELS[disposition];
  if (!label) return null;

  const parts = [`${label} on ${formatFallbackCallDate(row.started_at)}`];
  const duration = formatDuration(row.duration_sec);
  if (duration) parts.push(duration);
  return parts.join(" • ");
}

export function buildLeadNoteTimeline(args: {
  leadId: string;
  callRows: CallLogTimelineRow[];
  sessionNotes: SessionNoteTimelineRow[];
}): LeadNoteTimelineItem[] {
  const sessionToCall = new Map<string, CallLogTimelineRow>();
  for (const row of args.callRows) {
    if (row.dialer_session_id) {
      sessionToCall.set(row.dialer_session_id, row);
    }
  }

  const timeline: LeadNoteTimelineItem[] = [];

  for (const row of args.callRows) {
    const disposition = row.disposition ?? null;
    const noteContent = trimmed(row.notes);
    const aiSummary = trimmed(row.ai_summary);
    const createdAt = row.summary_timestamp ?? row.started_at;
    const fallbackContent = !noteContent && !aiSummary
      ? buildFallbackCallNote(row)
      : null;

    if (noteContent) {
      const sourceType = disposition === "operator_note" ? "operator_note" : "call_summary";
      timeline.push({
        id: `${sourceType}:${row.id}`,
        sourceType,
        sourceLabel: sourceType === "operator_note" ? "Operator note" : "Call summary",
        content: noteContent,
        createdAt,
        leadId: args.leadId,
        sessionId: row.dialer_session_id ?? null,
        callLogId: row.id,
        isAiGenerated: false,
        isConfirmed: true,
        disposition,
        durationSec: row.duration_sec ?? null,
      });
    }

    if (fallbackContent) {
      timeline.push({
        id: `system_call:${row.id}`,
        sourceType: "system_call",
        sourceLabel: "Call activity",
        content: fallbackContent,
        createdAt,
        leadId: args.leadId,
        sessionId: row.dialer_session_id ?? null,
        callLogId: row.id,
        isAiGenerated: false,
        isConfirmed: true,
        disposition,
        durationSec: row.duration_sec ?? null,
      });
    }

    if (aiSummary) {
      timeline.push({
        id: `ai_summary:${row.id}`,
        sourceType: "ai_summary",
        sourceLabel: "AI call summary",
        content: aiSummary,
        createdAt,
        leadId: args.leadId,
        sessionId: row.dialer_session_id ?? null,
        callLogId: row.id,
        isAiGenerated: true,
        isConfirmed: false,
        disposition,
        durationSec: row.duration_sec ?? null,
      });
    }
  }

  for (const row of args.sessionNotes) {
    const content = trimmed(row.content);
    if (!content) continue;

    const relatedCall = sessionToCall.get(row.session_id);
    const sourceType = row.note_type === "operator_note" ? "operator_note" : "ai_summary";

    timeline.push({
      id: `session_note:${row.id}`,
      sourceType,
      sourceLabel: sourceLabelForSessionNote(row),
      content,
      createdAt: row.created_at,
      leadId: args.leadId,
      sessionId: row.session_id,
      callLogId: relatedCall?.id ?? null,
      isAiGenerated: sourceType === "ai_summary" || row.is_ai_generated === true,
      isConfirmed: row.is_confirmed === true,
      disposition: relatedCall?.disposition ?? null,
      durationSec: relatedCall?.duration_sec ?? null,
    });
  }

  return timeline.sort((left, right) => {
    const rightTime = new Date(right.createdAt).getTime();
    const leftTime = new Date(left.createdAt).getTime();
    return rightTime - leftTime;
  });
}

export function buildRecentCallMemoryEntries(
  callRows: CallLogTimelineRow[],
  noteTimeline: LeadNoteTimelineItem[],
  limit = 3,
): CallMemoryEntry[] {
  return callRows
    .filter((row) => row.disposition !== "operator_note")
    .slice(0, limit)
    .map((row) => {
      const related = noteTimeline.filter((item) =>
        item.callLogId === row.id || (row.dialer_session_id && item.sessionId === row.dialer_session_id),
      );
      const operatorNote = related.find((item) => item.sourceType === "operator_note");
      const callSummary = related.find((item) => item.sourceType === "call_summary");
      const fallbackCallNote = related.find((item) => item.sourceType === "system_call");
      const aiSummary = related.find((item) => item.sourceType === "ai_summary");
      const preferredOperatorContent = operatorNote ?? callSummary ?? fallbackCallNote ?? null;

      return {
        callLogId: row.id,
        sessionId: row.dialer_session_id ?? null,
        date: row.started_at,
        disposition: row.disposition ?? null,
        durationSec: row.duration_sec ?? null,
        notes: preferredOperatorContent?.content ?? null,
        noteSourceLabel: preferredOperatorContent?.sourceLabel ?? null,
        aiSummary: aiSummary?.content ?? null,
        aiSourceLabel: aiSummary?.sourceLabel ?? null,
        preferSource: preferredOperatorContent ? "notes" : aiSummary ? "ai" : null,
      };
    });
}

export async function fetchLeadNoteTimeline(
  sb: SupabaseClient,
  leadId: string,
  options: FetchLeadNoteTimelineOptions = {},
): Promise<LeadNoteTimelineData> {
  const callLimit = Math.max(10, options.callLimit ?? 25);
  const noteLimit = Math.max(10, options.noteLimit ?? 40);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: callRowsRaw, error: callErr } = await (sb.from("calls_log") as any)
    .select("id, lead_id, dialer_session_id, disposition, notes, ai_summary, duration_sec, started_at, summary_timestamp")
    .eq("lead_id", leadId)
    .order("started_at", { ascending: false })
    .limit(callLimit);

  if (callErr) {
    throw new Error(callErr.message ?? "Failed to load calls_log note timeline");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessionRowsRaw, error: sessionErr } = await (sb.from("call_sessions") as any)
    .select("id")
    .eq("lead_id", leadId)
    .order("started_at", { ascending: false })
    .limit(callLimit);

  if (sessionErr) {
    throw new Error(sessionErr.message ?? "Failed to load call_sessions note timeline");
  }

  const callRows = ((callRowsRaw ?? []) as CallLogTimelineRow[]);
  const sessionIds = Array.from(new Set([
    ...callRows.map((row) => row.dialer_session_id).filter((value): value is string => Boolean(value)),
    ...((sessionRowsRaw ?? []) as Array<{ id: string | null }>).map((row) => row.id).filter((value): value is string => Boolean(value)),
  ]));

  let sessionNotes: SessionNoteTimelineRow[] = [];

  if (sessionIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sessionNotesRaw, error: noteErr } = await (sb.from("session_notes") as any)
      .select("id, session_id, note_type, content, is_ai_generated, is_confirmed, created_at")
      .in("session_id", sessionIds)
      .in("note_type", ["operator_note", "ai_suggestion"])
      .order("created_at", { ascending: false })
      .limit(noteLimit);

    if (noteErr) {
      throw new Error(noteErr.message ?? "Failed to load session_notes timeline");
    }

    sessionNotes = (sessionNotesRaw ?? []) as SessionNoteTimelineRow[];
  }

  return {
    callRows,
    noteTimeline: buildLeadNoteTimeline({
      leadId,
      callRows,
      sessionNotes,
    }),
  };
}
