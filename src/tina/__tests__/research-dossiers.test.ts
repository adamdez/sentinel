import { describe, expect, it } from "vitest";
import {
  buildTinaResearchDossierFromIdea,
  buildTinaResearchDossiers,
} from "@/tina/lib/research-dossiers";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaTaxIdeaLead } from "@/tina/lib/research-ideas";

function buildIdea(overrides?: Partial<TinaTaxIdeaLead>): TinaTaxIdeaLead {
  return {
    id: "idea-1",
    title: "Check QBI",
    summary: "Research the QBI deduction.",
    whyItMatters: "It may save money.",
    category: "deduction",
    decisionBucket: "interesting_but_unsupported",
    sourceClasses: ["internal_signal"],
    sourceLabels: ["The filing lane points to Schedule C."],
    factIds: [],
    documentIds: [],
    searchPrompt: "Research QBI.",
    nextStep: "Keep it in Tina's idea queue until primary authority proves or kills it.",
    ...overrides,
  };
}

describe("buildTinaResearchDossierFromIdea", () => {
  it("marks unsupported ideas as needing primary authority", () => {
    const dossier = buildTinaResearchDossierFromIdea(buildIdea());

    expect(dossier.status).toBe("needs_primary_authority");
    expect(dossier.whyItMatters).toBe("It may save money.");
    expect(dossier.groundingLabels).toEqual(["The filing lane points to Schedule C."]);
    expect(dossier.steps.find((step) => step.id === "authority")?.status).toBe("ready");
  });

  it("marks disclosure-grade ideas correctly", () => {
    const dossier = buildTinaResearchDossierFromIdea(
      buildIdea({
        decisionBucket: "usable_with_disclosure",
      })
    );

    expect(dossier.status).toBe("needs_disclosure_review");
    expect(dossier.steps.find((step) => step.id === "authority")?.status).toBe("done");
    expect(dossier.steps.find((step) => step.id === "disclosure")?.status).toBe("ready");
  });

  it("marks supported ideas as review-ready", () => {
    const dossier = buildTinaResearchDossierFromIdea(
      buildIdea({
        decisionBucket: "authoritative_and_usable",
      })
    );

    expect(dossier.status).toBe("review_ready");
    expect(dossier.steps.find((step) => step.id === "filing")?.status).toBe("ready");
  });
});

describe("buildTinaResearchDossiers", () => {
  it("builds dossiers from the live Tina draft", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      priorReturnDocumentId: "prior-doc",
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
      },
    };

    const dossiers = buildTinaResearchDossiers(draft);

    expect(dossiers.length).toBeGreaterThan(0);
    expect(dossiers[0]?.authorityPrompt).toContain("Use primary authority only");
  });
});
