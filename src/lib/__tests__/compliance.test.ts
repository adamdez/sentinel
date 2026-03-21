import { describe, it, expect } from "vitest";

// --- Pure compliance business-logic helpers ---

/** Check if a lead's status blocks outbound contact */
function isDncStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return s === "dnc" || s === "do_not_call";
}

/** Check if a disposition code should flag a lead as DNC */
function isDncDisposition(disposition: string | null | undefined): boolean {
  if (!disposition) return false;
  const d = disposition.toLowerCase().trim();
  return d === "do_not_call" || d === "dnc";
}

/** Determine if a lead can be called */
function canCallLead(lead: {
  status: string;
  dnc_flag?: boolean;
}): boolean {
  if (lead.dnc_flag) return false;
  if (isDncStatus(lead.status)) return false;
  return true;
}

/**
 * Washington state outbound rules:
 * Default outreach type is cold_call. Cold SMS is NOT allowed by default.
 */
function getDefaultOutreachType(state: string): "cold_call" | "cold_sms" {
  // Washington is call-only by default
  if (state.toUpperCase() === "WA" || state.toLowerCase() === "washington") {
    return "cold_call";
  }
  // Idaho and other states also default to cold_call in this system
  return "cold_call";
}

/** Validate that a call log record has required fields */
function validateCallLog(log: {
  lead_id?: string | null;
  started_at?: string | null;
  disposition?: string | null;
}): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!log.lead_id) missing.push("lead_id");
  if (!log.started_at) missing.push("started_at");
  if (!log.disposition) missing.push("disposition");
  return { valid: missing.length === 0, missing };
}

// --- Tests ---

describe("Compliance / DNC rules", () => {
  describe("DNC status detection", () => {
    it("blocks outbound for status 'dnc'", () => {
      expect(isDncStatus("dnc")).toBe(true);
    });

    it("blocks outbound for status 'do_not_call'", () => {
      expect(isDncStatus("do_not_call")).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(isDncStatus("DNC")).toBe(true);
      expect(isDncStatus("Do_Not_Call")).toBe(true);
    });

    it("trims whitespace", () => {
      expect(isDncStatus("  dnc  ")).toBe(true);
    });

    it("does not flag active statuses", () => {
      expect(isDncStatus("new")).toBe(false);
      expect(isDncStatus("lead")).toBe(false);
      expect(isDncStatus("contacted")).toBe(false);
    });

    it("handles null/undefined gracefully", () => {
      expect(isDncStatus(null)).toBe(false);
      expect(isDncStatus(undefined)).toBe(false);
    });
  });

  describe("DNC disposition code", () => {
    it("flags 'do_not_call' disposition", () => {
      expect(isDncDisposition("do_not_call")).toBe(true);
    });

    it("flags 'dnc' disposition", () => {
      expect(isDncDisposition("dnc")).toBe(true);
    });

    it("does not flag other dispositions", () => {
      expect(isDncDisposition("no_answer")).toBe(false);
      expect(isDncDisposition("voicemail")).toBe(false);
      expect(isDncDisposition("callback")).toBe(false);
    });
  });

  describe("canCallLead", () => {
    it("allows calling active leads", () => {
      expect(canCallLead({ status: "new" })).toBe(true);
      expect(canCallLead({ status: "lead" })).toBe(true);
      expect(canCallLead({ status: "contacted" })).toBe(true);
    });

    it("blocks calling DNC-status leads", () => {
      expect(canCallLead({ status: "dnc" })).toBe(false);
      expect(canCallLead({ status: "do_not_call" })).toBe(false);
    });

    it("blocks calling leads with dnc_flag set", () => {
      expect(canCallLead({ status: "new", dnc_flag: true })).toBe(false);
    });

    it("allows calling leads with dnc_flag explicitly false", () => {
      expect(canCallLead({ status: "new", dnc_flag: false })).toBe(true);
    });
  });

  describe("Washington outbound rules", () => {
    it("defaults to cold_call for WA", () => {
      expect(getDefaultOutreachType("WA")).toBe("cold_call");
    });

    it("defaults to cold_call for full state name", () => {
      expect(getDefaultOutreachType("Washington")).toBe("cold_call");
    });

    it("never defaults to cold_sms for Washington", () => {
      expect(getDefaultOutreachType("WA")).not.toBe("cold_sms");
    });

    it("defaults to cold_call for Idaho as well", () => {
      expect(getDefaultOutreachType("ID")).toBe("cold_call");
    });
  });

  describe("Call logging validation", () => {
    it("accepts a complete call log record", () => {
      const result = validateCallLog({
        lead_id: "lead_abc123",
        started_at: "2026-03-12T10:30:00Z",
        disposition: "no_answer",
      });
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it("rejects a call log missing lead_id", () => {
      const result = validateCallLog({
        lead_id: null,
        started_at: "2026-03-12T10:30:00Z",
        disposition: "voicemail",
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("lead_id");
    });

    it("rejects a call log missing started_at", () => {
      const result = validateCallLog({
        lead_id: "lead_abc123",
        started_at: null,
        disposition: "callback",
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("started_at");
    });

    it("rejects a call log missing disposition", () => {
      const result = validateCallLog({
        lead_id: "lead_abc123",
        started_at: "2026-03-12T10:30:00Z",
        disposition: null,
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("disposition");
    });

    it("reports all missing fields at once", () => {
      const result = validateCallLog({
        lead_id: null,
        started_at: null,
        disposition: null,
      });
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(["lead_id", "started_at", "disposition"]);
    });
  });
});
