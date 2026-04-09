import { describe, expect, it } from "vitest";
import {
  buildTinaReviewerCorrectionCapture,
  buildTinaReviewerCorrectionTargets,
} from "@/tina/lib/reviewer-correction-capture";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("reviewer correction capture", () => {
  it("builds an override and outcome from a revised reviewer correction", () => {
    const captured = buildTinaReviewerCorrectionCapture({
      targetType: "tax_adjustment",
      targetId: "tax-1",
      targetLabel: "Tax adjustment: shareholder expense reclass",
      phase: "tax_review",
      verdict: "revised",
      summary: "CPA moved the item from deductible expense to shareholder distribution.",
      lessons: [
        "Shareholder-paid personal charges should stay in distribution review until proven business.",
      ],
      caseTags: ["s_corp", "owner_flow"],
      decidedBy: "Taylor CPA",
      sourceDocumentIds: ["gl-doc"],
      beforeState: "Tina left the charge inside operating expense.",
      afterState: "CPA reclassed the charge to shareholder distribution.",
      reason: "The payment was personal and paid on behalf of the shareholder.",
      overrideSeverity: "material",
    });

    expect(captured.override?.targetId).toBe("tax-1");
    expect(captured.override?.severity).toBe("material");
    expect(captured.outcome.verdict).toBe("revised");
    expect(captured.outcome.overrideIds).toEqual([captured.override?.id]);
    expect(captured.outcome.lessons[0]).toContain("Shareholder-paid personal charges");
  });

  it("does not force an override record for a clean accepted result", () => {
    const captured = buildTinaReviewerCorrectionCapture({
      targetType: "cpa_handoff_artifact",
      targetId: "source-paper-index",
      targetLabel: "CPA packet: Source paper index",
      phase: "package",
      verdict: "accepted",
      summary: "CPA accepted the source index as-is.",
      lessons: ["Keep the source index short and reference-driven."],
      caseTags: ["schedule_c"],
      decidedBy: "Jordan CPA",
    });

    expect(captured.override).toBeNull();
    expect(captured.outcome.verdict).toBe("accepted");
    expect(captured.outcome.overrideIds).toHaveLength(0);
  });

  it("offers current packet targets for fast reviewer capture", () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...baseDraft,
      cpaHandoff: {
        ...baseDraft.cpaHandoff,
        artifacts: [
          {
            id: "s-corp-prep-spine",
            title: "1120-S prep spine",
            status: "ready" as const,
            summary: "Ready.",
            includes: [],
            relatedFieldIds: [],
            relatedNoteIds: [],
            relatedReadinessItemIds: [],
            sourceDocumentIds: ["prior-doc"],
          },
        ],
      },
      taxAdjustments: {
        ...baseDraft.taxAdjustments,
        adjustments: [
          {
            id: "tax-1",
            kind: "related_party_review" as const,
            status: "ready_for_review" as const,
            risk: "medium" as const,
            requiresAuthority: false,
            title: "Review shareholder-paid expense",
            summary: "Needs review.",
            suggestedTreatment: "Move to distribution if personal.",
            whyItMatters: "Changes equity treatment.",
            amount: 1200,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: [],
            sourceDocumentIds: ["gl-doc"],
            sourceFactIds: [],
            reviewerNotes: "",
          },
        ],
      },
    };

    const targets = buildTinaReviewerCorrectionTargets(draft);

    expect(targets.some((target) => target.value === "cpa_handoff_artifact:s-corp-prep-spine")).toBe(
      true
    );
    expect(targets.some((target) => target.value === "tax_adjustment:tax-1")).toBe(true);
  });
});
