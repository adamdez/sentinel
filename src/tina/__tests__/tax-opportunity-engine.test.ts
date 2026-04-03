import { describe, expect, it } from "vitest";
import { buildTinaTaxOpportunityEngine } from "@/tina/lib/tax-opportunity-engine";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("tax-opportunity-engine", () => {
  it("promotes a supported QBI path into ready-to-pursue when facts, evidence, and authority are strong", () => {
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

    const snapshot = buildTinaTaxOpportunityEngine(draft);
    const qbi = snapshot.items.find((item) => item.id === "qbi-review");

    expect(qbi?.status).toBe("ready_to_pursue");
    expect(snapshot.overallStatus).toBe("mixed_queue");
  });
});
