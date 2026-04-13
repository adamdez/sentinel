import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getTwilioCredentials: vi.fn(),
  isTwilioError: vi.fn(),
  friendlyTwilioError: vi.fn(),
  scrubLead: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/twilio", () => ({
  getTwilioCredentials: mocks.getTwilioCredentials,
  isTwilioError: mocks.isTwilioError,
  friendlyTwilioError: mocks.friendlyTwilioError,
}));

vi.mock("@/lib/compliance", () => ({
  scrubLead: mocks.scrubLead,
}));

function createSupabaseClient() {
  return {
    from() {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    },
  };
}

describe("sendAndLogSMS", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://sentinel.dominionhomedeals.com";
    delete process.env.TWILIO_SMS_MESSAGING_SERVICE_SID;
    delete process.env.TWILIO_NOTIFY_MESSAGING_SERVICE_SID;

    mocks.createServerClient.mockReturnValue(createSupabaseClient());
    mocks.getTwilioCredentials.mockReturnValue({
      sid: "AC123456789012345678901234567890",
      token: "token",
      from: "+15099921136",
      authHeader: "Basic abc123",
    });
    mocks.isTwilioError.mockReturnValue(false);
    mocks.friendlyTwilioError.mockImplementation((message: string) => message);
    mocks.scrubLead.mockResolvedValue({ allowed: true, blockedReasons: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TWILIO_SMS_MESSAGING_SERVICE_SID;
    delete process.env.TWILIO_NOTIFY_MESSAGING_SERVICE_SID;
  });

  it("sends outbound seller SMS through a messaging service when configured", async () => {
    process.env.TWILIO_SMS_MESSAGING_SERVICE_SID = "MG123";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ sid: "SM123", status: "queued" }),
    }));
    const { sendAndLogSMS } = await import("@/lib/sms/send");

    const result = await sendAndLogSMS({
      to: "(509) 279-5818",
      body: "Checking in.",
      context: "operator_forced",
    });

    expect(result).toMatchObject({ success: true, messageSid: "SM123" });
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, request] = fetchMock.mock.calls[0];
    const params = new URLSearchParams(String(request?.body));
    expect(params.get("To")).toBe("+15092795818");
    expect(params.get("From")).toBe("+15099921136");
    expect(params.get("MessagingServiceSid")).toBe("MG123");
    expect(params.get("StatusCallback")).toBe("https://sentinel.dominionhomedeals.com/api/twilio/sms/status");
  });

  it("falls back to direct From routing when no messaging service is configured", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ sid: "SM123", status: "queued" }),
    }));
    const { sendAndLogSMS } = await import("@/lib/sms/send");

    await sendAndLogSMS({
      to: "+15092795818",
      body: "Checking in.",
      context: "operator_forced",
    });

    const fetchMock = vi.mocked(fetch);
    const [, request] = fetchMock.mock.calls.at(-1)!;
    const params = new URLSearchParams(String(request?.body));
    expect(params.get("From")).toBe("+15099921136");
    expect(params.get("MessagingServiceSid")).toBeNull();
  });

  it("discovers the messaging service that owns the operator number when only the notify service is configured", async () => {
    process.env.TWILIO_NOTIFY_MESSAGING_SERVICE_SID = "MGnotify";
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          phone_numbers: [{ phone_number: "+15098225460" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          services: [{ sid: "MGnotify" }, { sid: "MGoperator" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          phone_numbers: [{ phone_number: "+15099921136" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ sid: "SM123", status: "queued" }),
      }));

    const { sendAndLogSMS } = await import("@/lib/sms/send");

    await sendAndLogSMS({
      to: "+15092795818",
      body: "Checking in.",
      context: "operator_forced",
    });

    const fetchMock = vi.mocked(fetch);
    const [, request] = fetchMock.mock.calls[3];
    const params = new URLSearchParams(String(request?.body));
    expect(params.get("From")).toBe("+15099921136");
    expect(params.get("MessagingServiceSid")).toBe("MGoperator");
  });
});
