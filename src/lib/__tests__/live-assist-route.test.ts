import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyLiveCoachState } from "@/lib/dialer/live-coach-service";

const mocks = vi.hoisted(() => ({
  getStyleBlock: vi.fn(),
  writeAiTrace: vi.fn(),
  createDialerClient: vi.fn(),
  getDialerUser: vi.fn(),
  completeDialerAiLayered: vi.fn(),
  getSession: vi.fn(),
  getSessionLiveCoachState: vi.fn(),
  updateSessionLiveCoachState: vi.fn(),
}));

vi.mock("@/lib/conversation-style", () => ({
  getStyleBlock: mocks.getStyleBlock,
}));

vi.mock("@/lib/dialer/ai-trace-writer", () => ({
  writeAiTrace: mocks.writeAiTrace,
}));

vi.mock("@/lib/dialer/db", () => ({
  createDialerClient: mocks.createDialerClient,
  getDialerUser: mocks.getDialerUser,
}));

vi.mock("@/lib/dialer/openai-lane-client", () => ({
  completeDialerAiLayered: mocks.completeDialerAiLayered,
}));

vi.mock("@/lib/dialer/session-manager", () => ({
  getSession: mocks.getSession,
  getSessionLiveCoachState: mocks.getSessionLiveCoachState,
  updateSessionLiveCoachState: mocks.updateSessionLiveCoachState,
}));

function makeSessionNotesClient(rows: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      if (table !== "session_notes") {
        throw new Error(`Unexpected table: ${table}`);
      }

      let result = [...rows];

      const chain = {
        select() {
          return chain;
        },
        eq(column: string, value: unknown) {
          result = result.filter((row) => row[column] === value);
          return chain;
        },
        in(column: string, values: unknown[]) {
          result = result.filter((row) => values.includes(row[column]));
          return chain;
        },
        gt(column: string, value: number) {
          result = result.filter((row) => Number(row[column] ?? 0) > value);
          return chain;
        },
        order(column: string, opts: { ascending: boolean }) {
          result = [...result].sort((left, right) => {
            const leftValue = Number(left[column] ?? 0);
            const rightValue = Number(right[column] ?? 0);
            return opts.ascending ? leftValue - rightValue : rightValue - leftValue;
          });
          return chain;
        },
        async limit(count: number) {
          return { data: result.slice(0, count) };
        },
      };

      return chain;
    },
  };
}

const session = {
  id: "session-1",
  lead_id: "lead-1",
  context_snapshot: null,
};

describe("POST /api/dialer/v1/sessions/[id]/live-assist", () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();

    process.env.OPENAI_API_KEY = "test-openai-key";

    mocks.getStyleBlock.mockReturnValue("Use calm, direct language.");
    mocks.writeAiTrace.mockResolvedValue(undefined);
    mocks.getDialerUser.mockResolvedValue({ id: "user-1" });
    mocks.getSession.mockResolvedValue({ data: session, error: null });
    mocks.getSessionLiveCoachState.mockResolvedValue({ data: null, error: null });
    mocks.updateSessionLiveCoachState.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  });

  it("returns a rules-backed discovery map when GPT refinement fails", async () => {
    mocks.createDialerClient.mockReturnValue(
      makeSessionNotesClient([
        {
          id: "note-1",
          session_id: "session-1",
          content: "There is a roof leak over the kitchen.",
          speaker: "seller",
          note_type: "transcript_chunk",
          sequence_num: 1,
          created_at: "2026-03-22T20:00:00.000Z",
          confidence: 0.96,
        },
      ]),
    );
    mocks.completeDialerAiLayered.mockRejectedValue(new Error("gpt down"));

    const { POST } = await import("@/app/api/dialer/v1/sessions/[id]/live-assist/route");
    const request = new Request("http://localhost/api/dialer/v1/sessions/session-1/live-assist", {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ mode: "outbound" }),
    });

    const response = await POST(request as never, {
      params: Promise.resolve({ id: "session-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.source).toBe("rules");
    expect(payload.discoveryMap.property_condition.status).toBe("confirmed");
    expect(payload.highestPriorityGap).toBe("human_pain");
    expect(payload.structuredLiveNotes.length).toBeGreaterThan(0);
    expect(payload.nextBestQuestion).toContain("affecting things for you personally");
    expect(mocks.completeDialerAiLayered).toHaveBeenCalledTimes(1);
    expect(mocks.updateSessionLiveCoachState).toHaveBeenCalledTimes(1);
  });

  it("reuses a fresh cached strategist move when no new notes arrived", async () => {
    const cachedState = createEmptyLiveCoachState("2026-03-22T20:00:00.000Z");
    cachedState.lastProcessedSequence = 5;
    cachedState.recentTurns = [
      {
        sequenceNum: 5,
        speaker: "seller",
        text: "The roof leak has been a pain.",
        createdAt: "2026-03-22T20:00:00.000Z",
      },
    ];
    cachedState.bestMove = {
      currentStage: "problem_awareness",
      highestPriorityGap: "human_pain",
      whyThisGapNow: "Personal impact is still the clearest gap.",
      nextBestQuestion: "What has been the hardest part of dealing with that?",
      backupQuestion: "How has that been affecting things for you day to day?",
      suggestedMirror: "Hardest part?",
      suggestedLabel: "It sounds like this has been weighing on you.",
      guardrail: "Stay with the personal impact before moving to price.",
    };
    cachedState.source = "gpt5";
    cachedState.lastStrategizedAt = new Date().toISOString();
    cachedState.lastStrategizedGap = "human_pain";

    mocks.createDialerClient.mockReturnValue(makeSessionNotesClient([]));
    mocks.getSessionLiveCoachState.mockResolvedValue({
      data: cachedState as unknown as Record<string, unknown>,
      error: null,
    });

    const { POST } = await import("@/app/api/dialer/v1/sessions/[id]/live-assist/route");
    const request = new Request("http://localhost/api/dialer/v1/sessions/session-1/live-assist", {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ mode: "outbound" }),
    });

    const response = await POST(request as never, {
      params: Promise.resolve({ id: "session-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.source).toBe("gpt5");
    expect(payload.nextBestQuestion).toBe(
      "What has been the hardest part of dealing with that?",
    );
    expect(mocks.completeDialerAiLayered).not.toHaveBeenCalled();
    expect(mocks.updateSessionLiveCoachState).toHaveBeenCalledTimes(1);
  });
});
