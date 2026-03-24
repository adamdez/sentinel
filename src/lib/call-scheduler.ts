/**
 * 7-Day Power Sequence Scheduler
 *
 * Calculates the optimal next call time for a lead based on:
 *   - Sequence step (1–7 touches over 7 days)
 *   - Peak-hour prioritization (9–11 AM, 4–6 PM local time)
 *   - Minimum 90-minute gap between touches on the same lead
 *   - Disposition-aware rescheduling
 *
 * All times returned in UTC; the UI converts to local display.
 */

const SEQUENCE_DELAYS_HOURS = [0, 4, 24, 48, 72, 120, 168];

const PEAK_HOURS = [9, 10, 16, 17] as const;
const ACCEPTABLE_HOURS = [9, 10, 11, 13, 14, 15, 16, 17] as const;
const MIN_GAP_MS = 90 * 60 * 1000;

function nextPeakSlot(after: Date, step: number): Date {
  const d = new Date(after);

  if (step <= 5) {
    const peakIdx = step % PEAK_HOURS.length;
    const targetHour = PEAK_HOURS[peakIdx];
    d.setUTCHours(targetHour + 8, Math.floor(Math.random() * 30), 0, 0);

    if (d.getTime() < after.getTime() + MIN_GAP_MS) {
      d.setUTCDate(d.getUTCDate() + 1);
    }
  } else {
    const idx = step % ACCEPTABLE_HOURS.length;
    const hour = ACCEPTABLE_HOURS[idx];
    d.setUTCHours(hour + 8, Math.floor(Math.random() * 45), 0, 0);

    if (d.getTime() < after.getTime() + MIN_GAP_MS) {
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }

  return d;
}

export interface ScheduleResult {
  nextCallAt: string;
  sequenceStep: number;
  isComplete: boolean;
}

export function scheduleNextCall(
  currentStep: number,
  lastCallAt: string | null,
  disposition: string,
): ScheduleResult {
  if (disposition === "interested" || disposition === "appointment" || disposition === "contract") {
    const followUp = new Date();
    followUp.setUTCHours(followUp.getUTCHours() + 2);
    return {
      nextCallAt: followUp.toISOString(),
      sequenceStep: currentStep,
      isComplete: false,
    };
  }

  if (disposition === "dead" || disposition === "dead_lead" || disposition === "disqualified") {
    return {
      nextCallAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      sequenceStep: currentStep,
      isComplete: true,
    };
  }

  const nextStep = currentStep + 1;
  if (nextStep > 7) {
    return {
      nextCallAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      sequenceStep: 7,
      isComplete: true,
    };
  }

  const reference = lastCallAt ? new Date(lastCallAt) : new Date();
  const delayHrs = SEQUENCE_DELAYS_HOURS[nextStep - 1] ?? 24;
  const earliest = new Date(reference.getTime() + delayHrs * 60 * 60 * 1000);

  const scheduled = nextPeakSlot(earliest, nextStep);

  return {
    nextCallAt: scheduled.toISOString(),
    sequenceStep: nextStep,
    isComplete: false,
  };
}

export function scheduleFirstCall(): ScheduleResult {
  const now = new Date();
  const scheduled = nextPeakSlot(now, 1);

  if (scheduled.getTime() - now.getTime() > 24 * 60 * 60 * 1000) {
    scheduled.setTime(now.getTime() + 60 * 60 * 1000);
  }

  return {
    nextCallAt: scheduled.toISOString(),
    sequenceStep: 1,
    isComplete: false,
  };
}

export function getSequenceLabel(step: number): string {
  if (step >= 7) return "Sequence Complete";
  return `Step ${step} of 7 in follow-up sequence`;
}

export function getSequenceProgress(step: number): number {
  return Math.min(step / 7, 1);
}

// ── 30-Day Follow-Up Cadence ───────────────────────────────────────────
//
// After the initial 7-touch power sequence, leads transition to a 30-day
// cadence: Day 1, 3, 7, 10, 14, 21, 30. Each "touch" is a scheduled
// follow-up call. The cadence is suggestion-only — the operator confirms.

const CADENCE_DAYS = [1, 3, 7, 10, 14, 21, 30] as const;

export interface CadencePosition {
  /** Which touch in the cadence (1-7) */
  touchNumber: number;
  /** The day in the schedule this touch falls on */
  cadenceDay: number;
  /** Total touches in the cadence */
  totalTouches: number;
  /** Whether the cadence is complete */
  isComplete: boolean;
  /** Label like "Step 3 of 7 • Day 7 of cadence" */
  label: string;
}

/**
 * Map a call count to a cadence position. This maps calls made (totalCalls)
 * to a position in the 7-touch, 30-day cadence.
 *
 * If totalCalls is 0, we haven't started. If > 7, cadence is complete.
 */
export function getCadencePosition(totalCalls: number): CadencePosition {
  if (totalCalls <= 0) {
    return {
      touchNumber: 0,
      cadenceDay: 0,
      totalTouches: CADENCE_DAYS.length,
      isComplete: false,
      label: "Not started",
    };
  }

  const idx = Math.min(totalCalls, CADENCE_DAYS.length) - 1;
  const isComplete = totalCalls >= CADENCE_DAYS.length;

  return {
    touchNumber: Math.min(totalCalls, CADENCE_DAYS.length),
    cadenceDay: CADENCE_DAYS[idx],
    totalTouches: CADENCE_DAYS.length,
    isComplete,
    label: isComplete
      ? "Cadence Complete"
      : `Step ${totalCalls} of ${CADENCE_DAYS.length} in follow-up sequence`,
  };
}

/**
 * Suggest the next follow-up date based on the cadence schedule.
 * Takes the date of the last call and the current touch number,
 * and returns the suggested next call date.
 */
export function suggestNextCadenceDate(
  lastCallDate: string | Date,
  currentTouchNumber: number,
): Date | null {
  const nextIdx = currentTouchNumber; // 0-indexed: after touch 1, next is index 1 (Day 3)
  if (nextIdx >= CADENCE_DAYS.length) return null; // cadence complete

  const lastCall = typeof lastCallDate === "string" ? new Date(lastCallDate) : lastCallDate;
  if (isNaN(lastCall.getTime())) return null;

  // Days from cadence start to next touch
  const currentDay = currentTouchNumber > 0 ? CADENCE_DAYS[currentTouchNumber - 1] : 0;
  const nextDay = CADENCE_DAYS[nextIdx];
  const deltaDays = nextDay - currentDay;

  const suggested = new Date(lastCall);
  suggested.setDate(suggested.getDate() + deltaDays);

  // Snap to a reasonable hour (10 AM local)
  suggested.setHours(10, 0, 0, 0);

  return suggested;
}
