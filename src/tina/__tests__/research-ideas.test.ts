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
        naicsCode: "541611",
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
        "self-employed-benefits-review",
        "industry-edge-review",
        "fixed-assets-review",
        "repair-safe-harbor-review",
        "de-minimis-writeoff-review",
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
    expect(multistateIdea?.searchPrompt.toLowerCase()).toContain("federal");
  });

  it("keeps Washington state review framed as support for the federal package", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "WA Tina Co",
        entityType: "single_member_llc" as const,
        formationState: "WA",
      },
    };

    const ideas = buildTinaResearchIdeas(draft);
    const washingtonIdea = ideas.find((idea) => idea.id === "wa-state-review");

    expect(washingtonIdea?.summary.toLowerCase()).toContain("federal");
    expect(washingtonIdea?.searchPrompt.toLowerCase()).toContain("federal");
  });

  it("adds a startup-cost lead for first-year businesses without a prior return", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "New Tina Co",
        taxYear: "2025",
        formationDate: "2025-02-10",
        entityType: "single_member_llc" as const,
      },
    };

    const ideas = buildTinaResearchIdeas(draft);

    expect(ideas.map((idea) => idea.id)).toContain("startup-costs-review");
  });

  it("surfaces fixed-asset research cards from paper clues even when the organizer missed the checkbox", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Fringe Tina LLC",
        entityType: "single_member_llc" as const,
      },
      sourceFacts: [
        {
          id: "fixed-asset-fact",
          sourceDocumentId: "books-doc",
          label: "Fixed asset clue",
          value:
            'This paper mentions equipment, depreciation, or other big-purchase treatment. Example: "Equipment: Portable extraction machine package".',
          confidence: "medium" as const,
          capturedAt: "2026-03-29T10:22:00.000Z",
        },
        {
          id: "repair-fact",
          sourceDocumentId: "books-doc",
          label: "Repair clue",
          value:
            'This paper mentions repairs, maintenance, or capitalization-sensitive spending. Example: "Repairs & Maintenance: Vacuum motor rebuild and service".',
          confidence: "medium" as const,
          capturedAt: "2026-03-29T10:22:00.000Z",
        },
      ],
    };

    const ideas = buildTinaResearchIdeas(draft);
    const fixedAssetIdea = ideas.find((idea) => idea.id === "fixed-assets-review");
    const repairIdea = ideas.find((idea) => idea.id === "repair-safe-harbor-review");
    const smallEquipmentIdea = ideas.find((idea) => idea.id === "de-minimis-writeoff-review");

    expect(ideas.map((idea) => idea.id)).toEqual(
      expect.arrayContaining([
        "fixed-assets-review",
        "repair-safe-harbor-review",
        "de-minimis-writeoff-review",
      ])
    );
    expect(fixedAssetIdea?.factIds).toEqual(["fixed-asset-fact"]);
    expect(fixedAssetIdea?.documentIds).toEqual(["books-doc"]);
    expect(fixedAssetIdea?.searchPrompt).toContain("Portable extraction machine package");
    expect(repairIdea?.factIds).toEqual(["repair-fact"]);
    expect(repairIdea?.searchPrompt).toContain("Vacuum motor rebuild and service");
    expect(smallEquipmentIdea?.factIds).toEqual(["fixed-asset-fact"]);
    expect(smallEquipmentIdea?.searchPrompt).not.toContain("Portable extraction machine package");
    expect(repairIdea?.sourceLabels[0]).toContain("uploaded papers");
    expect(smallEquipmentIdea?.sourceLabels[0]).toContain("uploaded papers");
  });

  it("adds small-equipment examples only to the de minimis lane when those clues exist", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Fringe Tina LLC",
        entityType: "single_member_llc" as const,
      },
      sourceFacts: [
        {
          id: "fixed-asset-fact",
          sourceDocumentId: "books-doc",
          label: "Fixed asset clue",
          value:
            'This paper mentions equipment, depreciation, or other big-purchase treatment. Example: "Equipment: Portable extraction machine package".',
          confidence: "medium" as const,
          capturedAt: "2026-03-29T10:22:00.000Z",
        },
        {
          id: "small-equipment-fact",
          sourceDocumentId: "books-doc",
          label: "Small equipment clue",
          value:
            'This paper mentions lower-dollar tools, accessories, or small equipment. Example: "Tools: Meters hoses nozzles filters".',
          confidence: "medium" as const,
          capturedAt: "2026-03-29T10:22:00.000Z",
        },
      ],
    };

    const ideas = buildTinaResearchIdeas(draft);
    const fixedAssetIdea = ideas.find((idea) => idea.id === "fixed-assets-review");
    const smallEquipmentIdea = ideas.find((idea) => idea.id === "de-minimis-writeoff-review");

    expect(fixedAssetIdea?.searchPrompt).toContain("Portable extraction machine package");
    expect(fixedAssetIdea?.searchPrompt).not.toContain("Meters hoses nozzles filters");
    expect(smallEquipmentIdea?.factIds).toEqual(["small-equipment-fact"]);
    expect(smallEquipmentIdea?.searchPrompt).toContain("Meters hoses nozzles filters");
    expect(smallEquipmentIdea?.searchPrompt).not.toContain("Portable extraction machine package");
  });
});
