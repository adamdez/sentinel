import { describe, expect, it } from "vitest";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("start-path", () => {
  it("captures mixed return-type hints across papers", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
      },
      sourceFacts: [
        {
          id: "hint-a",
          sourceDocumentId: "doc-a",
          label: "Return type hint",
          value: "Schedule C / 1040",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:00:00.000Z",
        },
        {
          id: "hint-b",
          sourceDocumentId: "doc-b",
          label: "Return type hint",
          value: "1120-S",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:01:00.000Z",
        },
      ],
    };

    const assessment = buildTinaStartPathAssessment(draft);
    expect(assessment.hasMixedHintedLanes).toBe(true);
    expect(assessment.route).toBe("blocked");
    expect(assessment.confidence).toBe("blocked");
    expect(assessment.hintedLanes).toContain("schedule_c_single_member_llc");
    expect(assessment.hintedLanes).toContain("1120_s");
  });

  it("flags ownership mismatch against the single-owner supported lane", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
        ownerCount: 1,
      },
      sourceFacts: [
        {
          id: "ownership-change-fact",
          sourceDocumentId: "doc-1",
          label: "Ownership change clue",
          value: "This paper may show an ownership change.",
          confidence: "medium" as const,
          capturedAt: "2026-03-27T05:02:00.000Z",
        },
      ],
    };

    const assessment = buildTinaStartPathAssessment(draft);
    expect(assessment.ownershipMismatchWithSingleOwnerLane).toBe(true);
    expect(assessment.recommendation.laneId).toBe("schedule_c_single_member_llc");
    expect(assessment.route).toBe("blocked");
    expect(assessment.blockingReasons.length).toBeGreaterThan(0);
  });

  it("routes a two-owner uneven-ownership LLC to partnership review instead of schedule c", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Two Owner LLC",
        entityType: "single_member_llc" as const,
        ownerCount: 2,
      },
      sourceFacts: [
        {
          id: "multi-owner-fact",
          sourceDocumentId: "doc-1",
          label: "Multi-owner clue",
          value: "This paper may show more than one owner, partner, member, K-1, or ownership split.",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:02:00.000Z",
        },
      ],
    };

    const assessment = buildTinaStartPathAssessment(draft);
    expect(assessment.recommendation.laneId).toBe("1065");
    expect(assessment.route).toBe("review_only");
    expect(assessment.confidence).toBe("needs_review");
  });

  it("keeps confirmed spouse community-property facts on a review-only schedule c path", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Spouse LLC",
        entityType: "single_member_llc" as const,
        ownerCount: 2,
        spouseCommunityPropertyTreatment: "confirmed" as const,
      },
      sourceFacts: [
        {
          id: "community-property-fact",
          sourceDocumentId: "doc-1",
          label: "Community property clue",
          value: "This paper may show spouse community-property treatment or a husband-and-wife ownership setup.",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:03:00.000Z",
        },
        {
          id: "multi-owner-fact",
          sourceDocumentId: "doc-1",
          label: "Multi-owner clue",
          value: "This paper may show more than one owner, partner, member, K-1, or ownership split.",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:03:30.000Z",
        },
      ],
    };

    const assessment = buildTinaStartPathAssessment(draft);
    expect(assessment.recommendation.laneId).toBe("schedule_c_single_member_llc");
    expect(assessment.route).toBe("review_only");
    expect(assessment.blockingReasons).toHaveLength(0);
    expect(assessment.reviewReasons.join(" ")).toContain("community-property");
  });

  it("keeps a three-owner buyout file on the partnership lane while blocking the route", () => {
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
          id: "former-owner-fact",
          sourceDocumentId: "doc-1",
          label: "Former owner payment clue",
          value: "This paper may show payments to a former owner or retiring owner.",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:04:00.000Z",
        },
      ],
    };

    const assessment = buildTinaStartPathAssessment(draft);
    expect(assessment.recommendation.laneId).toBe("1065");
    expect(assessment.route).toBe("blocked");
    expect(assessment.blockingReasons.join(" ")).toContain("former owner");
  });

  it("publishes explicit proof requirements for spouse-community-property review paths", () => {
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
          id: "multi-owner-fact",
          sourceDocumentId: "doc-owners",
          label: "Multi-owner clue",
          value: "This paper may show more than one owner, partner, member, K-1, or ownership split.",
          confidence: "high" as const,
          capturedAt: "2026-03-27T05:03:30.000Z",
        },
        {
          id: "community-property-fact",
          sourceDocumentId: "doc-owners",
          label: "Community property clue",
          value: "This paper may show spouse community-property treatment or a husband-and-wife ownership setup.",
          confidence: "medium" as const,
          capturedAt: "2026-03-27T05:04:00.000Z",
        },
      ],
    };

    const assessment = buildTinaStartPathAssessment(draft);
    expect(assessment.route).toBe("review_only");
    expect(assessment.proofRequirements.map((requirement) => requirement.id)).toContain(
      "ownership-agreement"
    );
    expect(assessment.proofRequirements.map((requirement) => requirement.id)).toContain(
      "community-property-proof"
    );
    expect(
      assessment.proofRequirements.find((requirement) => requirement.id === "community-property-proof")
        ?.status
    ).toBe("needed");
  });

  it("infers a non-schedule-c lane from prior-return package text even without saved source facts", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Election Signal LLC",
        entityType: "single_member_llc" as const,
      },
      documents: [
        {
          id: "doc-prior",
          name: "2024-1120s-return-package.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/2024-1120s-return-package.pdf",
          category: "prior_return" as const,
          requestId: "prior-return",
          requestLabel: "Last year's return",
          uploadedAt: "2026-03-27T05:00:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-prior",
          status: "complete" as const,
          kind: "pdf" as const,
          summary: "Prior return package mentions Form 2553 acceptance and 1120-S filing.",
          nextStep: "Keep going",
          facts: [],
          detailLines: ["The prior return package is labeled 1120-S federal return."],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-03-27T05:01:00.000Z",
        },
      ],
    };

    const assessment = buildTinaStartPathAssessment(draft);

    expect(assessment.recommendation.laneId).toBe("1120_s");
    expect(assessment.route).toBe("review_only");
    expect(assessment.returnTypeHintFacts.some((fact) => fact.sourceDocumentId === "doc-prior")).toBe(
      true
    );
  });

  it("treats operating agreement style uploads as ownership proof even when request ids are missing", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Operating Agreement LLC",
        entityType: "multi_member_llc" as const,
        ownerCount: 2,
      },
      documents: [
        {
          id: "doc-oa",
          name: "operating-agreement-and-cap-table.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/operating-agreement-and-cap-table.pdf",
          category: "supporting_document" as const,
          requestId: null,
          requestLabel: null,
          uploadedAt: "2026-03-27T05:00:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "doc-oa",
          status: "complete" as const,
          kind: "pdf" as const,
          summary: "Operating agreement lists members and ownership percentages.",
          nextStep: "Keep going",
          facts: [],
          detailLines: ["Cap table shows two members at 60% and 40%."],
          rowCount: null,
          headers: [],
          sheetNames: [],
          lastReadAt: "2026-03-27T05:01:00.000Z",
        },
      ],
    };

    const assessment = buildTinaStartPathAssessment(draft);

    expect(assessment.recommendation.laneId).toBe("1065");
    expect(
      assessment.proofRequirements.find((requirement) => requirement.id === "ownership-agreement")
        ?.status
    ).toBe("covered");
  });
});
