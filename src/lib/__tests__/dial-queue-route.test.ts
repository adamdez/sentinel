import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDialerClient: vi.fn(),
  getDialerUser: vi.fn(),
  queueLeadIdsForUser: vi.fn(),
  removeLeadFromDialQueue: vi.fn(),
}));

vi.mock("@/lib/dialer/db", () => ({
  createDialerClient: mocks.createDialerClient,
  getDialerUser: mocks.getDialerUser,
}));

vi.mock("@/lib/dial-queue", () => ({
  queueLeadIdsForUser: mocks.queueLeadIdsForUser,
  removeLeadFromDialQueue: mocks.removeLeadFromDialQueue,
}));

describe("POST /api/dialer/v1/dial-queue", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();

    mocks.getDialerUser.mockResolvedValue({ id: "user-1" });
    mocks.queueLeadIdsForUser.mockResolvedValue({
      queuedIds: ["lead-1"],
      conflictedIds: [],
      missingIds: [],
    });
  });

  it("returns success even when dialer_events audit logging fails", async () => {
    const insert = vi.fn().mockResolvedValue({
      error: { message: "dialer_events relation missing" },
    });

    mocks.createDialerClient.mockReturnValue({
      from(table: string) {
        if (table !== "dialer_events") {
          throw new Error(`Unexpected table ${table}`);
        }

        return { insert };
      },
    });

    const { POST } = await import("@/app/api/dialer/v1/dial-queue/route");
    const response = await POST(
      new Request("http://localhost/api/dialer/v1/dial-queue", {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ leadIds: ["lead-1"] }),
      }) as never,
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      queuedIds: ["lead-1"],
      conflictedIds: [],
      missingIds: [],
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
