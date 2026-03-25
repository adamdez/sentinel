import { describe, expect, it } from "vitest";
import {
  deriveLeadCycleState,
  isAutoCycleLeadExitDisposition,
  mapAutoCyclePhoneState,
  nextAttemptPlan,
  normalizePhoneForCompare,
} from "@/lib/dialer/auto-cycle";

describe("normalizePhoneForCompare", () => {
  it("keeps the last 10 digits for matching", () => {
    expect(normalizePhoneForCompare("+1 (555) 111-2222")).toBe("5551112222");
    expect(normalizePhoneForCompare("555.111.2222")).toBe("5551112222");
    expect(normalizePhoneForCompare(null)).toBe("");
  });
});

describe("isAutoCycleLeadExitDisposition", () => {
  it("exits the lead on live-answer outcomes", () => {
    expect(isAutoCycleLeadExitDisposition("completed")).toBe(true);
    expect(isAutoCycleLeadExitDisposition("not_interested")).toBe(true);
    expect(isAutoCycleLeadExitDisposition("appointment")).toBe(true);
  });

  it("keeps the lead in cycle for no-answer style outcomes", () => {
    expect(isAutoCycleLeadExitDisposition("no_answer")).toBe(false);
    expect(isAutoCycleLeadExitDisposition("voicemail")).toBe(false);
    expect(isAutoCycleLeadExitDisposition("dead_phone")).toBe(false);
  });
});

describe("nextAttemptPlan", () => {
  const now = new Date("2026-03-24T10:00:00.000Z");

  it("schedules attempt 2 about 5 minutes after attempt 1 and flags voicemail", () => {
    const plan = nextAttemptPlan(1, now);
    expect(plan.nextAttemptNumber).toBe(2);
    expect(plan.nextDueAt).toBe("2026-03-24T10:05:00.000Z");
    expect(plan.voicemailDropNext).toBe(true);
    expect(plan.phoneStatus).toBe("active");
  });

  it("schedules attempt 3 for the next day without voicemail", () => {
    const plan = nextAttemptPlan(2, now);
    expect(plan.nextAttemptNumber).toBe(3);
    expect(plan.nextDueAt).toBe("2026-03-25T10:00:00.000Z");
    expect(plan.voicemailDropNext).toBe(false);
  });

  it("schedules attempt 4 about 5 minutes after attempt 3 and flags voicemail", () => {
    const plan = nextAttemptPlan(3, now);
    expect(plan.nextAttemptNumber).toBe(4);
    expect(plan.nextDueAt).toBe("2026-03-24T10:05:00.000Z");
    expect(plan.voicemailDropNext).toBe(true);
  });

  it("schedules attempt 5 for the next day after attempt 4", () => {
    const plan = nextAttemptPlan(4, now);
    expect(plan.nextAttemptNumber).toBe(5);
    expect(plan.nextDueAt).toBe("2026-03-25T10:00:00.000Z");
    expect(plan.voicemailDropNext).toBe(false);
  });

  it("marks the phone completed after attempt 5", () => {
    const plan = nextAttemptPlan(5, now);
    expect(plan.nextAttemptNumber).toBeNull();
    expect(plan.nextDueAt).toBeNull();
    expect(plan.voicemailDropNext).toBe(false);
    expect(plan.phoneStatus).toBe("completed");
  });
});

describe("mapAutoCyclePhoneState", () => {
  it("marks an active phone due when its due time has passed", () => {
    const phone = mapAutoCyclePhoneState(
      {
        id: "phone-1",
        cycle_lead_id: "cycle-1",
        lead_id: "lead-1",
        phone_id: "lead-phone-1",
        phone: "5551112222",
        phone_position: 1,
        attempt_count: 1,
        next_attempt_number: 2,
        next_due_at: "2026-03-24T09:58:00.000Z",
        last_attempt_at: "2026-03-24T09:53:00.000Z",
        last_outcome: "no_answer",
        voicemail_drop_next: true,
        phone_status: "active",
        exit_reason: null,
      },
      new Date("2026-03-24T10:00:00.000Z"),
    );

    expect(phone.dueNow).toBe(true);
    expect(phone.voicemailDropNext).toBe(true);
  });
});

describe("deriveLeadCycleState", () => {
  const leadRow = {
    id: "cycle-1",
    lead_id: "lead-1",
    cycle_status: "waiting" as const,
    current_round: 2,
    next_due_at: "2026-03-24T10:05:00.000Z",
    next_phone_id: "lead-phone-2",
    last_outcome: "no_answer",
    exit_reason: null,
  };

  it("promotes due phones to ready and picks the due phone first", () => {
    const state = deriveLeadCycleState(
      leadRow,
      [
        {
          id: "phone-1",
          cycle_lead_id: "cycle-1",
          lead_id: "lead-1",
          phone_id: "lead-phone-1",
          phone: "5551112222",
          phone_position: 1,
          attempt_count: 1,
          next_attempt_number: 2,
          next_due_at: "2026-03-24T09:59:00.000Z",
          last_attempt_at: "2026-03-24T09:54:00.000Z",
          last_outcome: "no_answer",
          voicemail_drop_next: true,
          phone_status: "active" as const,
          exit_reason: null,
        },
        {
          id: "phone-2",
          cycle_lead_id: "cycle-1",
          lead_id: "lead-1",
          phone_id: "lead-phone-2",
          phone: "5553334444",
          phone_position: 2,
          attempt_count: 1,
          next_attempt_number: 2,
          next_due_at: "2026-03-24T10:07:00.000Z",
          last_attempt_at: "2026-03-24T10:02:00.000Z",
          last_outcome: "no_answer",
          voicemail_drop_next: true,
          phone_status: "active" as const,
          exit_reason: null,
        },
      ],
      new Date("2026-03-24T10:00:00.000Z"),
    );

    expect(state.cycleStatus).toBe("ready");
    expect(state.readyNow).toBe(true);
    expect(state.nextPhoneId).toBe("lead-phone-1");
    expect(state.voicemailDropNext).toBe(true);
    expect(state.remainingPhones).toBe(2);
    expect(state.currentRound).toBe(2);
  });

  it("marks the lead exited once no active phones remain", () => {
    const state = deriveLeadCycleState(
      leadRow,
      [
        {
          id: "phone-1",
          cycle_lead_id: "cycle-1",
          lead_id: "lead-1",
          phone_id: "lead-phone-1",
          phone: "5551112222",
          phone_position: 1,
          attempt_count: 5,
          next_attempt_number: null,
          next_due_at: null,
          last_attempt_at: "2026-03-26T10:00:00.000Z",
          last_outcome: "voicemail",
          voicemail_drop_next: false,
          phone_status: "completed" as const,
          exit_reason: "completed",
        },
      ],
      new Date("2026-03-26T11:00:00.000Z"),
    );

    expect(state.cycleStatus).toBe("exited");
    expect(state.exitReason).toBe("completed");
    expect(state.remainingPhones).toBe(0);
    expect(state.readyNow).toBe(false);
  });
});
