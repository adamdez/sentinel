import { describe, expect, it } from "vitest";
import { buildTinaAiCleanupSnapshot } from "@/tina/lib/ai-cleanup";
import { buildTinaBookTieOutSnapshot } from "@/tina/lib/book-tie-out";
import { buildTinaCleanupPlan } from "@/tina/lib/cleanup-plan";
import { buildTinaCpaPacketExport } from "@/tina/lib/cpa-packet-export";
import { buildTinaIssueQueue } from "@/tina/lib/issue-queue";
import { buildTinaPackageReadiness } from "@/tina/lib/package-readiness";
import { buildTinaProfileFingerprint } from "@/tina/lib/profile-fingerprint";
import { buildTinaReviewerFinalSnapshot } from "@/tina/lib/reviewer-final";
import { buildTinaScheduleCDraft } from "@/tina/lib/schedule-c-draft";
import { deriveTinaSourceFactsFromReading } from "@/tina/lib/source-facts";
import { buildTinaTaxAdjustmentSnapshot } from "@/tina/lib/tax-adjustments";
import { buildTinaTaxPositionMemory, markTinaTaxPositionMemoryStale } from "@/tina/lib/tax-position-memory";
import { buildTinaWorkpaperSnapshot } from "@/tina/lib/workpapers";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaDocumentReading, TinaStoredDocument, TinaWorkspaceDraft } from "@/tina/types";

function buildDraft(overrides?: Partial<TinaWorkspaceDraft>): TinaWorkspaceDraft {
  return {
    ...createDefaultTinaWorkspaceDraft(),
    ...overrides,
    profile: {
      ...createDefaultTinaWorkspaceDraft().profile,
      ...(overrides?.profile ?? {}),
    },
  };
}

function buildReading(documentId: string, facts: TinaDocumentReading["facts"]): TinaDocumentReading {
  return {
    documentId,
    status: "complete",
    kind: "spreadsheet",
    summary: "Smoke reading",
    nextStep: "Keep going",
    facts,
    detailLines: [],
    rowCount: 10,
    headers: ["Date", "Description", "Amount"],
    sheetNames: ["Sheet1"],
    lastReadAt: "2026-04-07T08:00:00.000Z",
  };
}

function withDerivedFacts(draft: TinaWorkspaceDraft, readings: TinaDocumentReading[]): TinaWorkspaceDraft {
  return {
    ...draft,
    documentReadings: readings,
    sourceFacts: readings.flatMap((reading) => {
      const document = draft.documents.find((item) => item.id === reading.documentId);
      return document ? deriveTinaSourceFactsFromReading(document, reading) : [];
    }),
  };
}

function runPipeline(baseDraft: TinaWorkspaceDraft): TinaWorkspaceDraft {
  const issueQueue = buildTinaIssueQueue(baseDraft);
  const withIssues = { ...baseDraft, issueQueue };
  const bookTieOut = buildTinaBookTieOutSnapshot(withIssues);
  const withTieOut = { ...withIssues, bookTieOut };
  const workpapers = buildTinaWorkpaperSnapshot(withTieOut);
  const withWorkpapers = { ...withTieOut, workpapers };
  const cleanupPlan = buildTinaCleanupPlan(withWorkpapers);
  const approvedCleanupPlan = {
    ...cleanupPlan,
    suggestions: cleanupPlan.suggestions.map((suggestion) => ({
      ...suggestion,
      status: suggestion.issueIds.length === 0 ? "approved" : suggestion.status,
    })),
  };
  const withCleanup = { ...withWorkpapers, cleanupPlan: approvedCleanupPlan };
  const aiCleanup = buildTinaAiCleanupSnapshot(withCleanup);
  const withAiCleanup = { ...withCleanup, aiCleanup };
  const taxAdjustments = buildTinaTaxAdjustmentSnapshot(withAiCleanup);
  const approvedTaxAdjustments = {
    ...taxAdjustments,
    adjustments: taxAdjustments.adjustments.map((adjustment) => ({
      ...adjustment,
      status: adjustment.status === "ready_for_review" ? "approved" : adjustment.status,
      reviewerNotes:
        adjustment.status === "ready_for_review" ? "Smoke approval for pipeline verification." : adjustment.reviewerNotes,
    })),
  };
  const withAdjustments = { ...withAiCleanup, taxAdjustments: approvedTaxAdjustments };
  const taxPositionMemory = buildTinaTaxPositionMemory(withAdjustments);
  const withPositions = { ...withAdjustments, taxPositionMemory };
  const reviewerFinal = buildTinaReviewerFinalSnapshot(withPositions);
  const withReviewerFinal = { ...withPositions, reviewerFinal };
  const scheduleCDraft = buildTinaScheduleCDraft(withReviewerFinal);
  const withSchedule = { ...withReviewerFinal, scheduleCDraft };
  const packageReadiness = buildTinaPackageReadiness(withSchedule);
  return { ...withSchedule, packageReadiness };
}

describe("tina full-pipeline smoke", () => {
  it("does not false-ready a commingled messy-books case even after downstream approvals", () => {
    const documents: TinaStoredDocument[] = [
      {
        id: "qb-doc",
        name: "qb-export.csv",
        size: 2500,
        mimeType: "text/csv",
        storagePath: "tina/qb-export.csv",
        category: "supporting_document",
        requestId: "quickbooks",
        requestLabel: "QuickBooks export",
        uploadedAt: "2026-04-07T08:00:00.000Z",
      },
      {
        id: "bank-doc",
        name: "bank-export.csv",
        size: 2500,
        mimeType: "text/csv",
        storagePath: "tina/bank-export.csv",
        category: "supporting_document",
        requestId: "bank-support",
        requestLabel: "Bank support",
        uploadedAt: "2026-04-07T08:01:00.000Z",
      },
    ];

    const draft = withDerivedFacts(
      buildDraft({
        documents,
        profile: {
          businessName: "Smoke Entity Mix",
          entityType: "single_member_llc",
          taxYear: "2025",
          hasPayroll: false,
          paysContractors: false,
          hasInventory: false,
          hasFixedAssets: false,
          collectsSalesTax: false,
          hasIdahoActivity: false,
          formationState: "WA",
          formationDate: "",
          accountingMethod: "cash",
          naicsCode: "",
          notes: "",
        },
      }),
      [
        buildReading("qb-doc", [
          { id: "f1", label: "Money in clue", value: "$18,000.00", confidence: "high" },
          { id: "f2", label: "Money out clue", value: "$4,000.00", confidence: "high" },
          { id: "f3", label: "Date range clue", value: "2025-01-01 through 2025-12-31", confidence: "high" },
          { id: "f4", label: "Owner draw clue", value: "Owner draw distributions posted.", confidence: "high" },
          { id: "f5", label: "Intercompany transfer clue", value: "Intercompany transfer activity detected.", confidence: "high" },
          { id: "f6", label: "EIN clue", value: "This paper references EIN 12-3456789.", confidence: "high" },
        ]),
        buildReading("bank-doc", [
          { id: "f7", label: "Money in clue", value: "$18,000.00", confidence: "high" },
          { id: "f8", label: "Money out clue", value: "$24,000.00", confidence: "high" },
          { id: "f9", label: "EIN clue", value: "This paper references EIN 98-7654321.", confidence: "high" },
        ]),
      ]
    );

    const pipeline = runPipeline(draft);
    const packet = buildTinaCpaPacketExport(pipeline);

    expect(pipeline.issueQueue.items.some((item) => item.id === "books-intercompany-transfer-clue")).toBe(true);
    expect(pipeline.bookTieOut.variances.some((variance) => variance.id === "owner-flow-contamination")).toBe(true);
    expect(pipeline.bookTieOut.variances.some((variance) => variance.id === "conflicting-money-story")).toBe(true);
    expect(pipeline.packageReadiness.level).toBe("blocked");
    expect(pipeline.packageReadiness.items.some((item) => item.id === "issue-books-multi-ein-conflict")).toBe(true);
    expect(packet.contents).toContain("Packet status:");
    expect(packet.contents).toContain("[blocking]");
  });

  it("keeps reviewer-fragile tax treatment from looking settled in a full pipeline run", () => {
    const documents: TinaStoredDocument[] = [
      {
        id: "qb-doc",
        name: "qb-export.csv",
        size: 2500,
        mimeType: "text/csv",
        storagePath: "tina/qb-export.csv",
        category: "supporting_document",
        requestId: "quickbooks",
        requestLabel: "QuickBooks export",
        uploadedAt: "2026-04-07T08:00:00.000Z",
      },
      {
        id: "bank-doc",
        name: "bank-export.csv",
        size: 2500,
        mimeType: "text/csv",
        storagePath: "tina/bank-export.csv",
        category: "supporting_document",
        requestId: "bank-support",
        requestLabel: "Bank support",
        uploadedAt: "2026-04-07T08:01:00.000Z",
      },
    ];

    const baseDraft = withDerivedFacts(
      buildDraft({
        documents,
        profile: {
          businessName: "Smoke Fragile Confidence",
          entityType: "single_member_llc",
          taxYear: "2025",
          hasPayroll: false,
          paysContractors: false,
          hasInventory: false,
          hasFixedAssets: false,
          collectsSalesTax: false,
          hasIdahoActivity: false,
          formationState: "WA",
          formationDate: "",
          accountingMethod: "cash",
          naicsCode: "",
          notes: "",
        },
        reviewerOutcomeMemory: {
          updatedAt: "2026-04-07T08:10:00.000Z",
          summary: "Fragile history.",
          nextStep: "Review repeated corrections first.",
          scorecard: {
            totalOutcomes: 3,
            acceptedCount: 1,
            revisedCount: 1,
            rejectedCount: 1,
            acceptanceScore: 48,
            trustLevel: "fragile",
            nextStep: "Review repeated corrections first.",
            patterns: [
              {
                patternId: "tax_adjustment:tax_review",
                label: "tax adjustment in tax review",
                targetType: "tax_adjustment",
                phase: "tax_review",
                totalOutcomes: 3,
                acceptedCount: 1,
                revisedCount: 1,
                rejectedCount: 1,
                acceptanceScore: 48,
                trustLevel: "fragile",
                confidenceImpact: "lower",
                nextStep: "Treat this pattern as unstable.",
                lessons: ["Do not present gross receipts as settled before stronger proof."],
                updatedAt: "2026-04-07T08:10:00.000Z",
              },
              {
                patternId: "reviewer_final_line:package",
                label: "reviewer final line in package",
                targetType: "reviewer_final_line",
                phase: "package",
                totalOutcomes: 3,
                acceptedCount: 1,
                revisedCount: 1,
                rejectedCount: 1,
                acceptanceScore: 48,
                trustLevel: "fragile",
                confidenceImpact: "lower",
                nextStep: "Treat this pattern as unstable.",
                lessons: ["Do not present gross receipts as settled before stronger proof."],
                updatedAt: "2026-04-07T08:10:00.000Z",
              },
            ],
          },
          overrides: [],
          outcomes: [],
        },
      }),
      [
        buildReading("qb-doc", [
          { id: "f1", label: "Money in clue", value: "$18,000.00", confidence: "high" },
          { id: "f2", label: "Money out clue", value: "$4,000.00", confidence: "high" },
          { id: "f3", label: "Date range clue", value: "2025-01-01 through 2025-12-31", confidence: "high" },
        ]),
        buildReading("bank-doc", [
          { id: "f4", label: "Money in clue", value: "$18,000.00", confidence: "high" },
          { id: "f5", label: "Money out clue", value: "$4,000.00", confidence: "high" },
          { id: "f6", label: "Date range clue", value: "2025-01-01 through 2025-12-31", confidence: "high" },
        ]),
      ]
    );

    const issueQueue = buildTinaIssueQueue(baseDraft);
    const withIssues = { ...baseDraft, issueQueue };
    const bookTieOut = buildTinaBookTieOutSnapshot(withIssues);
    const withTieOut = { ...withIssues, bookTieOut };
    const workpapers = buildTinaWorkpaperSnapshot(withTieOut);
    const incomeLine = workpapers.lines.find((line) => line.kind === "income");
    expect(incomeLine).toBeDefined();

    const cleanupPlan = {
      ...buildTinaCleanupPlan({ ...withTieOut, workpapers }),
      status: "complete" as const,
      summary: "Manual smoke cleanup plan",
      nextStep: "Carry the reviewed income line forward.",
      suggestions: [
        {
          id: "cleanup-income-smoke",
          type: "reconcile_line" as const,
          priority: "helpful" as const,
          status: "approved" as const,
          title: "Carry income line",
          summary: "Smoke-approved income cleanup line.",
          suggestedAction: "Carry it forward.",
          whyItMatters: "Needed for full-pipeline smoke verification.",
          workpaperLineIds: [incomeLine?.id ?? ""],
          issueIds: [],
          sourceDocumentIds: incomeLine?.sourceDocumentIds ?? [],
          sourceFactIds: incomeLine?.sourceFactIds ?? [],
          reviewerNotes: "Approved for smoke pipeline.",
        },
      ],
    };
    const withCleanup = { ...withTieOut, workpapers, cleanupPlan };
    const aiCleanup = buildTinaAiCleanupSnapshot(withCleanup);
    const withAiCleanup = { ...withCleanup, aiCleanup };
    const taxAdjustments = buildTinaTaxAdjustmentSnapshot(withAiCleanup);
    const approvedAdjustments = {
      ...taxAdjustments,
      adjustments: taxAdjustments.adjustments.map((item) => ({
        ...item,
        status: "approved" as const,
        reviewerNotes: "Approved for smoke pipeline.",
      })),
    };
    const withAdjustments = { ...withAiCleanup, taxAdjustments: approvedAdjustments };
    const taxPositionMemory = buildTinaTaxPositionMemory(withAdjustments);
    const withPositions = { ...withAdjustments, taxPositionMemory };
    const reviewerFinal = buildTinaReviewerFinalSnapshot(withPositions);
    const withReviewerFinal = { ...withPositions, reviewerFinal };
    const scheduleCDraft = buildTinaScheduleCDraft(withReviewerFinal);
    const pipeline = {
      ...withReviewerFinal,
      scheduleCDraft,
      packageReadiness: buildTinaPackageReadiness({ ...withReviewerFinal, scheduleCDraft }),
    };

    expect(pipeline.taxAdjustments.adjustments.some((item) => item.risk === "medium")).toBe(true);
    expect(pipeline.taxAdjustments.adjustments.some((item) => item.summary.includes("fragile"))).toBe(true);
    expect(pipeline.taxPositionMemory.records.some((record) => record.summary.includes("48/100"))).toBe(true);
    expect(pipeline.reviewerFinal.lines.some((line) => line.status === "needs_attention")).toBe(true);
    expect(pipeline.reviewerFinal.lines.some((line) => line.summary.includes("fragile"))).toBe(true);
    expect(pipeline.packageReadiness.level).not.toBe("ready_for_cpa");
  });

  it("blocks a stale tax-position layer in an otherwise ready manual handoff state", () => {
    const draft = buildDraft({
      profile: {
        businessName: "Smoke Ready Package",
        entityType: "single_member_llc",
        taxYear: "2025",
        hasPayroll: false,
        paysContractors: false,
        hasInventory: false,
        hasFixedAssets: false,
        collectsSalesTax: false,
        hasIdahoActivity: false,
        formationState: "WA",
        formationDate: "",
        accountingMethod: "cash",
        naicsCode: "",
        notes: "",
      },
      documents: [
        {
          id: "prior-doc",
          name: "prior-return.pdf",
          size: 3500,
          mimeType: "application/pdf",
          storagePath: "tina/prior-return.pdf",
          category: "prior_return",
          requestId: "prior-return",
          requestLabel: "Last year's return",
          uploadedAt: "2026-04-07T07:59:00.000Z",
        },
        {
          id: "qb-doc",
          name: "qb-export.csv",
          size: 2500,
          mimeType: "text/csv",
          storagePath: "tina/qb-export.csv",
          category: "supporting_document",
          requestId: "quickbooks",
          requestLabel: "QuickBooks export",
          uploadedAt: "2026-04-07T08:00:00.000Z",
        },
        {
          id: "bank-doc",
          name: "bank-export.csv",
          size: 2500,
          mimeType: "text/csv",
          storagePath: "tina/bank-export.csv",
          category: "supporting_document",
          requestId: "bank-support",
          requestLabel: "Bank support",
          uploadedAt: "2026-04-07T08:00:30.000Z",
        },
      ],
      documentReadings: [buildReading("qb-doc", [])],
      sourceFacts: [],
      priorReturnDocumentId: "prior-doc",
    });

    const fingerprint = buildTinaProfileFingerprint(draft.profile);
    const currentReadyDraft = {
      ...draft,
      bootstrapReview: {
        lastRunAt: "2026-04-07T08:10:00.000Z",
        profileFingerprint: fingerprint,
        status: "complete" as const,
        summary: "Checked",
        nextStep: "Done",
        facts: [],
        items: [],
      },
      issueQueue: {
        lastRunAt: "2026-04-07T08:10:00.000Z",
        profileFingerprint: fingerprint,
        status: "complete" as const,
        summary: "Checked",
        nextStep: "Done",
        items: [],
        records: [],
      },
      reviewerFinal: {
        lastRunAt: "2026-04-07T08:12:00.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Done",
        lines: [
          {
            id: "rf-1",
            kind: "income" as const,
            layer: "reviewer_final" as const,
            label: "Gross receipts candidate",
            amount: 18000,
            status: "ready" as const,
            summary: "Ready",
            sourceDocumentIds: ["qb-doc"],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: ["ai-1"],
            cleanupSuggestionIds: ["cleanup-1"],
            taxAdjustmentIds: ["adj-1"],
          },
        ],
      },
      scheduleCDraft: {
        lastRunAt: "2026-04-07T08:13:00.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Done",
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 18000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["rf-1"],
            taxAdjustmentIds: ["adj-1"],
            sourceDocumentIds: ["qb-doc"],
          },
        ],
        notes: [],
      },
      taxAdjustments: {
        lastRunAt: "2026-04-07T08:11:00.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Done",
        adjustments: [
          {
            id: "adj-1",
            kind: "carryforward_line" as const,
            status: "approved" as const,
            risk: "low" as const,
            requiresAuthority: false,
            title: "Carry income",
            summary: "Approved",
            suggestedTreatment: "Carry it",
            whyItMatters: "Traceability",
            amount: 18000,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: ["ai-1"],
            sourceDocumentIds: ["qb-doc"],
            sourceFactIds: [],
            reviewerNotes: "Approved.",
          },
        ],
      },
      taxPositionMemory: {
        lastRunAt: "2026-04-07T08:11:30.000Z",
        status: "complete" as const,
        summary: "Ready",
        nextStep: "Done",
        records: [
          {
            id: "tax-position-adj-1",
            adjustmentId: "adj-1",
            title: "Carry income",
            status: "ready" as const,
            confidence: "high" as const,
            summary: "Ready",
            treatmentSummary: "Carry it",
            reviewerGuidance: "Approved.",
            authorityWorkIdeaIds: [],
            sourceDocumentIds: ["qb-doc"],
            sourceFactIds: [],
            reviewerOutcomeIds: [],
            reviewerOverrideIds: [],
            updatedAt: "2026-04-07T08:11:30.000Z",
          },
        ],
      },
    };

    const readyReadiness = buildTinaPackageReadiness(currentReadyDraft);
    const staleReadiness = buildTinaPackageReadiness({
      ...currentReadyDraft,
      taxPositionMemory: markTinaTaxPositionMemoryStale(currentReadyDraft.taxPositionMemory),
    });

    expect(readyReadiness.level).toBe("ready_for_cpa");
    expect(staleReadiness.level).toBe("blocked");
    expect(staleReadiness.items.some((item) => item.id === "tax-position-memory-not-current")).toBe(true);
  });
});
