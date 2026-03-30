import { beforeEach, describe, expect, it, vi } from "vitest";

describe("createOrUpdateAssistant", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.VAPI_API_KEY = "test-vapi-key";
    process.env.VAPI_ASSISTANT_ID = "assistant-123";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
  });

  it("retries without transferPlan when persisted assistant schema rejects it", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: ["property transferPlan should not exist"],
            error: "Bad Request",
            statusCode: 400,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "assistant-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const { createOrUpdateAssistant } = await import("@/providers/voice/vapi-adapter");
    const assistantId = await createOrUpdateAssistant("https://example.com/api/voice/vapi/webhook");

    expect(assistantId).toBe("assistant-123");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));

    expect(firstBody.transferPlan).toBeTruthy();
    expect(secondBody.transferPlan).toBeUndefined();
    expect(secondBody.serverUrl).toBe("https://example.com/api/voice/vapi/webhook");
  });
});
