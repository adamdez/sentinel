import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  listJeffInteractions: vi.fn(),
  getJeffInteractionById: vi.fn(),
  updateJeffInteraction: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/jeff-interactions", () => ({
  listJeffInteractions: mocks.listJeffInteractions,
  getJeffInteractionById: mocks.getJeffInteractionById,
  updateJeffInteraction: mocks.updateJeffInteraction,
}));

function createRouteClient() {
  const from = vi.fn((table: string) => {
    if (table === "voice_sessions") {
      return {
        select: vi.fn(() => ({
          in: vi.fn(async () => ({
            data: [{
              id: "voice-1",
              transcript: "Caller wanted Adam involved.",
              extracted_facts: [
                { field: "caller_name", value: "Mark Oye" },
                { field: "urgency", value: "high" },
              ],
              duration_seconds: 84,
            }],
            error: null,
          })),
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { id: "voice-1", extracted_facts: [] },
              error: null,
            })),
          })),
          maybeSingle: vi.fn(async () => ({
            data: { id: "voice-1", extracted_facts: [] },
            error: null,
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: null, error: null })),
        })),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1", email: "logan@dominionhomedeals.com" } } })),
    },
    from,
  };
}

describe("GET /api/dialer/v1/jeff-messages", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.createServerClient.mockReturnValue(createRouteClient() as never);
    mocks.listJeffInteractions.mockResolvedValue([
      {
        id: "interaction-1",
        voice_session_id: "call-log-2",
        lead_id: "lead-2",
        calls_log_id: "call-log-2",
        direction: "inbound",
        caller_phone: "+15097684584",
        caller_name: "Mark Oye",
        property_address: "808 W Chelan Ave",
        interaction_type: "follow_up_needed",
        status: "needs_review",
        summary: "Jeff answered this inbound call, but the conversation notes did not persist. Review the Jeff inbound pipeline for this call.",
        callback_requested: false,
        callback_due_at: null,
        callback_timing_text: null,
        transfer_outcome: "jeff_answered_notes_missing",
        assigned_to: null,
        task_id: null,
        policy_version: "test",
        metadata: { persistence_missing: true },
        reviewed_at: null,
        resolved_at: null,
        created_at: "2026-04-11T21:12:00.000Z",
        updated_at: "2026-04-11T21:12:00.000Z",
        lead: null,
        task: null,
      },
      {
        id: "interaction-2",
        voice_session_id: "voice-1",
        lead_id: "lead-3",
        calls_log_id: "call-log-3",
        direction: "inbound",
        caller_phone: "+15095551212",
        caller_name: null,
        property_address: "123 Main St",
        interaction_type: "follow_up_needed",
        status: "reviewed",
        summary: "Seller wants Adam to call back.",
        callback_requested: false,
        callback_due_at: null,
        callback_timing_text: null,
        transfer_outcome: "callback_requested",
        assigned_to: null,
        task_id: null,
        policy_version: "test",
        metadata: { caller_type: "seller" },
        reviewed_at: "2026-04-11T21:20:00.000Z",
        resolved_at: null,
        created_at: "2026-04-11T21:15:00.000Z",
        updated_at: "2026-04-11T21:20:00.000Z",
        lead: null,
        task: null,
      },
    ]);
  });

  it("returns Jeff placeholder interactions even without a persisted voice session", async () => {
    const { GET } = await import("@/app/api/dialer/v1/jeff-messages/route");
    const request = new NextRequest("http://localhost/api/dialer/v1/jeff-messages?include=all", {
      headers: { authorization: "Bearer token" },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.messages).toHaveLength(2);
    expect(payload.messages[0]).toMatchObject({
      id: "interaction-1",
      callerPhone: "+15097684584",
      summary: "Jeff answered this inbound call, but the conversation notes did not persist. Review the Jeff inbound pipeline for this call.",
      acknowledged: false,
      extracted: {
        callerName: "Mark Oye",
      },
    });
  });
});

describe("PATCH /api/dialer/v1/jeff-messages/[id]/acknowledge", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.createServerClient.mockReturnValue(createRouteClient() as never);
    mocks.getJeffInteractionById.mockResolvedValue({
      id: "interaction-1",
      voice_session_id: "call-log-2",
      lead_id: "lead-2",
      calls_log_id: "call-log-2",
      direction: "inbound",
      caller_phone: "+15097684584",
      caller_name: "Mark Oye",
      property_address: "808 W Chelan Ave",
      interaction_type: "follow_up_needed",
      status: "needs_review",
      summary: "Jeff answered this inbound call, but the conversation notes did not persist. Review the Jeff inbound pipeline for this call.",
      callback_requested: false,
      callback_due_at: null,
      callback_timing_text: null,
      transfer_outcome: "jeff_answered_notes_missing",
      assigned_to: null,
      task_id: null,
      policy_version: "test",
      metadata: { persistence_missing: true },
      reviewed_at: null,
      resolved_at: null,
      created_at: "2026-04-11T21:12:00.000Z",
      updated_at: "2026-04-11T21:12:00.000Z",
    });
  });

  it("acknowledges placeholder interactions without requiring a voice session row", async () => {
    const { PATCH } = await import("@/app/api/dialer/v1/jeff-messages/[id]/acknowledge/route");

    const response = await PATCH(
      new Request("http://localhost/api/dialer/v1/jeff-messages/interaction-1/acknowledge", {
        method: "PATCH",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "dismissed" }),
      }) as never,
      { params: Promise.resolve({ id: "interaction-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.updateJeffInteraction).toHaveBeenCalledWith(
      "interaction-1",
      expect.objectContaining({
        status: "reviewed",
      }),
    );
  });
});
