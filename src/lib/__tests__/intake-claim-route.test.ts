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

import { POST } from "@/app/api/intake/claim/route";

describe("POST /api/intake/claim", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ id: "user-1" });
  });

  it("recovers cleanly when a lead already exists for the intake row", async () => {
    const updateEqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn(() => ({ eq: updateEqMock }));

    const intakeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "intake-1",
        status: "pending_review",
        source_category: "Lead House",
      },
      error: null,
    });

    const leadsMaybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "lead-1",
        source_category: "Lead House",
      },
      error: null,
    });

    const sb = {
      from: vi.fn((table: string) => {
        if (table === "intake_leads") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: intakeSingleMock,
              })),
            })),
            update: updateMock,
          };
        }

        if (table === "leads") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: leadsMaybeSingleMock,
                  })),
                })),
              })),
            })),
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }),
    };

    createServerClientMock.mockReturnValue(sb);

    const request = new NextRequest("http://localhost/api/intake/claim", {
      method: "POST",
      body: JSON.stringify({
        intake_lead_id: "intake-1",
        provider_id: "provider-1",
      }),
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer test-token",
      },
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      lead_id: "lead-1",
      source_category: "Lead House",
      intake_lead_id: "intake-1",
      recovered_existing_lead: true,
    });
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "claimed",
        claimed_by: "user-1",
        source_category: "Lead House",
      }),
    );
    expect(updateEqMock).toHaveBeenCalledWith("id", "intake-1");
  });
});
