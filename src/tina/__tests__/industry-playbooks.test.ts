import { describe, expect, it } from "vitest";
import { buildTinaIndustryPlaybooks } from "@/tina/lib/industry-playbooks";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("industry-playbooks", () => {
  it("identifies a real-estate file from profile and naming signals", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Northwest Homes LLC",
        principalBusinessActivity: "Real estate investing",
        naicsCode: "531110",
      },
    };

    const snapshot = buildTinaIndustryPlaybooks(draft);

    expect(snapshot.primaryIndustryId).toBe("real_estate");
    expect(snapshot.items[0]?.title).toBe("Real estate and property activity");
    expect(snapshot.items[0]?.likelyOpportunities).toContain("Installment-method review.");
  });

  it("falls back to the general small-business playbook when signals are thin", () => {
    const snapshot = buildTinaIndustryPlaybooks(createDefaultTinaWorkspaceDraft());

    expect(snapshot.primaryIndustryId).toBe("general_small_business");
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.fit).toBe("primary");
  });
});
