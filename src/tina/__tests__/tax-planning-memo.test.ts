import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaTaxPlanningMemo } from "@/tina/lib/tax-planning-memo";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("tax-planning-memo", () => {
  it("prioritizes actionable tax opportunities into a planning memo", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Planning Memo LLC",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "sole_prop" as const,
      },
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-income",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 85000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income", "doc-bank"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-income"],
          },
        ],
      },
      scheduleCDraft: {
        ...createDefaultTinaWorkspaceDraft().scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 85000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: ["tax-income"],
            sourceDocumentIds: ["doc-income", "doc-bank"],
          },
        ],
        notes: [],
      },
      authorityWork: [
        {
          ideaId: "qbi-review",
          status: "reviewed" as const,
          reviewerDecision: "use_it" as const,
          disclosureDecision: "not_needed" as const,
          memo: "Strong candidate.",
          reviewerNotes: "",
          missingAuthority: [],
          citations: [],
          lastAiRunAt: null,
          updatedAt: null,
        },
        {
          ideaId: "self-employed-retirement-review",
          status: "reviewed" as const,
          reviewerDecision: "use_it" as const,
          disclosureDecision: "not_needed" as const,
          memo: "Worth pursuing.",
          reviewerNotes: "",
          missingAuthority: [],
          citations: [],
          lastAiRunAt: null,
          updatedAt: null,
        },
      ],
      packageReadiness: {
        ...createDefaultTinaWorkspaceDraft().packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        items: [],
      },
    };

    const snapshot = buildTinaTaxPlanningMemo(draft);

    expect(snapshot.overallStatus).toBe("actionable");
    expect(snapshot.items.some((item) => item.id === "qbi-review" && item.priority === "now")).toBe(
      true
    );
    expect(snapshot.items.some((item) => item.documentationNeeds.length > 0)).toBe(true);
  });

  it("pushes authority-backed retail planning into the now lane", () => {
    const snapshot = buildTinaTaxPlanningMemo(TINA_SKILL_REVIEW_DRAFTS["sales-tax-authority"]);

    expect(snapshot.items.some((item) => item.priority === "now")).toBe(true);
    expect(
      snapshot.items.some(
        (item) =>
          item.priority === "now" && /washington business-tax treatment/i.test(item.title)
      )
    ).toBe(true);
  });
});
