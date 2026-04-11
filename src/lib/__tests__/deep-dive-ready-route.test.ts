import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDialerClient: vi.fn(),
  getDialerUser: vi.fn(),
}));

vi.mock("@/lib/dialer/db", () => ({
  createDialerClient: mocks.createDialerClient,
  getDialerUser: mocks.getDialerUser,
}));

type LeadRow = {
  id: string;
  assigned_to: string | null;
  status: string | null;
};

type DossierRow = {
  likely_decision_maker: string | null;
  raw_ai_output: Record<string, unknown> | null;
  created_at: string | null;
};

type RouteConfig = {
  lead: LeadRow | null;
  dossier: DossierRow | null;
  updateError?: { message: string } | null;
};

function createRouteClient(config: RouteConfig) {
  const leadFilters: Record<string, unknown> = {};
  const dossierFilters: Record<string, unknown> = {};
  const updatePayloads: Array<Record<string, unknown>> = [];
  const eventPayloads: Array<Record<string, unknown>> = [];

  const leadSelectChain = {
    eq(column: string, value: unknown) {
      leadFilters[column] = value;
      return leadSelectChain;
    },
    maybeSingle: vi.fn(async () => ({
      data: leadFilters.id === "lead-1" ? config.lead : null,
      error: null,
    })),
  };

  const dossierSelectChain = {
    eq(column: string, value: unknown) {
      dossierFilters[column] = value;
      return dossierSelectChain;
    },
    order() {
      return dossierSelectChain;
    },
    limit() {
      return dossierSelectChain;
    },
    maybeSingle: vi.fn(async () => ({
      data: dossierFilters.lead_id === "lead-1" ? config.dossier : null,
      error: null,
    })),
  };

  return {
    updatePayloads,
    eventPayloads,
    client: {
      from(table: string) {
        if (table === "leads") {
          return {
            select() {
              return leadSelectChain;
            },
            update(payload: Record<string, unknown>) {
              updatePayloads.push(payload);
              return {
                eq: vi.fn(async () => ({ error: config.updateError ?? null })),
              };
            },
          };
        }

        if (table === "dossiers") {
          return {
            select() {
              return dossierSelectChain;
            },
          };
        }

        if (table === "dialer_events") {
          return {
            insert(payload: Record<string, unknown>) {
              eventPayloads.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    },
  };
}

describe("POST /api/dialer/v1/deep-dive/[lead_id]/ready", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.getDialerUser.mockResolvedValue({ id: "user-1" });
  });

  it("blocks files that are still missing a confirmed decision-maker", async () => {
    const routeClient = createRouteClient({
      lead: { id: "lead-1", assigned_to: "user-1", status: "lead" },
      dossier: {
        likely_decision_maker: null,
        created_at: "2026-04-10T18:00:00.000Z",
        raw_ai_output: {
          research_run: {
            run_quality: "full",
            research_gaps: [],
          },
        },
      },
    });
    mocks.createDialerClient.mockReturnValue(routeClient.client);

    const { POST } = await import("@/app/api/dialer/v1/deep-dive/[lead_id]/ready/route");
    const response = await POST(
      new Request("http://localhost/api/dialer/v1/deep-dive/lead-1/ready", {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }) as never,
      { params: Promise.resolve({ lead_id: "lead-1" }) },
    );

    const payload = await response.json();
    expect(response.status).toBe(409);
    expect(payload.blockers).toContain("No decision-maker has been confirmed yet.");
    expect(routeClient.updatePayloads).toHaveLength(0);
    expect(routeClient.eventPayloads).toHaveLength(0);
  });

  it("returns the file to calling when the deep-dive readiness gate passes", async () => {
    const routeClient = createRouteClient({
      lead: { id: "lead-1", assigned_to: "user-1", status: "lead" },
      dossier: {
        likely_decision_maker: "Janet Bates",
        created_at: "2026-04-10T18:00:00.000Z",
        raw_ai_output: {
          research_run: {
            run_quality: "fallback",
            research_gaps: [],
          },
        },
      },
    });
    mocks.createDialerClient.mockReturnValue(routeClient.client);

    const { POST } = await import("@/app/api/dialer/v1/deep-dive/[lead_id]/ready/route");
    const response = await POST(
      new Request("http://localhost/api/dialer/v1/deep-dive/lead-1/ready", {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      }) as never,
      { params: Promise.resolve({ lead_id: "lead-1" }) },
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(routeClient.updatePayloads).toHaveLength(1);
    expect(routeClient.updatePayloads[0]).toMatchObject({
      next_action: "Call researched lead",
    });
    expect(routeClient.eventPayloads).toHaveLength(1);
    expect(routeClient.eventPayloads[0]).toMatchObject({
      event_type: "queue.deep_dive.ready",
      lead_id: "lead-1",
      user_id: "user-1",
    });
  });
});
