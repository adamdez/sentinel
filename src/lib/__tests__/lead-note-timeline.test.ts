import { describe, expect, it } from "vitest";
import { buildLeadNoteTimeline, buildRecentCallMemoryEntries } from "@/lib/dialer/lead-note-timeline";

describe("buildLeadNoteTimeline", () => {
  it("keeps operator timestamp notes, call summaries, and AI summaries as separate timeline items", () => {
    const timeline = buildLeadNoteTimeline({
      leadId: "lead-1",
      callRows: [
        {
          id: "call-1",
          lead_id: "lead-1",
          dialer_session_id: "session-1",
          disposition: "completed",
          notes: "Final closeout summary",
          ai_summary: "AI recap",
          duration_sec: 420,
          started_at: "2026-04-09T18:00:00.000Z",
          summary_timestamp: "2026-04-09T18:08:00.000Z",
        },
        {
          id: "call-2",
          lead_id: "lead-1",
          dialer_session_id: null,
          disposition: "operator_note",
          notes: "Client-file operator note",
          ai_summary: null,
          duration_sec: 0,
          started_at: "2026-04-09T19:00:00.000Z",
          summary_timestamp: null,
        },
      ],
      sessionNotes: [
        {
          id: "note-1",
          session_id: "session-1",
          note_type: "operator_note",
          content: "Seller said call back after probate hearing",
          is_ai_generated: false,
          is_confirmed: true,
          created_at: "2026-04-09T18:05:00.000Z",
        },
        {
          id: "note-2",
          session_id: "session-1",
          note_type: "ai_suggestion",
          content: "AI draft note",
          is_ai_generated: true,
          is_confirmed: false,
          created_at: "2026-04-09T18:06:00.000Z",
        },
      ],
    });

    expect(timeline.map((item) => [item.sourceType, item.content])).toEqual([
      ["operator_note", "Client-file operator note"],
      ["call_summary", "Final closeout summary"],
      ["ai_summary", "AI recap"],
      ["ai_summary", "AI draft note"],
      ["operator_note", "Seller said call back after probate hearing"],
    ]);

    expect(timeline[1]).toMatchObject({
      sourceLabel: "Call summary",
      callLogId: "call-1",
      sessionId: "session-1",
      isAiGenerated: false,
      isConfirmed: true,
    });
    expect(timeline[3]).toMatchObject({
      sourceLabel: "AI note",
      callLogId: "call-1",
      sessionId: "session-1",
      isAiGenerated: true,
      isConfirmed: false,
    });
  });

  it("adds a deterministic fallback call note when a worked call has no operator or AI summary", () => {
    const timeline = buildLeadNoteTimeline({
      leadId: "lead-1",
      callRows: [
        {
          id: "call-1",
          lead_id: "lead-1",
          dialer_session_id: "session-1",
          disposition: "voicemail",
          notes: null,
          ai_summary: null,
          duration_sec: 19,
          started_at: "2026-04-10T18:00:00.000Z",
          summary_timestamp: null,
        },
      ],
      sessionNotes: [],
    });

    expect(timeline).toEqual([
      expect.objectContaining({
        id: "system_call:call-1",
        sourceType: "system_call",
        sourceLabel: "Call activity",
        content: "Left voicemail on Apr 10, 2026 • 19s",
        disposition: "voicemail",
        durationSec: 19,
      }),
    ]);
  });

  it("does not add a fallback note when richer human or AI content exists", () => {
    const withHumanSummary = buildLeadNoteTimeline({
      leadId: "lead-1",
      callRows: [
        {
          id: "call-1",
          lead_id: "lead-1",
          dialer_session_id: "session-1",
          disposition: "voicemail",
          notes: "Published summary",
          ai_summary: null,
          duration_sec: 19,
          started_at: "2026-04-10T18:00:00.000Z",
          summary_timestamp: null,
        },
      ],
      sessionNotes: [],
    });

    const withAiSummary = buildLeadNoteTimeline({
      leadId: "lead-1",
      callRows: [
        {
          id: "call-2",
          lead_id: "lead-1",
          dialer_session_id: "session-2",
          disposition: "no_answer",
          notes: null,
          ai_summary: "AI recap",
          duration_sec: 0,
          started_at: "2026-04-10T18:30:00.000Z",
          summary_timestamp: null,
        },
      ],
      sessionNotes: [],
    });

    expect(withHumanSummary.some((item) => item.sourceType === "system_call")).toBe(false);
    expect(withAiSummary.some((item) => item.sourceType === "system_call")).toBe(false);
  });
});

describe("buildRecentCallMemoryEntries", () => {
  it("prefers operator-authored notes over AI notes for seller memory surfaces", () => {
    const callRows = [
      {
        id: "call-1",
        lead_id: "lead-1",
        dialer_session_id: "session-1",
        disposition: "completed",
        notes: "Final closeout summary",
        ai_summary: "AI recap",
        duration_sec: 310,
        started_at: "2026-04-09T18:00:00.000Z",
        summary_timestamp: "2026-04-09T18:08:00.000Z",
      },
      {
        id: "call-2",
        lead_id: "lead-1",
        dialer_session_id: "session-2",
        disposition: "voicemail",
        notes: "Legacy published note",
        ai_summary: null,
        duration_sec: 45,
        started_at: "2026-04-08T18:00:00.000Z",
        summary_timestamp: null,
      },
    ];

    const timeline = buildLeadNoteTimeline({
      leadId: "lead-1",
      callRows,
      sessionNotes: [
        {
          id: "note-1",
          session_id: "session-1",
          note_type: "operator_note",
          content: "Operator timestamp note",
          is_ai_generated: false,
          is_confirmed: true,
          created_at: "2026-04-09T18:05:00.000Z",
        },
      ],
    });

    const recentCalls = buildRecentCallMemoryEntries(callRows, timeline, 3);

    expect(recentCalls[0]).toMatchObject({
      callLogId: "call-1",
      notes: "Operator timestamp note",
      noteSourceLabel: "Operator note",
      aiSummary: "AI recap",
      aiSourceLabel: "AI call summary",
      preferSource: "notes",
    });

    expect(recentCalls[1]).toMatchObject({
      callLogId: "call-2",
      notes: "Legacy published note",
      noteSourceLabel: "Call summary",
      aiSummary: null,
      preferSource: "notes",
    });
  });

  it("does not treat standalone operator notes as recent calls", () => {
    const callRows = [
      {
        id: "call-standalone-note",
        lead_id: "lead-1",
        dialer_session_id: null,
        disposition: "operator_note",
        notes: "Manual note only",
        ai_summary: null,
        duration_sec: 0,
        started_at: "2026-04-09T19:00:00.000Z",
        summary_timestamp: null,
      },
      {
        id: "call-actual",
        lead_id: "lead-1",
        dialer_session_id: "session-1",
        disposition: "completed",
        notes: "Actual call summary",
        ai_summary: null,
        duration_sec: 120,
        started_at: "2026-04-09T18:00:00.000Z",
        summary_timestamp: null,
      },
    ];

    const timeline = buildLeadNoteTimeline({
      leadId: "lead-1",
      callRows,
      sessionNotes: [],
    });

    const recentCalls = buildRecentCallMemoryEntries(callRows, timeline, 3);

    expect(recentCalls).toHaveLength(1);
    expect(recentCalls[0]?.callLogId).toBe("call-actual");
  });

  it("uses fallback call activity when no richer note exists", () => {
    const callRows = [
      {
        id: "call-1",
        lead_id: "lead-1",
        dialer_session_id: "session-1",
        disposition: "wrong_number",
        notes: null,
        ai_summary: null,
        duration_sec: 12,
        started_at: "2026-04-10T18:00:00.000Z",
        summary_timestamp: null,
      },
    ];

    const timeline = buildLeadNoteTimeline({
      leadId: "lead-1",
      callRows,
      sessionNotes: [],
    });

    const recentCalls = buildRecentCallMemoryEntries(callRows, timeline, 3);

    expect(recentCalls[0]).toMatchObject({
      callLogId: "call-1",
      notes: "Marked number wrong on Apr 10, 2026 • 12s",
      noteSourceLabel: "Call activity",
      aiSummary: null,
      preferSource: "notes",
    });
  });
});
