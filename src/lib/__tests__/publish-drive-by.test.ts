import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  notifyPostCallSummary: vi.fn(),
  trackedDelivery: vi.fn(),
  exitIntroSop: vi.fn(),
  progressIntroSopForCallAttempt: vi.fn(),
  toIntroSopState: vi.fn(),
  evictFromDialQueueIfDriveBy: vi.fn(),
  upsertLeadCallTask: vi.fn(),
}));

vi.mock("@/lib/dialer/session-manager", () => ({
  getSession: (...args: unknown[]) => mocks.getSession(...args),
}));

vi.mock("@/lib/notify", () => ({
  notifyPostCallSummary: (...args: unknown[]) => mocks.notifyPostCallSummary(...args),
}));

vi.mock("@/lib/delivery-tracker", () => ({
  trackedDelivery: (...args: unknown[]) => mocks.trackedDelivery(...args),
}));

vi.mock("@/lib/intro-sop", () => ({
  exitIntroSop: (...args: unknown[]) => mocks.exitIntroSop(...args),
  progressIntroSopForCallAttempt: (...args: unknown[]) => mocks.progressIntroSopForCallAttempt(...args),
  toIntroSopState: (...args: unknown[]) => mocks.toIntroSopState(...args),
}));

vi.mock("@/lib/dial-queue", () => ({
  evictFromDialQueueIfDriveBy: (...args: unknown[]) => mocks.evictFromDialQueueIfDriveBy(...args),
}));

vi.mock("@/lib/task-lead-sync", () => ({
  upsertLeadCallTask: (...args: unknown[]) => mocks.upsertLeadCallTask(...args),
}));

function createMockSupabase() {
  const callsLogUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const callsLogUpdate = vi.fn(() => ({
    eq: callsLogUpdateEq,
  }));

  const callsLogMaybeSingle = vi
    .fn()
    .mockResolvedValueOnce({
      data: {
        id: "call-log-1",
        disposition: "failed",
        duration_sec: 0,
        phone_dialed: "+15094836268",
      },
      error: null,
    });

  const leadMaybeSingle = vi
    .fn()
    .mockResolvedValueOnce({
      data: {
        intro_sop_active: false,
        intro_day_count: 0,
        intro_last_call_date: null,
        intro_completed_at: null,
        intro_exit_category: null,
      },
      error: null,
    });

  const dialerEventInsert = vi.fn().mockResolvedValue({ error: null });

  const from = (table: string) => {
    if (table === "calls_log") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: callsLogMaybeSingle,
          })),
        })),
        update: callsLogUpdate,
      };
    }

    if (table === "leads") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: leadMaybeSingle,
          })),
        })),
      };
    }

    if (table === "dialer_events") {
      return {
        insert: dialerEventInsert,
      };
    }

    throw new Error(`Unexpected table ${table}`);
  };

  return {
    sb: { from, rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
    callsLogUpdate,
    callsLogUpdateEq,
  };
}

describe("publishSession drive by", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({
      data: {
        id: "session-1",
        lead_id: "lead-1",
        status: "failed",
        context_snapshot: { ownerName: "CRAWFORD, JOHN W", address: "917 E RICH AVE" },
      },
      error: null,
      code: undefined,
    });
    mocks.notifyPostCallSummary.mockResolvedValue({ ok: true });
    mocks.trackedDelivery.mockResolvedValue(undefined);
    mocks.toIntroSopState.mockReturnValue({
      intro_sop_active: false,
      intro_day_count: 0,
      intro_last_call_date: null,
      intro_completed_at: null,
      intro_exit_category: null,
    });
    mocks.exitIntroSop.mockResolvedValue({
      supported: true,
      state: {
        intro_sop_active: false,
        intro_day_count: 3,
        intro_last_call_date: "2026-04-14",
        intro_completed_at: "2026-04-14T15:00:00.000Z",
        intro_exit_category: "drive_by",
      },
    });
    mocks.progressIntroSopForCallAttempt.mockResolvedValue({
      supported: true,
      state: {
        intro_sop_active: false,
        intro_day_count: 3,
        intro_last_call_date: "2026-04-14",
        intro_completed_at: "2026-04-14T15:00:00.000Z",
        intro_exit_category: "drive_by",
      },
    });
    mocks.evictFromDialQueueIfDriveBy.mockResolvedValue(true);
    mocks.upsertLeadCallTask.mockResolvedValue("task-1");
  });

  it("treats failed technical call rows as provisional and still moves the file into drive by", async () => {
    const mockSupabase = createMockSupabase();
    const { publishSession } = await import("@/lib/dialer/publish-manager");

    const result = await publishSession(mockSupabase.sb as never, "session-1", "user-1", {
      disposition: "drive_by",
      duration_sec: 10,
      next_action: "Drive by",
    });

    expect(result.ok).toBe(true);
    expect(mockSupabase.callsLogUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: "drive_by",
        duration_sec: 10,
      }),
    );
    expect(mocks.evictFromDialQueueIfDriveBy).toHaveBeenCalledWith(mockSupabase.sb, "lead-1", "Drive by");
    expect(mocks.exitIntroSop).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead-1",
        category: "drive_by",
        userId: "user-1",
      }),
    );
    expect(mocks.upsertLeadCallTask).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead-1",
        title: "Drive by",
        taskType: "drive_by",
      }),
    );
  });
});
