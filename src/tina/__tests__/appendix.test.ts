import { describe, expect, it } from "vitest";
import { buildTinaAppendix } from "@/tina/lib/appendix";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("appendix", () => {
  it("keeps plausible idea leads in the reviewer appendix and filters junk", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      priorReturnDocumentId: "prior-doc",
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Home Buyers LLC",
        entityType: "single_member_llc" as const,
      },
    };

    const appendix = buildTinaAppendix(draft);
    expect(appendix.status).toBe("complete");
    expect(appendix.items.some((item) => item.id === "prior-year-carryovers")).toBe(true);
    expect(appendix.items.some((item) => item.id === "fringe-opportunities-scan")).toBe(false);
  });
});
