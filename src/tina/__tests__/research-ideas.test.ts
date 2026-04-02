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
        businessName: "Tina Home Buyers LLC",
        notes: "wholesale real estate acquisitions",
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
        "de-minimis-safe-harbor-review",
        "self-employed-retirement-review",
        "self-employed-health-insurance-review",
        "real-property-repair-vs-improvement-review",
        "real-estate-characterization-review",
        "installment-and-imputed-interest-review",
        "contractor-review",
        "wa-state-review",
        "inventory-review",
        "fringe-opportunities-scan",
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

  it("adds startup cost review when formation year matches tax year", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Start LLC",
        taxYear: "2025",
        formationDate: "2025-02-01",
        entityType: "single_member_llc" as const,
      },
    };

    const ideas = buildTinaResearchIdeas(draft);
    expect(ideas.some((idea) => idea.id === "startup-costs-review")).toBe(true);
  });

  it("does not add real-estate-only ideas for unrelated business profiles", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Acme Bakery LLC",
        notes: "small food business",
        naicsCode: "311811",
        entityType: "single_member_llc" as const,
        hasFixedAssets: true,
      },
    };

    const ideas = buildTinaResearchIdeas(draft);
    expect(ideas.some((idea) => idea.id === "real-estate-characterization-review")).toBe(false);
    expect(ideas.some((idea) => idea.id === "installment-and-imputed-interest-review")).toBe(
      false
    );
    expect(ideas.some((idea) => idea.id === "real-property-repair-vs-improvement-review")).toBe(
      false
    );
  });
});
