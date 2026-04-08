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

  it("turns deeper paper-intelligence clues into concrete research ideas", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Deep Docs LLC",
        entityType: "single_member_llc" as const,
      },
      sourceFacts: [
        {
          id: "carryover-fact",
          sourceDocumentId: "prior-doc",
          label: "Prior-year carryover clue",
          value: "This paper mentions carryover loss.",
          confidence: "medium" as const,
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
        {
          id: "election-fact",
          sourceDocumentId: "prior-doc",
          label: "Tax election clue",
          value: "This paper mentions an election.",
          confidence: "medium" as const,
          capturedAt: "2026-04-07T08:01:00.000Z",
        },
        {
          id: "ownership-fact",
          sourceDocumentId: "org-doc",
          label: "Ownership record clue",
          value: "This paper shows ownership percentages.",
          confidence: "medium" as const,
          capturedAt: "2026-04-07T08:02:00.000Z",
        },
        {
          id: "depreciation-fact",
          sourceDocumentId: "asset-doc",
          label: "Depreciation clue",
          value: "This paper includes depreciation schedule detail.",
          confidence: "medium" as const,
          capturedAt: "2026-04-07T08:03:00.000Z",
        },
        {
          id: "payroll-form-fact",
          sourceDocumentId: "payroll-doc",
          label: "Payroll tax form clue",
          value: "This paper includes Form 941 details.",
          confidence: "medium" as const,
          capturedAt: "2026-04-07T08:04:00.000Z",
        },
      ],
    };

    const ideas = buildTinaResearchIdeas(draft);

    expect(ideas.map((idea) => idea.id)).toEqual(
      expect.arrayContaining([
        "prior-year-carryover-proof-review",
        "tax-election-continuity-review",
        "ownership-structure-review",
        "depreciation-rollforward-review",
        "payroll-tax-form-review",
      ])
    );
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
