import { describe, expect, it } from "vitest";
import { buildTinaEntityJudgment } from "@/tina/lib/entity-judgment";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("entity-judgment", () => {
  it("marks the supported single-owner lane as clear and supported", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Supported LLC",
        entityType: "single_member_llc" as const,
      },
    };

    const snapshot = buildTinaEntityJudgment(draft);
    expect(snapshot.judgmentStatus).toBe("clear_supported");
    expect(snapshot.likelyFederalTreatment).toContain("Schedule C");
  });

  it("keeps a likely multi-owner partnership treatment visible even when unsupported", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Two Owner LLC",
        entityType: "multi_member_llc" as const,
        ownerCount: 2,
      },
      sourceFacts: [
        {
          id: "multi-owner-fact",
          sourceDocumentId: "doc-owners",
          label: "Multi-owner clue",
          value: "This paper may show more than one owner, partner, member, K-1, or ownership split.",
          confidence: "high" as const,
          capturedAt: "2026-04-02T19:35:00.000Z",
        },
      ],
    };

    const snapshot = buildTinaEntityJudgment(draft);
    expect(snapshot.judgmentStatus).toBe("clear_but_unsupported");
    expect(snapshot.laneId).toBe("1065");
    expect(snapshot.questions.some((question) => question.id === "proof-ownership-agreement")).toBe(
      true
    );
  });

  it("blocks entity treatment when mixed return-type hints conflict", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Mixed Signal LLC",
        entityType: "single_member_llc" as const,
      },
      sourceFacts: [
        {
          id: "hint-a",
          sourceDocumentId: "doc-a",
          label: "Return type hint",
          value: "Schedule C / 1040",
          confidence: "high" as const,
          capturedAt: "2026-04-02T19:35:00.000Z",
        },
        {
          id: "hint-b",
          sourceDocumentId: "doc-b",
          label: "Return type hint",
          value: "1120-S",
          confidence: "high" as const,
          capturedAt: "2026-04-02T19:36:00.000Z",
        },
      ],
    };

    const snapshot = buildTinaEntityJudgment(draft);
    expect(snapshot.judgmentStatus).toBe("blocked");
    expect(snapshot.questions.some((question) => question.id.startsWith("blocking-"))).toBe(true);
  });
});
