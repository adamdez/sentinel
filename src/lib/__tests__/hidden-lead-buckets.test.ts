import { describe, expect, it } from "vitest";

import { buildHiddenLeadBucketAudit } from "@/lib/hidden-lead-buckets";

describe("buildHiddenLeadBucketAudit", () => {
  it("counts hidden buckets, blocked sources, next-action gaps, and state/county drift", () => {
    const audit = buildHiddenLeadBucketAudit([
      {
        id: "lead-1",
        status: "staging",
        source: "craigslist",
        assigned_to: null,
        next_action: null,
        property_id: "property-1",
        properties: {
          state: "ID",
          county: "Spokane",
        },
      },
      {
        id: "lead-2",
        status: "prospect",
        source: "EliteSeed_Top10_20260301",
        assigned_to: null,
        next_action: "call seller",
        property_id: "property-2",
        properties: {
          state: "MT",
          county: "Spokane",
        },
      },
      {
        id: "lead-3",
        status: "staging",
        source: "manual",
        assigned_to: "user-1",
        next_action: "review",
        property_id: "property-3",
        properties: {
          state: "WA",
          county: "Spokane",
        },
      },
    ]);

    expect(audit.totalHiddenLeads).toBe(3);
    expect(audit.byStatus).toEqual({
      staging: 2,
      prospect: 1,
    });
    expect(audit.bySource).toEqual({
      craigslist: 1,
      EliteSeed_Top10_20260301: 1,
      manual: 1,
    });
    expect(audit.blockedSourceRows).toBe(2);
    expect(audit.blockedSourceLeadIds).toEqual(["lead-1", "lead-2"]);
    expect(audit.missingNextActionRows).toBe(1);
    expect(audit.stateCountyDrift).toEqual([
      {
        state: "ID",
        county: "Spokane",
        expectedState: "WA",
        count: 1,
      },
      {
        state: "MT",
        county: "Spokane",
        expectedState: "WA",
        count: 1,
      },
    ]);
  });
});
