import { describe, expect, it } from "vitest";
import { buildTinaResearchIdeas } from "@/tina/lib/research-ideas";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaResearchIdeas", () => {
  it("builds a starter research queue from organizer facts and paper clues", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      priorReturnDocumentId: "prior-doc",
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
        hasFixedAssets: true,
        paysContractors: true,
        collectsSalesTax: true,
      },
      sourceFacts: [
        {
          id: "inventory-fact",
          sourceDocumentId: "books-doc",
          label: "Inventory clue",
          value: "This paper mentions inventory.",
          confidence: "medium" as const,
          capturedAt: "2026-03-26T22:00:00.000Z",
        },
      ],
    };

    const ideas = buildTinaResearchIdeas(draft);

    expect(ideas.map((idea) => idea.id)).toEqual(
      expect.arrayContaining([
        "prior-year-carryovers",
        "qbi-review",
        "fixed-assets-review",
        "contractor-review",
        "wa-state-review",
        "inventory-review",
      ])
    );
    expect(ideas.every((idea) => idea.decisionBucket === "interesting_but_unsupported")).toBe(
      true
    );
  });

  it("links clue-based ideas back to the source fact and document", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
      },
      sourceFacts: [
        {
          id: "state-fact",
          sourceDocumentId: "prior-doc",
          label: "State clue",
          value: "This paper mentions Idaho.",
          confidence: "medium" as const,
          capturedAt: "2026-03-26T22:05:00.000Z",
        },
      ],
    };

    const ideas = buildTinaResearchIdeas(draft);
    const multistateIdea = ideas.find((idea) => idea.id === "multistate-review");

    expect(multistateIdea?.factIds).toEqual(["state-fact"]);
    expect(multistateIdea?.documentIds).toEqual(["prior-doc"]);
  });
});
