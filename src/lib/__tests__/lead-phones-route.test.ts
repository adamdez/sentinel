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

describe("POST /api/leads/[id]/phones", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-1" });
  });

  it("adds a canonical lead_phone row and syncs primary owner_phone", async () => {
    const operations: Array<{
      table: string;
      action: "update" | "insert";
      payload: Record<string, unknown>;
      conditions: Array<{ field: string; value: unknown }>;
    }> = [];

    const leadPhonesQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            { id: "phone-old", phone: "+15095550000", position: 0, is_primary: true, status: "active" },
          ],
          error: null,
        }),
      }),
      update(payload: Record<string, unknown>) {
        operations.push({ table: "lead_phones", action: "update", payload, conditions: [] });
        return {
          eq(field: string, value: unknown) {
            operations[operations.length - 1].conditions.push({ field, value });
            return Promise.resolve({ error: null });
          },
        };
      },
      insert(payload: Record<string, unknown>) {
        operations.push({ table: "lead_phones", action: "insert", payload, conditions: [] });
        return {
          select() {
            return {
              single: vi.fn().mockResolvedValue({
                data: { id: "phone-new", phone: payload.phone, is_primary: payload.is_primary },
                error: null,
              }),
            };
          },
        };
      },
    };

    const leadsQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: "lead-1", property_id: "property-1" }, error: null }),
      }),
    };

    const propertiesQuery = {
      update(payload: Record<string, unknown>) {
        operations.push({ table: "properties", action: "update", payload, conditions: [] });
        return {
          eq(field: string, value: unknown) {
            operations[operations.length - 1].conditions.push({ field, value });
            return Promise.resolve({ error: null });
          },
        };
      },
    };

    const eventLogQuery = {
      insert(payload: Record<string, unknown>) {
        operations.push({ table: "event_log", action: "insert", payload, conditions: [] });
        return Promise.resolve({ error: null });
      },
    };

    mocks.createServerClient.mockReturnValue({
      from(table: string) {
        if (table === "lead_phones") return leadPhonesQuery;
        if (table === "leads") return leadsQuery;
        if (table === "properties") return propertiesQuery;
        if (table === "event_log") return eventLogQuery;
        throw new Error(`Unexpected table ${table}`);
      },
    });

    const { POST } = await import("@/app/api/leads/[id]/phones/route");
    const response = await POST(
      new Request("http://localhost/api/leads/lead-1/phones", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer token" },
        body: JSON.stringify({ phone: "(509) 555-1234", label: "mobile", make_primary: true }),
      }) as never,
      { params: Promise.resolve({ id: "lead-1" }) },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "lead_phones",
          action: "update",
          payload: { is_primary: false },
          conditions: [{ field: "lead_id", value: "lead-1" }],
        }),
        expect.objectContaining({
          table: "lead_phones",
          action: "insert",
          payload: expect.objectContaining({
            lead_id: "lead-1",
            property_id: "property-1",
            phone: "+15095551234",
            label: "mobile",
            source: "manual_entry",
            is_primary: true,
          }),
        }),
        expect.objectContaining({
          table: "properties",
          action: "update",
          payload: { owner_phone: "+15095551234" },
          conditions: [{ field: "id", value: "property-1" }],
        }),
      ]),
    );
  });
});
