import { describe, expect, it } from "vitest";
import {
  buildTinaOwnershipRiskLines,
  buildTinaOwnershipSupportReason,
  buildTinaStartPathAssessment,
  describeTinaFilingLane,
  describeTinaOwnerCount,
  describeTinaTaxElection,
  formatTinaFilingLaneList,
  inferTinaReturnTypeHintLane,
  tinaNeedsEntityElectionSupport,
  tinaNeedsOwnershipSupport,
  tinaOwnershipSupportIsRequired,
} from "@/tina/lib/start-path";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("start-path helpers", () => {
  it("parses return-type hints into Tina lanes", () => {
    expect(inferTinaReturnTypeHintLane("1120-S / S-corp")).toBe("1120_s");
    expect(inferTinaReturnTypeHintLane("1065 partnership")).toBe("1065");
    expect(inferTinaReturnTypeHintLane("1040 Schedule C")).toBe(
      "schedule_c_single_member_llc"
    );
    expect(inferTinaReturnTypeHintLane("unrelated note")).toBeNull();
  });

  it("builds a unified start-path assessment from organizer facts and saved-paper clues", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      sourceFacts: [
        {
          id: "return-hint-1",
          sourceDocumentId: "doc-1",
          label: "Return type hint",
          value: "1120-S / S-corp",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:00:00.000Z",
        },
        {
          id: "ownership-change-1",
          sourceDocumentId: "doc-2",
          label: "Ownership change clue",
          value: "This paper mentions an ownership change or partner exit.",
          confidence: "medium" as const,
          capturedAt: "2026-03-27T05:01:00.000Z",
        },
      ],
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        entityType: "single_member_llc" as const,
        ownerCount: 2,
        taxElection: "default" as const,
      },
    };

    const assessment = buildTinaStartPathAssessment(draft);

    expect(assessment.singleHintedLane).toBe("1120_s");
    expect(assessment.hasHintVsOrganizerConflict).toBe(true);
    expect(assessment.ownershipMismatchWithSingleOwnerLane).toBe(true);
    expect(assessment.ownershipChangeClue?.id).toBe("ownership-change-1");
  });

  it("keeps ownership descriptions consistent across handoff surfaces", () => {
    const profile = {
      ...createDefaultTinaWorkspaceDraft().profile,
      ownerCount: 2,
      taxElection: "s_corp" as const,
      ownershipChangedDuringYear: true,
      hasFormerOwnerPayments: true,
    };

    expect(describeTinaOwnerCount(profile.ownerCount)).toBe("2 owners");
    expect(describeTinaTaxElection(profile.taxElection)).toBe("S-corp election indicated");
    expect(buildTinaOwnershipRiskLines(profile)).toContain("Ownership changed during the tax year");
    expect(describeTinaFilingLane("1120")).toBe("1120 / C-corp");
    expect(formatTinaFilingLaneList(["1120_s", "1065"])).toBe(
      "1120-S / S-corp, 1065 / partnership"
    );
  });

  it("centralizes ownership-support and election-proof policy", () => {
    const baseProfile = createDefaultTinaWorkspaceDraft().profile;

    expect(
      tinaNeedsOwnershipSupport({
        ...baseProfile,
        entityType: "single_member_llc",
      })
    ).toBe(true);
    expect(
      tinaOwnershipSupportIsRequired({
        ...baseProfile,
        entityType: "multi_member_llc",
        ownerCount: 2,
      })
    ).toBe(true);
    expect(
      buildTinaOwnershipSupportReason({
        ...baseProfile,
        entityType: "single_member_llc",
        ownershipChangedDuringYear: true,
      })
    ).toContain("ownership timeline");
    expect(
      tinaNeedsEntityElectionSupport({
        ...baseProfile,
        taxElection: "s_corp",
      })
    ).toBe(true);
  });
});
