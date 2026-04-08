import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  runClaimEnrichment: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/intake-claim-enrichment", () => ({
  runClaimEnrichment: mocks.runClaimEnrichment,
}));

function createClaimClient() {
  const leadsInsert = vi.fn().mockImplementation((payload: Record<string, unknown>) => ({
    select() {
      return {
        single: vi.fn().mockResolvedValue({
          data: { id: "lead-1", ...payload },
          error: null,
        }),
      };
    },
  }));

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: { id: "user-1" },
        },
      }),
    },
    from(table: string) {
      if (table === "intake_leads") {
        return {
          select() {
            return {
              eq() {
                return {
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: "intake-1",
                      status: "pending_review",
                      owner_name: "Anna Macpherson",
                      owner_phone: "(509) 342-6379",
                      owner_email: "amac12381@yahoo.com",
                      property_address: "5328 Rail Canyon Road",
                      property_city: "Spokane",
                      property_state: "WA",
                      property_zip: "99006",
                      county: "spokane",
                    },
                    error: null,
                  }),
                };
              },
            };
          },
          update() {
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            };
          },
        };
      }

      if (table === "intake_providers") {
        return {
          select() {
            return {
              eq() {
                return {
                  single: vi.fn().mockResolvedValue({
                    data: { name: "LeadHouse" },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "properties") {
        return {
          upsert(payload: Record<string, unknown>) {
            return {
              select() {
                return {
                  single: vi.fn().mockResolvedValue({
                    data: { id: "property-1", ...payload },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "contacts") {
        return {
          select() {
            return {
              eq() {
                return {
                  limit() {
                    return {
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: null,
                        error: null,
                      }),
                    };
                  },
                };
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            return {
              select() {
                return {
                  single: vi.fn().mockResolvedValue({
                    data: { id: "contact-1", ...payload },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      if (table === "leads") {
        return {
          insert: leadsInsert,
        };
      }

      if (table === "lead_phones" || table === "dialer_events") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
    __spies: {
      leadsInsert,
    },
  };
}

describe("POST /api/intake/claim", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.runClaimEnrichment.mockResolvedValue(undefined);
  });

  it("puts claimed PPL leads straight into Active and assigns the claimer by default", async () => {
    const client = createClaimClient();
    mocks.createServerClient.mockReturnValue(client);

    const { POST } = await import("@/app/api/intake/claim/route");
    const response = await POST(
      new Request("http://localhost/api/intake/claim", {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          intake_lead_id: "intake-1",
          provider_id: "provider-1",
        }),
      }) as never,
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      lead_id: "lead-1",
      source_category: "LeadHouse",
    });

    expect(client.__spies.leadsInsert).toHaveBeenCalledTimes(1);
    expect(client.__spies.leadsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        assigned_to: "user-1",
        next_action: "review",
        from_special_intake: true,
      }),
    );
  });
});
