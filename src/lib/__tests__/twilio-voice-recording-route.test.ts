import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: mocks.createServerClient,
}));

function createServerClientMock() {
  const updateEq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const maybeSingle = vi.fn(async () => ({
    data: {
      id: "call-log-1",
      metadata: {
        prior_flag: true,
      },
    },
    error: null,
  }));
  const selectEq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: selectEq }));
  const insert = vi.fn(async () => ({ error: null }));
  const from = vi.fn((table: string) => {
    if (table === "calls_log") {
      return {
        select,
        update,
      };
    }
    if (table === "event_log") {
      return {
        insert,
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from },
    spies: { from, select, selectEq, maybeSingle, update, updateEq, insert },
  };
}

describe("POST /api/twilio/voice/recording", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("stores voicemail on calls_log using recording_url and metadata", async () => {
    const mock = createServerClientMock();
    mocks.createServerClient.mockReturnValue(mock.client as never);

    const formData = new FormData();
    formData.set("RecordingUrl", "https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123");
    formData.set("RecordingDuration", "9");

    const { POST } = await import("@/app/api/twilio/voice/recording/route");
    const response = await POST(
      new NextRequest("http://localhost/api/twilio/voice/recording?callLogId=call-log-1", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    expect(mock.spies.update).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: "voicemail",
        recording_url: "https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123",
        metadata: expect.objectContaining({
          prior_flag: true,
          voicemail_duration: 9,
          voicemail_recorded_at: expect.any(String),
        }),
      }),
    );
    expect(mock.spies.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "twilio.voicemail_recorded",
        entity_id: "call-log-1",
      }),
    );
  });
});
