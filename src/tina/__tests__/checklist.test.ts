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

  it("turns messy-book clues into simple follow-up asks", () => {
    const base = createDefaultTinaWorkspaceDraft();
    const draft = {
      ...base,
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
          uploadedAt: "2026-03-27T10:04:00.000Z",
        },
        {
          id: "doc-qb",
          name: "partial-books.csv",
          size: 2200,
          mimeType: "text/csv",
          storagePath: "user/2025/doc-qb.csv",
          category: "supporting_document" as const,
          requestId: "quickbooks",
          requestLabel: "QuickBooks or your profit-and-loss report",
          uploadedAt: "2026-03-27T10:05:00.000Z",
        },
        {
          id: "doc-bank",
          name: "bank.csv",
          size: 3200,
          mimeType: "text/csv",
          storagePath: "user/2025/doc-bank.csv",
          category: "supporting_document" as const,
          requestId: "bank-support",
          requestLabel: "Business bank and card statements",
          uploadedAt: "2026-03-27T10:06:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-payroll",
          sourceDocumentId: "doc-qb",
          label: "Payroll clue",
          value: "This paper mentions payroll.",
          confidence: "medium" as const,
          capturedAt: "2026-03-27T10:07:00.000Z",
        },
        {
          id: "fact-contractor",
          sourceDocumentId: "doc-qb",
          label: "Contractor clue",
          value: "This paper mentions contractors.",
          confidence: "medium" as const,
          capturedAt: "2026-03-27T10:07:00.000Z",
        },
        {
          id: "fact-sales-tax",
          sourceDocumentId: "doc-qb",
          label: "Sales tax clue",
          value: "This paper mentions sales tax.",
          confidence: "medium" as const,
          capturedAt: "2026-03-27T10:07:00.000Z",
        },
        {
          id: "fact-inventory",
          sourceDocumentId: "doc-qb",
          label: "Inventory clue",
          value: "This paper mentions inventory.",
          confidence: "medium" as const,
          capturedAt: "2026-03-27T10:07:00.000Z",
        },
        {
          id: "fact-idaho",
          sourceDocumentId: "doc-qb",
          label: "State clue",
          value: "This paper mentions Idaho.",
          confidence: "medium" as const,
          capturedAt: "2026-03-27T10:07:00.000Z",
        },
      ],
      booksImport: {
        ...base.booksImport,
        status: "complete" as const,
        coverageStart: "2025-01-01",
        coverageEnd: "2025-06-30",
      },
      profile: {
        ...base.profile,
        businessName: "Tina Test LLC",
        taxYear: "2025",
        entityType: "single_member_llc" as const,
        formationDate: "2024-01-15",
      },
    };

    const checklist = buildTinaChecklist(draft, recommendTinaFilingLane(draft.profile));

    expect(checklist.find((item) => item.id === "quickbooks")?.status).toBe("needed");
    expect(checklist.find((item) => item.id === "quickbooks")?.reason).toContain("part of the year");
    expect(checklist.find((item) => item.id === "quickbooks")?.kind).toBe("replacement");
    expect(checklist.find((item) => item.id === "quickbooks")?.actionLabel).toBe(
      "Add fuller books export"
    );
    expect(checklist.find((item) => item.id === "quickbooks")?.substituteHint).toContain(
      "full-year"
    );
    expect(checklist.find((item) => item.id === "payroll")?.status).toBe("needed");
    expect(checklist.find((item) => item.id === "contractors")?.substituteHint).toContain(
      "vendor payment export"
    );
    expect(checklist.find((item) => item.id === "contractors")?.status).toBe("needed");
    expect(checklist.find((item) => item.id === "sales-tax")?.status).toBe("needed");
    expect(checklist.find((item) => item.id === "inventory")?.status).toBe("needed");
    expect(checklist.find((item) => item.id === "idaho-activity")?.action).toBe("answer");
    expect(checklist.slice(0, 4).map((item) => item.id)).toEqual([
      "contractors",
      "payroll",
      "sales-tax",
      "idaho-activity",
    ]);
    expect(checklist.findIndex((item) => item.id === "quickbooks")).toBeGreaterThan(
      checklist.findIndex((item) => item.id === "sales-tax")
    );
  });

  it("adds LLC follow-up asks when the federal tax path or election papers still matter", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Election LLC",
        entityType: "single_member_llc" as const,
        llcFederalTaxTreatment: "c_corp_return" as const,
      },
    };

    const checklist = buildTinaChecklist(draft, recommendTinaFilingLane(draft.profile));

    expect(checklist.find((item) => item.id === "llc-election")?.status).toBe("needed");
    expect(checklist.find((item) => item.id === "llc-election")?.substituteHint).toContain(
      "Form 2553"
    );
  });

  it("shows one calm return-type review ask when explicit LLC answers conflict with saved papers", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Conflict LLC",
        entityType: "single_member_llc" as const,
        llcFederalTaxTreatment: "owner_return" as const,
      },
      sourceFacts: [
        {
          id: "return-type",
          sourceDocumentId: "prior-doc",
          label: "Return type hint",
          value: "Form 1120-S / LLC taxed as S-corp",
          confidence: "high" as const,
          capturedAt: "2026-03-28T23:30:00.000Z",
        },
        {
          id: "llc-election",
          sourceDocumentId: "prior-doc",
          label: "LLC election clue",
          value: "Form 2553 election accepted for S corporation treatment.",
          confidence: "high" as const,
          capturedAt: "2026-03-28T23:31:00.000Z",
        },
      ],
    };

    const checklist = buildTinaChecklist(
      draft,
      recommendTinaFilingLane(draft.profile, draft.sourceFacts)
    );

    expect(checklist.find((item) => item.id === "lane-review")).toEqual(
      expect.objectContaining({
        action: "review",
        status: "needed",
      })
    );
    expect(checklist.find((item) => item.id === "lane-review")?.reason).toContain(
      "LLC tax path"
    );
  });

  it("lets saved LLC election papers cover the tax-path question before Tina asks again", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      priorReturnDocumentId: "doc-prior",
      documents: [
        {
          id: "doc-prior",
          name: "2024-return.pdf",
          size: 2048,
          mimeType: "application/pdf",
          storagePath: "user/2025/doc-prior.pdf",
          category: "prior_return" as const,
          requestId: "prior-return",
          requestLabel: "Last year's tax return",
          uploadedAt: "2026-03-28T18:10:00.000Z",
        },
      ],
      sourceFacts: [
        {
          id: "fact-llc-election",
          sourceDocumentId: "doc-prior",
          label: "LLC election clue",
          value: "Form 2553 election accepted for S corporation treatment.",
          confidence: "high" as const,
          capturedAt: "2026-03-28T18:10:00.000Z",
        },
      ],
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Election LLC",
        entityType: "single_member_llc" as const,
        llcFederalTaxTreatment: "unsure" as const,
      },
    };

    const checklist = buildTinaChecklist(
      draft,
      recommendTinaFilingLane(draft.profile, draft.sourceFacts)
    );

    expect(checklist.find((item) => item.id === "llc-tax-treatment")).toBeUndefined();
    expect(checklist.find((item) => item.id === "llc-election")?.status).toBe("covered");
  });

  it("does not turn a non-Idaho state clue into an Idaho owner ask", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      sourceFacts: [
        {
          id: "fact-wa",
          sourceDocumentId: "doc-prior",
          label: "State clue",
          value: "This paper mentions Washington.",
          confidence: "medium" as const,
          capturedAt: "2026-03-28T20:20:00.000Z",
        },
      ],
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Washington LLC",
        entityType: "single_member_llc" as const,
      },
    };

    const checklist = buildTinaChecklist(
      draft,
      recommendTinaFilingLane(draft.profile, draft.sourceFacts)
    );

    expect(checklist.find((item) => item.id === "idaho-activity")).toBeUndefined();
  });

  it("keeps both llc follow-up questions hidden when saved papers prove the spouse community-property path", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      sourceFacts: [
        {
          id: "fact-owner-return",
          sourceDocumentId: "doc-prior",
          label: "LLC tax treatment clue",
          value: "Schedule C owner return for this husband-and-wife LLC.",
          confidence: "high" as const,
          capturedAt: "2026-03-28T21:00:00.000Z",
        },
        {
          id: "fact-community-property",
          sourceDocumentId: "doc-prior",
          label: "Community property clue",
          value: "Husband and wife community property owners in Washington.",
          confidence: "high" as const,
          capturedAt: "2026-03-28T21:00:00.000Z",
        },
      ],
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Spouse Path LLC",
        entityType: "multi_member_llc" as const,
        formationState: "WA",
        llcFederalTaxTreatment: "unsure" as const,
        llcCommunityPropertyStatus: "unsure" as const,
      },
    };

    const checklist = buildTinaChecklist(
      draft,
      recommendTinaFilingLane(draft.profile, draft.sourceFacts)
    );

    expect(checklist.find((item) => item.id === "llc-tax-treatment")).toBeUndefined();
    expect(checklist.find((item) => item.id === "llc-community-property")).toBeUndefined();
  });

  it("turns fixed-asset paper clues into a calm asset follow-up even when the organizer missed it", () => {
    const draft = {
      ...createDefaultTinaWorkspaceDraft(),
      profile: {
        ...createDefaultTinaWorkspaceDraft().profile,
        businessName: "Fringe LLC",
        entityType: "single_member_llc" as const,
      },
      sourceFacts: [
        {
          id: "fact-fixed-assets",
          sourceDocumentId: "doc-books",
          label: "Fixed asset clue",
          value: "This paper mentions equipment, depreciation, or other big-purchase treatment.",
          confidence: "medium" as const,
          capturedAt: "2026-03-29T10:35:00.000Z",
        },
      ],
    };

    const checklist = buildTinaChecklist(
      draft,
      recommendTinaFilingLane(draft.profile, draft.sourceFacts)
    );

    expect(checklist.find((item) => item.id === "assets")).toEqual(
      expect.objectContaining({
        source: "document_clue",
        status: "needed",
      })
    );
    expect(checklist.find((item) => item.id === "assets")?.reason).toContain("equipment");
  });
});
