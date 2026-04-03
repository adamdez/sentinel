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

  it("adds ownership and intercompany skill lanes when risky clues are present", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Dominion Ops LLC",
        entityType: "s_corp" as const,
      },
      sourceFacts: [
        {
          id: "intercompany-fact",
          sourceDocumentId: "books-doc",
          label: "Intercompany transfer clue",
          value: "Due to/from affiliate activity.",
          confidence: "medium" as const,
          capturedAt: "2026-03-26T22:05:00.000Z",
        },
        {
          id: "owner-draw-fact",
          sourceDocumentId: "books-doc",
          label: "Owner draw clue",
          value: "Shareholder distribution posted.",
          confidence: "medium" as const,
          capturedAt: "2026-03-26T22:06:00.000Z",
        },
        {
          id: "related-party-fact",
          sourceDocumentId: "books-doc",
          label: "Related-party clue",
          value: "Due from shareholder.",
          confidence: "medium" as const,
          capturedAt: "2026-03-26T22:07:00.000Z",
        },
        {
          id: "ein-fact-1",
          sourceDocumentId: "books-doc",
          label: "EIN clue",
          value: "This paper references EIN 12-3456789.",
          confidence: "medium" as const,
          capturedAt: "2026-03-26T22:08:00.000Z",
        },
        {
          id: "ein-fact-2",
          sourceDocumentId: "books-doc",
          label: "EIN clue",
          value: "This paper references EIN 98-7654321.",
          confidence: "medium" as const,
          capturedAt: "2026-03-26T22:09:00.000Z",
        },
      ],
    };

    const ideas = buildTinaResearchIdeas(draft);

    expect(ideas.map((idea) => idea.id)).toEqual(
      expect.arrayContaining([
        "intercompany-separation-review",
        "owner-flow-characterization-review",
        "related-party-transaction-review",
        "multi-entity-boundary-review",
      ])
    );
  });

  it("adds entity-path research when paper hints conflict with intake lane", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Mixed Signal LLC",
        entityType: "single_member_llc" as const,
      },
      sourceFacts: [
        {
          id: "return-type-fact",
          sourceDocumentId: "prior-doc",
          label: "Return type hint",
          value: "1120-S",
          confidence: "high" as const,
          capturedAt: "2026-03-26T22:05:00.000Z",
        },
      ],
    };

    const ideas = buildTinaResearchIdeas(draft);
    expect(ideas.some((idea) => idea.id === "entity-and-filing-path-review")).toBe(true);
  });

  it("adds ownership-transition research when ownership path signals appear", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Ownership Change LLC",
        entityType: "single_member_llc" as const,
        ownershipChangedDuringYear: true,
      },
      sourceFacts: [
        {
          id: "former-owner-fact",
          sourceDocumentId: "books-doc",
          label: "Former owner payment clue",
          value: "This paper may show payments to a former owner.",
          confidence: "medium" as const,
          capturedAt: "2026-03-26T22:10:00.000Z",
        },
      ],
    };

    const ideas = buildTinaResearchIdeas(draft);
    expect(ideas.map((idea) => idea.id)).toEqual(
      expect.arrayContaining(["ownership-transition-review", "former-owner-payment-review"])
    );
  });

  it("adds mixed-use, depreciation, and worker-classification research when books are messy", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      sourceFacts: [
        {
          id: "mixed-use-fact",
          sourceDocumentId: "books-doc",
          label: "Mixed personal/business clue",
          value: "This paper may include mixed personal and business spending.",
          confidence: "medium" as const,
          capturedAt: "2026-03-26T22:10:00.000Z",
        },
        {
          id: "depreciation-fact",
          sourceDocumentId: "books-doc",
          label: "Depreciation clue",
          value: "This paper mentions depreciation.",
          confidence: "medium" as const,
          capturedAt: "2026-03-26T22:11:00.000Z",
        },
        {
          id: "payroll-fact",
          sourceDocumentId: "books-doc",
          label: "Payroll clue",
          value: "This paper mentions payroll.",
          confidence: "medium" as const,
          capturedAt: "2026-03-26T22:12:00.000Z",
        },
        {
          id: "contractor-fact",
          sourceDocumentId: "books-doc",
          label: "Contractor clue",
          value: "This paper mentions contractors.",
          confidence: "medium" as const,
          capturedAt: "2026-03-26T22:13:00.000Z",
        },
      ],
    };

    const ideas = buildTinaResearchIdeas(draft);
    expect(ideas.map((idea) => idea.id)).toEqual(
      expect.arrayContaining([
        "mixed-use-allocation-review",
        "depreciation-support-review",
        "worker-classification-review",
      ])
    );
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
