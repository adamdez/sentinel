import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  scrubLead: vi.fn(),
  captureStageTransition: vi.fn(),
  refreshZillowEstimateForLeadAssignment: vi.fn(),
  inngestSend: vi.fn(),
  syncLeadPhoneOutcome: vi.fn(),
  isPhoneDispositionRelevant: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/compliance", () => ({
  scrubLead: mocks.scrubLead,
}));

vi.mock("@/lib/conversion-tracking", () => ({
  captureStageTransition: mocks.captureStageTransition,
}));

vi.mock("@/lib/zillow-estimate", () => ({
  refreshZillowEstimateForLeadAssignment: mocks.refreshZillowEstimateForLeadAssignment,
}));

vi.mock("@/inngest/client", () => ({
  inngest: {
    send: mocks.inngestSend,
  },
}));

vi.mock("@/lib/lead-phone-outcome", () => ({
  syncLeadPhoneOutcome: (...args: unknown[]) => mocks.syncLeadPhoneOutcome(...args),
  isPhoneDispositionRelevant: (...args: unknown[]) => mocks.isPhoneDispositionRelevant(...args),
}));

type BuildServerClientParams = {
  leadNotes?: string | null;
  activityNotes?: string[];
};

function buildServerClient({ leadNotes = null, activityNotes = [] }: BuildServerClientParams = {}) {
  const leadRow = {
    status: "lead",
    lock_version: 2,
    notes: leadNotes,
    qualification_route: null,
    qualification_score_total: null,
    assigned_to: "user-1",
    property_id: null,
    last_contact_at: null,
    total_calls: 0,
    disposition_code: null,
    next_call_scheduled_at: null,
    next_follow_up_at: null,
    motivation_level: null,
    seller_timeline: null,
    condition_level: null,
    decision_maker_confirmed: false,
    price_expectation: null,
    occupancy_score: null,
    equity_flexibility_score: null,
    next_action: "Initial seller outreach",
    next_action_due_at: null,
  };

  const leadSingle = vi.fn().mockResolvedValue({ data: leadRow, error: null });
  const leadSelectQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: leadSingle,
    maybeSingle: vi.fn().mockResolvedValue({ data: leadRow, error: null }),
  };

  const leadUpdateSelect = vi.fn().mockResolvedValue({ data: [{ id: "lead-1" }], error: null });
  const leadUpdateEqLock = vi.fn().mockReturnValue({ select: leadUpdateSelect });
  const leadUpdateEqId = vi.fn().mockReturnValue({ eq: leadUpdateEqLock });
  const leadUpdateQuery = {
    update: vi.fn((payload: Record<string, unknown>) => {
      Object.assign(leadRow, payload);
      return { eq: leadUpdateEqId };
    }),
  };

  const callsLogLimit = vi.fn().mockResolvedValue({
    data: activityNotes.map((notes) => ({ notes })),
    error: null,
  });
  const callsLogQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: callsLogLimit,
  };

  const tasksMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const tasksSingle = vi.fn().mockResolvedValue({ data: { id: "task-1" }, error: null });
  const tasksSelectQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: tasksMaybeSingle,
    single: tasksSingle,
  };
  const tasksInsertQuery = {
    select: vi.fn().mockReturnValue({ single: tasksSingle }),
  };
  const tasksInsert = vi.fn().mockReturnValue(tasksInsertQuery);
  const tasksUpdateQuery = {
    eq: vi.fn().mockResolvedValue({ error: null }),
    in: vi.fn().mockResolvedValue({ error: null }),
  };

  const auditLogsQuery = {
    insert: vi.fn().mockResolvedValue({ error: null }),
  };
  const eventLogQuery = {
    insert: vi.fn().mockResolvedValue({ error: null }),
  };

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
    },
    from(table: string) {
      if (table === "leads") {
        return {
          ...leadSelectQuery,
          ...leadUpdateQuery,
        };
      }
      if (table === "calls_log") return callsLogQuery;
      if (table === "tasks") {
        return {
          ...tasksSelectQuery,
          insert: tasksInsert,
          update: vi.fn().mockReturnValue(tasksUpdateQuery),
        };
      }
      if (table === "audit_logs") return auditLogsQuery;
      if (table === "event_log") return eventLogQuery;
      throw new Error(`Unexpected table ${table}`);
    },
    callsLogLimit,
    leadUpdateSelect,
    tasksInsert,
  };
}

describe("PATCH /api/prospects", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.scrubLead.mockResolvedValue({ allowed: true, blockedReasons: [], reason: null });
    mocks.captureStageTransition.mockResolvedValue(undefined);
    mocks.refreshZillowEstimateForLeadAssignment.mockResolvedValue(undefined);
    mocks.inngestSend.mockResolvedValue(undefined);
    mocks.syncLeadPhoneOutcome.mockResolvedValue({
      handled: true,
      applied: true,
      phoneId: "phone-1",
      previousStatus: "active",
      newStatus: "dead",
      newPrimaryPhone: "+15095550000",
      allPhonesDead: false,
      reason: null,
    });
    mocks.isPhoneDispositionRelevant.mockImplementation((disposition: unknown) =>
      ["wrong_number", "disconnected", "do_not_call"].includes(String(disposition ?? "")),
    );
  });

  it("allows moving to active when prior calls_log notes exist", async () => {
    const serverClient = buildServerClient({ activityNotes: ["seller asked for a callback"] });
    mocks.createServerClient.mockReturnValue(serverClient);

    const { PATCH } = await import("@/app/api/prospects/route");
    const response = await PATCH(new Request("http://localhost/api/prospects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
        "x-lock-version": "2",
      },
      body: JSON.stringify({
        lead_id: "lead-1",
        status: "active",
        next_action: "Initial seller outreach",
        next_action_due_at: null,
      }),
    }) as never);

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("active");
    expect(serverClient.callsLogLimit).toHaveBeenCalledOnce();
    expect(serverClient.leadUpdateSelect).toHaveBeenCalledOnce();
  });

  it("blocks moving to active when neither lead notes nor activity notes exist", async () => {
    const serverClient = buildServerClient();
    mocks.createServerClient.mockReturnValue(serverClient);

    const { PATCH } = await import("@/app/api/prospects/route");
    const response = await PATCH(new Request("http://localhost/api/prospects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
        "x-lock-version": "2",
      },
      body: JSON.stringify({
        lead_id: "lead-1",
        status: "active",
        next_action: "Initial seller outreach",
        next_action_due_at: null,
      }),
    }) as never);

    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error).toBe("Missing stage prerequisites");
    expect(payload.detail).toContain("prior note");
    expect(serverClient.callsLogLimit).toHaveBeenCalledOnce();
    expect(serverClient.leadUpdateSelect).not.toHaveBeenCalled();
  });

  it("blocks moving to nurture when the next step is only a generic callback", async () => {
    const serverClient = buildServerClient();
    mocks.createServerClient.mockReturnValue(serverClient);

    const { PATCH } = await import("@/app/api/prospects/route");
    const response = await PATCH(new Request("http://localhost/api/prospects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
        "x-lock-version": "2",
      },
      body: JSON.stringify({
        lead_id: "lead-1",
        status: "nurture",
        next_action: "Call back in 6 months",
        next_action_due_at: "2026-10-10T16:00:00.000Z",
        next_follow_up_at: "2026-10-10T16:00:00.000Z",
        note_append: "Family asked for a longer-term follow-up.",
      }),
    }) as never);

    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.detail).toContain("nurture next step");
    expect(serverClient.leadUpdateSelect).not.toHaveBeenCalled();
  });

  it("creates only one canonical follow-up task when saving a nurture closeout", async () => {
    const serverClient = buildServerClient();
    mocks.createServerClient.mockReturnValue(serverClient);

    const { PATCH } = await import("@/app/api/prospects/route");
    const response = await PATCH(new Request("http://localhost/api/prospects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
        "x-lock-version": "2",
      },
      body: JSON.stringify({
        lead_id: "lead-1",
        qualification_route: "nurture",
        next_action: "Nurture check-in in 6 months",
        next_action_due_at: "2026-10-10T16:00:00.000Z",
        next_follow_up_at: "2026-10-10T16:00:00.000Z",
        note_append: "Family requested we revisit this after the estate clears.",
      }),
    }) as never);

    expect(response.status).toBe(200);
    expect(serverClient.tasksInsert).toHaveBeenCalledTimes(1);
    expect(serverClient.tasksInsert.mock.calls[0]?.[0]).toMatchObject({
      title: "Nurture check-in in 6 months",
      source_type: "lead_follow_up",
      source_key: "lead:lead-1:primary_call",
    });
  });

  it("syncs canonical phone state for wrong-number closeouts when a phone number is provided", async () => {
    const serverClient = buildServerClient();
    mocks.createServerClient.mockReturnValue(serverClient);

    const { PATCH } = await import("@/app/api/prospects/route");
    const response = await PATCH(new Request("http://localhost/api/prospects", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer token",
        "x-lock-version": "2",
      },
      body: JSON.stringify({
        lead_id: "lead-1",
        disposition_code: "wrong_number",
        note_append: "Reached the wrong party on this number.",
        phone_number: "+15095551234",
      }),
    }) as never);

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.syncLeadPhoneOutcome).toHaveBeenCalledWith(expect.objectContaining({
      leadId: "lead-1",
      userId: "user-1",
      disposition: "wrong_number",
      phoneNumber: "+15095551234",
    }));
    expect(payload.phone_outcome_applied).toBe(true);
    expect(payload.phone_outcome_phone_id).toBe("phone-1");
  });
});
