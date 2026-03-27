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
