import { describe, expect, it } from "vitest";
import { buildTinaDecisionBriefings } from "@/tina/lib/decision-briefings";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("decision-briefings", () => {
  it("builds paired reviewer and owner briefings from the current Tina state", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Briefing Ready LLC",
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
            amount: 25000,
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
            amount: 25000,
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

    const snapshot = buildTinaDecisionBriefings(draft);

    expect(snapshot.reviewer.keyPoints.some((point) => point.includes("Route"))).toBe(true);
    expect(
      snapshot.reviewer.keyPoints.some((point) => point.includes("Official-form execution"))
    ).toBe(true);
    expect(
      snapshot.reviewer.keyPoints.some((point) => point.includes("Accounting artifact coverage"))
    ).toBe(true);
    expect(
      snapshot.reviewer.keyPoints.some((point) => point.includes("Planning action board"))
    ).toBe(true);
    expect(
      snapshot.reviewer.keyPoints.some((point) => point.includes("Confidence calibration"))
    ).toBe(true);
    expect(snapshot.reviewer.keyPoints.some((point) => point.includes("Case memory ledger"))).toBe(
      true
    );
    expect(
      snapshot.reviewer.keyPoints.some((point) => point.includes("Reviewer learning loop"))
    ).toBe(true);
    expect(snapshot.owner.keyPoints.some((point) => point.includes("Tina believes"))).toBe(true);
    expect(snapshot.reviewer.recommendedActions.length).toBeGreaterThan(0);
    expect(snapshot.owner.recommendedActions.length).toBeGreaterThan(0);
  });
});
