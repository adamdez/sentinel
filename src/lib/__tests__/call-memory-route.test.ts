import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDialerClient: vi.fn(),
  getDialerUser: vi.fn(),
}));

vi.mock("@/lib/dialer/db", () => ({
  createDialerClient: mocks.createDialerClient,
  getDialerUser: mocks.getDialerUser,
}));

type Dataset = {
  calls_log?: Array<Record<string, unknown>>;
  call_sessions?: Array<Record<string, unknown>>;
  session_notes?: Array<Record<string, unknown>>;
  leads?: Array<Record<string, unknown>>;
  post_call_structures?: Array<Record<string, unknown>>;
};

function createDialerClientDouble(dataset: Dataset) {
  return {
    from(table: string) {
      let rows = [...((dataset[table as keyof Dataset] as Array<Record<string, unknown>> | undefined) ?? [])];

      const chain = {
        select() {
          return chain;
        },
        eq(field: string, value: unknown) {
          rows = rows.filter((row) => row[field] === value);
          return chain;
        },
        in(field: string, values: unknown[]) {
          rows = rows.filter((row) => values.includes(row[field]));
          return chain;
        },
        order(field: string, options?: { ascending?: boolean }) {
          rows = [...rows].sort((left, right) => {
            const leftValue = new Date(String(left[field] ?? 0)).getTime();
            const rightValue = new Date(String(right[field] ?? 0)).getTime();
            return options?.ascending === false ? rightValue - leftValue : leftValue - rightValue;
          });
          return chain;
        },
        limit(value: number) {
          rows = rows.slice(0, value);
          return chain;
        },
        async maybeSingle() {
          return { data: rows[0] ?? null, error: null };
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };

      return chain;
    },
  };
}

describe("GET /api/dialer/v1/leads/[lead_id]/call-memory", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.getDialerUser.mockResolvedValue({ id: "user-1" });
  });

  it("returns unified note timeline and prefers operator notes in seller memory", async () => {
    mocks.createDialerClient.mockReturnValue(createDialerClientDouble({
      calls_log: [
        {
          id: "call-1",
          lead_id: "lead-1",
          dialer_session_id: "session-1",
          disposition: "completed",
          notes: "Final closeout summary",
          ai_summary: "AI call summary",
          duration_sec: 300,
          started_at: "2026-04-09T18:00:00.000Z",
          summary_timestamp: "2026-04-09T18:08:00.000Z",
        },
      ],
      call_sessions: [
        {
          id: "session-1",
          lead_id: "lead-1",
          started_at: "2026-04-09T18:00:00.000Z",
        },
      ],
      session_notes: [
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
      leads: [
        {
          id: "lead-1",
          decision_maker_note: "Daughter handles decisions",
          decision_maker_confirmed: true,
        },
      ],
      post_call_structures: [
        {
          lead_id: "lead-1",
          summary_line: "AI structured summary",
          promises_made: null,
          objection: null,
          next_task_suggestion: null,
          callback_timing_hint: null,
          deal_temperature: null,
          created_at: "2026-04-09T18:09:00.000Z",
        },
      ],
    }));

    const { GET } = await import("@/app/api/dialer/v1/leads/[lead_id]/call-memory/route");
    const response = await GET(
      new Request("http://localhost/api/dialer/v1/leads/lead-1/call-memory", {
        headers: { authorization: "Bearer test-token" },
      }) as never,
      { params: Promise.resolve({ lead_id: "lead-1" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.memory.lastCallSummary).toBe("Operator timestamp note");
    expect(payload.memory.recentCalls[0]).toMatchObject({
      notes: "Operator timestamp note",
      noteSourceLabel: "Operator note",
      aiSummary: "AI call summary",
    });
    expect(payload.memory.notesPreview.items).toEqual([
      expect.objectContaining({
        id: "session_note:note-1",
        sourceType: "operator_note",
        sourceLabel: "Operator note",
        content: "Operator timestamp note",
      }),
    ]);
    expect(payload.memory.noteTimeline.map((entry: { sourceType: string }) => entry.sourceType)).toEqual([
      "call_summary",
      "ai_summary",
      "operator_note",
    ]);
  });
});
