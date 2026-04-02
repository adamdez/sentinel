import { describe, expect, it } from "vitest";
import {
  buildTinaAuthorityWorkItems,
  createDefaultTinaAuthorityWorkItem,
  mergeTinaAuthorityResearchRun,
} from "@/tina/lib/authority-work";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaAuthorityWorkItems", () => {
  it("builds default saved-work views from the current draft", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      priorReturnDocumentId: "prior-doc",
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
      },
    };

    const workItems = buildTinaAuthorityWorkItems(draft);
    const qbiItem = workItems.find((item) => item.ideaId === "qbi-review");

    expect(workItems.length).toBeGreaterThan(0);
    expect(qbiItem?.status).toBe("not_started");
    expect(qbiItem?.whyItMatters).toContain("tax saver");
    expect(qbiItem?.groundingLabels).toEqual(
      expect.arrayContaining(["The current filing lane points to a Schedule C or single-member LLC path."])
    );
    expect(qbiItem?.authorityTargets).toEqual(
      expect.arrayContaining(["IRS instructions", "Treasury regulations"])
    );
  });

  it("preserves saved memo, citations, and reviewer state", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
      },
      authorityWork: [
        {
          ...createDefaultTinaAuthorityWorkItem("qbi-review"),
          status: "researching" as const,
          memo: "Need to confirm the limits.",
          reviewerNotes: "Hold until authority is attached.",
          citations: [
            {
              id: "citation-1",
              title: "IRS example",
              url: "https://www.irs.gov/example",
              sourceClass: "primary_authority" as const,
              effect: "supports" as const,
              note: "Potentially helpful.",
            },
          ],
        },
      ],
    };

    const workItems = buildTinaAuthorityWorkItems(draft);
    const qbiItem = workItems.find((item) => item.ideaId === "qbi-review");

    expect(qbiItem?.status).toBe("researching");
    expect(qbiItem?.memo).toContain("confirm the limits");
    expect(qbiItem?.citations).toHaveLength(1);
  });
});

describe("mergeTinaAuthorityResearchRun", () => {
  it("merges AI memo, missing authority, and citations into saved work", () => {
    const current = createDefaultTinaAuthorityWorkItem("qbi-review");

    const merged = mergeTinaAuthorityResearchRun(current, {
      memo: "QBI may apply here, but Tina still needs stronger primary support.",
      missingAuthority: ["Need primary authority that clearly fits this fact pattern"],
      citations: [
        {
          id: "citation-1",
          title: "IRS source",
          url: "https://www.irs.gov/example",
          sourceClass: "primary_authority",
          effect: "supports",
          note: "Potentially relevant authority.",
        },
      ],
      status: "researching",
      reviewerDecision: "need_more_support",
      disclosureDecision: "needs_review",
      lastAiRunAt: "2026-03-26T23:05:00.000Z",
    });

    expect(merged.memo).toContain("QBI may apply");
    expect(merged.missingAuthority).toHaveLength(1);
    expect(merged.citations).toHaveLength(1);
    expect(merged.lastAiRunAt).toBe("2026-03-26T23:05:00.000Z");
  });
});
