import { describe, expect, it } from "vitest";

import {
  getAllLeadIngestPolicies,
  getBlockedLeadSourceTags,
  getLeadIngestPolicy,
  isLeadIngestEnabled,
} from "@/lib/lead-ingest-policy";

describe("lead ingest policy", () => {
  it("defaults managed hidden-ingest sources to disabled", () => {
    const craigslist = getLeadIngestPolicy("craigslist_fsbo", {});
    const eliteSeed = getLeadIngestPolicy("elite_seed_top10", {});

    expect(craigslist.policy).toBe("disabled");
    expect(craigslist.reason).toBe("disabled by default");
    expect(eliteSeed.policy).toBe("disabled");
    expect(isLeadIngestEnabled("craigslist_fsbo", {})).toBe(false);
    expect(isLeadIngestEnabled("elite_seed_top10", {})).toBe(false);
  });

  it("honors explicit env enablement and computes blocked source tags", () => {
    const env = {
      LEAD_INGEST_POLICY_CRAIGSLIST_FSBO: "enabled",
      LEAD_INGEST_POLICY_ELITE_SEED_TOP10: "disabled",
    };

    expect(getLeadIngestPolicy("craigslist_fsbo", env).policy).toBe("enabled");
    expect(getLeadIngestPolicy("elite_seed_top10", env).policy).toBe("disabled");
    expect(getBlockedLeadSourceTags(env)).toEqual(["EliteSeed_Top10_20260301"]);

    expect(getAllLeadIngestPolicies(env)).toEqual([
      expect.objectContaining({
        sourceId: "craigslist_fsbo",
        policy: "enabled",
      }),
      expect.objectContaining({
        sourceId: "elite_seed_top10",
        policy: "disabled",
      }),
    ]);
  });
});
