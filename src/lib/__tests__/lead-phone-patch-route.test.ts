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

type RecordedOperation = {
  table: string;
  action: "update" | "insert" | "upsert";
  payload: Record<string, unknown>;
  conditions: Array<{ type: "eq" | "neq"; field: string; value: unknown }>;
};

function createMockSupabase() {
  const operations: RecordedOperation[] = [];
  const phoneRecord = {
    id: "phone-1",
    lead_id: "lead-1",
    phone: "+15095551234",
    status: "active",
    is_primary: false,
    property_id: "property-1",
  };

  function buildQuery(table: string) {
    const state: {
      selectArgs?: unknown[];
      updatePayload?: Record<string, unknown>;
      insertPayload?: Record<string, unknown>;
      upsertPayload?: Record<string, unknown>;
      conditions: Array<{ type: "eq" | "neq"; field: string; value: unknown }>;
    } = {
      conditions: [],
    };

    const query = {
      select(...args: unknown[]) {
        state.selectArgs = args;
        return query;
      },
      update(payload: Record<string, unknown>) {
        state.updatePayload = payload;
        return query;
      },
      insert(payload: Record<string, unknown>) {
        state.insertPayload = payload;
        return query;
      },
      upsert(payload: Record<string, unknown>) {
        state.upsertPayload = payload;
        return query;
      },
      eq(field: string, value: unknown) {
        state.conditions.push({ type: "eq", field, value });
        return query;
      },
      neq(field: string, value: unknown) {
        state.conditions.push({ type: "neq", field, value });
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      single: vi.fn(async () => {
        if (table === "lead_phones") {
          return { data: phoneRecord, error: null };
        }
        if (table === "properties") {
          return { data: null, error: null };
        }
        throw new Error(`Unexpected single() on ${table}`);
      }),
      then(resolve: (value: unknown) => unknown) {
        const action = state.updatePayload
          ? "update"
          : state.insertPayload
            ? "insert"
            : state.upsertPayload
              ? "upsert"
              : null;

        if (table === "lead_phones" && state.selectArgs?.[1] && typeof state.selectArgs[1] === "object") {
          return Promise.resolve(resolve({ count: 2, error: null }));
        }

        if (action) {
          operations.push({
            table,
            action,
            payload: state.updatePayload ?? state.insertPayload ?? state.upsertPayload ?? {},
            conditions: [...state.conditions],
          });
        }

        return Promise.resolve(resolve({ error: null }));
      },
    };

    return query;
  }

  return {
    operations,
    client: {
      from(table: string) {
        return buildQuery(table);
      },
    },
  };
}

describe("PATCH /api/leads/[id]/phones/[phoneId]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-1" });
  });

  it("promotes an active phone to the primary callback number", async () => {
    const { client, operations } = createMockSupabase();
    mocks.createServerClient.mockReturnValue(client);

    const { PATCH } = await import("@/app/api/leads/[id]/phones/[phoneId]/route");
    const response = await PATCH(
      new Request("http://localhost/api/leads/lead-1/phones/phone-1", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: "Bearer token" },
        body: JSON.stringify({ mark_primary: true }),
      }) as never,
      { params: Promise.resolve({ id: "lead-1", phoneId: "phone-1" }) },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.mark_primary).toBe(true);
    expect(payload.new_primary_phone).toBe("+15095551234");

    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "lead_phones",
          action: "update",
          payload: expect.objectContaining({ is_primary: false }),
          conditions: expect.arrayContaining([
            { type: "eq", field: "lead_id", value: "lead-1" },
            { type: "neq", field: "id", value: "phone-1" },
          ]),
        }),
        expect.objectContaining({
          table: "lead_phones",
          action: "update",
          payload: expect.objectContaining({ is_primary: true }),
          conditions: expect.arrayContaining([
            { type: "eq", field: "id", value: "phone-1" },
          ]),
        }),
        expect.objectContaining({
          table: "properties",
          action: "update",
          payload: expect.objectContaining({ owner_phone: "+15095551234" }),
          conditions: expect.arrayContaining([
            { type: "eq", field: "id", value: "property-1" },
          ]),
        }),
      ]),
    );
  });
});
