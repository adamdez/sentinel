import { describe, expect, it } from "vitest";
import { buildTinaTaxTreatmentPolicy } from "@/tina/lib/tax-treatment-policy";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("tax-treatment-policy", () => {
  it("blocks high-materiality rejected treatment and keeps review items visible", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const snapshot = buildTinaTaxTreatmentPolicy({
      ...base,
      profile: {
        ...base.profile,
        entityType: "single_member_llc",
        hasFixedAssets: true,
        hasInventory: true,
      },
      sourceFacts: [
        {
          id: "mixed-use",
          sourceDocumentId: "doc-1",
          label: "Mixed personal/business clue",
          value: "Personal and business spending are mixed together.",
          confidence: "high",
          capturedAt: "2026-04-02T12:00:00.000Z",
        },
        {
          id: "depreciation",
          sourceDocumentId: "doc-2",
          label: "Depreciation clue",
          value: "Depreciation posted without full asset schedule.",
          confidence: "high",
          capturedAt: "2026-04-02T12:00:00.000Z",
        },
      ],
    });

    expect(snapshot.overallStatus).toBe("blocked");
    expect(snapshot.decisions.some((decision) => decision.status === "blocked")).toBe(true);
    expect(
      snapshot.decisions.some(
        (decision) => decision.id === "mixed-use-treatment" && decision.materiality === "high"
      )
    ).toBe(true);
    expect(
      snapshot.decisions.some(
        (decision) => decision.id === "depreciation-treatment" && decision.status === "review_required"
      )
    ).toBe(true);
  });
});
