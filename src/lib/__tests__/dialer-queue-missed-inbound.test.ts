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

type Scenario = "voicemail" | "jeff_placeholder" | "fallback_dismissed";

let scenario: Scenario = "voicemail";

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
    if (!ids) {
      if (scenario === "fallback_dismissed") {
        return {
          data: [{
            id: "fallback-call-log-1",
            lead_id: null,
            phone_dialed: "+15095551234",
            twilio_sid: "CA-fallback-1",
            created_at: "2026-04-13T18:00:00.000Z",
            disposition: "in_progress",
          }],
          error: null,
        };
      }
      return { data: [], error: null };
    }

    if (scenario === "voicemail" && ids.includes("call-log-1")) {
      return {
        data: [{
          id: "call-log-1",
          recording_url: "https://api.twilio.com/recordings/RE123",
          duration_sec: 31,
          disposition: "missed",
          metadata: { voicemail_duration: 31 },
        }],
        error: null,
      };
    }

    if (scenario === "jeff_placeholder" && ids.includes("call-log-2")) {
      return {
        data: [{
          id: "call-log-2",
          recording_url: null,
          duration_sec: null,
          disposition: "missed",
          metadata: null,
        }],
        error: null,
      };
    }

    return { data: [], error: null };
  }

  if (table === "jeff_interactions") {
    if (scenario === "voicemail") {
      return {
        data: [{
          voice_session_id: "voice-1",
          calls_log_id: "call-log-1",
          caller_phone: "+15098428628",
          summary: "Jeff booked a callback for tonight.",
          callback_requested: true,
          callback_due_at: "2026-04-09T23:00:00.000Z",
          callback_timing_text: "Tonight around 4 PM",
          created_at: "2026-04-09T18:05:00.000Z",
          metadata: null,
        }],
        error: null,
      };
    }

    return {
      data: [{
        voice_session_id: "placeholder-voice-2",
        calls_log_id: "call-log-2",
        caller_phone: "+15097684584",
        summary: "Jeff answered this inbound call, but the conversation notes did not persist. Review the Jeff inbound pipeline for this call.",
        callback_requested: false,
        callback_due_at: null,
        callback_timing_text: null,
        created_at: "2026-04-11T21:12:00.000Z",
        metadata: { placeholder: true, persistence_missing: true },
      }],
      error: null,
    };
  }

  if (table === "voice_sessions") {
    return { data: [], error: null };
  }

  if (table === "sms_messages") {
    if (scenario === "voicemail") {
      return {
        data: [{
          phone: "+15098428628",
          created_at: "2026-04-09T18:06:00.000Z",
        }],
        error: null,
      };
    }
    return { data: [], error: null };
  }

  if (table === "dialer_events") {
    const eqEventType = state.eq.find(([field]) => field === "event_type")?.[1];
    const inEventType = state.in.find(([field]) => field === "event_type")?.[1] as string[] | undefined;

    if (eqEventType === "inbound.missed") {
      expect(state.gte).toEqual(expect.arrayContaining([["created_at", expect.any(String)]]));

      if (scenario === "fallback_dismissed") {
        return { data: [], error: null };
      }

      if (scenario === "voicemail") {
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

      return {
        data: [{
          id: "missed-event-2",
          lead_id: "lead-2",
          task_id: "task-2",
          created_at: "2026-04-11T21:11:00.000Z",
          metadata: {
            from_number: "+15097684584",
            missed_at: "2026-04-11T21:11:00.000Z",
            task_due_at: "2026-04-14T16:00:00.000Z",
            call_sid: "CA456",
            calls_log_id: "call-log-2",
            lead_matched: true,
            route_primary: "logan",
            route_secondary: "adam",
            route_reason: "answered_by_jeff_after_browser_miss",
            call_end_reason: "answered_by_jeff",
            owner_name: "Mark Oye",
            property_address: "808 W Chelan Ave",
          },
        }],
        error: null,
      };
    }

    if (Array.isArray(inEventType) && inEventType.includes("inbound.recovered")) {
      if (scenario === "fallback_dismissed") {
        return {
          data: [{
            metadata: {
              original_call_log_id: "fallback-call-log-1",
            },
          }],
          error: null,
        };
      }
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
    scenario = "voicemail";

    mocks.getDialerUser.mockResolvedValue({ id: "user-1" });
    mocks.createDialerClient.mockReturnValue(createMockClient());
    mocks.readEventTaskId.mockReturnValue(null);
    mocks.unifiedPhoneLookup.mockImplementation(async (phone: string) => {
      if (phone === "+15097684584") {
        return {
          leadId: "lead-2",
          matchSource: "lead_phones",
          matchConfidence: "direct",
          ownerName: "Mark Oye",
          propertyAddress: "808 W Chelan Ave",
          contactId: null,
          propertyId: null,
          intakeLeadId: null,
          recentCallCount: 1,
          lastCallDate: "2026-04-11T21:11:00.000Z",
        };
      }

      return {
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
      };
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
      voicemail_duration: 31,
      final_state: "voicemail_recorded",
      jeff_callback_requested: true,
      jeff_callback_time: "Tonight around 4 PM",
      jeff_notes_missing: false,
    });
  });

  it("surfaces Jeff answered calls even when the Jeff notes did not persist", async () => {
    scenario = "jeff_placeholder";
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
      event_id: "missed-event-2",
      lead_id: "lead-2",
      owner_name: "Mark Oye",
      property_address: "808 W Chelan Ave",
      route_reason: "answered_by_jeff_after_browser_miss",
      call_log_id: "call-log-2",
      voice_session_id: "placeholder-voice-2",
      jeff_notes_missing: true,
      jeff_summary: "Jeff answered this inbound call, but the conversation notes did not persist. Review the Jeff inbound pipeline for this call.",
      final_state: "jeff_message",
      seller_sms_sent: false,
    });
  });

  it("does not resurface dismissed fallback missed calls from calls_log", async () => {
    scenario = "fallback_dismissed";
    const { GET } = await import("@/app/api/dialer/v1/queue/route");

    const response = await GET(
      new Request("http://localhost/api/dialer/v1/queue", {
        headers: { authorization: "Bearer test-token" },
      }) as never,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.missed_inbound).toHaveLength(0);
  });
});
