import { describe, expect, it } from "vitest";
import { buildTinaDisclosureReadiness } from "@/tina/lib/disclosure-readiness";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("disclosure-readiness", () => {
  it("requires disclosure handling when a preserved appendix position is marked required", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      appendix: {
        ...createDefaultTinaWorkspaceDraft().appendix,
        status: "complete" as const,
        items: [
          {
            id: "appendix-1",
            title: "Aggressive state position",
            summary: "Potentially usable with disclosure",
            whyItMatters: "Could reduce tax if support holds",
            taxPositionBucket: "appendix" as const,
            category: "position",
            nextStep: "Review it",
            authoritySummary: "Credible but needs explicit disclosure handling",
            reviewerQuestion: "Should this move forward with disclosure?",
            disclosureFlag: "required",
            authorityTargets: ["State guidance"],
            sourceLabels: [],
            factIds: ["fact-1"],
            documentIds: ["doc-1"],
          },
        ],
      },
    };

    const snapshot = buildTinaDisclosureReadiness(draft);

    expect(snapshot.overallStatus).toBe("required");
    expect(snapshot.items[0]?.status).toBe("required");
  });
});
