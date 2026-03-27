import { describe, expect, it } from "vitest";
import {
  buildTinaAuthorityTrailFromDossier,
  buildTinaAuthorityTrails,
} from "@/tina/lib/authority-trails";
import type { TinaResearchDossier } from "@/tina/lib/research-dossiers";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

function buildDossier(overrides?: Partial<TinaResearchDossier>): TinaResearchDossier {
  return {
    id: "qbi-review",
    title: "Check the QBI deduction",
    status: "needs_primary_authority",
    summary: "Tina still needs primary authority.",
    nextStep: "Keep it in research.",
    authorityPrompt: "Use primary authority only.",
    discoveryPrompt: "Research QBI.",
    steps: [],
    documentIds: [],
    factIds: [],
    ...overrides,
  };
}

describe("buildTinaAuthorityTrailFromDossier", () => {
  it("maps unsupported ideas into a not-ready authority trail", () => {
    const trail = buildTinaAuthorityTrailFromDossier(buildDossier());

    expect(trail.reviewerState).toBe("not_ready");
    expect(trail.authorityTargets).toEqual(
      expect.arrayContaining(["IRS instructions", "Treasury regulations"])
    );
    expect(trail.memoFocus).toContain("qualifies for QBI");
  });

  it("marks disclosure-grade ideas for reviewer caution", () => {
    const trail = buildTinaAuthorityTrailFromDossier(
      buildDossier({
        id: "wa-state-review",
        title: "Check Washington business-tax treatment",
        status: "needs_disclosure_review",
      })
    );

    expect(trail.reviewerState).toBe("review_needed");
    expect(trail.disclosureFlag).toBe("likely_needed");
    expect(trail.authorityTargets).toEqual(
      expect.arrayContaining(["Washington DOR guidance", "state statutes or rules"])
    );
  });

  it("marks ready ideas as reviewable", () => {
    const trail = buildTinaAuthorityTrailFromDossier(
      buildDossier({
        id: "fixed-assets-review",
        title: "Check big purchases for depreciation options",
        status: "review_ready",
      })
    );

    expect(trail.reviewerState).toBe("can_consider");
    expect(trail.disclosureFlag).toBe("review_if_supported");
    expect(trail.authorityTargets).toEqual(
      expect.arrayContaining(["prior-year return support"])
    );
  });
});

describe("buildTinaAuthorityTrails", () => {
  it("builds authority trails from the live Tina draft", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      priorReturnDocumentId: "prior-doc",
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
        hasFixedAssets: true,
      },
    };

    const trails = buildTinaAuthorityTrails(draft);

    expect(trails.length).toBeGreaterThan(0);
    expect(trails.some((trail) => trail.id === "prior-year-carryovers")).toBe(true);
    expect(trails.some((trail) => trail.id === "fixed-assets-review")).toBe(true);
  });
});
