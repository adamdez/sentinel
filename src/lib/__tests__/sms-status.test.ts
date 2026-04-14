import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTwilioCredentials: vi.fn(),
  isTwilioError: vi.fn(),
}));

vi.mock("@/lib/twilio", () => ({
  getTwilioCredentials: mocks.getTwilioCredentials,
  isTwilioError: mocks.isTwilioError,
}));

describe("sms status reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTwilioCredentials.mockReturnValue({
      sid: "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      token: "token",
      from: "+15099921136",
      authHeader: "Basic abc123",
    });
    mocks.isTwilioError.mockReturnValue(false);
  });

  it("reconciles stale queued outbound messages from Twilio", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: "undelivered" }),
    }));

    const update = vi.fn().mockReturnThis();
    const eq = vi.fn().mockResolvedValue({ error: null });
    const sb = {
      from: vi.fn().mockReturnValue({
        update,
        eq,
      }),
    };

    const { reconcileSmsStatuses } = await import("@/lib/sms/status");
    const result = await reconcileSmsStatuses(sb, [{
      id: "msg-1",
      direction: "outbound",
      twilio_sid: "SM123",
      twilio_status: "queued",
      created_at: "2026-04-14T03:00:00.000Z",
    }]);

    expect(update).toHaveBeenCalledWith({ twilio_status: "undelivered" });
    expect(eq).toHaveBeenCalledWith("id", "msg-1");
    expect(result.get("msg-1")).toBe("undelivered");
  });
});
