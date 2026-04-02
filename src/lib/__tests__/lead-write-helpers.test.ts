import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
    },
  },
}));

describe("lead-write-helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "test-token",
        },
      },
    });
  });

  it("uses the batch delete endpoint and normalizes the response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        deletedLeadIds: ["lead-1"],
        skippedLeadIds: ["lead-2"],
        deletedProperties: 1,
        failed: [],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        deletedLeadIds: ["lead-1"],
        skippedLeadIds: [],
        deletedProperties: 1,
        failed: [],
      }), { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    const { deleteLeadCustomerFile, deleteLeadCustomerFiles } = await import("@/lib/lead-write-helpers");

    await expect(deleteLeadCustomerFiles(["lead-1", "lead-2"])).resolves.toEqual({
      ok: true,
      deletedLeadIds: ["lead-1"],
      skippedLeadIds: ["lead-2"],
      deletedProperties: 1,
      failed: [],
    });

    await expect(deleteLeadCustomerFile("lead-1")).resolves.toEqual({
      ok: true,
      propertyDeleted: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/leads/batch", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      }),
    }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns an error result when the batch endpoint fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    ));

    const { deleteLeadCustomerFiles } = await import("@/lib/lead-write-helpers");

    await expect(deleteLeadCustomerFiles(["lead-1"])).resolves.toEqual({
      ok: false,
      status: 500,
      error: "boom",
    });
  });
});
