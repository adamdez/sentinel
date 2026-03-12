/**
 * Write-Path Hardening Tests
 *
 * Tests for the hardened write paths introduced in Phase 4:
 * 1. Disposition category consistency (dialer now uses shared dispositionCategory)
 * 2. Deal-buyer lifecycle timestamp auto-population logic
 * 3. Atomic counter increment behavior expectations
 *
 * These are pure-function tests — no DB or HTTP required.
 */

import { describe, it, expect } from "vitest";
import { dispositionCategory } from "@/lib/comm-truth";

// ── Disposition Classification Consistency ─────────────────────────

/**
 * The dialer PATCH handler previously used an inline exclusion list:
 *   ["no_answer", "voicemail", "ghost", "skip_trace", "in_progress", "initiating", "sms_outbound"]
 *
 * It now uses dispositionCategory() from comm-truth.ts for isLive/isVM checks.
 * These tests verify the equivalence holds for all known dispositions.
 */
describe("dispositionCategory consistency with dialer isLive logic", () => {
  // Old inline logic: isLive = !["no_answer", "voicemail", "ghost", "skip_trace", "in_progress", "initiating", "sms_outbound"].includes(dispo)
  const NON_LIVE_DISPOS = new Set([
    "no_answer", "voicemail", "ghost", "skip_trace",
    "in_progress", "initiating", "sms_outbound",
  ]);

  function oldIsLive(dispo: string): boolean {
    return !NON_LIVE_DISPOS.has(dispo);
  }

  const LIVE_DISPOS = ["connected", "interested", "appointment_set", "appointment", "callback", "contract"];
  const VM_DISPOS = ["voicemail", "left_voicemail", "vm"];
  const DEAD_DISPOS = ["wrong_number", "disconnected", "do_not_call", "dnc", "dead"];
  const NO_ANSWER_DISPOS = ["no_answer", "busy", "no_pickup"];

  it("live dispositions are classified as 'live'", () => {
    for (const d of LIVE_DISPOS) {
      expect(dispositionCategory(d)).toBe("live");
    }
  });

  it("voicemail dispositions are classified as 'voicemail'", () => {
    for (const d of VM_DISPOS) {
      expect(dispositionCategory(d)).toBe("voicemail");
    }
  });

  it("dead dispositions are classified as 'dead'", () => {
    for (const d of DEAD_DISPOS) {
      expect(dispositionCategory(d)).toBe("dead");
    }
  });

  it("no-answer dispositions are classified as 'no_answer'", () => {
    for (const d of NO_ANSWER_DISPOS) {
      expect(dispositionCategory(d)).toBe("no_answer");
    }
  });

  it("live dispositions agree: new === old for known live dispos", () => {
    for (const d of LIVE_DISPOS) {
      const newIsLive = dispositionCategory(d) === "live";
      expect(newIsLive).toBe(oldIsLive(d));
    }
  });

  it("non-live dispositions agree: new !== 'live' for old exclusion list", () => {
    for (const d of NON_LIVE_DISPOS) {
      const newIsLive = dispositionCategory(d) === "live";
      expect(newIsLive).toBe(false);
      expect(oldIsLive(d)).toBe(false);
    }
  });

  it("dead dispositions were considered 'live' under old logic (semantic fix)", () => {
    // Important behavioral change: the old inline logic did NOT exclude
    // dead/wrong_number/disconnected/dnc from isLive. This was a bug —
    // a disconnected number is not a "live answer". The new logic correctly
    // classifies these as "dead", not "live".
    //
    // Impact: dead dispositions no longer increment live_answers counter.
    // This is the CORRECT behavior — wrong_number is not a live answer.
    for (const d of DEAD_DISPOS) {
      expect(dispositionCategory(d)).toBe("dead");
      expect(oldIsLive(d)).toBe(true); // old logic was wrong here
    }
  });
});

// ── Deal-Buyer Lifecycle Timestamp Logic ───────────────────────────

/**
 * Pure-function tests for the auto-set logic added to deal-buyers PATCH.
 * We test the decision logic without needing HTTP/DB.
 */
describe("deal-buyer lifecycle timestamp auto-population", () => {
  // Mirrors the logic in deal-buyers/[id]/route.ts PATCH handler
  const preContactStatuses = new Set(["not_contacted", "queued"]);
  const contactedStatuses = new Set(["sent", "interested", "offered", "follow_up", "selected", "passed"]);
  const outreachStatuses = new Set(["not_contacted", "queued", "sent"]);
  const responseStatuses = new Set(["interested", "offered", "follow_up", "selected"]);

  function shouldAutoSetDateContacted(
    prevStatus: string,
    newStatus: string,
    existingDateContacted: string | null,
  ): boolean {
    if (!preContactStatuses.has(prevStatus)) return false;
    if (!contactedStatuses.has(newStatus)) return false;
    if (existingDateContacted) return false;
    return true;
  }

  function shouldAutoSetRespondedAt(
    prevStatus: string,
    newStatus: string,
    existingRespondedAt: string | null,
  ): boolean {
    if (!outreachStatuses.has(prevStatus)) return false;
    if (!responseStatuses.has(newStatus)) return false;
    if (existingRespondedAt) return false;
    return true;
  }

  describe("date_contacted auto-set", () => {
    it("sets when moving from not_contacted to sent", () => {
      expect(shouldAutoSetDateContacted("not_contacted", "sent", null)).toBe(true);
    });

    it("sets when moving from queued to interested", () => {
      expect(shouldAutoSetDateContacted("queued", "interested", null)).toBe(true);
    });

    it("sets when moving from not_contacted to selected", () => {
      expect(shouldAutoSetDateContacted("not_contacted", "selected", null)).toBe(true);
    });

    it("does NOT set when already has date_contacted", () => {
      expect(shouldAutoSetDateContacted("not_contacted", "sent", "2026-03-01T10:00:00Z")).toBe(false);
    });

    it("does NOT set when moving from sent to interested (already past pre-contact)", () => {
      expect(shouldAutoSetDateContacted("sent", "interested", null)).toBe(false);
    });

    it("does NOT set when moving backward to not_contacted", () => {
      expect(shouldAutoSetDateContacted("interested", "not_contacted", null)).toBe(false);
    });
  });

  describe("responded_at auto-set", () => {
    it("sets when moving from sent to interested", () => {
      expect(shouldAutoSetRespondedAt("sent", "interested", null)).toBe(true);
    });

    it("sets when moving from not_contacted to offered", () => {
      expect(shouldAutoSetRespondedAt("not_contacted", "offered", null)).toBe(true);
    });

    it("sets when moving from queued to follow_up", () => {
      expect(shouldAutoSetRespondedAt("queued", "follow_up", null)).toBe(true);
    });

    it("sets when moving from sent to selected", () => {
      expect(shouldAutoSetRespondedAt("sent", "selected", null)).toBe(true);
    });

    it("does NOT set when already has responded_at", () => {
      expect(shouldAutoSetRespondedAt("sent", "interested", "2026-03-01T10:00:00Z")).toBe(false);
    });

    it("does NOT set when moving from interested to selected (already responded)", () => {
      expect(shouldAutoSetRespondedAt("interested", "selected", null)).toBe(false);
    });

    it("does NOT set when moving to passed (not a response status)", () => {
      expect(shouldAutoSetRespondedAt("sent", "passed", null)).toBe(false);
    });

    it("does NOT set when moving backward to sent", () => {
      expect(shouldAutoSetRespondedAt("interested", "sent", null)).toBe(false);
    });
  });
});

// ── Atomic Counter Increment Expectations ──────────────────────────

describe("atomic counter increment expectations", () => {
  /**
   * These tests document the expected behavior of the PostgreSQL RPC
   * `increment_lead_call_counters`. Since we can't call Supabase in unit tests,
   * we test the input derivation logic used by the dialer PATCH handler.
   */

  it("isLive is true only for 'live' category dispositions", () => {
    expect(dispositionCategory("connected") === "live").toBe(true);
    expect(dispositionCategory("interested") === "live").toBe(true);
    expect(dispositionCategory("no_answer") === "live").toBe(false);
    expect(dispositionCategory("voicemail") === "live").toBe(false);
    expect(dispositionCategory("dead") === "live").toBe(false);
    expect(dispositionCategory("ghost") === "live").toBe(false);
  });

  it("isVM is true only for 'voicemail' category dispositions", () => {
    expect(dispositionCategory("voicemail") === "voicemail").toBe(true);
    expect(dispositionCategory("left_voicemail") === "voicemail").toBe(true);
    expect(dispositionCategory("vm") === "voicemail").toBe(true);
    expect(dispositionCategory("connected") === "voicemail").toBe(false);
    expect(dispositionCategory("no_answer") === "voicemail").toBe(false);
  });

  it("dead dispositions do NOT increment live_answers (behavioral fix)", () => {
    // This is the key semantic fix: wrong_number, disconnected, dnc, dead
    // should NOT count as "live answers" — they are not live contacts.
    const deadDispos = ["wrong_number", "disconnected", "do_not_call", "dnc", "dead"];
    for (const d of deadDispos) {
      expect(dispositionCategory(d) === "live").toBe(false);
    }
  });

  it("non-call dispositions are classified as 'other' (excluded from counters separately)", () => {
    // NON_CALL_DISPOSITIONS in integrity-checks.ts filters these out of total_calls
    // The RPC always increments total_calls; the NON_CALL filter is for integrity checks only
    const nonCallDispos = ["initiating", "in_progress", "sms_outbound", "skip_trace", "ghost"];
    for (const d of nonCallDispos) {
      expect(dispositionCategory(d)).toBe("other");
    }
  });
});
