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
          requestId: "profit-loss",
          requestLabel: "Full-year profit and loss",
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
    expect(checklist.find((item) => item.id === "profit-loss")?.status).toBe("covered");
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

  it("asks for the concrete CPA intake files instead of generic bookkeeping language", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Tina Test LLC",
        entityType: "single_member_llc" as const,
        hasFixedAssets: true,
      },
    };

    const checklist = buildTinaChecklist(draft, recommendTinaFilingLane(draft.profile));

    expect(checklist.find((item) => item.id === "general-ledger")?.label).toBe(
      "General ledger export"
    );
    expect(checklist.find((item) => item.id === "balance-sheet")?.label).toBe(
      "Year-end balance sheet"
    );
    expect(checklist.find((item) => item.id === "assets")?.priority).toBe("required");
    expect(checklist.find((item) => item.id === "unusual-items")?.priority).toBe("recommended");
  });
});
