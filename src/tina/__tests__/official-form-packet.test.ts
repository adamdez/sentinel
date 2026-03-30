import { describe, expect, it } from "vitest";
import { buildTinaOfficialFormPacket } from "@/tina/lib/official-form-packet";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaOfficialFormPacket", () => {
  it("waits for the schedule c draft first", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Sole Prop",
        entityType: "sole_prop" as const,
      },
    };

    const packet = buildTinaOfficialFormPacket(draft);

    expect(packet.status).toBe("idle");
    expect(packet.summary).toContain("Schedule C draft");
    expect(packet.forms).toHaveLength(0);
  });

  it("builds a year-specific schedule c packet from the supported draft", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop" as const,
      },
      scheduleCDraft: {
        ...base.scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 22000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
          {
            id: "line-4-cogs",
            lineNumber: "Line 4",
            label: "Cost of goods sold",
            amount: 0,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
          {
            id: "line-11-contract-labor",
            lineNumber: "Line 11",
            label: "Contract labor",
            amount: 2000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
          {
            id: "line-26-wages",
            lineNumber: "Line 26",
            label: "Wages",
            amount: 0,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
          {
            id: "line-27a-other-expenses",
            lineNumber: "Line 27a",
            label: "Other expenses",
            amount: 19700,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: ["review-line-other-expense"],
            taxAdjustmentIds: ["tax-adjustment-bank-fees"],
            sourceDocumentIds: ["doc-1"],
          },
          {
            id: "line-28-total-expenses",
            lineNumber: "Line 28",
            label: "Total expenses",
            amount: 21700,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
          {
            id: "line-29-tentative-profit",
            lineNumber: "Line 29",
            label: "Tentative profit or loss",
            amount: 300,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
          {
            id: "line-31-tentative-net",
            lineNumber: "Line 31",
            label: "Tentative net profit or loss",
            amount: 300,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      reviewerFinal: {
        ...base.reviewerFinal,
        status: "complete" as const,
        lines: [
          {
            id: "review-line-other-expense",
            kind: "expense" as const,
            layer: "reviewer_final" as const,
            label: "Bank fees",
            amount: 19700,
            status: "ready" as const,
            summary: "Approved business banking cost.",
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            issueIds: [],
            derivedFromLineIds: [],
            cleanupSuggestionIds: [],
            taxAdjustmentIds: ["tax-adjustment-bank-fees"],
          },
        ],
      },
      taxAdjustments: {
        ...base.taxAdjustments,
        status: "complete" as const,
        adjustments: [
          {
            id: "tax-adjustment-bank-fees",
            kind: "carryforward_line" as const,
            status: "approved" as const,
            risk: "low" as const,
            requiresAuthority: false,
            title: "Bank fees",
            summary: "Approved other business expense.",
            suggestedTreatment: "Carry the approved bank-fee amount into Part V support.",
            whyItMatters: "The reviewer needs the other-expense breakout.",
            amount: 19700,
            authorityWorkIdeaIds: [],
            aiCleanupLineIds: [],
            sourceDocumentIds: ["doc-1"],
            sourceFactIds: [],
            reviewerNotes: "",
          },
        ],
      },
      packageReadiness: {
        ...base.packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        summary: "Ready",
        nextStep: "Hand it off",
        items: [],
      },
    };

    const packet = buildTinaOfficialFormPacket(draft);
    const form = packet.forms[0];
    const line31 = form?.lines.find((line) => line.lineNumber === "Line 31");

    expect(packet.status).toBe("complete");
    expect(form?.formNumber).toContain("Schedule C");
    expect(form?.status).toBe("ready");
    expect(line31?.value).toContain("$300");
    expect(form?.supportSchedules).toHaveLength(1);
    expect(form?.supportSchedules[0]?.title).toContain("Part V");
    expect(form?.supportSchedules[0]?.rows[0]?.label).toBe("Bank fees");
  });

  it("blocks the export-ready packet when a required companion federal form is still outside support", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop" as const,
      },
      scheduleCDraft: {
        ...base.scheduleCDraft,
        status: "complete" as const,
        fields: [
          {
            id: "line-1-gross-receipts",
            lineNumber: "Line 1",
            label: "Gross receipts or sales",
            amount: 22000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
          {
            id: "line-27a-other-expenses",
            lineNumber: "Line 27a",
            label: "Other expenses",
            amount: 6000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
          {
            id: "line-28-total-expenses",
            lineNumber: "Line 28",
            label: "Total expenses",
            amount: 6000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
          {
            id: "line-29-tentative-profit",
            lineNumber: "Line 29",
            label: "Tentative profit or loss",
            amount: 16000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
          {
            id: "line-31-tentative-net",
            lineNumber: "Line 31",
            label: "Tentative net profit or loss",
            amount: 16000,
            status: "ready" as const,
            summary: "Ready",
            reviewerFinalLineIds: [],
            taxAdjustmentIds: [],
            sourceDocumentIds: ["doc-1"],
          },
        ],
        notes: [],
      },
      reviewerFinal: {
        ...base.reviewerFinal,
        status: "complete" as const,
        lines: [],
      },
      packageReadiness: {
        ...base.packageReadiness,
        status: "complete" as const,
        level: "needs_review" as const,
        summary: "Needs review",
        nextStep: "Keep going",
        items: [],
      },
    };

    const packet = buildTinaOfficialFormPacket(draft);

    expect(packet.status).toBe("complete");
    expect(packet.summary).toContain("Schedule SE");
    expect(packet.forms[0]?.status).toBe("blocked");
    expect(packet.forms[0]?.nextStep).toContain("IRS-facing business packet");
  });

  it("refuses to claim an IRS-facing packet for a tax year outside the certified registry", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Tina Sole Prop",
        taxYear: "2026",
        entityType: "sole_prop" as const,
      },
      scheduleCDraft: {
        ...base.scheduleCDraft,
        status: "complete" as const,
        fields: [],
        notes: [],
      },
      reviewerFinal: {
        ...base.reviewerFinal,
        status: "complete" as const,
        lines: [],
      },
      packageReadiness: {
        ...base.packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        summary: "Ready",
        nextStep: "Hand it off",
        items: [],
      },
    };

    const packet = buildTinaOfficialFormPacket(draft);

    expect(packet.status).toBe("complete");
    expect(packet.forms).toHaveLength(0);
    expect(packet.summary).toContain("2025");
    expect(packet.summary).toContain("2026");
  });

  it("refuses to claim an IRS-facing packet when the latest watch needs review", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
      profile: {
        ...base.profile,
        businessName: "Tina Sole Prop",
        taxYear: "2025",
        entityType: "sole_prop" as const,
      },
      scheduleCDraft: {
        ...base.scheduleCDraft,
        status: "complete" as const,
        fields: [],
        notes: [],
      },
      reviewerFinal: {
        ...base.reviewerFinal,
        status: "complete" as const,
        lines: [],
      },
      packageReadiness: {
        ...base.packageReadiness,
        status: "complete" as const,
        level: "ready_for_cpa" as const,
        summary: "Ready",
        nextStep: "Hand it off",
        items: [],
      },
    };

    const packet = buildTinaOfficialFormPacket(draft, {
      irsAuthorityWatchStatus: {
        level: "needs_review",
        generatedAt: "2026-03-29T04:20:00.000Z",
        checkedCount: 18,
        failedCount: 0,
        changedCount: 1,
        newCount: 0,
        summary: "The latest IRS watch found 1 changed IRS source since the prior stored run.",
        nextStep: "Review the changed sources and recertify Tina's IRS registry before leaning on fresh IRS-facing claims.",
      },
    });

    expect(packet.status).toBe("complete");
    expect(packet.forms).toHaveLength(0);
    expect(packet.summary).toContain("changed IRS source");
  });
});
