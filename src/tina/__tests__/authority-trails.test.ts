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
    whyItMatters: "This may materially reduce tax when the facts support it.",
    nextStep: "Keep it in research.",
    authorityPrompt: "Use primary authority only.",
    discoveryPrompt: "Research QBI.",
    groundingLabels: ["The filing lane points to Schedule C."],
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

  it("builds ownership-change trails with specialized authority targets and reviewer questions", () => {
    const trail = buildTinaAuthorityTrailFromDossier(
      buildDossier({
        id: "ownership-change-treatment-review",
        title: "Check ownership change, buyout, and former-owner payment treatment",
        status: "needs_primary_authority",
      })
    );

    expect(trail.authorityTargets).toEqual(
      expect.arrayContaining([
        "entity formation and operating documents",
        "partnership tax authority",
        "transaction documents for owner exits",
      ])
    );
    expect(trail.memoFocus).toContain("buyouts");
    expect(trail.reviewerQuestion).toContain("alter the filing lane");
  });

  it("builds election-proof trails with election-specific targets", () => {
    const trail = buildTinaAuthorityTrailFromDossier(
      buildDossier({
        id: "entity-election-proof-review",
        title: "Check entity election proof and effective-date continuity",
        status: "needs_primary_authority",
      })
    );

    expect(trail.authorityTargets).toEqual(
      expect.arrayContaining([
        "entity formation and operating documents",
        "entity election filings or acceptance notices",
      ])
    );
    expect(trail.reviewerQuestion).toContain("corporate election");
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
