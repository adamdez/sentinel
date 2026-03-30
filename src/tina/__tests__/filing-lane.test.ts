import { describe, expect, it } from "vitest";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { createDefaultTinaProfile } from "@/tina/lib/workspace-draft";

describe("recommendTinaFilingLane", () => {
  it("supports the schedule c pilot lane for a single-member llc", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Tina Test LLC",
      entityType: "single_member_llc",
    });

    expect(result.laneId).toBe("schedule_c_single_member_llc");
    expect(result.support).toBe("supported");
    expect(result.blockers).toHaveLength(0);
  });

  it("fails closed when the entity type is unknown", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Unknown Co",
      entityType: "unsure",
    });

    expect(result.support).toBe("blocked");
    expect(result.blockers[0]).toContain("does not know");
  });

  it("marks s-corp as a future lane", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "S Corp Co",
      entityType: "s_corp",
    });

    expect(result.laneId).toBe("1120_s");
    expect(result.support).toBe("future");
  });

  it("routes a default multi-member llc to the partnership lane", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Two Owner LLC",
      entityType: "multi_member_llc",
    });

    expect(result.laneId).toBe("1065");
    expect(result.support).toBe("future");
    expect(result.reasons.join(" ")).toContain("default");
  });

  it("supports the married-couple community-property owner-return llc path", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Spouse LLC",
      entityType: "multi_member_llc",
      llcFederalTaxTreatment: "owner_return",
      llcCommunityPropertyStatus: "yes",
      formationState: "WA",
    });

    expect(result.laneId).toBe("schedule_c_single_member_llc");
    expect(result.support).toBe("supported");
    expect(result.title).toContain("Community-Property");
  });

  it("routes a single-member llc with a corporate election to form 1120 future work", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Corp Tax LLC",
      entityType: "single_member_llc",
      llcFederalTaxTreatment: "c_corp_return",
    });

    expect(result.laneId).toBe("1120");
    expect(result.support).toBe("future");
  });

  it("uses saved paper LLC election evidence when the organizer is still on the default path", () => {
    const result = recommendTinaFilingLane(
      {
        ...createDefaultTinaProfile(),
        businessName: "Election LLC",
        entityType: "single_member_llc",
      },
      [
        {
          id: "llc-election",
          sourceDocumentId: "doc-election",
          label: "LLC election clue",
          value: "Form 2553 election accepted for S corporation treatment.",
          confidence: "high",
          capturedAt: "2026-03-28T18:00:00.000Z",
        },
      ]
    );

    expect(result.laneId).toBe("1120_s");
    expect(result.support).toBe("future");
    expect(result.reasons.join(" ")).toContain("saved paper");
  });

  it("uses saved spouse community-property clues to support the owner-return exception", () => {
    const result = recommendTinaFilingLane(
      {
        ...createDefaultTinaProfile(),
        businessName: "Spouse Proof LLC",
        entityType: "multi_member_llc",
        llcFederalTaxTreatment: "unsure",
        llcCommunityPropertyStatus: "unsure",
        formationState: "WA",
      },
      [
        {
          id: "llc-treatment",
          sourceDocumentId: "doc-prior",
          label: "LLC tax treatment clue",
          value: "Reported on Schedule C on the owners' return.",
          confidence: "high",
          capturedAt: "2026-03-28T18:05:00.000Z",
        },
        {
          id: "llc-community",
          sourceDocumentId: "doc-prior",
          label: "Community property clue",
          value: "Husband and wife community property owners.",
          confidence: "high",
          capturedAt: "2026-03-28T18:05:00.000Z",
        },
      ]
    );

    expect(result.laneId).toBe("schedule_c_single_member_llc");
    expect(result.support).toBe("supported");
    expect(result.title).toContain("Community-Property");
  });

  it("uses saved paper partnership clues when a multi-member llc answer is still unsure", () => {
    const result = recommendTinaFilingLane(
      {
        ...createDefaultTinaProfile(),
        businessName: "Partner Proof LLC",
        entityType: "multi_member_llc",
        llcFederalTaxTreatment: "unsure",
      },
      [
        {
          id: "llc-treatment",
          sourceDocumentId: "doc-prior",
          label: "LLC tax treatment clue",
          value: "This paper mentions partnership return treatment for the LLC.",
          confidence: "high",
          capturedAt: "2026-03-28T19:10:00.000Z",
        },
      ]
    );

    expect(result.laneId).toBe("1065");
    expect(result.support).toBe("future");
    expect(result.title).toContain("Multi-Member LLC");
    expect(result.reasons.join(" ")).toContain("saved paper");
  });

  it("uses saved paper corporation clues when a single-member llc answer is still unsure", () => {
    const result = recommendTinaFilingLane(
      {
        ...createDefaultTinaProfile(),
        businessName: "Corp Proof LLC",
        entityType: "single_member_llc",
        llcFederalTaxTreatment: "unsure",
      },
      [
        {
          id: "llc-corp-treatment",
          sourceDocumentId: "doc-prior",
          label: "LLC tax treatment clue",
          value: "This paper mentions corporation return treatment for the LLC.",
          confidence: "high",
          capturedAt: "2026-03-28T22:10:00.000Z",
        },
      ]
    );

    expect(result.laneId).toBe("1120");
    expect(result.support).toBe("future");
    expect(result.title).toContain("Corporation");
    expect(result.reasons.join(" ")).toContain("saved paper");
  });

  it("keeps an explicit owner-return LLC answer in place until a human resolves a saved-paper conflict", () => {
    const result = recommendTinaFilingLane(
      {
        ...createDefaultTinaProfile(),
        businessName: "Conflict LLC",
        entityType: "single_member_llc",
        llcFederalTaxTreatment: "owner_return",
      },
      [
        {
          id: "llc-election",
          sourceDocumentId: "doc-election",
          label: "LLC election clue",
          value: "Form 2553 election accepted for S corporation treatment.",
          confidence: "high",
          capturedAt: "2026-03-28T23:10:00.000Z",
        },
      ]
    );

    expect(result.laneId).toBe("schedule_c_single_member_llc");
    expect(result.support).toBe("supported");
    expect(result.title).toContain("Owner Return LLC");
    expect(result.reasons.join(" ")).not.toContain("saved paper");
  });

  it("blocks the pilot when idaho activity is present", () => {
    const result = recommendTinaFilingLane({
      ...createDefaultTinaProfile(),
      businessName: "Border Business",
      entityType: "sole_prop",
      hasIdahoActivity: true,
    });

    expect(result.support).toBe("blocked");
    expect(result.blockers.join(" ")).toContain("Idaho");
  });
});
