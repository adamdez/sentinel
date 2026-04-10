import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDialerClient: vi.fn(),
  getDialerUser: vi.fn(),
  readEventTaskId: vi.fn(),
  unifiedPhoneLookup: vi.fn(),
}));

vi.mock("@/lib/dialer/db", () => ({
  createDialerClient: mocks.createDialerClient,
  getDialerUser: mocks.getDialerUser,
}));

vi.mock("@/lib/dialer/dialer-events", () => ({
  readEventTaskId: mocks.readEventTaskId,
}));

vi.mock("@/lib/dialer/phone-lookup", () => ({
  unifiedPhoneLookup: mocks.unifiedPhoneLookup,
}));

type QueryState = {
  select?: string;
  eq: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
  not: Array<[string, string, unknown]>;
  order?: [string, boolean];
  limit?: number;
  gte: Array<[string, unknown]>;
  lt: Array<[string, unknown]>;
};

function createMockClient() {
  return {
    from(table: string) {
      const state: QueryState = {
        eq: [],
        in: [],
        not: [],
        gte: [],
        lt: [],
      };

      const builder = {
        select(value: string) {
          state.select = value;
          return builder;
        },
        eq(field: string, value: unknown) {
          state.eq.push([field, value]);
          return builder;
        },
        or() {
          return builder;
        },
        in(field: string, values: unknown[]) {
          state.in.push([field, values]);
          return builder;
        },
        not(field: string, op: string, value: unknown) {
          state.not.push([field, op, value]);
          return builder;
        },
        order(field: string, options?: { ascending?: boolean }) {
          state.order = [field, options?.ascending ?? true];
          return builder;
        },
        limit(value: number) {
          state.limit = value;
          return builder;
        },
        gte(field: string, value: unknown) {
          state.gte.push([field, value]);
          return builder;
        },
        lt(field: string, value: unknown) {
          state.lt.push([field, value]);
          return builder;
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve(resolveQuery(table, state)).then(resolve, reject);
        },
      };

      return builder;
    },
  };
}

function resolveQuery(table: string, state: QueryState) {
  if (table === "tasks") {
    return { data: [], error: null };
  }

  if (table === "dialer_ai_traces") {
    return { data: [], error: null };
  }

  if (table === "leads") {
    const ids = state.in.find(([field]) => field === "id")?.[1] as string[] | undefined;
    if (ids) {
      return {
        data: ids.map((id) => ({ id, source_category: "LeadHouse" })),
        error: null,
      };
    }
    return { data: [], error: null };
  }

  if (table === "intake_leads") {
    const ids = state.in.find(([field]) => field === "id")?.[1] as string[] | undefined;
    if (ids) {
      return {
        data: ids.map((id) => ({ id, source_category: "LeadHouse" })),
        error: null,
      };
    }
    return { data: [], error: null };
  }

  if (table === "calls_log") {
    const ids = state.in.find(([field]) => field === "id")?.[1] as string[] | undefined;
    if (ids?.includes("call-log-1")) {
      return {
        data: [{
          id: "call-log-1",
          voicemail_url: "https://api.twilio.com/recordings/RE123",
          voicemail_duration: 31,
          disposition: "missed",
        }],
        error: null,
      };
    }
    return { data: [], error: null };
  }

  if (table === "jeff_interactions") {
    return {
      data: [{
        voice_session_id: "voice-1",
        caller_phone: "+15098428628",
        summary: "Jeff booked a callback for tonight.",
        callback_requested: true,
        callback_due_at: "2026-04-09T23:00:00.000Z",
        callback_timing_text: "Tonight around 4 PM",
        created_at: "2026-04-09T18:05:00.000Z",
      }],
      error: null,
    };
  }

  if (table === "voice_sessions") {
    return { data: [], error: null };
  }

  if (table === "sms_messages") {
    return {
      data: [{
        phone: "+15098428628",
        created_at: "2026-04-09T18:06:00.000Z",
      }],
      error: null,
    };
  }

  if (table === "dialer_events") {
    const eqEventType = state.eq.find(([field]) => field === "event_type")?.[1];
    const inEventType = state.in.find(([field]) => field === "event_type")?.[1] as string[] | undefined;

    if (eqEventType === "inbound.missed") {
      expect(state.gte).toEqual(expect.arrayContaining([["created_at", expect.any(String)]]));
      return {
        data: [{
          id: "missed-event-1",
          lead_id: "lead-1",
          task_id: "task-1",
          created_at: "2026-04-09T18:00:00.000Z",
          metadata: {
            from_number: "+15098428628",
            missed_at: "2026-04-09T18:00:00.000Z",
            task_due_at: "2026-04-09T19:00:00.000Z",
            call_sid: "CA123",
            calls_log_id: "call-log-1",
            lead_matched: true,
            route_primary: "adam",
            route_secondary: "logan",
            route_reason: "browser_chain_exhausted",
            owner_name: "Melissa Donahue",
            property_address: "906 E Vicksburg Ave",
          },
        }],
        error: null,
      };
    }

    if (Array.isArray(inEventType) && inEventType.includes("inbound.recovered")) {
      return { data: [], error: null };
    }

    if (eqEventType === "inbound.classified") {
      return { data: [], error: null };
    }

    if (eqEventType === "inbound.answered") {
      return { data: [], error: null };
    }

    return { data: [], error: null };
  }

  return { data: [], error: null };
}

describe("GET /api/dialer/v1/queue missed inbound enrichment", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();

    mocks.getDialerUser.mockResolvedValue({ id: "user-1" });
    mocks.createDialerClient.mockReturnValue(createMockClient());
    mocks.readEventTaskId.mockReturnValue(null);
    mocks.unifiedPhoneLookup.mockResolvedValue({
      leadId: "lead-1",
      matchSource: "lead_phones",
      matchConfidence: "direct",
      ownerName: "Melissa Donahue",
      propertyAddress: "906 E Vicksburg Ave",
      contactId: null,
      propertyId: null,
      intakeLeadId: null,
      recentCallCount: 2,
      lastCallDate: "2026-04-09T18:00:00.000Z",
    });
  });

  it("returns rich missed inbound recovery cards for known callers", async () => {
    const { GET } = await import("@/app/api/dialer/v1/queue/route");

    const response = await GET(
      new Request("http://localhost/api/dialer/v1/queue", {
        headers: { authorization: "Bearer test-token" },
      }) as never,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.missed_inbound).toHaveLength(1);
    expect(payload.missed_inbound[0]).toMatchObject({
      event_id: "missed-event-1",
      lead_id: "lead-1",
      owner_name: "Melissa Donahue",
      property_address: "906 E Vicksburg Ave",
      lead_source: "LeadHouse",
      route_primary: "adam",
      route_secondary: "logan",
      open_target_type: "lead",
      open_target_id: "lead-1",
      seller_sms_sent: true,
      voicemail_url: "https://api.twilio.com/recordings/RE123",
      final_state: "voicemail_recorded",
      jeff_callback_requested: true,
      jeff_callback_time: "Tonight around 4 PM",
    });
  });
});
