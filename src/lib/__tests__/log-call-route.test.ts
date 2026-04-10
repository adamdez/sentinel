import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  dispositionCategory: vi.fn(),
  suggestNextCadenceDate: vi.fn(),
  exitIntroSop: vi.fn(),
  progressIntroSopForCallAttempt: vi.fn(),
  toIntroSopState: vi.fn(),
  completeOpenCallTasksForLead: vi.fn(),
  projectLeadFromTasks: vi.fn(),
  upsertLeadCallTask: vi.fn(),
  isPhoneDispositionRelevant: vi.fn(),
  syncLeadPhoneOutcome: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@/lib/comm-truth", () => ({
  dispositionCategory: (...args: unknown[]) => mocks.dispositionCategory(...args),
}));

vi.mock("@/lib/call-scheduler", () => ({
  suggestNextCadenceDate: (...args: unknown[]) => mocks.suggestNextCadenceDate(...args),
}));

vi.mock("@/lib/intro-sop", () => ({
  exitIntroSop: (...args: unknown[]) => mocks.exitIntroSop(...args),
  progressIntroSopForCallAttempt: (...args: unknown[]) => mocks.progressIntroSopForCallAttempt(...args),
  toIntroSopState: (...args: unknown[]) => mocks.toIntroSopState(...args),
}));

vi.mock("@/lib/task-lead-sync", () => ({
  completeOpenCallTasksForLead: (...args: unknown[]) => mocks.completeOpenCallTasksForLead(...args),
  projectLeadFromTasks: (...args: unknown[]) => mocks.projectLeadFromTasks(...args),
  upsertLeadCallTask: (...args: unknown[]) => mocks.upsertLeadCallTask(...args),
}));

vi.mock("@/lib/lead-phone-outcome", () => ({
  isPhoneDispositionRelevant: (...args: unknown[]) => mocks.isPhoneDispositionRelevant(...args),
  syncLeadPhoneOutcome: (...args: unknown[]) => mocks.syncLeadPhoneOutcome(...args),
}));

function createMockSupabase() {
  const callLogInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: "call-log-1" }, error: null }),
    }),
  });

  const eventInsert = vi.fn().mockResolvedValue({ error: null });

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
    },
    rpc: vi.fn().mockResolvedValue({ error: null }),
    from(table: string) {
      if (table === "leads") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "lead-1",
                property_id: "property-1",
                total_calls: 0,
                call_sequence_step: 1,
                intro_sop_active: true,
                intro_day_count: 1,
                intro_last_call_date: null,
                intro_completed_at: null,
                intro_exit_category: null,
              },
              error: null,
            }),
          }),
        };
      }

      if (table === "properties") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { owner_phone: "+15095551234" }, error: null }),
          }),
        };
      }

      if (table === "calls_log") {
        return {
          insert: callLogInsert,
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

describe("POST /api/leads/[id]/log-call", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.createServerClient.mockReturnValue(createMockSupabase());
    mocks.dispositionCategory.mockReturnValue("dead");
    mocks.suggestNextCadenceDate.mockReturnValue(null);
    mocks.toIntroSopState.mockReturnValue({
      intro_sop_active: true,
      intro_day_count: 1,
      intro_exit_category: null,
      requires_exit_category: false,
    });
    mocks.progressIntroSopForCallAttempt.mockResolvedValue({ state: null });
    mocks.completeOpenCallTasksForLead.mockResolvedValue(undefined);
    mocks.projectLeadFromTasks.mockResolvedValue(undefined);
    mocks.exitIntroSop.mockResolvedValue(undefined);
    mocks.upsertLeadCallTask.mockResolvedValue(undefined);
    mocks.isPhoneDispositionRelevant.mockReturnValue(true);
    mocks.syncLeadPhoneOutcome.mockResolvedValue({
      handled: true,
      applied: true,
      phoneId: "phone-1",
      previousStatus: "active",
      newStatus: "dead",
      newPrimaryPhone: null,
      allPhonesDead: false,
      reason: null,
    });
  });

  it("syncs canonical phone deactivation for wrong-number log calls", async () => {
    const { POST } = await import("@/app/api/leads/[id]/log-call/route");
    const response = await POST(
      new Request("http://localhost/api/leads/lead-1/log-call", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          disposition: "wrong_number",
          notes: "Reached the wrong party.",
        }),
      }) as never,
      { params: Promise.resolve({ id: "lead-1" }) },
    );

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
