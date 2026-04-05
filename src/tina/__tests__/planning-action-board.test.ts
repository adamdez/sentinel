import { describe, expect, it } from "vitest";
import { TINA_SKILL_REVIEW_DRAFTS } from "@/tina/data/skill-review-fixtures";
import { buildTinaPlanningActionBoard } from "@/tina/lib/planning-action-board";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("planning-action-board", () => {
  it("turns reviewer-preserved opportunities into a ranked action board", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      documents: [
        {
          id: "doc-home-office",
          name: "home-office-support.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/home-office.pdf",
          category: "supporting_document" as const,
          requestId: "home-office",
          requestLabel: "Home office support",
          uploadedAt: "2026-04-03T13:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-home-office",
          sourceDocumentId: "doc-home-office",
          label: "Home office fact",
          value: "Exclusive-use home office support is present.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T13:01:00.000Z",
        },
      ],
      appendix: {
        ...createDefaultTinaWorkspaceDraft().appendix,
        status: "complete" as const,
        items: [
          {
            id: "appendix-home-office",
            title: "Home office deduction",
            summary: "Potentially usable with better support.",
            whyItMatters: "Could reduce tax.",
            taxPositionBucket: "appendix" as const,
            category: "deduction",
            nextStep: "Review it",
            authoritySummary: "Credible path with more support.",
            reviewerQuestion: "Should this move forward?",
            disclosureFlag: "not_needed",
            authorityTargets: ["IRS home office guidance"],
            sourceLabels: [],
            factIds: ["fact-home-office"],
            documentIds: ["doc-home-office"],
          },
        ],
      },
    };

    const snapshot = buildTinaPlanningActionBoard(draft);

    expect(snapshot.overallStatus).toBe("mixed");
    expect(snapshot.items.length).toBeGreaterThan(0);
    expect(snapshot.items.some((item) => item.title.includes("Home office deduction"))).toBe(true);
  });

  it("promotes clean planning work without laundering dirty-file noise into advances", () => {
    const supportedSnapshot = buildTinaPlanningActionBoard(TINA_SKILL_REVIEW_DRAFTS["supported-core"]);
    const salesTaxSnapshot = buildTinaPlanningActionBoard(
      TINA_SKILL_REVIEW_DRAFTS["sales-tax-authority"]
    );

    expect(supportedSnapshot.items.some((item) => item.status === "advance")).toBe(true);
    expect(
      salesTaxSnapshot.items.some(
        (item) => item.status === "advance" && item.priority === "immediate"
      )
    ).toBe(true);
  });
});
