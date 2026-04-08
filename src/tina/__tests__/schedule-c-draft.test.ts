import { describe, expect, it } from "vitest";
import {
  buildTinaScheduleCDraft,
  markTinaScheduleCDraftStale,
} from "@/tina/lib/schedule-c-draft";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type { TinaWorkspaceDraft } from "@/tina/types";

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

describe("buildTinaScheduleCDraft", () => {
  it("fails closed for unsupported filing lanes", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina S Corp",
        entityType: "s_corp",
      },
    });

    const snapshot = buildTinaScheduleCDraft(draft);

    expect(snapshot.status).toBe("idle");
    expect(snapshot.summary).toContain("supported Schedule C lane");
    expect(snapshot.fields).toHaveLength(0);
  });

  it("waits for the reviewer-final layer first", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "sole_prop",
      },
      reviewerFinal: {
        lastRunAt: null,
        status: "idle",
        summary: "Not ready",
        nextStep: "Build it",
        lines: [],
      },
    });

    const snapshot = buildTinaScheduleCDraft(draft);

    expect(snapshot.status).toBe("idle");
    expect(snapshot.summary).toContain("needs the return-facing review layer");
  });

  it("maps approved reviewer-final lines into Schedule C boxes", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "sole_prop",
      },
      reviewerFinal: {
        lastRunAt: "2026-03-27T03:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "rf-income",
            kind: "income",
            layer: "reviewer_final",
            label: "Gross receipts candidate",
            amount: 22000,
            status: "ready",
            summary: "Approved income",
            sourceDocumentIds: ["doc-income"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: ["ai-income"],
            cleanupSuggestionIds: ["cleanup-income"],
            taxAdjustmentIds: ["tax-income"],
          },
          {
            id: "rf-expense",
            kind: "expense",
            layer: "reviewer_final",
            label: "Business expense candidate",
            amount: 4000,
            status: "ready",
            summary: "Approved expense",
            sourceDocumentIds: ["doc-expense"],
            sourceFactIds: ["fact-expense"],
            issueIds: [],
            derivedFromLineIds: ["ai-expense"],
            cleanupSuggestionIds: ["cleanup-expense"],
            taxAdjustmentIds: ["tax-expense"],
          },
        ],
      },
    });

    const snapshot = buildTinaScheduleCDraft(draft);
    const grossReceipts = snapshot.fields.find((field) => field.id === "line-1-gross-receipts");
    const otherExpenses = snapshot.fields.find((field) => field.id === "line-27a-other-expenses");
    const netProfit = snapshot.fields.find((field) => field.id === "line-31-tentative-net");

    expect(snapshot.status).toBe("complete");
    expect(grossReceipts?.amount).toBe(22000);
    expect(grossReceipts?.status).toBe("ready");
    expect(otherExpenses?.amount).toBe(4000);
    expect(netProfit?.amount).toBe(18000);
  });

  it("keeps tricky sales tax items as notes instead of auto-applying them", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sales Tax Biz",
        entityType: "single_member_llc",
      },
      reviewerFinal: {
        lastRunAt: "2026-03-27T03:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "rf-income",
            kind: "income",
            layer: "reviewer_final",
            label: "Gross receipts candidate",
            amount: 22000,
            status: "ready",
            summary: "Approved income",
            sourceDocumentIds: ["doc-income"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: ["ai-income"],
            cleanupSuggestionIds: ["cleanup-income"],
            taxAdjustmentIds: ["tax-income"],
          },
          {
            id: "rf-sales-tax",
            kind: "signal",
            layer: "reviewer_final",
            label: "Sales tax should stay out of income",
            amount: 1200,
            status: "needs_attention",
            summary: "Approved but still careful",
            sourceDocumentIds: ["doc-sales-tax"],
            sourceFactIds: ["fact-sales-tax"],
            issueIds: [],
            derivedFromLineIds: ["ai-sales-tax"],
            cleanupSuggestionIds: ["cleanup-sales-tax"],
            taxAdjustmentIds: ["tax-sales-tax"],
          },
        ],
      },
    });

    const snapshot = buildTinaScheduleCDraft(draft);
    const grossReceipts = snapshot.fields.find((field) => field.id === "line-1-gross-receipts");

    expect(grossReceipts?.amount).toBe(22000);
    expect(grossReceipts?.status).toBe("needs_attention");
    expect(snapshot.notes).toHaveLength(1);
    expect(snapshot.notes[0]?.title).toContain("Sales tax");
  });

  it("feeds richer AI paper facts into downstream Schedule C notes and summaries", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Payroll Assets LLC",
        entityType: "single_member_llc",
        hasPayroll: true,
      },
      sourceFacts: [
        {
          id: "payroll-period",
          sourceDocumentId: "doc-payroll",
          label: "Payroll filing period clue",
          value: "Q1 2025",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
        {
          id: "carryover-amount",
          sourceDocumentId: "doc-prior",
          label: "Carryover amount clue",
          value: "$1,250.00",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
        {
          id: "ownership-percentage",
          sourceDocumentId: "doc-org",
          label: "Ownership percentage clue",
          value: "50%",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
        {
          id: "asset-pis",
          sourceDocumentId: "doc-asset",
          label: "Asset placed-in-service clue",
          value: "2025-03-03",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
      ],
      reviewerFinal: {
        lastRunAt: "2026-03-27T03:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "rf-income",
            kind: "income",
            layer: "reviewer_final",
            label: "Gross receipts candidate",
            amount: 22000,
            status: "ready",
            summary: "Approved income",
            sourceDocumentIds: ["doc-income"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: ["ai-income"],
            cleanupSuggestionIds: ["cleanup-income"],
            taxAdjustmentIds: ["tax-income"],
          },
          {
            id: "rf-payroll",
            kind: "expense",
            layer: "reviewer_final",
            label: "Payroll expense candidate",
            amount: 3000,
            status: "ready",
            summary: "Approved payroll",
            sourceDocumentIds: ["doc-payroll"],
            sourceFactIds: ["payroll-period"],
            issueIds: [],
            derivedFromLineIds: ["ai-payroll"],
            cleanupSuggestionIds: ["cleanup-payroll"],
            taxAdjustmentIds: ["tax-payroll"],
          },
        ],
      },
    });

    const snapshot = buildTinaScheduleCDraft(draft);
    const wages = snapshot.fields.find((field) => field.id === "line-26-wages");

    expect(wages?.summary).toContain("Q1 2025");
    expect(snapshot.notes.some((note) => note.title.includes("carryover amount"))).toBe(true);
    expect(snapshot.notes.some((note) => note.title.includes("Ownership records"))).toBe(true);
    expect(snapshot.notes.some((note) => note.title.includes("Placed-in-service asset dates"))).toBe(
      true
    );
  });

  it("keeps the draft cautious when source papers reveal hidden payroll, contractor, inventory, sales-tax, and owner-flow patterns", () => {
    const draft = buildDraft({
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Messy Schedule C LLC",
        entityType: "single_member_llc",
      },
      sourceFacts: [
        {
          id: "sales-tax-clue",
          sourceDocumentId: "doc-qb",
          label: "Sales tax clue",
          value: "This paper mentions sales tax activity.",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
        {
          id: "payroll-clue",
          sourceDocumentId: "doc-qb",
          label: "Payroll clue",
          value: "This paper mentions payroll, wages, or employees.",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
        {
          id: "contractor-clue",
          sourceDocumentId: "doc-qb",
          label: "Contractor clue",
          value: "This paper mentions contractors or 1099-style payments.",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
        {
          id: "inventory-clue",
          sourceDocumentId: "doc-qb",
          label: "Inventory clue",
          value: "This paper mentions inventory or cost of goods.",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
        {
          id: "owner-draw-clue",
          sourceDocumentId: "doc-qb",
          label: "Owner draw clue",
          value: "This paper mentions owner draws, owner withdrawals, or owner distributions.",
          confidence: "medium",
          capturedAt: "2026-04-07T08:00:00.000Z",
        },
      ],
      reviewerFinal: {
        lastRunAt: "2026-03-27T03:00:00.000Z",
        status: "complete",
        summary: "Ready",
        nextStep: "Keep going",
        lines: [
          {
            id: "rf-income",
            kind: "income",
            layer: "reviewer_final",
            label: "Gross receipts candidate",
            amount: 22000,
            status: "ready",
            summary: "Approved income",
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-income"],
            issueIds: [],
            derivedFromLineIds: ["ai-income"],
            cleanupSuggestionIds: ["cleanup-income"],
            taxAdjustmentIds: ["tax-income"],
          },
          {
            id: "rf-expense",
            kind: "expense",
            layer: "reviewer_final",
            label: "Business expense candidate",
            amount: 4000,
            status: "ready",
            summary: "Approved expense",
            sourceDocumentIds: ["doc-qb"],
            sourceFactIds: ["fact-expense"],
            issueIds: [],
            derivedFromLineIds: ["ai-expense"],
            cleanupSuggestionIds: ["cleanup-expense"],
            taxAdjustmentIds: ["tax-expense"],
          },
        ],
      },
    });

    const snapshot = buildTinaScheduleCDraft(draft);

    expect(snapshot.fields.find((field) => field.id === "line-1-gross-receipts")?.status).toBe(
      "needs_attention"
    );
    expect(snapshot.fields.find((field) => field.id === "line-26-wages")?.status).toBe(
      "needs_attention"
    );
    expect(snapshot.fields.find((field) => field.id === "line-11-contract-labor")?.status).toBe(
      "needs_attention"
    );
    expect(snapshot.fields.find((field) => field.id === "line-4-cogs")?.status).toBe(
      "needs_attention"
    );
    expect(snapshot.fields.find((field) => field.id === "line-31-tentative-net")?.status).toBe(
      "needs_attention"
    );
    expect(snapshot.notes.some((note) => note.id === "schedule-c-sales-tax-signal-note")).toBe(
      true
    );
    expect(snapshot.notes.some((note) => note.id === "schedule-c-payroll-signal-note")).toBe(
      true
    );
    expect(snapshot.notes.some((note) => note.id === "schedule-c-contractor-signal-note")).toBe(
      true
    );
    expect(snapshot.notes.some((note) => note.id === "schedule-c-inventory-signal-note")).toBe(
      true
    );
    expect(snapshot.notes.some((note) => note.id === "schedule-c-owner-flow-note")).toBe(true);
  });
});

describe("markTinaScheduleCDraftStale", () => {
  it("marks a built schedule c draft as stale", () => {
    const stale = markTinaScheduleCDraftStale({
      lastRunAt: "2026-03-27T03:10:00.000Z",
      status: "complete",
      summary: "Built",
      nextStep: "Done",
      fields: [],
      notes: [],
    });

    expect(stale.status).toBe("stale");
    expect(stale.summary).toContain("changed");
  });
});
