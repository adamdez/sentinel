import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateClient = vi.fn();
const mockEvictQueue = vi.fn();
const mockUpsertLeadCallTask = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

vi.mock("@/lib/dial-queue", () => ({
  evictFromDialQueueIfAutoCycleStatusStopsImmediateWork: (...args: unknown[]) => mockEvictQueue(...args),
}));

vi.mock("@/lib/task-lead-sync", () => ({
  upsertLeadCallTask: (...args: unknown[]) => mockUpsertLeadCallTask(...args),
}));

type Row = Record<string, unknown>;

function createSelectChain(rows: Row[]) {
  let working = [...rows];
  const chain = {
    eq(column: string, value: unknown) {
      working = working.filter((row) => row[column] === value);
      return chain;
    },
    order() {
      return chain;
    },
    maybeSingle: async () => ({ data: working[0] ?? null, error: null }),
    then(onFulfilled: (value: { data: Row[]; error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: working, error: null }).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

function createUpdateChain(rows: Row[], patch: Record<string, unknown>) {
  let working = [...rows];
  const chain = {
    eq(column: string, value: unknown) {
      working = working.filter((row) => row[column] === value);
      return chain;
    },
    then(onFulfilled: (value: { error: null }) => unknown, onRejected?: (reason: unknown) => unknown) {
      for (const row of working) {
        Object.assign(row, patch);
      }
      return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

function createMockSupabase(state: {
  lead: Row;
  cycleLead: Row;
  phones: Row[];
}) {
  const cycleLeads = [state.cycleLead];
  const leads = [state.lead];
  const phones = state.phones;

  return {
    from(table: string) {
      if (table === "dialer_auto_cycle_leads") {
        return {
          select() {
            return createSelectChain(cycleLeads);
          },
          update(patch: Record<string, unknown>) {
            return createUpdateChain(cycleLeads, patch);
          },
        };
      }

      if (table === "leads") {
        return {
          select() {
            return createSelectChain(leads);
          },
        };
      }

      if (table === "dialer_auto_cycle_phones") {
        return {
          select() {
            return createSelectChain(phones);
          },
          update(patch: Record<string, unknown>) {
            return createUpdateChain(phones, patch);
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
    rpc() {
      return {
        throwOnError: async () => ({ data: null, error: null }),
      };
    },
  };
}

describe("processAutoCycleOutcome", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T21:00:00.000Z"));
    mockUpsertLeadCallTask.mockResolvedValue(undefined);
    mockEvictQueue.mockResolvedValue(true);
  });

  it("keeps the file ready until every active phone has been worked for the day", async () => {
    const state = {
      lead: {
        id: "lead-1",
        status: "lead",
        assigned_to: "user-1",
      },
      cycleLead: {
        id: "cycle-1",
        lead_id: "lead-1",
        user_id: "user-1",
        cycle_status: "ready",
        current_round: 1,
        next_due_at: "2026-04-09T20:30:00.000Z",
        next_phone_id: "phone-1",
        last_outcome: null,
        exit_reason: null,
      },
      phones: [
        {
          id: "row-1",
          cycle_lead_id: "cycle-1",
          lead_id: "lead-1",
          phone_id: "phone-1",
          phone: "+15095550101",
          phone_position: 1,
          attempt_count: 0,
          next_attempt_number: 1,
          next_due_at: "2026-04-09T20:30:00.000Z",
          last_attempt_at: null,
          last_outcome: null,
          voicemail_drop_next: false,
          phone_status: "active",
          exit_reason: null,
        },
        {
          id: "row-2",
          cycle_lead_id: "cycle-1",
          lead_id: "lead-1",
          phone_id: "phone-2",
          phone: "+15095550102",
          phone_position: 2,
          attempt_count: 0,
          next_attempt_number: 1,
          next_due_at: "2026-04-09T20:30:00.000Z",
          last_attempt_at: null,
          last_outcome: null,
          voicemail_drop_next: false,
          phone_status: "active",
          exit_reason: null,
        },
      ],
    };

    mockCreateClient.mockReturnValue(createMockSupabase(state));
    const { processAutoCycleOutcome } = await import("@/lib/dialer/auto-cycle-outcome");

    const result = await processAutoCycleOutcome({
      leadId: "lead-1",
      disposition: "voicemail",
      phoneNumber: "+15095550101",
      source: "operator",
      userId: "user-1",
    });

    expect(result).toMatchObject({
      ok: true,
      cycleStatus: "ready",
      nextDueAt: "2026-04-09T20:30:00.000Z",
      nextPhoneId: "phone-2",
    });
    expect(state.cycleLead.cycle_status).toBe("ready");
    expect(state.cycleLead.current_round).toBe(1);
    expect(state.phones.filter((phone) => phone.phone_status === "active").map((phone) => phone.next_attempt_number)).toEqual([2, 1]);
    expect(state.phones.filter((phone) => phone.phone_status === "active").map((phone) => phone.next_due_at)).toEqual([
      "2026-04-10T21:00:00.000Z",
      "2026-04-09T20:30:00.000Z",
    ]);
    expect(mockEvictQueue).not.toHaveBeenCalled();
  });

  it("keeps the file ready for same-day cleanup after a disconnected number", async () => {
    const state = {
      lead: {
        id: "lead-1",
        status: "lead",
        assigned_to: "user-1",
      },
      cycleLead: {
        id: "cycle-1",
        lead_id: "lead-1",
        user_id: "user-1",
        cycle_status: "ready",
        current_round: 1,
        next_due_at: "2026-04-09T20:30:00.000Z",
        next_phone_id: "phone-1",
        last_outcome: null,
        exit_reason: null,
      },
      phones: [
        {
          id: "row-1",
          cycle_lead_id: "cycle-1",
          lead_id: "lead-1",
          phone_id: "phone-1",
          phone: "+15095550101",
          phone_position: 1,
          attempt_count: 0,
          next_attempt_number: 1,
          next_due_at: "2026-04-09T20:30:00.000Z",
          last_attempt_at: null,
          last_outcome: null,
          voicemail_drop_next: false,
          phone_status: "active",
          exit_reason: null,
        },
        {
          id: "row-2",
          cycle_lead_id: "cycle-1",
          lead_id: "lead-1",
          phone_id: "phone-2",
          phone: "+15095550102",
          phone_position: 2,
          attempt_count: 0,
          next_attempt_number: 1,
          next_due_at: "2026-04-09T20:30:00.000Z",
          last_attempt_at: null,
          last_outcome: null,
          voicemail_drop_next: false,
          phone_status: "active",
          exit_reason: null,
        },
      ],
    };

    mockCreateClient.mockReturnValue(createMockSupabase(state));
    const { processAutoCycleOutcome } = await import("@/lib/dialer/auto-cycle-outcome");

    const result = await processAutoCycleOutcome({
      leadId: "lead-1",
      disposition: "disconnected",
      phoneNumber: "+15095550101",
      source: "operator",
      userId: "user-1",
    });

    expect(result).toMatchObject({
      ok: true,
      cycleStatus: "ready",
      nextPhoneId: "phone-2",
    });
    expect(state.cycleLead.cycle_status).toBe("ready");
    expect(state.phones.find((phone) => phone.phone_id === "phone-1")?.phone_status).toBe("dead");
    expect(state.phones.find((phone) => phone.phone_id === "phone-2")?.next_due_at).toBe("2026-04-09T20:30:00.000Z");
    expect(mockEvictQueue).not.toHaveBeenCalled();
  });

  it("exits the file on not interested and evicts it from the staged queue", async () => {
    const state = {
      lead: {
        id: "lead-1",
        status: "lead",
        assigned_to: "user-1",
      },
      cycleLead: {
        id: "cycle-1",
        lead_id: "lead-1",
        user_id: "user-1",
        cycle_status: "ready",
        current_round: 1,
        next_due_at: "2026-04-09T20:30:00.000Z",
        next_phone_id: "phone-1",
        last_outcome: null,
        exit_reason: null,
      },
      phones: [
        {
          id: "row-1",
          cycle_lead_id: "cycle-1",
          lead_id: "lead-1",
          phone_id: "phone-1",
          phone: "+15095550101",
          phone_position: 1,
          attempt_count: 0,
          next_attempt_number: 1,
          next_due_at: "2026-04-09T20:30:00.000Z",
          last_attempt_at: null,
          last_outcome: null,
          voicemail_drop_next: false,
          phone_status: "active",
          exit_reason: null,
        },
        {
          id: "row-2",
          cycle_lead_id: "cycle-1",
          lead_id: "lead-1",
          phone_id: "phone-2",
          phone: "+15095550102",
          phone_position: 2,
          attempt_count: 0,
          next_attempt_number: 1,
          next_due_at: "2026-04-09T20:30:00.000Z",
          last_attempt_at: null,
          last_outcome: null,
          voicemail_drop_next: false,
          phone_status: "active",
          exit_reason: null,
        },
      ],
    };

    mockCreateClient.mockReturnValue(createMockSupabase(state));
    const { processAutoCycleOutcome } = await import("@/lib/dialer/auto-cycle-outcome");

    const result = await processAutoCycleOutcome({
      leadId: "lead-1",
      disposition: "not_interested",
      phoneNumber: "+15095550101",
      source: "operator",
      userId: "user-1",
    });

    expect(result).toMatchObject({
      ok: true,
      cycleStatus: "exited",
      nextDueAt: null,
      nextPhoneId: null,
    });
    expect(state.cycleLead.cycle_status).toBe("exited");
    expect(state.phones.every((phone) => phone.phone_status === "exited")).toBe(true);
    expect(mockEvictQueue).toHaveBeenCalled();
  });

  it("evicts a no-response file from the staged queue once today's phones are exhausted", async () => {
    const state = {
      lead: {
        id: "lead-1",
        status: "lead",
        assigned_to: "user-1",
      },
      cycleLead: {
        id: "cycle-1",
        lead_id: "lead-1",
        user_id: "user-1",
        cycle_status: "ready",
        current_round: 1,
        next_due_at: "2026-04-09T20:30:00.000Z",
        next_phone_id: "phone-2",
        last_outcome: null,
        exit_reason: null,
      },
      phones: [
        {
          id: "row-1",
          cycle_lead_id: "cycle-1",
          lead_id: "lead-1",
          phone_id: "phone-1",
          phone: "+15095550101",
          phone_position: 1,
          attempt_count: 1,
          next_attempt_number: 2,
          next_due_at: "2026-04-10T21:00:00.000Z",
          last_attempt_at: "2026-04-09T20:45:00.000Z",
          last_outcome: "voicemail",
          voicemail_drop_next: false,
          phone_status: "active",
          exit_reason: null,
        },
        {
          id: "row-2",
          cycle_lead_id: "cycle-1",
          lead_id: "lead-1",
          phone_id: "phone-2",
          phone: "+15095550102",
          phone_position: 2,
          attempt_count: 0,
          next_attempt_number: 1,
          next_due_at: "2026-04-09T20:30:00.000Z",
          last_attempt_at: null,
          last_outcome: null,
          voicemail_drop_next: false,
          phone_status: "active",
          exit_reason: null,
        },
      ],
    };

    mockCreateClient.mockReturnValue(createMockSupabase(state));
    const { processAutoCycleOutcome } = await import("@/lib/dialer/auto-cycle-outcome");

    const result = await processAutoCycleOutcome({
      leadId: "lead-1",
      disposition: "voicemail",
      phoneNumber: "+15095550102",
      source: "operator",
      userId: "user-1",
    });

    expect(result).toMatchObject({
      ok: true,
      cycleStatus: "waiting",
      nextDueAt: "2026-04-10T21:00:00.000Z",
      nextPhoneId: "phone-1",
    });
    expect(state.cycleLead.cycle_status).toBe("waiting");
    expect(state.phones.filter((phone) => phone.phone_status === "active").map((phone) => phone.next_attempt_number)).toEqual([1, 1]);
    expect(state.phones.filter((phone) => phone.phone_status === "active").map((phone) => phone.next_due_at)).toEqual([
      "2026-04-10T21:00:00.000Z",
      "2026-04-10T21:00:00.000Z",
    ]);
    expect(mockEvictQueue).toHaveBeenCalledWith(
      expect.anything(),
      "lead-1",
      "waiting",
    );
  });
});
