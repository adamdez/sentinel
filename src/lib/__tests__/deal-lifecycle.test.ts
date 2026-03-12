import { describe, it, expect } from "vitest";
import { isContractStatus } from "@/lib/analytics-helpers";

// --- Pure helper functions for deal lifecycle logic ---

/** Valid deal-buyer status progression */
const DEAL_BUYER_STATUS_ORDER = [
  "not_contacted",
  "queued",
  "sent",
  "interested",
  "offered",
  "passed",
  "follow_up",
  "selected",
] as const;

type DealBuyerStatus = (typeof DEAL_BUYER_STATUS_ORDER)[number];

function isValidForwardProgression(
  from: DealBuyerStatus,
  to: DealBuyerStatus
): boolean {
  const fromIdx = DEAL_BUYER_STATUS_ORDER.indexOf(from);
  const toIdx = DEAL_BUYER_STATUS_ORDER.indexOf(to);
  return toIdx > fromIdx;
}

/** Statuses that should auto-set responded_at */
const RESPONSE_STATUSES = new Set<string>([
  "interested",
  "offered",
  "follow_up",
  "selected",
]);

/** Statuses that should NOT auto-set responded_at */
const NON_RESPONSE_STATUSES = new Set<string>(["queued", "sent"]);

function shouldAutoSetRespondedAt(
  fromStatus: string,
  toStatus: string
): boolean {
  const fromIsPassive =
    fromStatus === "not_contacted" || fromStatus === "sent";
  return fromIsPassive && RESPONSE_STATUSES.has(toStatus);
}

/** Merge dispo prep JSONB: partial update preserves existing fields */
function mergeDispoPrep(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  return { ...existing, ...patch };
}

/** Business rule: selected buyer must have a selection_reason */
function validateSelectedBuyer(buyer: {
  status: string;
  selection_reason?: string | null;
}): { valid: boolean; error?: string } {
  if (buyer.status === "selected" && !buyer.selection_reason?.trim()) {
    return {
      valid: false,
      error: "selection_reason is required when status is selected",
    };
  }
  return { valid: true };
}

/** Sum assignment fees for closed deals */
function sumClosedRevenue(
  deals: { status: string; assignment_fee: number | null }[]
): number {
  return deals
    .filter((d) => isContractStatus(d.status) && d.status.toLowerCase() === "closed")
    .reduce((sum, d) => sum + (d.assignment_fee ?? 0), 0);
}

// --- Tests ---

describe("Deal lifecycle", () => {
  describe("Deal status progression", () => {
    it("negotiating → under_contract → closed is a valid contract path", () => {
      const path = ["negotiating", "under_contract", "closed"];
      // Each step after under_contract should be a contract status
      expect(isContractStatus("under_contract")).toBe(true);
      expect(isContractStatus("closed")).toBe(true);
      // negotiating is not yet a contract status
      expect(isContractStatus("negotiating")).toBe(false);
    });
  });

  describe("isContractStatus", () => {
    it.each([
      ["under_contract", true],
      ["contract", true],
      ["contracted", true],
      ["closed", true],
      ["assigned", true],
      ["UNDER_CONTRACT", true],
      [" Closed ", true],
      ["negotiating", false],
      ["new", false],
      ["dead", false],
      [null, false],
      [undefined, false],
      ["", false],
    ])("isContractStatus(%j) → %s", (input, expected) => {
      expect(isContractStatus(input as string | null | undefined)).toBe(
        expected
      );
    });
  });

  describe("Revenue calculation", () => {
    it("sums assignment_fee for closed deals only", () => {
      const deals = [
        { status: "closed", assignment_fee: 8000 },
        { status: "closed", assignment_fee: 12000 },
        { status: "under_contract", assignment_fee: 5000 },
        { status: "negotiating", assignment_fee: 3000 },
        { status: "closed", assignment_fee: null },
      ];
      // Only the two closed deals with fees count
      expect(sumClosedRevenue(deals)).toBe(20000);
    });
  });

  describe("Deal-buyer status transitions", () => {
    it("allows valid forward progression", () => {
      expect(isValidForwardProgression("not_contacted", "queued")).toBe(true);
      expect(isValidForwardProgression("queued", "sent")).toBe(true);
      expect(isValidForwardProgression("sent", "interested")).toBe(true);
      expect(isValidForwardProgression("interested", "offered")).toBe(true);
      expect(isValidForwardProgression("offered", "selected")).toBe(true);
      expect(isValidForwardProgression("not_contacted", "selected")).toBe(true);
    });

    it("rejects backward progression", () => {
      expect(isValidForwardProgression("selected", "not_contacted")).toBe(
        false
      );
      expect(isValidForwardProgression("interested", "queued")).toBe(false);
      expect(isValidForwardProgression("sent", "not_contacted")).toBe(false);
    });

    it("rejects same-status transition", () => {
      expect(isValidForwardProgression("sent", "sent")).toBe(false);
    });
  });

  describe("responded_at auto-set rules", () => {
    it("auto-sets responded_at when moving from not_contacted to interested", () => {
      expect(shouldAutoSetRespondedAt("not_contacted", "interested")).toBe(
        true
      );
    });

    it("auto-sets responded_at when moving from sent to offered", () => {
      expect(shouldAutoSetRespondedAt("sent", "offered")).toBe(true);
    });

    it("auto-sets responded_at when moving from not_contacted to follow_up", () => {
      expect(shouldAutoSetRespondedAt("not_contacted", "follow_up")).toBe(
        true
      );
    });

    it("does NOT auto-set responded_at when moving to queued", () => {
      expect(shouldAutoSetRespondedAt("not_contacted", "queued")).toBe(false);
    });

    it("does NOT auto-set responded_at when moving to sent", () => {
      expect(shouldAutoSetRespondedAt("not_contacted", "sent")).toBe(false);
    });
  });

  describe("Dispo prep JSONB merge", () => {
    it("partial update preserves existing fields", () => {
      const existing = {
        arv: 250000,
        repair_estimate: 40000,
        notes: "Good bones",
      };
      const patch = { repair_estimate: 45000, offer_price: 180000 };
      const merged = mergeDispoPrep(existing, patch);

      expect(merged).toEqual({
        arv: 250000,
        repair_estimate: 45000,
        notes: "Good bones",
        offer_price: 180000,
      });
    });

    it("does not remove fields not present in patch", () => {
      const existing = { arv: 250000, notes: "Keep this" };
      const patch = { arv: 260000 };
      const merged = mergeDispoPrep(existing, patch);
      expect(merged.notes).toBe("Keep this");
      expect(merged.arv).toBe(260000);
    });
  });

  describe("Selected buyer validation", () => {
    it("requires selection_reason when status is selected", () => {
      const result = validateSelectedBuyer({
        status: "selected",
        selection_reason: null,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain("selection_reason");
    });

    it("rejects empty-string selection_reason for selected status", () => {
      const result = validateSelectedBuyer({
        status: "selected",
        selection_reason: "   ",
      });
      expect(result.valid).toBe(false);
    });

    it("accepts selected buyer with a valid selection_reason", () => {
      const result = validateSelectedBuyer({
        status: "selected",
        selection_reason: "Best offer price and fastest close timeline",
      });
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("does not require selection_reason for non-selected statuses", () => {
      const result = validateSelectedBuyer({
        status: "interested",
        selection_reason: null,
      });
      expect(result.valid).toBe(true);
    });
  });
});
