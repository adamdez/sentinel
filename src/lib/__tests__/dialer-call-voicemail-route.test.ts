import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createDialerClient: vi.fn(),
  getDialerUser: vi.fn(),
}));

vi.mock("@/lib/dialer/db", () => ({
  createDialerClient: mocks.createDialerClient,
  getDialerUser: mocks.getDialerUser,
}));

function createClient(recordingUrl: string | null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: recordingUrl ? { id: "call-log-1", recording_url: recordingUrl } : null,
            error: null,
          })),
        })),
      })),
    })),
  };
}

describe("GET /api/dialer/v1/calls/[call_log_id]/voicemail", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.getDialerUser.mockResolvedValue({ id: "user-1" });
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "auth-token";
  });

  it("proxies Twilio recording media through Sentinel with auth", async () => {
    mocks.createDialerClient.mockReturnValue(createClient("https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123") as never);

    const fetchMock = vi.fn(async () => new Response("audio", {
      status: 200,
      headers: { "content-type": "audio/mpeg" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/dialer/v1/calls/[call_log_id]/voicemail/route");
    const response = await GET(
      new NextRequest("http://localhost/api/dialer/v1/calls/call-log-1/voicemail?format=mp3", {
        headers: { authorization: "Bearer token" },
      }),
      { params: Promise.resolve({ call_log_id: "call-log-1" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Recordings/RE123.mp3",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.any(Headers),
      }),
    );
    const passedHeaders = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(passedHeaders.get("Authorization")).toContain("Basic ");

    vi.unstubAllGlobals();
  });

  it("returns 404 when the call has no recording URL", async () => {
    mocks.createDialerClient.mockReturnValue(createClient(null) as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/dialer/v1/calls/[call_log_id]/voicemail/route");
    const response = await GET(
      new NextRequest("http://localhost/api/dialer/v1/calls/call-log-1/voicemail", {
        headers: { authorization: "Bearer token" },
      }),
      { params: Promise.resolve({ call_log_id: "call-log-1" }) },
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
