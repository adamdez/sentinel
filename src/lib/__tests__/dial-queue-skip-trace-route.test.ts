import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDialerClient: vi.fn(),
  getDialerUser: vi.fn(),
  runSkipTraceIntel: vi.fn(),
}));

vi.mock("@/lib/dialer/db", () => ({
  createDialerClient: mocks.createDialerClient,
  getDialerUser: mocks.getDialerUser,
}));

vi.mock("@/lib/skiptrace-intel", () => ({
  runSkipTraceIntel: (...args: unknown[]) => mocks.runSkipTraceIntel(...args),
}));

function createRouteSb(rows: Array<Record<string, unknown>>) {
  const leads = rows;

  const buildSelectChain = (
    currentRows: Array<Record<string, unknown>>,
    includesSkipTraceStatus: boolean,
  ) => ({
    eq(column: string, value: unknown) {
      return buildSelectChain(
        currentRows.filter((row) => row[column] === value),
        includesSkipTraceStatus,
      );
    },
    order() {
      if (includesSkipTraceStatus) {
        return Promise.resolve({
          data: null,
          error: { message: "column leads.skip_trace_status does not exist", code: "42703" },
        });
      }
      return Promise.resolve({ data: [...currentRows], error: null });
    },
  });

  return {
    from(table: string) {
      if (table === "dialer_events") {
        return {
          insert: async () => ({ error: null }),
        };
      }

      if (table !== "leads") {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select(columns?: string) {
          return buildSelectChain(leads, typeof columns === "string" && columns.includes("skip_trace_status"));
        },
        update() {
          return {
            eq() {
              return {
                error: { message: "column leads.skip_trace_status does not exist", code: "42703" },
              };
            },
          };
        },
      };
    },
  };
}

describe("POST /api/dialer/v1/dial-queue/skip-trace", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();

    mocks.getDialerUser.mockResolvedValue({ id: "adam" });
    mocks.runSkipTraceIntel.mockResolvedValue({
      ran: true,
      reason: "completed",
      phonesFound: 2,
      emailsFound: 0,
      newFactsCreated: 1,
      phonesPromoted: 2,
      saveFailures: 0,
      saveErrors: [],
      providers: ["tracerfy"],
    });
  });

  it("returns success when skip-trace status columns are missing but the fallback path succeeds", async () => {
    mocks.createDialerClient.mockReturnValue(createRouteSb([
      {
        id: "lead-1",
        property_id: "prop-1",
        assigned_to: "adam",
        dial_queue_active: true,
        properties: {
          id: "prop-1",
          address: "123 Main",
          city: "Spokane",
          state: "WA",
          zip: "99201",
          owner_name: "A Owner",
          owner_flags: {},
        },
      },
    ]));

    const { POST } = await import("@/app/api/dialer/v1/dial-queue/skip-trace/route");
    const response = await POST(new Request("http://localhost/api/dialer/v1/dial-queue/skip-trace", {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
      },
    }) as never);

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      summary: {
        checked: 1,
        tracedNow: 1,
        skippedAlreadyTraced: 0,
        failed: 0,
        phonesSaved: 2,
      },
    });
    expect(mocks.runSkipTraceIntel).toHaveBeenCalledTimes(1);
  });
});
