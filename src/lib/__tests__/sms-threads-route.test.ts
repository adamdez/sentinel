import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDialerClient: vi.fn(),
  getDialerUser: vi.fn(),
  resolveSmsLead: vi.fn(),
  backfillSmsLeadForPhone: vi.fn(),
}));

vi.mock("@/lib/dialer/db", () => ({
  createDialerClient: mocks.createDialerClient,
  getDialerUser: mocks.getDialerUser,
}));

vi.mock("@/lib/sms/lead-resolution", () => ({
  resolveSmsLead: (...args: unknown[]) => mocks.resolveSmsLead(...args),
  backfillSmsLeadForPhone: (...args: unknown[]) => mocks.backfillSmsLeadForPhone(...args),
}));

type QueryState = {
  gte: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
};

function createMockClient() {
  return {
    from(table: string) {
      const state: QueryState = { gte: [], in: [] };
      const builder = {
        select() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        gte(field: string, value: unknown) {
          state.gte.push([field, value]);
          return builder;
        },
        in(field: string, values: unknown[]) {
          state.in.push([field, values]);
          return builder;
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve(resolve(resolveQuery(table, state))).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

function resolveQuery(table: string, state: QueryState) {
  if (table === "sms_messages") {
    expect(state.gte).toEqual(expect.arrayContaining([["created_at", expect.any(String)]]));
    return {
      data: [
        {
          id: "msg-1",
          phone: "+15095551234",
          direction: "inbound",
          body: "Checking back on 906 E Vicksburg Ave",
          lead_id: "lead-1",
          read_at: null,
          created_at: "2026-04-10T16:00:00.000Z",
        },
      ],
      error: null,
    };
  }

  if (table === "leads") {
    return { data: [{ id: "lead-1", property_id: "property-1" }], error: null };
  }

  if (table === "properties") {
    return {
      data: [{
        id: "property-1",
        owner_name: "Melissa Donahue",
        address: "906 E Vicksburg Ave",
        city: "Spokane",
        state: "WA",
        zip: "99207",
      }],
      error: null,
    };
  }

  return { data: [], error: null };
}

describe("GET /api/twilio/sms/threads", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.getDialerUser.mockResolvedValue({ id: "user-1" });
    mocks.createDialerClient.mockReturnValue(createMockClient());
    mocks.resolveSmsLead.mockResolvedValue({
      leadId: null,
      ownerName: null,
      propertyAddress: null,
      assignedTo: null,
      matchReason: null,
      matchSource: null,
      resolutionState: "unresolved",
      suggestedMatch: null,
      candidateMatches: [],
    });
    mocks.backfillSmsLeadForPhone.mockResolvedValue(undefined);
  });

  it("limits threads to the last 7 days and includes searchable property metadata", async () => {
    const { GET } = await import("@/app/api/twilio/sms/threads/route");

    const response = await GET(new Request("http://localhost/api/twilio/sms/threads", {
      headers: { authorization: "Bearer token" },
    }) as never);

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.threads).toHaveLength(1);
    expect(payload.threads[0]).toMatchObject({
      phone: "+15095551234",
      leadId: "lead-1",
      leadName: "Melissa Donahue",
      propertyAddress: "906 E Vicksburg Ave, Spokane, WA, 99207",
      lastMessage: "Checking back on 906 E Vicksburg Ave",
    });
  });
});
