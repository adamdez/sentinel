import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  applyOfferTerminalStatus: vi.fn(),
  syncOfferStatusSnapshot: vi.fn(),
  appendOfferEventLog: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/offer-manager", () => ({
  applyOfferTerminalStatus: (...args: unknown[]) => mocks.applyOfferTerminalStatus(...args),
  syncOfferStatusSnapshot: (...args: unknown[]) => mocks.syncOfferStatusSnapshot(...args),
  appendOfferEventLog: (...args: unknown[]) => mocks.appendOfferEventLog(...args),
}));

function createWebhookClient() {
  const updates: Array<Record<string, unknown>> = [];

  return {
    updates,
    client: {
      from(table: string) {
        if (table !== "offer_executions") {
          throw new Error(`Unexpected table ${table}`);
        }

        const state: { mode?: "select" | "update"; payload?: Record<string, unknown> } = {};

        return {
          select() {
            state.mode = "select";
            return this;
          },
          eq() {
            if (state.mode === "update") {
              updates.push(state.payload ?? {});
              return Promise.resolve({ error: null });
            }
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return this;
          },
          single: vi.fn(async () => ({
            data: {
              id: "exec-1",
              offer_id: "offer-1",
              sent_at: null,
              completed_at: null,
              voided_at: null,
              offers: {
                deal_id: "deal-1",
                amount: 182000,
                deals: {
                  property_id: "property-1",
                },
              },
            },
            error: null,
          })),
          update(payload: Record<string, unknown>) {
            state.mode = "update";
            state.payload = payload;
            return this;
          },
        };
      },
    },
  };
}

describe("POST /api/webhooks/docusign", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    process.env.DOCUSIGN_CONNECT_KEY = "connect-secret";
    mocks.applyOfferTerminalStatus.mockResolvedValue(undefined);
    mocks.syncOfferStatusSnapshot.mockResolvedValue(undefined);
    mocks.appendOfferEventLog.mockResolvedValue(undefined);
  });

  it("marks completed envelopes as accepted and syncs offer state", async () => {
    const routeClient = createWebhookClient();
    mocks.createServerClient.mockReturnValue(routeClient.client);

    const { POST } = await import("@/app/api/webhooks/docusign/route");
    const response = await POST(new Request("http://localhost/api/webhooks/docusign", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-docusign-connect-key": "connect-secret",
      },
      body: JSON.stringify({
        envelopeId: "env-1",
        status: "completed",
      }),
    }) as never);

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(routeClient.updates[0]?.provider_status).toBe("completed");
    expect(mocks.applyOfferTerminalStatus).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      offerId: "offer-1",
      status: "accepted",
    }));
    expect(mocks.syncOfferStatusSnapshot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      propertyId: "property-1",
      status: "accepted",
    }));
  });
});
