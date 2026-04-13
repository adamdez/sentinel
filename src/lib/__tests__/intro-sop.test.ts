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

function createMockSupabase() {
  const updatedLead = {
    assigned_to: "user-1",
    intro_sop_active: false,
    intro_day_count: 3,
    intro_last_call_date: "2026-04-13",
    intro_completed_at: "2026-04-13T18:00:00.000Z",
    intro_exit_category: "drive_by",
  };
  const leadUpdateEq = vi.fn();
  leadUpdateEq
    .mockReturnValueOnce({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: updatedLead,
          error: null,
        }),
      })),
    })
    .mockResolvedValueOnce({ error: null });

  const leadUpdate = vi.fn(() => ({
    eq: leadUpdateEq,
  }));

  const eventInsert = vi.fn().mockResolvedValue({ error: null });

  return {
    leadUpdate,
    leadUpdateEq,
    sb: {
      from(table: string) {
        if (table === "leads") {
          return {
            update: leadUpdate,
          };
        }

        if (table === "event_log") {
          return {
            insert: eventInsert,
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    },
  };
}

describe("exitIntroSop", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.completeOpenCallTasksForLead.mockResolvedValue(undefined);
    mocks.projectLeadFromTasks.mockResolvedValue(undefined);
    mocks.upsertLeadCallTask.mockResolvedValue("task-1");
  });

  it("applies a direct drive-by projection fallback when task upsert fails", async () => {
    mocks.upsertLeadCallTask.mockResolvedValue(null);
    const mockSupabase = createMockSupabase();
    const { exitIntroSop } = await import("@/lib/intro-sop");

    await exitIntroSop({
      sb: mockSupabase.sb,
      leadId: "lead-1",
      category: "drive_by",
      userId: "user-1",
    });

    expect(mocks.upsertLeadCallTask).toHaveBeenCalledWith(expect.objectContaining({
      leadId: "lead-1",
      title: "Drive by",
      taskType: "drive_by",
    }));
    expect(mockSupabase.leadUpdate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      next_action: "Drive by",
      next_action_due_at: expect.any(String),
      next_call_scheduled_at: null,
      next_follow_up_at: expect.any(String),
    }));
    expect(mockSupabase.leadUpdateEq).toHaveBeenCalledTimes(2);
  });
});
