import { describe, expect, it } from "vitest";
import { buildTinaReviewerAcceptanceForecast } from "@/tina/lib/reviewer-acceptance-forecast";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("reviewer-acceptance-forecast", () => {
  it("marks strong reviewer-backed positions as likely accepted", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Bright Path Consulting",
        taxYear: "2025",
        principalBusinessActivity: "Consulting",
        naicsCode: "541611",
        entityType: "single_member_llc" as const,
        ownerCount: 1,
        taxElection: "default" as const,
      },
      sourceFacts: [
        {
          id: "fact-owner-count",
          sourceDocumentId: "doc-organizer",
          label: "Owner count clue",
          value: "Single member only.",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:00:00.000Z",
        },
        {
          id: "fact-return-type",
          sourceDocumentId: "doc-prior",
          label: "Return type clue",
          value: "Schedule C",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:01:00.000Z",
        },
        {
          id: "fact-income",
          sourceDocumentId: "doc-income-2",
          label: "Income support clue",
          value: "Primary income support",
          confidence: "high" as const,
          capturedAt: "2026-04-03T08:02:00.000Z",
        },
      ],
      reviewerFinal: {
        ...createDefaultTinaWorkspaceDraft().reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "rf-income",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 120000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["doc-income-1", "doc-income-2"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: [],
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
            amount: 120000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-income"],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-income-1", "doc-income-2"],
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
          memo: "QBI is supported.",
          reviewerNotes: "Use it.",
          missingAuthority: [],
          citations: [],
          lastAiRunAt: "2026-04-03T08:10:00.000Z",
          updatedAt: "2026-04-03T08:10:00.000Z",
        },
      ],
    };

    const snapshot = buildTinaReviewerAcceptanceForecast(draft);

    expect(snapshot.items.find((item) => item.id === "acceptance-opportunity-qbi-review")?.status).toBe(
      "likely_accept"
    );
  });

  it("marks disclosure-sensitive or rejected positions as likely rejected", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      sourceFacts: [
        {
          id: "mixed-use-fact",
          sourceDocumentId: "doc-ledger",
          label: "Mixed personal/business clue",
          value: "This paper may include mixed personal and business spending.",
          confidence: "high" as const,
          capturedAt: "2026-04-02T19:45:00.000Z",
        },
      ],
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

    const snapshot = buildTinaReviewerAcceptanceForecast(draft);

    expect(
      snapshot.items.find((item) => item.id === "acceptance-treatment-mixed-use-treatment")?.status
    ).toBe("likely_reject");
    expect(snapshot.items.find((item) => item.id === "acceptance-appendix-appendix-1")?.status).toBe(
      "likely_reject"
    );
    expect(snapshot.overallStatus).toBe("low_confidence");
  });
});
