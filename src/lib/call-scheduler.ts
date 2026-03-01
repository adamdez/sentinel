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

  if (disposition === "dead") {
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
  return `Touch ${step}/7`;
}

export function getSequenceProgress(step: number): number {
  return Math.min(step / 7, 1);
}
