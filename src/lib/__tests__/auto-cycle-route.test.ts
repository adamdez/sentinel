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
  getQueuedLeadRows?: Record<string, unknown>[];
  getCycleLeadRows?: Record<string, unknown>[];
  getPhoneRows?: Record<string, unknown>[];
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
              const queuedRows = config.getQueuedLeadRows ?? null;
              if (queuedRows) {
                let rows = [...queuedRows];
                const chain = {
                  eq(column: string, value: unknown) {
                    rows = rows.filter((row) => row[column] === value);
                    return chain;
                  },
                  in(column: string, values: unknown[]) {
                    rows = rows.filter((row) => values.includes(row[column]));
                    return chain;
                  },
                  order() {
                    return chain;
                  },
                  limit() {
                    return Promise.resolve({ data: rows, error: null });
                  },
                  then(onFulfilled: (value: { data: Record<string, unknown>[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
                    return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
                  },
                  single: async () => leadResolver({ id: "lead-1" }),
                };
                return chain;
              }
              return buildMaybeSingleChain(leadResolver);
            },
          };
        }

        if (table === "dialer_auto_cycle_leads") {
          return {
            select() {
              if (config.getCycleLeadRows) {
                let rows = [...config.getCycleLeadRows];
                const chain = {
                  eq(column: string, value: unknown) {
                    rows = rows.filter((row) => row[column] === value);
                    return chain;
                  },
                  in(column: string, values: unknown[]) {
                    rows = rows.filter((row) => values.includes(row[column]));
                    return chain;
                  },
                  order() {
                    return chain;
                  },
                  limit() {
                    return Promise.resolve({ data: rows, error: null });
                  },
                  then(onFulfilled: (value: { data: Record<string, unknown>[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
                    return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
                  },
                  single: async () => cycleLeadResolver({ lead_id: "lead-1", user_id: "user-1" }),
                };
                return chain;
              }
              return buildMaybeSingleChain(cycleLeadResolver);
            },
            update,
          };
        }

        if (table === "dialer_auto_cycle_phones") {
          return {
            select() {
              if (config.getPhoneRows) {
                let rows = [...config.getPhoneRows];
                const chain = {
                  in(column: string, values: unknown[]) {
                    rows = rows.filter((row) => values.includes(row[column]));
                    return chain;
                  },
                  order() {
                    return chain;
                  },
                  then(onFulfilled: (value: { data: Record<string, unknown>[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
                    return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
                  },
                  single: async () => phoneResolver({ cycle_lead_id: "cycle-1", phone_id: "phone-2", phone_status: "active" }),
                };
                return chain;
              }
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

describe("GET /api/dialer/v1/auto-cycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.getDialerUser.mockResolvedValue({ id: "user-1" });
  });

  it("returns the same staged queue and marks queued leads without cycle state as not enrolled", async () => {
    mocks.createDialerClient.mockReturnValue(createRouteClient({
      getQueuedLeadRows: [
        {
          id: "lead-1",
          assigned_to: "user-1",
          dial_queue_active: true,
          status: "lead",
          priority: 10,
          properties: { owner_phone: "+15095550000" },
        },
        {
          id: "lead-2",
          assigned_to: "user-1",
          dial_queue_active: true,
          status: "lead",
          priority: 50,
          properties: { owner_phone: "+15095550001" },
        },
      ],
      getCycleLeadRows: [
        {
          id: "cycle-2",
          lead_id: "lead-2",
          user_id: "user-1",
          cycle_status: "ready",
          current_round: 1,
          next_due_at: "2026-04-01T18:00:00.000Z",
          next_phone_id: "phone-2",
          last_outcome: null,
          exit_reason: null,
        },
      ],
      getPhoneRows: [
        {
          id: "cycle-phone-2",
          cycle_lead_id: "cycle-2",
          lead_id: "lead-2",
          phone_id: "phone-2",
          phone: "+15095552222",
          phone_position: 0,
          attempt_count: 0,
          next_attempt_number: 1,
          next_due_at: "2026-04-01T18:00:00.000Z",
          last_attempt_at: null,
          last_outcome: null,
          voicemail_drop_next: false,
          phone_status: "active",
          exit_reason: null,
        },
      ],
    }).client);

    const { GET } = await import("@/app/api/dialer/v1/auto-cycle/route");
    const response = await GET(new Request("http://localhost/api/dialer/v1/auto-cycle?limit=10", {
      method: "GET",
      headers: {
        authorization: "Bearer test-token",
      },
    }) as never);

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.items).toHaveLength(2);
    const readyItem = payload.items.find((item: { lead: { id: string }; power_dial_state: string }) => item.lead.id === "lead-2");
    const queuedItem = payload.items.find((item: { lead: { id: string }; power_dial_state: string; auto_cycle: unknown }) => item.lead.id === "lead-1");

    expect(readyItem?.power_dial_state).toBe("ready");
    expect(queuedItem?.power_dial_state).toBe("not_enrolled");
    expect(queuedItem?.auto_cycle).toBeNull();
  });
});
