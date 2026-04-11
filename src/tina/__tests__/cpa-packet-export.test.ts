import { describe, expect, it } from "vitest";
import { buildTinaCpaPacketExport } from "@/tina/lib/cpa-packet-export";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaCpaPacketExport", () => {
  it("exports an entity-return intake section for a likely 1120-S packet", () => {
    const baseDraft = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...baseDraft,
      profile: {
        ...baseDraft.profile,
        businessName: "North Ridge Home Services LLC",
        taxYear: "2025",
        entityType: "s_corp" as const,
      },
      priorReturnDocumentId: "prior-doc",
      documents: [
        {
          id: "prior-doc",
          name: "prior-return.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "local/prior-return.csv",
          category: "prior_return" as const,
          requestId: "prior-return",
          requestLabel: "Prior-year filed return",
          uploadedAt: "2026-04-08T21:00:00.000Z",
        },
        {
          id: "pnl-doc",
          name: "pnl.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "local/pnl.csv",
          category: "supporting_document" as const,
          requestId: "profit-loss",
          requestLabel: "Full-year profit and loss",
          uploadedAt: "2026-04-08T21:01:00.000Z",
        },
        {
          id: "gl-doc",
          name: "gl.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "local/gl.csv",
          category: "supporting_document" as const,
          requestId: "general-ledger",
          requestLabel: "General ledger export",
          uploadedAt: "2026-04-08T21:02:00.000Z",
        },
        {
          id: "bank-doc",
          name: "bank.csv",
          size: 100,
          mimeType: "text/csv",
          storagePath: "local/bank.csv",
          category: "supporting_document" as const,
          requestId: "bank-support",
          requestLabel: "Business bank statements",
          uploadedAt: "2026-04-08T21:03:00.000Z",
        },
      ],
      documentReadings: [
        {
          documentId: "prior-doc",
          status: "complete" as const,
          kind: "spreadsheet" as const,
          summary: "Read.",
          nextStep: "Done.",
          facts: [],
          detailLines: [],
          rowCount: 8,
          headers: ["Form", "Amount"],
          sheetNames: ["Prior Return"],
          lastReadAt: "2026-04-08T21:04:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "return-type-hint-1",
          sourceDocumentId: "prior-doc",
          label: "Return type hint",
          value: "1120-S",
          confidence: "high" as const,
          capturedAt: "2026-04-08T21:05:00.000Z",
        },
      ],
    };

    const exportFile = buildTinaCpaPacketExport(draft);

    expect(exportFile.fileName).toContain(".html");
    expect(exportFile.mimeType).toContain("text/html");
    expect(exportFile.contents).toContain("<!doctype html>");
    expect(exportFile.contents).toContain("Reviewer fast pass");
    expect(exportFile.contents).toContain("Review thresholds");
    expect(exportFile.contents).toContain("Source-to-return index");
    expect(exportFile.contents).toContain("Entity-specific review insert");
    expect(exportFile.contents).toContain("Detailed packet appendix");
    expect(exportFile.contents).toContain("Entity-return intake contract");
    expect(exportFile.contents).toContain("1120-S review spine");
    expect(exportFile.contents).toContain("1120-S prep spine");
    expect(exportFile.contents).toContain("1120-S / S-Corp");
  });

  it("creates a skeptical-cpa html packet from the current Tina draft", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop" as const,
      },
      documents: [
        {
          id: "doc-1",
          name: "2025-return.pdf",
          size: 100,
          mimeType: "application/pdf",
          storagePath: "tina/2025-return.pdf",
          category: "prior_return" as const,
          requestId: "prior-return",
          requestLabel: "Last year's return",
          uploadedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "carryover-1",
          sourceDocumentId: "doc-1",
          label: "Carryover amount clue",
          value: "$1,250.00",
          confidence: "medium" as const,
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
        {
          id: "return-type-hint-1",
          sourceDocumentId: "doc-1",
          label: "Return type hint",
          value: "Schedule C / 1040",
          confidence: "high" as const,
          capturedAt: "2026-03-27T04:00:00.000Z",
        },
      ],
      reviewerFinal: {
        lastRunAt: "2026-03-27T04:01:00.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "reviewer-final-1",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 18000,
            status: "ready" as const,
            summary: "Ready for a return preview.",
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-1"],
          },
        ],
      },
      scheduleCDraft: {
        lastRunAt: "2026-03-27T04:02:00.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Review it",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "ready" as const,
            summary: "Mapped safely.",
            reviewerFinalLineIds: ["reviewer-final-1"],
            taxAdjustmentIds: ["tax-1"],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      packageReadiness: {
        lastRunAt: "2026-03-27T04:03:00.000Z",
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        summary: "Ready",
        nextStep: "Hand it off",
        items: [],
      },
      cpaHandoff: {
        lastRunAt: "2026-03-27T04:04:00.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Hand it off",
        artifacts: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-03-27T04:03:30.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Review",
        adjustments: [
          {
            id: "tax-1",
            kind: "carryforward_line" as const,
            status: "approved" as const,
            risk: "low" as const,
            requiresAuthority: false,
            title: "Carry it",
            summary: "Approved",
            suggestedTreatment: "Carry it",
            whyItMatters: "It matters",
            amount: 18000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: [],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            reviewerNotes: "",
          },
        ],
      },
      taxPositionMemory: {
        lastRunAt: "2026-03-27T04:03:40.000Z",
        status: "complete" as const,
        summary: "Position memory ready",
        nextStep: "Hand it off",
        records: [
          {
            id: "tax-position-tax-1",
            adjustmentId: "tax-1",
            title: "Carry it",
            status: "ready" as const,
            confidence: "high" as const,
            summary: "Supported and reviewer anchored.",
            treatmentSummary: "Carry it",
            reviewerGuidance: "Reviewer accepted the treatment.",
            authorityWorkIdeaIds: [],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            reviewerOutcomeIds: [],
            reviewerOverrideIds: [],
            updatedAt: "2026-03-27T04:03:45.000Z",
          },
        ],
      },
      reviewerOutcomeMemory: {
        updatedAt: "2026-03-27T04:03:50.000Z",
        summary: "Saved reviewer outcomes.",
        nextStep: "Keep measuring real reviewer traffic.",
        scorecard: {
          totalOutcomes: 2,
          acceptedCount: 1,
          revisedCount: 1,
          rejectedCount: 0,
          acceptanceScore: 73,
          trustLevel: "mixed" as const,
          nextStep: "Keep measuring real reviewer traffic.",
          patterns: [
            {
              patternId: "tax_adjustment:tax_review",
              label: "tax adjustment in tax review",
              targetType: "tax_adjustment" as const,
              phase: "tax_review" as const,
              totalOutcomes: 2,
              acceptedCount: 1,
              revisedCount: 1,
              rejectedCount: 0,
              acceptanceScore: 73,
              trustLevel: "mixed" as const,
              confidenceImpact: "hold" as const,
              nextStep: "Keep measuring tax adjustment in tax review.",
              lessons: ["Keep tying gross receipts back to reviewer-visible proof."],
              updatedAt: "2026-03-27T04:03:50.000Z",
            },
          ],
        },
        overrides: [],
        outcomes: [
          {
            id: "outcome-1",
            title: "Adjustment review",
            phase: "tax_review" as const,
            verdict: "accepted" as const,
            targetType: "tax_adjustment" as const,
            targetId: "tax-1",
            summary: "Accepted.",
            lessons: [],
            caseTags: ["clean_books", "schedule_c"] as const,
            overrideIds: [],
            decidedAt: "2026-03-20T04:03:50.000Z",
            decidedBy: "reviewer-1",
          },
          {
            id: "outcome-2",
            title: "Adjustment tweak",
            phase: "tax_review" as const,
            verdict: "revised" as const,
            targetType: "tax_adjustment" as const,
            targetId: "tax-1",
            summary: "Revised.",
            lessons: [],
            caseTags: ["messy_books", "schedule_c"] as const,
            overrideIds: [],
            decidedAt: "2026-03-21T04:03:50.000Z",
            decidedBy: "reviewer-1",
          },
        ],
      },
    };

    const exportFile = buildTinaCpaPacketExport(draft);

    expect(exportFile.fileName).toContain("tina-sole-prop");
    expect(exportFile.fileName).toContain("2025");
    expect(exportFile.fileName).toContain(".html");
    expect(exportFile.mimeType).toContain("text/html");
    expect(exportFile.contents).toContain("<!doctype html>");
    expect(exportFile.contents).toContain("Tina CPA Review Packet");
    expect(exportFile.contents).toContain("Reviewer fast pass");
    expect(exportFile.contents).toContain("Review thresholds");
    expect(exportFile.contents).toContain("Source-to-return index");
    expect(exportFile.contents).toContain("Exceptions and open loops");
    expect(exportFile.contents).toContain("Support archive index");
    expect(exportFile.contents).toContain("Detailed packet appendix");
    expect(exportFile.contents).toContain("Line 1 Gross receipts or sales");
    expect(exportFile.contents).toContain("2025-return.pdf");
    expect(exportFile.contents).toContain("Client intake review");
    expect(exportFile.contents).toContain("Profile lane:");
    expect(exportFile.contents).toContain("Tax position register");
    expect(exportFile.contents).toContain("confidence: high");
    expect(exportFile.contents).toContain("Current-lane scenario profile");
    expect(exportFile.contents).toContain("carryover continuity");
    expect(exportFile.contents).toContain("Return trace");
    expect(exportFile.contents).toContain("Reviewer-final lines:");
    expect(exportFile.contents).toContain("Numeric proof");
    expect(exportFile.contents).toContain("support:");
    expect(exportFile.contents).toContain("Live acceptance benchmark");
    expect(exportFile.contents).toContain("last 30 days");
    expect(exportFile.contents).toContain("Benchmark movement:");
    expect(exportFile.contents).toContain("Current file cohorts:");
    expect(exportFile.contents).toContain("Benchmark rescore");
    expect(exportFile.contents).toContain("Cohort-specific proposals:");
    expect(exportFile.contents).toContain("Internal benchmark dashboard");
    expect(exportFile.contents).toContain("Filing approval");
    expect(exportFile.contents).toContain("MeF readiness");
    expect(exportFile.contents).toContain("Return type: 1040");
    expect(exportFile.contents).toContain("Attachment manifest:");
    expect(exportFile.contents).toContain("1040/Schedule C export contract");
    expect(exportFile.contents).toContain("Contract version: tina.schedule_c_export.v1");
    expect(exportFile.contents).toContain("Scenario tags:");
    expect(exportFile.contents).toContain("Review delivery");
    expect(exportFile.contents).toContain("Planning and tradeoffs");
  });
});
