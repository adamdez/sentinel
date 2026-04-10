import { describe, expect, it } from "vitest";
import {
  AUTO_CYCLE_MAX_NO_RESPONSE_ROUNDS,
  buildAutoCycleNextRoundDueAt,
  buildAutoCycleThirtyDayFollowUpDueAt,
  deriveLeadCycleState,
  isAutoCycleLeadExitDisposition,
  isAutoCycleManualHoldDisposition,
  mapAutoCyclePhoneState,
  normalizePhoneForCompare,
  pickAutoCyclePhoneIdByPosition,
  planNextAutoCyclePhoneCall,
  shouldDisplayAutoCycleLead,
  shouldStopAutoCycleForNoResponseRound,
} from "@/lib/dialer/auto-cycle";

describe("normalizePhoneForCompare", () => {
  it("keeps the last 10 digits for matching", () => {
    expect(normalizePhoneForCompare("+1 (555) 111-2222")).toBe("5551112222");
    expect(normalizePhoneForCompare("555.111.2222")).toBe("5551112222");
    expect(normalizePhoneForCompare(null)).toBe("");
  });
});

describe("isAutoCycleLeadExitDisposition", () => {
  it("exits the lead on terminal negative outcomes", () => {
    expect(isAutoCycleLeadExitDisposition("completed")).toBe(false);
    expect(isAutoCycleLeadExitDisposition("not_interested")).toBe(true);
    expect(isAutoCycleLeadExitDisposition("wrong_number")).toBe(false);
    expect(isAutoCycleLeadExitDisposition("disconnected")).toBe(false);
    expect(isAutoCycleLeadExitDisposition("follow_up")).toBe(false);
    expect(isAutoCycleLeadExitDisposition("appointment")).toBe(false);
    expect(isAutoCycleLeadExitDisposition("offer_made")).toBe(false);
    expect(isAutoCycleLeadExitDisposition("do_not_call")).toBe(true);
    expect(isAutoCycleLeadExitDisposition("disqualified")).toBe(true);
  });

  it("keeps the lead in cycle for no-answer style outcomes", () => {
    expect(isAutoCycleLeadExitDisposition("no_answer")).toBe(false);
    expect(isAutoCycleLeadExitDisposition("voicemail")).toBe(false);
    expect(isAutoCycleLeadExitDisposition("dead_phone")).toBe(false);
  });
});

describe("isAutoCycleManualHoldDisposition", () => {
  it("holds positive outcomes for manual follow-through", () => {
    expect(isAutoCycleManualHoldDisposition("completed")).toBe(true);
    expect(isAutoCycleManualHoldDisposition("follow_up")).toBe(true);
    expect(isAutoCycleManualHoldDisposition("appointment")).toBe(true);
    expect(isAutoCycleManualHoldDisposition("offer_made")).toBe(true);
    expect(isAutoCycleManualHoldDisposition("not_interested")).toBe(false);
    expect(isAutoCycleManualHoldDisposition("voicemail")).toBe(false);
  });
});

describe("daily round helpers", () => {
  const now = new Date("2026-03-24T10:00:00.000Z");

  it("schedules the next phone attempt for the next day with no short retry window", () => {
    const plan = planNextAutoCyclePhoneCall(1, now);
    expect(plan.nextAttemptNumber).toBe(2);
    expect(plan.nextDueAt).toBe("2026-03-25T10:00:00.000Z");
    expect(plan.voicemailDropNext).toBe(false);
    expect(plan.phoneStatus).toBe("active");
  });

  it("builds the next-round and 30-day due dates from the current call time", () => {
    expect(buildAutoCycleNextRoundDueAt(now)).toBe("2026-03-25T10:00:00.000Z");
    expect(buildAutoCycleThirtyDayFollowUpDueAt(now)).toBe("2026-04-23T10:00:00.000Z");
  });

  it("keeps the same Pacific local time and skips weekends for the next call day", () => {
    expect(buildAutoCycleNextRoundDueAt(new Date("2026-04-10T21:00:00.000Z"))).toBe("2026-04-13T21:00:00.000Z");
  });

  it("stops the power dialer after three unanswered call days", () => {
    expect(AUTO_CYCLE_MAX_NO_RESPONSE_ROUNDS).toBe(3);
    expect(shouldStopAutoCycleForNoResponseRound(3)).toBe(false);
    expect(shouldStopAutoCycleForNoResponseRound(4)).toBe(true);
  });

  it("picks the first active phone by position for the next round pointer", () => {
    expect(pickAutoCyclePhoneIdByPosition([
      {
        id: "row-2",
        cycle_lead_id: "cycle-1",
        lead_id: "lead-1",
        phone_id: "lead-phone-2",
        phone: "5553334444",
        phone_position: 2,
        attempt_count: 1,
        next_attempt_number: 2,
        next_due_at: "2026-03-25T10:00:00.000Z",
        last_attempt_at: "2026-03-24T10:00:00.000Z",
        last_outcome: "no_answer",
        voicemail_drop_next: false,
        phone_status: "active",
        exit_reason: null,
      },
      {
        id: "row-1",
        cycle_lead_id: "cycle-1",
        lead_id: "lead-1",
        phone_id: "lead-phone-1",
        phone: "5551112222",
        phone_position: 1,
        attempt_count: 1,
        next_attempt_number: 2,
        next_due_at: "2026-03-25T10:00:00.000Z",
        last_attempt_at: "2026-03-24T10:00:00.000Z",
        last_outcome: "no_answer",
        voicemail_drop_next: false,
        phone_status: "active",
        exit_reason: null,
      },
    ])).toBe("lead-phone-1");
  });
});

describe("mapAutoCyclePhoneState", () => {
  it("marks an active phone due when its next-day due time has passed", () => {
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
        next_due_at: "2026-03-25T09:58:00.000Z",
        last_attempt_at: "2026-03-24T09:53:00.000Z",
        last_outcome: "no_answer",
        voicemail_drop_next: false,
        phone_status: "active",
        exit_reason: null,
      },
      new Date("2026-03-25T10:00:00.000Z"),
    );

    expect(phone.dueNow).toBe(true);
    expect(phone.voicemailDropNext).toBe(false);
  });
});

describe("deriveLeadCycleState", () => {
  const leadRow = {
    id: "cycle-1",
    lead_id: "lead-1",
    cycle_status: "waiting" as const,
    current_round: 2,
    next_due_at: "2026-03-25T10:00:00.000Z",
    next_phone_id: "lead-phone-1",
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
          next_due_at: "2026-03-25T09:59:00.000Z",
          last_attempt_at: "2026-03-24T09:54:00.000Z",
          last_outcome: "no_answer",
          voicemail_drop_next: false,
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
          next_due_at: "2026-03-25T10:07:00.000Z",
          last_attempt_at: "2026-03-24T10:02:00.000Z",
          last_outcome: "no_answer",
          voicemail_drop_next: false,
          phone_status: "active" as const,
          exit_reason: null,
        },
      ],
      new Date("2026-03-25T10:00:00.000Z"),
    );

    expect(state.cycleStatus).toBe("ready");
    expect(state.readyNow).toBe(true);
    expect(state.nextPhoneId).toBe("lead-phone-1");
    expect(state.voicemailDropNext).toBe(false);
    expect(state.remainingPhones).toBe(2);
    expect(state.currentRound).toBe(2);
  });

  it("waits until tomorrow once every active number has been worked for the day", () => {
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
          next_due_at: "2026-03-25T10:00:00.000Z",
          last_attempt_at: "2026-03-24T09:54:00.000Z",
          last_outcome: "no_answer",
          voicemail_drop_next: false,
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
          next_due_at: "2026-03-25T10:00:00.000Z",
          last_attempt_at: "2026-03-24T10:02:00.000Z",
          last_outcome: "voicemail",
          voicemail_drop_next: false,
          phone_status: "active" as const,
          exit_reason: null,
        },
      ],
      new Date("2026-03-24T10:05:00.000Z"),
    );

    expect(state.cycleStatus).toBe("waiting");
    expect(state.readyNow).toBe(false);
    expect(state.currentRound).toBe(2);
    expect(state.nextDueAt).toBe("2026-03-25T10:00:00.000Z");
    expect(state.nextPhoneId).toBe("lead-phone-1");
  });

  it("keeps paused leads visible without making them callable", () => {
    const pausedLead = {
      ...leadRow,
      cycle_status: "paused" as const,
      next_due_at: null,
      next_phone_id: "lead-phone-1",
      last_outcome: "completed",
      exit_reason: "manual_positive_hold",
    };
    const state = deriveLeadCycleState(
      pausedLead,
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
          next_due_at: null,
          last_attempt_at: "2026-03-24T09:54:00.000Z",
          last_outcome: "completed",
          voicemail_drop_next: false,
          phone_status: "active" as const,
          exit_reason: null,
        },
      ],
      new Date("2026-03-24T10:05:00.000Z"),
    );

    expect(state.cycleStatus).toBe("paused");
    expect(state.readyNow).toBe(false);
    expect(state.nextDueAt).toBeNull();
    expect(state.nextPhoneId).toBe("lead-phone-1");
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
          attempt_count: 3,
          next_attempt_number: null,
          next_due_at: null,
          last_attempt_at: "2026-03-26T10:00:00.000Z",
          last_outcome: "dead_phone",
          voicemail_drop_next: false,
          phone_status: "dead" as const,
          exit_reason: "dead_phone",
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

describe("shouldDisplayAutoCycleLead", () => {
  it("keeps staged leads visible even when they are waiting", () => {
    expect(shouldDisplayAutoCycleLead(
      { dial_queue_active: true },
      { readyNow: false },
    )).toBe(true);
  });

  it("brings due leads back even after they left the staged queue", () => {
    expect(shouldDisplayAutoCycleLead(
      { dial_queue_active: false },
      { readyNow: true },
    )).toBe(true);
  });

  it("hides parked waiting leads once they leave the staged queue", () => {
    expect(shouldDisplayAutoCycleLead(
      { dial_queue_active: false },
      { readyNow: false },
    )).toBe(false);
  });
});
