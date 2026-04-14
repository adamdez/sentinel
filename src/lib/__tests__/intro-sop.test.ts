import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeOpenCallTasksForLead: vi.fn(),
  projectLeadFromTasks: vi.fn(),
  upsertLeadCallTask: vi.fn(),
}));

vi.mock("@/lib/task-lead-sync", () => ({
  completeOpenCallTasksForLead: (...args: unknown[]) => mocks.completeOpenCallTasksForLead(...args),
  projectLeadFromTasks: (...args: unknown[]) => mocks.projectLeadFromTasks(...args),
  upsertLeadCallTask: (...args: unknown[]) => mocks.upsertLeadCallTask(...args),
}));

function createMockSupabase(config: {
  selectedLead?: Record<string, unknown>;
  updatedLead?: Record<string, unknown>;
}) {
  const selectSingle = vi.fn().mockResolvedValue({
    data: config.selectedLead ?? null,
    error: null,
  });
  const updateSingle = vi.fn().mockResolvedValue({
    data: config.updatedLead ?? config.selectedLead ?? null,
    error: null,
  });

  const selectEq = vi.fn(() => ({
    single: selectSingle,
    maybeSingle: selectSingle,
  }));

  const select = vi.fn(() => ({
    eq: selectEq,
    single: selectSingle,
    maybeSingle: selectSingle,
  }));

  const updateEq = vi.fn(() => ({
    select: vi.fn(() => ({
      single: updateSingle,
      maybeSingle: updateSingle,
    })),
    single: updateSingle,
    maybeSingle: updateSingle,
  }));

  const update = vi.fn(() => ({
    eq: updateEq,
  }));

  const insert = vi.fn().mockResolvedValue({ error: null });

  return {
    update,
    updateEq,
    select,
    insert,
    sb: {
      from(table: string) {
        if (table === "leads") {
          return {
            select,
            update,
          };
        }

        if (table === "event_log") {
          return {
            insert,
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    },
  };
}

describe("intro SOP retry rounds", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.completeOpenCallTasksForLead.mockResolvedValue(undefined);
    mocks.projectLeadFromTasks.mockResolvedValue(undefined);
    mocks.upsertLeadCallTask.mockResolvedValue("task-1");
  });

  it("derives a pending round-2 retry state from existing lead fields", async () => {
    const { toIntroSopState } = await import("@/lib/intro-sop");

    const state = toIntroSopState({
      intro_sop_active: true,
      intro_day_count: 3,
      intro_exit_reason: "intro_retry_pending:2",
      next_action_due_at: "2026-04-28T16:00:00.000Z",
    });

    expect(state.intro_retry_round).toBe(2);
    expect(state.intro_round_attempt_count).toBe(0);
    expect(state.intro_round_attempt_limit).toBe(2);
    expect(state.intro_retry_scheduled).toBe(true);
    expect(state.intro_retry_due_at).toBe("2026-04-28T16:00:00.000Z");
    expect(state.intro_pending_action).toBeNull();
  });

  it("clears retry scheduling and advances into round 2 on the first due retry call", async () => {
    const mockSupabase = createMockSupabase({
      selectedLead: {
        intro_sop_active: true,
        intro_day_count: 3,
        intro_last_call_date: "2026-04-01",
        intro_completed_at: null,
        intro_exit_category: null,
        intro_exit_reason: "intro_retry_pending:2",
        next_action_due_at: "2026-04-15T16:00:00.000Z",
        next_follow_up_at: "2026-04-15T16:00:00.000Z",
      },
      updatedLead: {
        intro_sop_active: true,
        intro_day_count: 4,
        intro_last_call_date: "2026-04-15",
        intro_completed_at: null,
        intro_exit_category: null,
        intro_exit_reason: null,
        next_action_due_at: null,
        next_follow_up_at: null,
      },
    });
    const { progressIntroSopForCallAttempt } = await import("@/lib/intro-sop");

    const result = await progressIntroSopForCallAttempt({
      sb: mockSupabase.sb,
      leadId: "lead-1",
      attemptedAtIso: "2026-04-15T18:00:00.000Z",
    });

    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
      intro_day_count: 4,
      intro_exit_reason: null,
      next_action: null,
      next_action_due_at: null,
      next_follow_up_at: null,
    }));
    expect(result.state?.intro_retry_round).toBe(2);
    expect(result.state?.intro_round_attempt_count).toBe(1);
    expect(result.state?.intro_pending_action).toBeNull();
  });

  it("schedules the final reduced retry round without creating a nurture task", async () => {
    const mockSupabase = createMockSupabase({
      updatedLead: {
        intro_sop_active: true,
        intro_day_count: 5,
        intro_last_call_date: "2026-04-15",
        intro_completed_at: null,
        intro_exit_category: null,
        intro_exit_reason: "intro_retry_pending:3",
        next_action_due_at: "2026-04-29T18:00:00.000Z",
        next_follow_up_at: "2026-04-29T18:00:00.000Z",
      },
    });
    const { scheduleIntroRetry } = await import("@/lib/intro-sop");

    const result = await scheduleIntroRetry({
      sb: mockSupabase.sb,
      leadId: "lead-1",
      nextRound: 3,
      userId: "user-1",
      dueAtIso: "2026-04-29T18:00:00.000Z",
    });

    expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
      intro_exit_reason: "intro_retry_pending:3",
      next_action: "Intro final retry",
      next_action_due_at: "2026-04-29T18:00:00.000Z",
      next_follow_up_at: "2026-04-29T18:00:00.000Z",
      dial_queue_active: true,
    }));
    expect(mocks.upsertLeadCallTask).not.toHaveBeenCalled();
    expect(result.state?.intro_retry_round).toBe(3);
    expect(result.state?.intro_retry_scheduled).toBe(true);
  });
});
