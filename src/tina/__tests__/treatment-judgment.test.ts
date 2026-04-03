import { describe, expect, it } from "vitest";
import { buildTinaTreatmentJudgment } from "@/tina/lib/treatment-judgment";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("treatment-judgment", () => {
  it("rejects mixed-use deductions until allocation exists", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      sourceFacts: [
        {
          id: "mixed-use-fact",
          sourceDocumentId: "doc-books",
          label: "Mixed personal/business clue",
          value: "This paper may include mixed personal and business spending.",
          confidence: "high" as const,
          capturedAt: "2026-04-02T19:45:00.000Z",
        },
      ],
    };

    const snapshot = buildTinaTreatmentJudgment(draft);
    expect(snapshot.items.find((item) => item.id === "mixed-use-treatment")?.taxPositionBucket).toBe(
      "reject"
    );
  });

  it("keeps worker-classification treatment in review when payroll and contractor clues coexist", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      sourceFacts: [
        {
          id: "payroll-fact",
          sourceDocumentId: "doc-books",
          label: "Payroll clue",
          value: "This paper mentions payroll.",
          confidence: "medium" as const,
          capturedAt: "2026-04-02T19:45:00.000Z",
        },
        {
          id: "contractor-fact",
          sourceDocumentId: "doc-books",
          label: "Contractor clue",
          value: "This paper mentions contractors.",
          confidence: "medium" as const,
          capturedAt: "2026-04-02T19:46:00.000Z",
        },
      ],
    };

    const snapshot = buildTinaTreatmentJudgment(draft);
    expect(
      snapshot.items.find((item) => item.id === "worker-classification-treatment")?.taxPositionBucket
    ).toBe("review");
  });

  it("promotes sales-tax exclusion treatment to use when authority review approved it", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        collectsSalesTax: true,
      },
      sourceFacts: [
        {
          id: "sales-tax-fact",
          sourceDocumentId: "doc-books",
          label: "Sales tax clue",
          value: "This paper mentions collected sales tax.",
          confidence: "medium" as const,
          capturedAt: "2026-04-02T19:47:00.000Z",
        },
      ],
      authorityWork: [
        {
          ideaId: "wa-state-review",
          status: "reviewed" as const,
          reviewerDecision: "use_it" as const,
          disclosureDecision: "not_needed" as const,
          memo: "Looks supported.",
          reviewerNotes: "",
          missingAuthority: [],
          citations: [],
          lastAiRunAt: null,
          updatedAt: "2026-04-02T19:48:00.000Z",
        },
      ],
    };

    const snapshot = buildTinaTreatmentJudgment(draft);
    expect(snapshot.items.find((item) => item.id === "sales-tax-treatment")?.taxPositionBucket).toBe(
      "use"
    );
  });
});
