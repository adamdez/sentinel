/**
 * Data Integrity Checks
 *
 * Pure functions for detecting drift between cached convenience fields
 * on lead records and their canonical truth sources (calls_log, etc.).
 *
 * These are DETECTION-ONLY helpers — they never mutate data.
 * Used by admin integrity reports and reconciliation tools.
 *
 * Design:
 * - All functions are pure (no DB access, no side effects)
 * - They accept pre-fetched data and return drift analysis
 * - Repair logic is separate and requires explicit admin action
 */

import { dispositionCategory } from "@/lib/comm-truth";

// ── Types ──────────────────────────────────────────────────────────

export interface CallLogRecord {
  lead_id: string;
  disposition: string | null;
  ended_at: string | null;
  started_at: string | null;
}

export interface LeadCounters {
  id: string;
  total_calls: number | null;
  live_answers: number | null;
  voicemails_left: number | null;
  last_contact_at: string | null;
}

export interface ComputedCallCounts {
  totalCalls: number;
  liveAnswers: number;
  voicemailsLeft: number;
}

export interface ComputedLastContact {
  /** ISO string of the latest call ended_at, or null if no calls */
  lastContactAt: string | null;
}

export interface CounterDrift {
  leadId: string;
  field: "total_calls" | "live_answers" | "voicemails_left";
  cached: number;
  computed: number;
  delta: number;
}

export interface LastContactDrift {
  leadId: string;
  cached: string | null;
  computed: string | null;
  /** Absolute difference in milliseconds, or null if one side is null */
  deltaMs: number | null;
}

export interface IntegrityReport {
  leadsChecked: number;
  leadsWithDrift: number;
  counterDrifts: CounterDrift[];
  lastContactDrifts: LastContactDrift[];
  /** Leads with cached total_calls > 0 but zero calls_log records (possible manual set or deleted logs) */
  orphanedCounterLeads: string[];
  /** Leads with calls_log records but cached total_calls = 0 (counter never incremented) */
  missedCounterLeads: string[];
}

// ── Call Count Computation ─────────────────────────────────────────

/**
 * Compute what a lead's call counters SHOULD be based on calls_log records.
 *
 * Uses the same disposition classification as comm-truth.ts to ensure
 * consistent definitions of "live" and "voicemail".
 *
 * Excludes dispositions that don't represent actual call attempts:
 * - "initiating" (call was started but never connected or timed out)
 * - "in_progress" (call is currently active)
 * - "sms_outbound" (not a call)
 * - "skip_trace" (data lookup, not a call)
 * - "ghost" (no audio detected, system artifact)
 */
const NON_CALL_DISPOSITIONS = new Set([
  "initiating",
  "in_progress",
  "sms_outbound",
  "skip_trace",
  "ghost",
]);

export function computeCallCounts(callLogs: CallLogRecord[]): ComputedCallCounts {
  let totalCalls = 0;
  let liveAnswers = 0;
  let voicemailsLeft = 0;

  for (const log of callLogs) {
    const dispo = (log.disposition ?? "").toLowerCase().trim();

    // Skip non-call dispositions (same logic as dialer PATCH handler)
    if (NON_CALL_DISPOSITIONS.has(dispo)) continue;

    totalCalls++;

    const category = dispositionCategory(log.disposition);
    if (category === "live") liveAnswers++;
    if (category === "voicemail") voicemailsLeft++;
  }

  return { totalCalls, liveAnswers, voicemailsLeft };
}

// ── Last Contact Computation ───────────────────────────────────────

/**
 * Compute the most recent contact timestamp from calls_log records.
 * Uses ended_at if available, falls back to started_at.
 */
export function computeLastContact(callLogs: CallLogRecord[]): ComputedLastContact {
  let latestMs = -Infinity;
  let latestIso: string | null = null;

  for (const log of callLogs) {
    const ts = log.ended_at ?? log.started_at;
    if (!ts) continue;
    const ms = new Date(ts).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms > latestMs) {
      latestMs = ms;
      latestIso = ts;
    }
  }

  return { lastContactAt: latestIso };
}

// ── Drift Detection ────────────────────────────────────────────────

/**
 * Detect counter drift between cached lead fields and computed values.
 * Returns an array of drifts (empty = no drift).
 */
export function detectCounterDrift(
  lead: LeadCounters,
  computed: ComputedCallCounts,
): CounterDrift[] {
  const drifts: CounterDrift[] = [];
  const cached = {
    total_calls: lead.total_calls ?? 0,
    live_answers: lead.live_answers ?? 0,
    voicemails_left: lead.voicemails_left ?? 0,
  };

  if (cached.total_calls !== computed.totalCalls) {
    drifts.push({
      leadId: lead.id,
      field: "total_calls",
      cached: cached.total_calls,
      computed: computed.totalCalls,
      delta: computed.totalCalls - cached.total_calls,
    });
  }

  if (cached.live_answers !== computed.liveAnswers) {
    drifts.push({
      leadId: lead.id,
      field: "live_answers",
      cached: cached.live_answers,
      computed: computed.liveAnswers,
      delta: computed.liveAnswers - cached.live_answers,
    });
  }

  if (cached.voicemails_left !== computed.voicemailsLeft) {
    drifts.push({
      leadId: lead.id,
      field: "voicemails_left",
      cached: cached.voicemails_left,
      computed: computed.voicemailsLeft,
      delta: computed.voicemailsLeft - cached.voicemails_left,
    });
  }

  return drifts;
}

/**
 * Detect last_contact_at drift.
 * Returns null if no drift detected.
 *
 * Tolerance: 60 seconds (calls_log ended_at and lead last_contact_at
 * are set at slightly different times in the write path).
 */
const LAST_CONTACT_TOLERANCE_MS = 60_000;

export function detectLastContactDrift(
  lead: LeadCounters,
  computed: ComputedLastContact,
): LastContactDrift | null {
  const cachedIso = lead.last_contact_at;
  const computedIso = computed.lastContactAt;

  // Both null = consistent
  if (!cachedIso && !computedIso) return null;

  // One null, other not = drift
  if (!cachedIso || !computedIso) {
    return {
      leadId: lead.id,
      cached: cachedIso ?? null,
      computed: computedIso,
      deltaMs: null,
    };
  }

  const cachedMs = new Date(cachedIso).getTime();
  const computedMs = new Date(computedIso).getTime();

  if (Number.isNaN(cachedMs) || Number.isNaN(computedMs)) {
    return {
      leadId: lead.id,
      cached: cachedIso,
      computed: computedIso,
      deltaMs: null,
    };
  }

  const deltaMs = Math.abs(computedMs - cachedMs);
  if (deltaMs <= LAST_CONTACT_TOLERANCE_MS) return null;

  return {
    leadId: lead.id,
    cached: cachedIso,
    computed: computedIso,
    deltaMs,
  };
}

// ── Full Integrity Report ──────────────────────────────────────────

/**
 * Build a complete integrity report for a set of leads and their calls_log records.
 *
 * @param leads - Lead records with cached counter fields
 * @param callLogs - All calls_log records for the given leads
 */
export function buildIntegrityReport(
  leads: LeadCounters[],
  callLogs: CallLogRecord[],
): IntegrityReport {
  // Group calls by lead_id
  const callsByLead = new Map<string, CallLogRecord[]>();
  for (const log of callLogs) {
    if (!log.lead_id) continue;
    const existing = callsByLead.get(log.lead_id) ?? [];
    existing.push(log);
    callsByLead.set(log.lead_id, existing);
  }

  const counterDrifts: CounterDrift[] = [];
  const lastContactDrifts: LastContactDrift[] = [];
  const orphanedCounterLeads: string[] = [];
  const missedCounterLeads: string[] = [];
  const leadsWithDriftSet = new Set<string>();

  for (const lead of leads) {
    const leadCalls = callsByLead.get(lead.id) ?? [];
    const computed = computeCallCounts(leadCalls);
    const computedContact = computeLastContact(leadCalls);

    // Counter drift
    const drifts = detectCounterDrift(lead, computed);
    if (drifts.length > 0) {
      counterDrifts.push(...drifts);
      leadsWithDriftSet.add(lead.id);
    }

    // Last contact drift
    const contactDrift = detectLastContactDrift(lead, computedContact);
    if (contactDrift) {
      lastContactDrifts.push(contactDrift);
      leadsWithDriftSet.add(lead.id);
    }

    // Orphaned counters: lead says it has calls, but no calls_log records exist
    if ((lead.total_calls ?? 0) > 0 && leadCalls.length === 0) {
      orphanedCounterLeads.push(lead.id);
      leadsWithDriftSet.add(lead.id);
    }

    // Missed counters: calls_log has records, but lead says zero
    if (leadCalls.length > 0 && (lead.total_calls ?? 0) === 0) {
      missedCounterLeads.push(lead.id);
      leadsWithDriftSet.add(lead.id);
    }
  }

  return {
    leadsChecked: leads.length,
    leadsWithDrift: leadsWithDriftSet.size,
    counterDrifts,
    lastContactDrifts,
    orphanedCounterLeads,
    missedCounterLeads,
  };
}

// ── Repair Payload Generation ──────────────────────────────────────

/**
 * Generate a safe repair payload for a single lead's call counters.
 *
 * Returns the fields that should be updated to match calls_log truth.
 * Does NOT execute the update — caller must apply it.
 *
 * This is intentionally conservative:
 * - Only includes fields that actually differ
 * - Returns null if no repair is needed
 */
export function buildRepairPayload(
  lead: LeadCounters,
  callLogs: CallLogRecord[],
): Record<string, unknown> | null {
  const computed = computeCallCounts(callLogs);
  const computedContact = computeLastContact(callLogs);
  const drifts = detectCounterDrift(lead, computed);
  const contactDrift = detectLastContactDrift(lead, computedContact);

  if (drifts.length === 0 && !contactDrift) return null;

  const payload: Record<string, unknown> = {};

  for (const drift of drifts) {
    payload[drift.field] = drift.computed;
  }

  if (contactDrift && computedContact.lastContactAt) {
    payload.last_contact_at = computedContact.lastContactAt;
  }

  payload.updated_at = new Date().toISOString();

  return payload;
}
