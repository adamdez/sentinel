import { describe, expect, it } from "vitest";
import {
  classifyTinaResearchSource,
  describeTinaResearchPolicy,
  evaluateTinaTaxIdea,
} from "@/tina/lib/research-policy";

describe("classifyTinaResearchSource", () => {
  it("treats official tax and law sites as primary authority", () => {
    expect(classifyTinaResearchSource("https://www.irs.gov/instructions/i8275").sourceClass).toBe(
      "primary_authority"
    );
    expect(classifyTinaResearchSource("https://dor.wa.gov/taxes-rates/business-occupation-tax").sourceClass).toBe(
      "primary_authority"
    );
  });

  it("treats community sites as discovery-only leads", () => {
    expect(classifyTinaResearchSource("https://www.reddit.com/r/tax/comments/example").sourceClass).toBe(
      "community_lead"
    );
    expect(classifyTinaResearchSource("https://x.com/taxperson/status/123").sourceClass).toBe(
      "community_lead"
    );
    expect(classifyTinaResearchSource("https://boards.4chan.org/biz/thread/123").sourceClass).toBe(
      "low_trust_lead"
    );
  });

  it("treats Tina's own extracted clues as internal signals", () => {
    expect(classifyTinaResearchSource("https://tina.internal/idea/payroll").sourceClass).toBe(
      "internal_signal"
    );
  });
});

describe("evaluateTinaTaxIdea", () => {
  it("allows a strongly supported idea into the filing workflow", () => {
    const decision = evaluateTinaTaxIdea({
      sourceClasses: ["primary_authority", "community_lead"],
      hasPrimaryAuthority: true,
      hasSubstantialAuthority: true,
      hasReasonableBasis: true,
      needsDisclosure: false,
      isTaxShelterLike: false,
      isFrivolous: false,
    });

    expect(decision.bucket).toBe("authoritative_and_usable");
    expect(decision.allowReturnImpact).toBe(true);
  });

  it("keeps discovery-only ideas out of the return", () => {
    const decision = evaluateTinaTaxIdea({
      sourceClasses: ["community_lead", "low_trust_lead"],
      hasPrimaryAuthority: false,
      hasSubstantialAuthority: false,
      hasReasonableBasis: false,
      needsDisclosure: false,
      isTaxShelterLike: false,
      isFrivolous: false,
    });

    expect(decision.bucket).toBe("interesting_but_unsupported");
    expect(decision.allowReturnImpact).toBe(false);
  });

  it("routes disclosure-grade ideas into elevated review", () => {
    const decision = evaluateTinaTaxIdea({
      sourceClasses: ["primary_authority", "secondary_analysis"],
      hasPrimaryAuthority: true,
      hasSubstantialAuthority: false,
      hasReasonableBasis: true,
      needsDisclosure: true,
      isTaxShelterLike: false,
      isFrivolous: false,
    });

    expect(decision.bucket).toBe("usable_with_disclosure");
    expect(decision.requireHumanReview).toBe(true);
  });
});

describe("describeTinaResearchPolicy", () => {
  it("returns the core policy rules in plain language", () => {
    const policy = describeTinaResearchPolicy();

    expect(policy).toHaveLength(4);
    expect(policy[0]).toContain("search widely");
    expect(policy[1]).toContain("primary authority");
  });
});
