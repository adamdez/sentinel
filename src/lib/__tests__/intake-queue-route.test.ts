import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: mocks.createServerClient,
}));

function createIntakeClient(options?: {
  status?: string;
  missing?: boolean;
  updateError?: { message: string };
  deleteError?: { message: string };
}) {
  const status = options?.status ?? "pending_review";
  const eventInsert = vi.fn().mockResolvedValue({ error: null });

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
                  single: vi.fn().mockResolvedValue(
                    options?.missing
                      ? { data: null, error: { message: "missing" } }
                      : { data: { id: "intake-1", status }, error: null },
                  ),
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            return {
              eq() {
                return {
                  select() {
                    return {
                      single: vi.fn().mockResolvedValue(
                        options?.updateError
                          ? { data: null, error: options.updateError }
                          : { data: { id: "intake-1", status, ...payload }, error: null },
                      ),
                    };
                  },
                };
              },
            };
          },
          delete() {
            return {
              eq: vi.fn().mockResolvedValue(
                options?.deleteError ? { error: options.deleteError } : { error: null },
              ),
            };
          },
        };
      }

      if (table === "event_log") {
        return {
          insert: eventInsert,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("/api/intake/queue mutations", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("updates an unclaimed intake lead", async () => {
    mocks.createServerClient.mockReturnValue(createIntakeClient());

    const { PATCH } = await import("@/app/api/intake/queue/route");
    const response = await PATCH(
      new Request("http://localhost/api/intake/queue", {
        method: "PATCH",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          intake_lead_id: "intake-1",
          owner_name: "Updated Name",
          property_city: "Spokane",
        }),
      }) as never,
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      lead: {
        id: "intake-1",
        owner_name: "Updated Name",
        property_city: "Spokane",
      },
    });
  });

  it("rejects deleting a claimed intake lead", async () => {
    mocks.createServerClient.mockReturnValue(createIntakeClient({ status: "claimed" }));

    const { DELETE } = await import("@/app/api/intake/queue/route");
    const response = await DELETE(
      new Request("http://localhost/api/intake/queue", {
        method: "DELETE",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ intake_lead_id: "intake-1" }),
      }) as never,
    );

    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      error: "Claimed intake leads cannot be deleted from intake queue",
    });
  });
});
