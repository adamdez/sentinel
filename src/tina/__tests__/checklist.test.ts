import { describe, expect, it } from "vitest";
import { buildTinaChecklist } from "@/tina/lib/checklist";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

describe("buildTinaChecklist", () => {
  it("marks request items covered when matching papers have been saved", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      priorReturnDocumentId: "doc-prior",
      documents: [
        {
          id: "doc-prior",
          name: "2024 return.pdf",
          size: 1200,
          mimeType: "application/pdf",
          storagePath: "user/2025/doc-prior.pdf",
          category: "prior_return" as const,
          requestId: "prior-return",
          requestLabel: "Last year's tax return",
          uploadedAt: "2026-03-26T21:00:00.000Z",
        },
        {
          id: "doc-qb",
          name: "profit-loss.xlsx",
          size: 2200,
          mimeType: "application/vnd.ms-excel",
          storagePath: "user/2025/doc-qb.xlsx",
          category: "supporting_document" as const,
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-26T21:05:00.000Z",
        },
        {
          id: "doc-bank",
          name: "bank-statements.pdf",
          size: 3200,
          mimeType: "application/pdf",
          storagePath: "user/2025/doc-bank.pdf",
          category: "supporting_document" as const,
          requestId: "bank-support",
          requestLabel: "Business bank and card statements",
          uploadedAt: "2026-03-26T21:06:00.000Z",
        },
      ],
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
      },
    };

    const checklist = buildTinaChecklist(draft, recommendTinaFilingLane(draft.profile));

    expect(checklist.find((item) => item.id === "prior-return")?.status).toBe("covered");
    expect(checklist.find((item) => item.id === "quickbooks")?.status).toBe("covered");
    expect(checklist.find((item) => item.id === "bank-support")?.status).toBe("covered");
  });

  it("keeps optional requests needed until the matching paper arrives", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
        hasPayroll: true,
        hasInventory: true,
      },
    };

    const checklist = buildTinaChecklist(draft, recommendTinaFilingLane(draft.profile));

    expect(checklist.find((item) => item.id === "payroll")?.status).toBe("needed");
    expect(checklist.find((item) => item.id === "inventory")?.status).toBe("needed");
  });

  it("treats a live QuickBooks connection as coverage for the books requirement", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      quickBooksConnection: {
        ...createDefaultTinaWorkspaceDraft().quickBooksConnection,
        status: "connected" as const,
        companyName: "Tina Books LLC",
        connectedAt: "2026-03-27T05:00:00.000Z",
      },
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
      },
    };

    const checklist = buildTinaChecklist(draft, recommendTinaFilingLane(draft.profile));
    expect(checklist.find((item) => item.id === "quickbooks")?.status).toBe("covered");
  });

  it("requests ownership proof for complex llc paths", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Complex LLC",
        entityType: "multi_member_llc" as const,
        ownerCount: 2,
        hasFormerOwnerPayments: true,
      },
    };

    const checklist = buildTinaChecklist(draft, {
      laneId: "1065",
      title: "1065 / Partnership",
      support: "future",
      summary: "Future lane",
      reasons: [],
      blockers: [],
    });

    expect(checklist.find((item) => item.id === "ownership-agreement")?.status).toBe("needed");
    expect(checklist.find((item) => item.id === "ownership-transition")?.status).toBe("needed");
  });

  it("requests election proof for corporate-election lane signals", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Election LLC",
        entityType: "single_member_llc" as const,
        taxElection: "s_corp" as const,
      },
    };

    const checklist = buildTinaChecklist(draft, {
      laneId: "1120_s",
      title: "1120-S / S-Corp",
      support: "future",
      summary: "Future lane",
      reasons: [],
      blockers: [],
    });

    expect(checklist.find((item) => item.id === "entity-election")?.status).toBe("needed");
  });
});
