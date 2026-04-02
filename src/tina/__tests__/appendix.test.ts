import { describe, expect, it } from "vitest";
import { buildTinaAppendix } from "@/tina/lib/appendix";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaAppendix", () => {
  it("preserves fact-tied unusual ideas in the appendix and filters generic scans", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Transition LLC",
        entityType: "single_member_llc" as const,
        ownerCount: 2,
        taxElection: "default" as const,
      },
      sourceFacts: [
        {
          id: "return-type-fact",
          sourceDocumentId: "books-doc",
          label: "Return type hint",
          value: "1065 / partnership",
          confidence: "medium" as const,
          capturedAt: "2026-04-02T18:00:00.000Z",
        },
      ],
    };

    const appendix = buildTinaAppendix(draft);

    expect(appendix.status).toBe("complete");
    expect(appendix.items.some((item) => item.id === "return-path-proof-review")).toBe(true);
    expect(appendix.items.some((item) => item.id === "fringe-opportunities-scan")).toBe(false);
    const item = appendix.items.find((candidate) => candidate.id === "return-path-proof-review");
    expect(item?.authorityTargets.length).toBeGreaterThan(0);
    expect(item?.reviewerQuestion).toContain("federal");
  });
});
