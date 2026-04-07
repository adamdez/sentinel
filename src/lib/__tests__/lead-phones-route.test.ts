import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/api-auth", () => ({
  requireAuth: mocks.requireAuth,
}));

describe("GET /api/leads/[id]/phones", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-1" });
  });

  it("falls back to legacy owner_flags phone arrays when lead_phones is empty", async () => {
    const leadSingle = vi.fn().mockResolvedValue({ data: { property_id: "property-1" }, error: null });
    const propertySingle = vi.fn().mockResolvedValue({
      data: {
        owner_phone: null,
        owner_flags: {
          all_phones: [
            { number: "(509) 111-2222" },
            { phone: "+1 (509) 333-4444" },
          ],
          manual_phones: ["509-555-6666"],
        },
      },
      error: null,
    });
    const leadPhonesSecondOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const leadPhonesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnValue({
        order: leadPhonesSecondOrder,
      }),
    };
    const leadsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({
        single: leadSingle,
      }),
    };
    const propertiesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({
        single: propertySingle,
      }),
    };

    mocks.createServerClient.mockReturnValue({
      from(table: string) {
        if (table === "lead_phones") return leadPhonesQuery;
        if (table === "leads") return leadsQuery;
        if (table === "properties") return propertiesQuery;
        throw new Error(`Unexpected table ${table}`);
      },
    });

    const { GET } = await import("@/app/api/leads/[id]/phones/route");
    const response = await GET(
      new Request("http://localhost/api/leads/lead-1/phones", {
        method: "GET",
        headers: { authorization: "Bearer token" },
      }) as never,
      { params: Promise.resolve({ id: "lead-1" }) },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.active_count).toBe(3);
    expect(payload.phones).toHaveLength(3);
    expect(payload.phones.map((phone: { phone: string }) => phone.phone)).toEqual([
      "+15091112222",
      "+15093334444",
      "+15095556666",
    ]);
    expect(payload.next_phone.phone).toBe("+15091112222");
  });
});
