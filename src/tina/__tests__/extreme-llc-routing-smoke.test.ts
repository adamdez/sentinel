import { describe, expect, it } from "vitest";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("extreme llc routing smoke", () => {
  it("routes a 60/40 two-owner llc to partnership review", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Sixty Forty LLC",
        entityType: "single_member_llc" as const,
        ownerCount: 2,
      },
      sourceFacts: [
        {
          id: "multi-owner",
          sourceDocumentId: "doc-1",
          label: "Multi-owner clue",
          value: "This paper may show more than one owner, partner, member, K-1, or ownership split.",
          confidence: "high" as const,
          capturedAt: "2026-04-02T20:00:00.000Z",
        },
      ],
    };

    const assessment = buildTinaStartPathAssessment(draft);
    expect(assessment.recommendation.laneId).toBe("1065");
    expect(assessment.route).toBe("review_only");
  });

  it("routes a two-owner llc with an s-corp election to the 1120-s path", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Two Owner S Corp LLC",
        entityType: "single_member_llc" as const,
        ownerCount: 2,
        taxElection: "s_corp" as const,
      },
    };

    const assessment = buildTinaStartPathAssessment(draft);
    expect(assessment.recommendation.laneId).toBe("1120_s");
    expect(assessment.route).toBe("review_only");
  });

  it("keeps a spouse community-property llc under review-only schedule c handling", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Spouse Community Property LLC",
        entityType: "single_member_llc" as const,
        ownerCount: 2,
        spouseCommunityPropertyTreatment: "confirmed" as const,
      },
      sourceFacts: [
        {
          id: "community-property",
          sourceDocumentId: "doc-1",
          label: "Community property clue",
          value: "This paper may show spouse community-property treatment or a husband-and-wife ownership setup.",
          confidence: "high" as const,
          capturedAt: "2026-04-02T20:01:00.000Z",
        },
      ],
    };

    const assessment = buildTinaStartPathAssessment(draft);
    expect(assessment.recommendation.laneId).toBe("schedule_c_single_member_llc");
    expect(assessment.route).toBe("review_only");
  });

  it("blocks a three-owner buyout file while keeping the likely partnership lane visible", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Three Owner Buyout LLC",
        entityType: "multi_member_llc" as const,
        ownerCount: 3,
        hasOwnerBuyoutOrRedemption: true,
        hasFormerOwnerPayments: true,
      },
      sourceFacts: [
        {
          id: "former-owner",
          sourceDocumentId: "doc-1",
          label: "Former owner payment clue",
          value: "This paper may show payments to a former owner or retiring owner.",
          confidence: "high" as const,
          capturedAt: "2026-04-02T20:02:00.000Z",
        },
      ],
    };

    const assessment = buildTinaStartPathAssessment(draft);
    expect(assessment.recommendation.laneId).toBe("1065");
    expect(assessment.route).toBe("blocked");
  });
});
