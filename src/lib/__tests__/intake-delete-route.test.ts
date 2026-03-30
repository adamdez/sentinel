import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAuthMock, createServerClientMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  createServerClientMock: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: requireAuthMock,
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: createServerClientMock,
}));

import { DELETE } from "@/app/api/intake/[id]/route";

describe("DELETE /api/intake/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ id: "user-1" });
  });

  it("deletes an intake lead and returns the deleted status", async () => {
    const deleteEqMock = vi.fn().mockResolvedValue({ error: null });
    const selectMaybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "intake-1",
        status: "pending_review",
      },
      error: null,
    });

    const sb = {
      from: vi.fn((table: string) => {
        if (table !== "intake_leads") {
          throw new Error(`Unexpected table ${table}`);
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: selectMaybeSingleMock,
            })),
          })),
          delete: vi.fn(() => ({
            eq: deleteEqMock,
          })),
        };
      }),
    };

    createServerClientMock.mockReturnValue(sb);

    const request = new NextRequest("http://localhost/api/intake/intake-1", {
      method: "DELETE",
      headers: {
        authorization: "Bearer test-token",
      },
    });

    const response = await DELETE(request, {
      params: Promise.resolve({ id: "intake-1" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      intake_lead_id: "intake-1",
      deleted_status: "pending_review",
    });
    expect(deleteEqMock).toHaveBeenCalledWith("id", "intake-1");
  });
});
