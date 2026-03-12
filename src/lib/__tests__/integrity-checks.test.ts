/**
 * Data Integrity Check Tests
 *
 * Tests drift detection, counter computation, repair payload generation,
 * and the full integrity report builder.
 *
 * All tests use pure functions with mock data — no DB access.
 */

import { describe, it, expect } from "vitest";
import {
  computeCallCounts,
  computeLastContact,
  detectCounterDrift,
  detectLastContactDrift,
  buildIntegrityReport,
  buildRepairPayload,
  type CallLogRecord,
  type LeadCounters,
} from "@/lib/integrity-checks";

// ── Helper factories ───────────────────────────────────────────────

function makeCall(overrides: Partial<CallLogRecord> = {}): CallLogRecord {
  return {
    lead_id: "lead-1",
    disposition: "no_answer",
    ended_at: "2026-03-10T17:00:00Z",
    started_at: "2026-03-10T16:55:00Z",
    ...overrides,
  };
}

function makeLead(overrides: Partial<LeadCounters> = {}): LeadCounters {
  return {
    id: "lead-1",
    total_calls: 0,
    live_answers: 0,
    voicemails_left: 0,
    last_contact_at: null,
    ...overrides,
  };
}

// ── computeCallCounts ──────────────────────────────────────────────

describe("computeCallCounts", () => {
  it("returns zeroes for empty call list", () => {
    const result = computeCallCounts([]);
    expect(result).toEqual({ totalCalls: 0, liveAnswers: 0, voicemailsLeft: 0 });
  });

  it("counts no_answer calls", () => {
    const calls = [makeCall({ disposition: "no_answer" }), makeCall({ disposition: "no_answer" })];
    const result = computeCallCounts(calls);
    expect(result.totalCalls).toBe(2);
    expect(result.liveAnswers).toBe(0);
    expect(result.voicemailsLeft).toBe(0);
  });

  it("counts live answer dispositions", () => {
    const calls = [
      makeCall({ disposition: "connected" }),
      makeCall({ disposition: "interested" }),
      makeCall({ disposition: "callback" }),
    ];
    const result = computeCallCounts(calls);
    expect(result.totalCalls).toBe(3);
    expect(result.liveAnswers).toBe(3);
  });

  it("counts voicemail dispositions", () => {
    const calls = [
      makeCall({ disposition: "voicemail" }),
      makeCall({ disposition: "left_voicemail" }),
    ];
    const result = computeCallCounts(calls);
    expect(result.totalCalls).toBe(2);
    expect(result.voicemailsLeft).toBe(2);
  });

  it("excludes non-call dispositions", () => {
    const calls = [
      makeCall({ disposition: "initiating" }),
      makeCall({ disposition: "in_progress" }),
      makeCall({ disposition: "sms_outbound" }),
      makeCall({ disposition: "skip_trace" }),
      makeCall({ disposition: "ghost" }),
      makeCall({ disposition: "no_answer" }), // this one counts
    ];
    const result = computeCallCounts(calls);
    expect(result.totalCalls).toBe(1);
  });

  it("handles mixed dispositions correctly", () => {
    const calls = [
      makeCall({ disposition: "no_answer" }),
      makeCall({ disposition: "voicemail" }),
      makeCall({ disposition: "connected" }),
      makeCall({ disposition: "no_answer" }),
      makeCall({ disposition: "interested" }),
    ];
    const result = computeCallCounts(calls);
    expect(result.totalCalls).toBe(5);
    expect(result.liveAnswers).toBe(2); // connected + interested
    expect(result.voicemailsLeft).toBe(1); // voicemail
  });

  it("handles null disposition as 'other' (still counted as a call)", () => {
    const calls = [makeCall({ disposition: null })];
    const result = computeCallCounts(calls);
    expect(result.totalCalls).toBe(1);
    expect(result.liveAnswers).toBe(0);
    expect(result.voicemailsLeft).toBe(0);
  });

  it("handles dead dispositions", () => {
    const calls = [
      makeCall({ disposition: "wrong_number" }),
      makeCall({ disposition: "disconnected" }),
    ];
    const result = computeCallCounts(calls);
    expect(result.totalCalls).toBe(2);
    expect(result.liveAnswers).toBe(0);
  });
});

// ── computeLastContact ─────────────────────────────────────────────

describe("computeLastContact", () => {
  it("returns null for empty call list", () => {
    expect(computeLastContact([]).lastContactAt).toBeNull();
  });

  it("returns the latest ended_at", () => {
    const calls = [
      makeCall({ ended_at: "2026-03-10T15:00:00Z" }),
      makeCall({ ended_at: "2026-03-10T17:00:00Z" }),
      makeCall({ ended_at: "2026-03-10T12:00:00Z" }),
    ];
    expect(computeLastContact(calls).lastContactAt).toBe("2026-03-10T17:00:00Z");
  });

  it("falls back to started_at when ended_at is null", () => {
    const calls = [
      makeCall({ ended_at: null, started_at: "2026-03-10T16:55:00Z" }),
    ];
    expect(computeLastContact(calls).lastContactAt).toBe("2026-03-10T16:55:00Z");
  });

  it("skips records with no timestamps", () => {
    const calls = [
      makeCall({ ended_at: null, started_at: null }),
      makeCall({ ended_at: "2026-03-10T12:00:00Z" }),
    ];
    expect(computeLastContact(calls).lastContactAt).toBe("2026-03-10T12:00:00Z");
  });

  it("returns null when all timestamps are null", () => {
    const calls = [
      makeCall({ ended_at: null, started_at: null }),
      makeCall({ ended_at: null, started_at: null }),
    ];
    expect(computeLastContact(calls).lastContactAt).toBeNull();
  });
});

// ── detectCounterDrift ─────────────────────────────────────────────

describe("detectCounterDrift", () => {
  it("returns empty array when no drift", () => {
    const lead = makeLead({ total_calls: 3, live_answers: 1, voicemails_left: 1 });
    const computed = { totalCalls: 3, liveAnswers: 1, voicemailsLeft: 1 };
    expect(detectCounterDrift(lead, computed)).toEqual([]);
  });

  it("detects total_calls drift", () => {
    const lead = makeLead({ total_calls: 5 });
    const computed = { totalCalls: 7, liveAnswers: 0, voicemailsLeft: 0 };
    const drifts = detectCounterDrift(lead, computed);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].field).toBe("total_calls");
    expect(drifts[0].cached).toBe(5);
    expect(drifts[0].computed).toBe(7);
    expect(drifts[0].delta).toBe(2);
  });

  it("detects multiple field drifts", () => {
    const lead = makeLead({ total_calls: 5, live_answers: 3, voicemails_left: 1 });
    const computed = { totalCalls: 7, liveAnswers: 2, voicemailsLeft: 3 };
    const drifts = detectCounterDrift(lead, computed);
    expect(drifts).toHaveLength(3);
  });

  it("detects negative drift (cached higher than computed)", () => {
    const lead = makeLead({ total_calls: 10 });
    const computed = { totalCalls: 7, liveAnswers: 0, voicemailsLeft: 0 };
    const drifts = detectCounterDrift(lead, computed);
    expect(drifts[0].delta).toBe(-3);
  });

  it("treats null cached values as 0", () => {
    const lead = makeLead({ total_calls: null, live_answers: null, voicemails_left: null });
    const computed = { totalCalls: 3, liveAnswers: 1, voicemailsLeft: 1 };
    const drifts = detectCounterDrift(lead, computed);
    expect(drifts).toHaveLength(3);
  });

  it("no drift when both null and computed are 0", () => {
    const lead = makeLead({ total_calls: null });
    const computed = { totalCalls: 0, liveAnswers: 0, voicemailsLeft: 0 };
    expect(detectCounterDrift(lead, computed)).toEqual([]);
  });
});

// ── detectLastContactDrift ─────────────────────────────────────────

describe("detectLastContactDrift", () => {
  it("returns null when both are null (consistent)", () => {
    const lead = makeLead({ last_contact_at: null });
    expect(detectLastContactDrift(lead, { lastContactAt: null })).toBeNull();
  });

  it("returns null when timestamps are within tolerance (60s)", () => {
    const lead = makeLead({ last_contact_at: "2026-03-10T17:00:00Z" });
    expect(
      detectLastContactDrift(lead, { lastContactAt: "2026-03-10T17:00:30Z" }),
    ).toBeNull();
  });

  it("detects drift when timestamps differ by more than 60s", () => {
    const lead = makeLead({ last_contact_at: "2026-03-10T17:00:00Z" });
    const drift = detectLastContactDrift(lead, { lastContactAt: "2026-03-10T18:00:00Z" });
    expect(drift).not.toBeNull();
    expect(drift!.deltaMs).toBe(3600000);
  });

  it("detects drift when cached is null but computed has value", () => {
    const lead = makeLead({ last_contact_at: null });
    const drift = detectLastContactDrift(lead, { lastContactAt: "2026-03-10T17:00:00Z" });
    expect(drift).not.toBeNull();
    expect(drift!.cached).toBeNull();
    expect(drift!.computed).toBe("2026-03-10T17:00:00Z");
    expect(drift!.deltaMs).toBeNull();
  });

  it("detects drift when computed is null but cached has value", () => {
    const lead = makeLead({ last_contact_at: "2026-03-10T17:00:00Z" });
    const drift = detectLastContactDrift(lead, { lastContactAt: null });
    expect(drift).not.toBeNull();
    expect(drift!.computed).toBeNull();
  });
});

// ── buildIntegrityReport ───────────────────────────────────────────

describe("buildIntegrityReport", () => {
  it("returns clean report when no drift", () => {
    const leads = [makeLead({ id: "l1", total_calls: 2, live_answers: 1, voicemails_left: 0, last_contact_at: "2026-03-10T17:00:00Z" })];
    const calls = [
      makeCall({ lead_id: "l1", disposition: "connected", ended_at: "2026-03-10T17:00:00Z" }),
      makeCall({ lead_id: "l1", disposition: "no_answer", ended_at: "2026-03-10T15:00:00Z" }),
    ];
    const report = buildIntegrityReport(leads, calls);
    expect(report.leadsChecked).toBe(1);
    expect(report.leadsWithDrift).toBe(0);
    expect(report.counterDrifts).toEqual([]);
    expect(report.lastContactDrifts).toEqual([]);
  });

  it("detects orphaned counters (lead has calls but no logs)", () => {
    const leads = [makeLead({ id: "l1", total_calls: 5 })];
    const calls: CallLogRecord[] = []; // no calls_log records
    const report = buildIntegrityReport(leads, calls);
    expect(report.orphanedCounterLeads).toContain("l1");
    expect(report.leadsWithDrift).toBe(1);
  });

  it("detects missed counters (logs exist but lead says 0)", () => {
    const leads = [makeLead({ id: "l1", total_calls: 0 })];
    const calls = [makeCall({ lead_id: "l1", disposition: "no_answer" })];
    const report = buildIntegrityReport(leads, calls);
    expect(report.missedCounterLeads).toContain("l1");
    expect(report.leadsWithDrift).toBe(1);
  });

  it("handles multiple leads with mixed drift states", () => {
    const leads = [
      makeLead({ id: "l1", total_calls: 3, live_answers: 1, voicemails_left: 1, last_contact_at: "2026-03-10T17:00:00Z" }),
      makeLead({ id: "l2", total_calls: 0 }),
      makeLead({ id: "l3", total_calls: 5 }),
    ];
    const calls = [
      // l1: consistent
      makeCall({ lead_id: "l1", disposition: "connected", ended_at: "2026-03-10T17:00:00Z" }),
      makeCall({ lead_id: "l1", disposition: "voicemail", ended_at: "2026-03-10T15:00:00Z" }),
      makeCall({ lead_id: "l1", disposition: "no_answer", ended_at: "2026-03-10T12:00:00Z" }),
      // l2: has calls but lead says 0 → missed
      makeCall({ lead_id: "l2", disposition: "no_answer" }),
      // l3: lead says 5 but no logs → orphaned
    ];
    const report = buildIntegrityReport(leads, calls);
    expect(report.leadsChecked).toBe(3);
    expect(report.leadsWithDrift).toBe(2); // l2 and l3
    expect(report.missedCounterLeads).toContain("l2");
    expect(report.orphanedCounterLeads).toContain("l3");
  });

  it("ignores call logs with null lead_id", () => {
    const leads = [makeLead({ id: "l1", total_calls: 0 })];
    const calls = [makeCall({ lead_id: (null as unknown as string) })];
    const report = buildIntegrityReport(leads, calls);
    expect(report.leadsWithDrift).toBe(0);
  });
});

// ── buildRepairPayload ─────────────────────────────────────────────

describe("buildRepairPayload", () => {
  it("returns null when no repair needed", () => {
    const lead = makeLead({ total_calls: 2, live_answers: 1, voicemails_left: 0, last_contact_at: "2026-03-10T17:00:00Z" });
    const calls = [
      makeCall({ disposition: "connected", ended_at: "2026-03-10T17:00:00Z" }),
      makeCall({ disposition: "no_answer", ended_at: "2026-03-10T15:00:00Z" }),
    ];
    expect(buildRepairPayload(lead, calls)).toBeNull();
  });

  it("generates payload for counter drift", () => {
    const lead = makeLead({ id: "l1", total_calls: 1 });
    const calls = [
      makeCall({ disposition: "no_answer" }),
      makeCall({ disposition: "no_answer" }),
      makeCall({ disposition: "no_answer" }),
    ];
    const payload = buildRepairPayload(lead, calls);
    expect(payload).not.toBeNull();
    expect(payload!.total_calls).toBe(3);
    expect(payload!.updated_at).toBeDefined();
  });

  it("generates payload for last_contact_at drift", () => {
    const lead = makeLead({ last_contact_at: null });
    const calls = [makeCall({ disposition: "no_answer", ended_at: "2026-03-10T17:00:00Z" })];
    const payload = buildRepairPayload(lead, calls);
    expect(payload).not.toBeNull();
    expect(payload!.last_contact_at).toBe("2026-03-10T17:00:00Z");
  });

  it("includes only drifted fields in payload", () => {
    const lead = makeLead({ total_calls: 2, live_answers: 0, voicemails_left: 0 });
    const calls = [
      makeCall({ disposition: "no_answer" }),
      makeCall({ disposition: "connected" }),
    ];
    const payload = buildRepairPayload(lead, calls);
    expect(payload).not.toBeNull();
    // total_calls is correct (2), but live_answers drifted (0 vs 1)
    expect(payload!.total_calls).toBeUndefined();
    expect(payload!.live_answers).toBe(1);
  });

  it("does not set last_contact_at if computed is null", () => {
    // Lead says it was contacted but no calls exist
    const lead = makeLead({ total_calls: 3, last_contact_at: "2026-03-10T17:00:00Z" });
    const calls: CallLogRecord[] = [];
    const payload = buildRepairPayload(lead, calls);
    expect(payload).not.toBeNull();
    expect(payload!.total_calls).toBe(0); // corrected from 3 to 0
    // last_contact_at should NOT be overwritten to null — that would erase legitimate data
    expect(payload!.last_contact_at).toBeUndefined();
  });
});
