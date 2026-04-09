import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDialerClient: vi.fn(),
  getDialerUser: vi.fn(),
}));

vi.mock("@/lib/dialer/db", () => ({
  createDialerClient: mocks.createDialerClient,
  getDialerUser: mocks.getDialerUser,
}));

type RouteClientConfig = {
  leadRow?: Record<string, unknown> | null;
  cycleLeadRow?: Record<string, unknown> | null;
  phoneRow?: Record<string, unknown> | null;
  updateError?: { message: string } | null;
};

function buildMaybeSingleChain(
  resolver: (filters: Record<string, unknown>) => { data: Record<string, unknown> | null; error: { message: string } | null },
) {
  const filters: Record<string, unknown> = {};
  const chain = {
    eq(column: string, value: unknown) {
      filters[column] = value;
      return chain;
    },
    maybeSingle: async () => resolver(filters),
  };
  return chain;
}

function createRouteClient(config: RouteClientConfig) {
  const leadResolver = (filters: Record<string, unknown>) => ({
    data: filters.id === "lead-1" ? (config.leadRow ?? null) : null,
    error: null,
  });
  const cycleLeadResolver = (filters: Record<string, unknown>) => ({
    data:
      filters.lead_id === "lead-1" && filters.user_id === "user-1"
        ? (config.cycleLeadRow ?? null)
        : null,
    error: null,
  });
  const phoneResolver = (filters: Record<string, unknown>) => ({
    data:
      filters.cycle_lead_id === "cycle-1"
      && filters.phone_id === "phone-2"
      && filters.phone_status === "active"
        ? (config.phoneRow ?? null)
        : null,
    error: null,
  });

  const updateEq = vi.fn().mockResolvedValue({ error: config.updateError ?? null });
  const update = vi.fn(() => ({
    eq: updateEq,
  }));

  return {
    updateEq,
    client: {
      from(table: string) {
        if (table === "leads") {
          return {
            select() {
              return buildMaybeSingleChain(leadResolver);
            },
          };
        }

        if (table === "dialer_auto_cycle_leads") {
          return {
            select() {
              return buildMaybeSingleChain(cycleLeadResolver);
            },
            update,
          };
        }

        if (table === "dialer_auto_cycle_phones") {
          return {
            select() {
              return buildMaybeSingleChain(phoneResolver);
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    },
  };
}

describe("PATCH /api/dialer/v1/auto-cycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.getDialerUser.mockResolvedValue({ id: "user-1" });
  });

  it("saves next_phone_id for a valid active phone on the operator's lead", async () => {
    const routeClient = createRouteClient({
      leadRow: { id: "lead-1", assigned_to: "user-1", status: "lead" },
      cycleLeadRow: { id: "cycle-1" },
      phoneRow: { id: "row-1", phone_id: "phone-2", phone_status: "active" },
    });
    mocks.createDialerClient.mockReturnValue(routeClient.client);

    const { PATCH } = await import("@/app/api/dialer/v1/auto-cycle/route");
    const response = await PATCH(new Request("http://localhost/api/dialer/v1/auto-cycle", {
      method: "PATCH",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ leadId: "lead-1", nextPhoneId: "phone-2" }),
    }) as never);

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      lead_id: "lead-1",
      next_phone_id: "phone-2",
    });
    expect(routeClient.updateEq).toHaveBeenCalledTimes(1);
    expect(routeClient.updateEq).toHaveBeenCalledWith("id", "cycle-1");
  });

  it("rejects phones that are not on the lead's active auto-cycle phone set", async () => {
    mocks.createDialerClient.mockReturnValue(createRouteClient({
      leadRow: { id: "lead-1", assigned_to: "user-1", status: "lead" },
      cycleLeadRow: { id: "cycle-1" },
      phoneRow: null,
    }).client);

    const { PATCH } = await import("@/app/api/dialer/v1/auto-cycle/route");
    const response = await PATCH(new Request("http://localhost/api/dialer/v1/auto-cycle", {
      method: "PATCH",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ leadId: "lead-1", nextPhoneId: "phone-2" }),
    }) as never);

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Selected phone");
  });

  it("rejects inactive or exited phones by requiring an active phone_status match", async () => {
    mocks.createDialerClient.mockReturnValue(createRouteClient({
      leadRow: { id: "lead-1", assigned_to: "user-1", status: "prospect" },
      cycleLeadRow: { id: "cycle-1" },
      phoneRow: null,
    }).client);

    const { PATCH } = await import("@/app/api/dialer/v1/auto-cycle/route");
    const response = await PATCH(new Request("http://localhost/api/dialer/v1/auto-cycle", {
      method: "PATCH",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ leadId: "lead-1", nextPhoneId: "phone-2" }),
    }) as never);

    expect(response.status).toBe(400);
  });

  it("rejects leads owned by another operator", async () => {
    mocks.createDialerClient.mockReturnValue(createRouteClient({
      leadRow: { id: "lead-1", assigned_to: "user-2", status: "lead" },
      cycleLeadRow: { id: "cycle-1" },
      phoneRow: { id: "row-1", phone_id: "phone-2", phone_status: "active" },
    }).client);

    const { PATCH } = await import("@/app/api/dialer/v1/auto-cycle/route");
    const response = await PATCH(new Request("http://localhost/api/dialer/v1/auto-cycle", {
      method: "PATCH",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ leadId: "lead-1", nextPhoneId: "phone-2" }),
    }) as never);

    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain("claimed by you");
  });
});
