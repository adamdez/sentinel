/**
 * Call Scheduler Tests
 *
 * Tests the 7-day power sequence and 30-day cadence logic.
 * These are pure-function tests — no external deps.
 */

import { describe, it, expect } from "vitest";
import {
  scheduleNextCall,
  scheduleFirstCall,
  getSequenceLabel,
  getSequenceProgress,
  getCadencePosition,
  suggestNextCadenceDate,
} from "@/lib/call-scheduler";

// ── scheduleNextCall ───────────────────────────────────────────────

describe("scheduleNextCall", () => {
  const LAST_CALL = "2026-03-10T17:00:00Z";

  it("advances step for normal disposition", () => {
    const result = scheduleNextCall(1, LAST_CALL, "no_answer");
    expect(result.sequenceStep).toBe(2);
    expect(result.isComplete).toBe(false);
  });

  it("keeps same step for 'interested' (follow-up in ~2hrs)", () => {
    const result = scheduleNextCall(3, LAST_CALL, "interested");
    expect(result.sequenceStep).toBe(3);
    expect(result.isComplete).toBe(false);
    // Should schedule roughly 2 hours from now
    const scheduled = new Date(result.nextCallAt);
    const twoHoursFromNow = Date.now() + 2 * 60 * 60 * 1000;
    expect(Math.abs(scheduled.getTime() - twoHoursFromNow)).toBeLessThan(5000);
  });

  it("keeps same step for 'appointment' disposition", () => {
    const result = scheduleNextCall(2, LAST_CALL, "appointment");
    expect(result.sequenceStep).toBe(2);
    expect(result.isComplete).toBe(false);
  });

  it("marks complete for 'dead' disposition", () => {
    const result = scheduleNextCall(4, LAST_CALL, "dead");
    expect(result.isComplete).toBe(true);
    // Scheduled far in the future (~1 year)
    const scheduled = new Date(result.nextCallAt);
    expect(scheduled.getTime()).toBeGreaterThan(Date.now() + 300 * 24 * 60 * 60 * 1000);
  });

  it("marks complete when step exceeds 7", () => {
    const result = scheduleNextCall(7, LAST_CALL, "no_answer");
    expect(result.sequenceStep).toBe(7);
    expect(result.isComplete).toBe(true);
    // Should schedule ~14 days out
    const scheduled = new Date(result.nextCallAt);
    const fourteenDays = Date.now() + 14 * 24 * 60 * 60 * 1000;
    expect(Math.abs(scheduled.getTime() - fourteenDays)).toBeLessThan(60000);
  });

  it("uses current time as reference when lastCallAt is null", () => {
    const result = scheduleNextCall(1, null, "voicemail");
    expect(result.sequenceStep).toBe(2);
    const scheduled = new Date(result.nextCallAt);
    // Should be in the future
    expect(scheduled.getTime()).toBeGreaterThan(Date.now() - 60000);
  });

  it("returns a valid ISO date string", () => {
    const result = scheduleNextCall(3, LAST_CALL, "no_answer");
    expect(() => new Date(result.nextCallAt)).not.toThrow();
    expect(new Date(result.nextCallAt).toISOString()).toBe(result.nextCallAt);
  });
});

// ── scheduleFirstCall ──────────────────────────────────────────────

describe("scheduleFirstCall", () => {
  it("returns step 1", () => {
    const result = scheduleFirstCall();
    expect(result.sequenceStep).toBe(1);
    expect(result.isComplete).toBe(false);
  });

  it("schedules within 24 hours", () => {
    const result = scheduleFirstCall();
    const scheduled = new Date(result.nextCallAt);
    const oneDayFromNow = Date.now() + 24 * 60 * 60 * 1000;
    expect(scheduled.getTime()).toBeLessThanOrEqual(oneDayFromNow + 60000);
  });

  it("returns a valid ISO date string", () => {
    const result = scheduleFirstCall();
    expect(() => new Date(result.nextCallAt)).not.toThrow();
  });
});

// ── getSequenceLabel ───────────────────────────────────────────────

describe("getSequenceLabel", () => {
  it("returns descriptive label for steps 1-6", () => {
    expect(getSequenceLabel(1)).toBe("Step 1 of 7 in follow-up sequence");
    expect(getSequenceLabel(3)).toBe("Step 3 of 7 in follow-up sequence");
    expect(getSequenceLabel(6)).toBe("Step 6 of 7 in follow-up sequence");
  });

  it("returns 'Sequence Complete' for step 7+", () => {
    expect(getSequenceLabel(7)).toBe("Sequence Complete");
    expect(getSequenceLabel(10)).toBe("Sequence Complete");
  });
});

// ── getSequenceProgress ────────────────────────────────────────────

describe("getSequenceProgress", () => {
  it("returns 0 for step 0", () => {
    expect(getSequenceProgress(0)).toBe(0);
  });

  it("returns fractional progress for mid-sequence", () => {
    expect(getSequenceProgress(1)).toBeCloseTo(1 / 7);
    expect(getSequenceProgress(3)).toBeCloseTo(3 / 7);
  });

  it("returns 1 for step 7", () => {
    expect(getSequenceProgress(7)).toBe(1);
  });

  it("caps at 1 for steps beyond 7", () => {
    expect(getSequenceProgress(10)).toBe(1);
  });
});

// ── getCadencePosition ─────────────────────────────────────────────

describe("getCadencePosition", () => {
  it("returns 'Not started' for 0 calls", () => {
    const pos = getCadencePosition(0);
    expect(pos.touchNumber).toBe(0);
    expect(pos.cadenceDay).toBe(0);
    expect(pos.isComplete).toBe(false);
    expect(pos.label).toBe("Not started");
  });

  it("returns correct position for call 1", () => {
    const pos = getCadencePosition(1);
    expect(pos.touchNumber).toBe(1);
    expect(pos.cadenceDay).toBe(1);
    expect(pos.isComplete).toBe(false);
    expect(pos.label).toBe("Step 1 of 7 in follow-up sequence");
  });

  it("returns correct position for call 3", () => {
    const pos = getCadencePosition(3);
    expect(pos.touchNumber).toBe(3);
    expect(pos.cadenceDay).toBe(7);
    expect(pos.label).toBe("Step 3 of 7 in follow-up sequence");
  });

  it("marks complete at 7 calls", () => {
    const pos = getCadencePosition(7);
    expect(pos.isComplete).toBe(true);
    expect(pos.touchNumber).toBe(7);
    expect(pos.cadenceDay).toBe(30);
    expect(pos.label).toBe("Cadence Complete");
  });

  it("caps at 7 for calls beyond 7", () => {
    const pos = getCadencePosition(15);
    expect(pos.isComplete).toBe(true);
    expect(pos.touchNumber).toBe(7);
    expect(pos.label).toBe("Cadence Complete");
  });

  it("handles negative calls (defensive)", () => {
    const pos = getCadencePosition(-1);
    expect(pos.touchNumber).toBe(0);
    expect(pos.isComplete).toBe(false);
    expect(pos.label).toBe("Not started");
  });

  it("totalTouches is always 7", () => {
    expect(getCadencePosition(0).totalTouches).toBe(7);
    expect(getCadencePosition(3).totalTouches).toBe(7);
    expect(getCadencePosition(7).totalTouches).toBe(7);
  });
});

// ── suggestNextCadenceDate ─────────────────────────────────────────

describe("suggestNextCadenceDate", () => {
  const LAST_CALL = "2026-03-10T14:00:00Z";

  it("suggests Day 3 after touch 1 (2 days later)", () => {
    const result = suggestNextCadenceDate(LAST_CALL, 1);
    expect(result).not.toBeNull();
    // Day 1 → Day 3 = +2 days
    const expected = new Date("2026-03-12T10:00:00.000");
    expect(result!.getDate()).toBe(expected.getDate());
  });

  it("suggests Day 7 after touch 2 (4 days later)", () => {
    const result = suggestNextCadenceDate(LAST_CALL, 2);
    expect(result).not.toBeNull();
    // Day 3 → Day 7 = +4 days
    const dayOfMonth = result!.getDate();
    expect(dayOfMonth).toBe(14); // March 10 + 4 = March 14
  });

  it("returns null when cadence is complete (touch 7+)", () => {
    expect(suggestNextCadenceDate(LAST_CALL, 7)).toBeNull();
    expect(suggestNextCadenceDate(LAST_CALL, 10)).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(suggestNextCadenceDate("not-a-date", 1)).toBeNull();
  });

  it("accepts Date object input", () => {
    const result = suggestNextCadenceDate(new Date(LAST_CALL), 1);
    expect(result).not.toBeNull();
  });

  it("snaps to 10 AM", () => {
    const result = suggestNextCadenceDate(LAST_CALL, 1);
    expect(result).not.toBeNull();
    expect(result!.getHours()).toBe(10);
    expect(result!.getMinutes()).toBe(0);
  });
});
