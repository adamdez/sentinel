import { describe, expect, it } from "vitest";

import {
  canUserClaimLead,
  isLeadUnclaimed,
  normalizeAssignedUserId,
} from "@/lib/lead-ownership";

describe("lead ownership helpers", () => {
  it("treats blank and unassigned values as unclaimed", () => {
    expect(normalizeAssignedUserId(null)).toBeNull();
    expect(normalizeAssignedUserId(undefined)).toBeNull();
    expect(normalizeAssignedUserId("")).toBeNull();
    expect(normalizeAssignedUserId("   ")).toBeNull();
    expect(normalizeAssignedUserId("unassigned")).toBeNull();
    expect(isLeadUnclaimed("unassigned")).toBe(true);
  });

  it("allows claims only when the lead is unclaimed or already mine", () => {
    expect(canUserClaimLead({ assignedUserId: null, claimantUserId: "adam" })).toBe(true);
    expect(canUserClaimLead({ assignedUserId: "adam", claimantUserId: "adam" })).toBe(true);
    expect(canUserClaimLead({ assignedUserId: "logan", claimantUserId: "adam" })).toBe(false);
  });

  it("rejects claims without a real claimant user id", () => {
    expect(canUserClaimLead({ assignedUserId: null, claimantUserId: null })).toBe(false);
    expect(canUserClaimLead({ assignedUserId: null, claimantUserId: "   " })).toBe(false);
  });
});
