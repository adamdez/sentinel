import { buildTinaProfileFingerprint } from "@/tina/lib/profile-fingerprint";
import {
  createTinaPackageSnapshotRecord,
  recordTinaReviewerDecision,
} from "@/tina/lib/package-state";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type {
  TinaAuthorityWorkItem,
  TinaDocumentReading,
  TinaStoredDocument,
  TinaStoredDocumentCategory,
  TinaWorkspaceDraft,
} from "@/tina/types";
import { TINA_EXTREME_SMOKE_DRAFTS } from "@/tina/data/extreme-smoke-drafts";
import type { TinaSkillReviewFixture } from "@/tina/lib/skill-report-card-contracts";

function cloneDraft(draft: TinaWorkspaceDraft): TinaWorkspaceDraft {
  return JSON.parse(JSON.stringify(draft)) as TinaWorkspaceDraft;
}

function requireDraft(id: string): TinaWorkspaceDraft {
  const found = TINA_EXTREME_SMOKE_DRAFTS.find((fixture) => fixture.id === id);
  if (!found) {
    throw new Error(`Missing Tina extreme smoke draft: ${id}`);
  }

  return cloneDraft(found.draft);
}

function createDocument(args: {
  id: string;
  name: string;
  category: TinaStoredDocumentCategory;
  uploadedAt: string;
  requestId?: string | null;
  requestLabel?: string | null;
  mimeType?: string;
}): TinaStoredDocument {
  return {
    id: args.id,
    name: args.name,
    size: 100,
    mimeType: args.mimeType ?? "application/pdf",
    storagePath: `tina/skill-review/${args.name}`,
    category: args.category,
    requestId: args.requestId ?? null,
    requestLabel: args.requestLabel ?? null,
    uploadedAt: args.uploadedAt,
  };
}

function createReading(args: {
  documentId: string;
  kind: TinaDocumentReading["kind"];
  lastReadAt: string;
  detailLines?: string[];
}): TinaDocumentReading {
  return {
    documentId: args.documentId,
    status: "complete",
    kind: args.kind,
    summary: "Read",
    nextStep: "Keep going",
    facts: [],
    detailLines: args.detailLines ?? [],
    rowCount: args.kind === "spreadsheet" ? 24 : null,
    headers: args.kind === "spreadsheet" ? ["Date", "Amount", "Memo"] : [],
    sheetNames: args.kind === "spreadsheet" ? ["Sheet1"] : [],
    lastReadAt: args.lastReadAt,
  };
}

function createAuthorityWorkItem(
  ideaId: string,
  overrides: Partial<TinaAuthorityWorkItem> = {}
): TinaAuthorityWorkItem {
  return {
    ideaId,
    status: "ready_for_reviewer",
    reviewerDecision: "use_it",
    disclosureDecision: "not_needed",
    memo: "Authority work complete.",
    reviewerNotes: "",
    missingAuthority: [],
    citations: [],
    lastAiRunAt: "2026-04-03T09:00:00.000Z",
    updatedAt: "2026-04-03T09:00:00.000Z",
    ...overrides,
  };
}

function buildThinProofDraft(): TinaWorkspaceDraft {
  const draft = createDefaultTinaWorkspaceDraft();
  const profile = {
    ...draft.profile,
    businessName: "Paper Moon Studio LLC",
    taxYear: "2025",
    principalBusinessActivity: "",
    naicsCode: "",
    entityType: "single_member_llc" as const,
    notes: "Owner only uploaded one bank statement and no prior return.",
  };
  const profileFingerprint = buildTinaProfileFingerprint(profile);

  return {
    ...draft,
    profile,
    documents: [
      createDocument({
        id: "doc-bank-only",
        name: "bank-only.pdf",
        category: "supporting_document",
        uploadedAt: "2026-04-03T08:00:00.000Z",
      }),
    ],
    documentReadings: [
      createReading({
        documentId: "doc-bank-only",
        kind: "pdf",
        lastReadAt: "2026-04-03T08:05:00.000Z",
        detailLines: ["Bank statement shows deposits and card spend only."],
      }),
    ],
    sourceFacts: [
      {
        id: "fact-income-only",
        sourceDocumentId: "doc-bank-only",
        label: "Gross receipts support",
        value: "One bank statement shows deposits that may represent gross receipts.",
        confidence: "medium",
        capturedAt: "2026-04-03T08:06:00.000Z",
      },
    ],
    bootstrapReview: {
      ...draft.bootstrapReview,
      status: "complete",
      lastRunAt: "2026-04-03T08:10:00.000Z",
      profileFingerprint,
      summary: "Thin proof",
      nextStep: "Collect stronger books and prior-year support.",
      facts: [],
      items: [],
    },
    issueQueue: {
      ...draft.issueQueue,
      status: "complete",
      lastRunAt: "2026-04-03T08:11:00.000Z",
      profileFingerprint,
      summary: "Thin proof",
      nextStep: "Collect stronger books and prior-year support.",
      items: [],
      records: [],
    },
    reviewerFinal: {
      ...draft.reviewerFinal,
      status: "complete",
      lastRunAt: "2026-04-03T08:12:00.000Z",
      summary: "Thin proof",
      nextStep: "Strengthen evidence before trust.",
      lines: [
        {
          id: "rf-income-only",
          kind: "income",
          layer: "reviewer_final",
          label: "Gross receipts candidate",
          amount: 24000,
          status: "needs_attention",
          summary: "Only one bank statement supports this line so far.",
          sourceDocumentIds: ["doc-bank-only"],
          sourceFactIds: ["fact-income-only"],
          issueIds: [],
          derivedFromLineIds: [],
          cleanupSuggestionIds: [],
          taxAdjustmentIds: [],
        },
      ],
    },
    scheduleCDraft: {
      ...draft.scheduleCDraft,
      status: "complete",
      lastRunAt: "2026-04-03T08:13:00.000Z",
      summary: "Thin proof",
      nextStep: "Do not trust this as reviewer-grade yet.",
      fields: [
        {
          id: "line-1-gross-receipts",
          lineNumber: "Line 1",
          label: "Gross receipts or sales",
          amount: 24000,
          status: "needs_attention",
          summary: "Thin proof only.",
          reviewerFinalLineIds: ["rf-income-only"],
          taxAdjustmentIds: [],
          sourceDocumentIds: ["doc-bank-only"],
        },
      ],
      notes: [],
    },
  };
}

function buildDirtyBooksDraft(): TinaWorkspaceDraft {
  const draft = requireDraft("sole-prop-supported-core");

  draft.profile.businessName = "Cinder Block Services LLC";
  draft.profile.principalBusinessActivity = "General contractor and remodel work";
  draft.profile.naicsCode = "238990";
  draft.profile.hasPayroll = true;
  draft.profile.paysContractors = true;
  draft.profile.hasInventory = true;
  draft.profile.hasFixedAssets = true;
  draft.profile.collectsSalesTax = true;
  draft.profile.notes =
    "Books contain owner draws, mixed-use card spend, payroll/contractor overlap, inventory, depreciation, related-party, and two EINs.";

  draft.documents.push(
    createDocument({
      id: "doc-ledger-mess",
      name: "ledger-mess.csv",
      category: "supporting_document",
      uploadedAt: "2026-04-03T09:00:00.000Z",
      mimeType: "text/csv",
    }),
    createDocument({
      id: "doc-owner-flows",
      name: "owner-flows.pdf",
      category: "supporting_document",
      uploadedAt: "2026-04-03T09:01:00.000Z",
    })
  );

  draft.documentReadings.push(
    createReading({
      documentId: "doc-ledger-mess",
      kind: "spreadsheet",
      lastReadAt: "2026-04-03T09:05:00.000Z",
      detailLines: [
        "Ledger includes owner draws, payroll, contractor payments, inventory, and intercompany transfers.",
      ],
    }),
    createReading({
      documentId: "doc-owner-flows",
      kind: "pdf",
      lastReadAt: "2026-04-03T09:06:00.000Z",
      detailLines: ["Agreement references related-party and owner reimbursement flows."],
    })
  );

  draft.sourceFacts.push(
    {
      id: "fact-owner-draw",
      sourceDocumentId: "doc-owner-flows",
      label: "Owner draw clue",
      value: "Owner draws and reimbursements are mixed into the books.",
      confidence: "high",
      capturedAt: "2026-04-03T09:07:00.000Z",
    },
    {
      id: "fact-mixed-use",
      sourceDocumentId: "doc-ledger-mess",
      label: "Mixed personal/business clue",
      value: "Business card includes personal meals, travel, and tech spend.",
      confidence: "high",
      capturedAt: "2026-04-03T09:08:00.000Z",
    },
    {
      id: "fact-payroll",
      sourceDocumentId: "doc-ledger-mess",
      label: "Payroll clue",
      value: "Payroll expense appears in the books.",
      confidence: "high",
      capturedAt: "2026-04-03T09:09:00.000Z",
    },
    {
      id: "fact-contractor",
      sourceDocumentId: "doc-ledger-mess",
      label: "Contractor clue",
      value: "Contract labor expense appears in the books.",
      confidence: "high",
      capturedAt: "2026-04-03T09:10:00.000Z",
    },
    {
      id: "fact-intercompany",
      sourceDocumentId: "doc-owner-flows",
      label: "Intercompany transfer clue",
      value: "Due-to and due-from transfers appear between entities.",
      confidence: "high",
      capturedAt: "2026-04-03T09:11:00.000Z",
    },
    {
      id: "fact-related-party",
      sourceDocumentId: "doc-owner-flows",
      label: "Related-party clue",
      value: "Related-party transactions appear with a family management company.",
      confidence: "high",
      capturedAt: "2026-04-03T09:12:00.000Z",
    },
    {
      id: "fact-depreciation",
      sourceDocumentId: "doc-ledger-mess",
      label: "Depreciation clue",
      value: "Equipment purchases and depreciation entries appear.",
      confidence: "high",
      capturedAt: "2026-04-03T09:13:00.000Z",
    },
    {
      id: "fact-inventory",
      sourceDocumentId: "doc-ledger-mess",
      label: "Inventory clue",
      value: "Inventory and job materials are mixed in expense accounts.",
      confidence: "high",
      capturedAt: "2026-04-03T09:14:00.000Z",
    },
    {
      id: "fact-sales-tax",
      sourceDocumentId: "doc-ledger-mess",
      label: "Sales tax clue",
      value: "Collected sales tax appears in gross receipts and liability accounts.",
      confidence: "high",
      capturedAt: "2026-04-03T09:15:00.000Z",
    },
    {
      id: "fact-ein",
      sourceDocumentId: "doc-owner-flows",
      label: "EIN clue",
      value: "EINs 12-3456789 and 98-7654321 both appear in the current paper set.",
      confidence: "high",
      capturedAt: "2026-04-03T09:16:00.000Z",
    }
  );

  return draft;
}

function buildSalesTaxAuthorityDraft(): TinaWorkspaceDraft {
  const draft = requireDraft("sole-prop-supported-core");
  draft.profile.businessName = "North River Retail LLC";
  draft.profile.principalBusinessActivity = "Ecommerce retail";
  draft.profile.naicsCode = "454110";
  draft.profile.collectsSalesTax = true;
  draft.profile.hasInventory = true;
  draft.profile.notes = "Strong sales-tax pass-through support plus marketplace inventory patterns.";
  draft.documents.push(
    createDocument({
      id: "doc-sales-tax",
      name: "sales-tax-remittance.pdf",
      category: "supporting_document",
      uploadedAt: "2026-04-03T10:00:00.000Z",
    })
  );
  draft.documentReadings.push(
    createReading({
      documentId: "doc-sales-tax",
      kind: "pdf",
      lastReadAt: "2026-04-03T10:05:00.000Z",
      detailLines: ["State sales-tax remittance support and marketplace payout summary."],
    })
  );
  draft.sourceFacts.push(
    {
      id: "fact-sales-tax",
      sourceDocumentId: "doc-sales-tax",
      label: "Sales tax clue",
      value: "Collected sales tax is remitted to the state and should not remain in taxable income.",
      confidence: "high",
      capturedAt: "2026-04-03T10:06:00.000Z",
    },
    {
      id: "fact-marketplace",
      sourceDocumentId: "doc-sales-tax",
      label: "Marketplace payout clue",
      value: "Marketplace payouts and processor fees reconcile to gross receipts.",
      confidence: "high",
      capturedAt: "2026-04-03T10:07:00.000Z",
    },
    {
      id: "fact-inventory",
      sourceDocumentId: "doc-sales-tax",
      label: "Inventory clue",
      value: "Inventory counts and year-end stock support are available.",
      confidence: "medium",
      capturedAt: "2026-04-03T10:08:00.000Z",
    }
  );
  draft.authorityWork.push(
    createAuthorityWorkItem("wa-state-review", {
      memo: "State pass-through sales-tax treatment supported.",
    })
  );
  return draft;
}

function buildCreatorMediaDraft(): TinaWorkspaceDraft {
  const draft = requireDraft("sole-prop-supported-core");
  draft.profile.businessName = "Orbit Media Studio LLC";
  draft.profile.principalBusinessActivity = "Creator media, podcast, and sponsorship revenue";
  draft.profile.naicsCode = "512110";
  draft.profile.hasFixedAssets = true;
  draft.profile.notes =
    "YouTube, podcast, affiliate, and sponsorship revenue with mixed-use equipment and travel.";
  draft.documents.push(
    createDocument({
      id: "doc-platform-payouts",
      name: "youtube-payouts.csv",
      category: "supporting_document",
      uploadedAt: "2026-04-03T11:00:00.000Z",
      mimeType: "text/csv",
    }),
    createDocument({
      id: "doc-sponsors",
      name: "sponsorship-agreements.pdf",
      category: "supporting_document",
      uploadedAt: "2026-04-03T11:01:00.000Z",
    })
  );
  draft.documentReadings.push(
    createReading({
      documentId: "doc-platform-payouts",
      kind: "spreadsheet",
      lastReadAt: "2026-04-03T11:05:00.000Z",
      detailLines: ["Platform payout statements and affiliate revenue exports."],
    }),
    createReading({
      documentId: "doc-sponsors",
      kind: "pdf",
      lastReadAt: "2026-04-03T11:06:00.000Z",
      detailLines: ["Sponsorship and affiliate agreements reference brand work and travel."],
    })
  );
  draft.sourceFacts.push(
    {
      id: "fact-platform",
      sourceDocumentId: "doc-platform-payouts",
      label: "Platform payout clue",
      value: "YouTube, podcast, and affiliate payouts are present.",
      confidence: "high",
      capturedAt: "2026-04-03T11:07:00.000Z",
    },
    {
      id: "fact-creator",
      sourceDocumentId: "doc-sponsors",
      label: "Creator clue",
      value: "Creator, content, podcast, sponsorship, and affiliate revenue are core to the business.",
      confidence: "high",
      capturedAt: "2026-04-03T11:08:00.000Z",
    },
    {
      id: "fact-mixed-use",
      sourceDocumentId: "doc-sponsors",
      label: "Mixed personal/business clue",
      value: "Travel and equipment appear partially personal and partially brand-driven.",
      confidence: "medium",
      capturedAt: "2026-04-03T11:09:00.000Z",
    }
  );
  return draft;
}

function buildPayrollContractorOverlapDraft(): TinaWorkspaceDraft {
  const draft = buildDirtyBooksDraft();
  draft.profile.businessName = "River Bend Field Ops LLC";
  draft.profile.notes =
    "Crew labor is split across W-2 payroll, 1099 subcontractors, and year-end reclasses between payroll and contract labor.";
  draft.documents.push(
    createDocument({
      id: "doc-payroll-register",
      name: "payroll-register.csv",
      category: "supporting_document",
      uploadedAt: "2026-04-03T11:30:00.000Z",
      mimeType: "text/csv",
    }),
    createDocument({
      id: "doc-1099-summary",
      name: "1099-summary.pdf",
      category: "supporting_document",
      uploadedAt: "2026-04-03T11:31:00.000Z",
    })
  );
  draft.documentReadings.push(
    createReading({
      documentId: "doc-payroll-register",
      kind: "spreadsheet",
      lastReadAt: "2026-04-03T11:32:00.000Z",
      detailLines: ["Payroll register shows field crew labor, overtime, and officer pay."],
    }),
    createReading({
      documentId: "doc-1099-summary",
      kind: "pdf",
      lastReadAt: "2026-04-03T11:33:00.000Z",
      detailLines: ["1099 package shows subcontractor labor overlapping with payroll-coded crews."],
    })
  );
  draft.sourceFacts.push(
    {
      id: "fact-payroll-overlap",
      sourceDocumentId: "doc-payroll-register",
      label: "Payroll clue",
      value: "W-2 payroll register shows crew labor that overlaps with job-cost labor categories.",
      confidence: "high",
      capturedAt: "2026-04-03T11:34:00.000Z",
    },
    {
      id: "fact-contractor-overlap",
      sourceDocumentId: "doc-1099-summary",
      label: "Contractor clue",
      value: "1099 subcontractor labor overlaps with payroll-coded field labor and year-end reclasses.",
      confidence: "high",
      capturedAt: "2026-04-03T11:35:00.000Z",
    }
  );
  return draft;
}

function buildHeavyDepreciationDraft(): TinaWorkspaceDraft {
  const draft = requireDraft("sole-prop-supported-core");
  draft.profile.businessName = "Iron Lantern Fabrication LLC";
  draft.profile.principalBusinessActivity = "Custom fabrication and shop work";
  draft.profile.naicsCode = "332322";
  draft.profile.hasFixedAssets = true;
  draft.profile.notes =
    "Heavy depreciation year with shop equipment, a service vehicle, and section 179 pressure.";
  draft.documents.push(
    createDocument({
      id: "doc-asset-rollforward",
      name: "asset-rollforward.xlsx",
      category: "supporting_document",
      uploadedAt: "2026-04-03T11:40:00.000Z",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    createDocument({
      id: "doc-asset-invoices",
      name: "asset-invoices.pdf",
      category: "supporting_document",
      uploadedAt: "2026-04-03T11:41:00.000Z",
    })
  );
  draft.documentReadings.push(
    createReading({
      documentId: "doc-asset-rollforward",
      kind: "spreadsheet",
      lastReadAt: "2026-04-03T11:42:00.000Z",
      detailLines: ["Asset rollforward shows placed-in-service dates, cost, and prior depreciation."],
    }),
    createReading({
      documentId: "doc-asset-invoices",
      kind: "pdf",
      lastReadAt: "2026-04-03T11:43:00.000Z",
      detailLines: ["Equipment and vehicle invoices support the current-year depreciation story."],
    })
  );
  draft.sourceFacts.push({
    id: "fact-depreciation-heavy",
    sourceDocumentId: "doc-asset-rollforward",
    label: "Depreciation clue",
    value: "Heavy current-year depreciation and section 179 treatment are supported by an asset rollforward.",
    confidence: "high",
    capturedAt: "2026-04-03T11:44:00.000Z",
  });
  draft.reviewerFinal.lines.push({
    id: "rf-depreciation-heavy",
    kind: "expense",
    layer: "reviewer_final",
    label: "Depreciation expense candidate",
    amount: 18000,
    status: "needs_attention",
    summary: "Depreciation is large enough that Form 4562 support matters.",
    sourceDocumentIds: ["doc-asset-rollforward", "doc-asset-invoices"],
    sourceFactIds: ["fact-depreciation-heavy"],
    issueIds: [],
    derivedFromLineIds: [],
    cleanupSuggestionIds: [],
    taxAdjustmentIds: [],
  });
  draft.scheduleCDraft.fields.push({
    id: "line-13-depreciation",
    lineNumber: "Line 13",
    label: "Depreciation and section 179 expense deduction",
    amount: 18000,
    status: "needs_attention",
    summary: "Large depreciation year needs Form 4562 support.",
    reviewerFinalLineIds: ["rf-depreciation-heavy"],
    taxAdjustmentIds: [],
    sourceDocumentIds: ["doc-asset-rollforward", "doc-asset-invoices"],
  });
  return draft;
}

function buildInventoryHeavyRetailDraft(): TinaWorkspaceDraft {
  const draft = buildSalesTaxAuthorityDraft();
  draft.profile.businessName = "Summit Trail Mercantile LLC";
  draft.profile.notes =
    "Inventory-heavy ecommerce retailer with year-end counts, returns, shrinkage, and marketplace sales-tax complexity.";
  draft.documents.push(
    createDocument({
      id: "doc-inventory-count",
      name: "year-end-inventory-count.xlsx",
      category: "supporting_document",
      uploadedAt: "2026-04-03T11:50:00.000Z",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    createDocument({
      id: "doc-cogs-rollforward",
      name: "cogs-rollforward.pdf",
      category: "supporting_document",
      uploadedAt: "2026-04-03T11:51:00.000Z",
    })
  );
  draft.documentReadings.push(
    createReading({
      documentId: "doc-inventory-count",
      kind: "spreadsheet",
      lastReadAt: "2026-04-03T11:52:00.000Z",
      detailLines: ["Year-end inventory count, shrinkage, and returns are tracked by SKU."],
    }),
    createReading({
      documentId: "doc-cogs-rollforward",
      kind: "pdf",
      lastReadAt: "2026-04-03T11:53:00.000Z",
      detailLines: ["COGS rollforward ties beginning inventory, purchases, and ending inventory."],
    })
  );
  draft.sourceFacts.push({
    id: "fact-inventory-method",
    sourceDocumentId: "doc-cogs-rollforward",
    label: "Inventory clue",
    value: "Inventory method, counts, and COGS rollforward support are available for the year.",
    confidence: "high",
    capturedAt: "2026-04-03T11:54:00.000Z",
  });
  draft.reviewerFinal.lines.push({
    id: "rf-cogs-heavy",
    kind: "expense",
    layer: "reviewer_final",
    label: "Cost of goods sold candidate",
    amount: 46000,
    status: "needs_attention",
    summary: "Inventory-heavy retailer needs COGS support and reviewer confirmation.",
    sourceDocumentIds: ["doc-inventory-count", "doc-cogs-rollforward"],
    sourceFactIds: ["fact-inventory-method"],
    issueIds: [],
    derivedFromLineIds: [],
    cleanupSuggestionIds: [],
    taxAdjustmentIds: [],
  });
  draft.scheduleCDraft.fields.push({
    id: "line-4-cost-of-goods-sold",
    lineNumber: "Line 4",
    label: "Cost of goods sold",
    amount: 46000,
    status: "needs_attention",
    summary: "Inventory-heavy retailer requires COGS support.",
    reviewerFinalLineIds: ["rf-cogs-heavy"],
    taxAdjustmentIds: [],
    sourceDocumentIds: ["doc-inventory-count", "doc-cogs-rollforward"],
  });
  return draft;
}

function buildMixedUseHomeOfficeVehicleDraft(): TinaWorkspaceDraft {
  const draft = requireDraft("sole-prop-supported-core");
  draft.profile.businessName = "Juniper Trail Advisory LLC";
  draft.profile.principalBusinessActivity = "Consulting with home office and field travel";
  draft.profile.naicsCode = "541618";
  draft.profile.notes =
    "Home office, vehicle mileage, travel, and mixed use equipment still need separation between personal and business use.";
  draft.documents.push(
    createDocument({
      id: "doc-mileage-log",
      name: "mileage-log.csv",
      category: "supporting_document",
      uploadedAt: "2026-04-03T12:10:00.000Z",
      mimeType: "text/csv",
    }),
    createDocument({
      id: "doc-home-office",
      name: "home-office-measurements.pdf",
      category: "supporting_document",
      uploadedAt: "2026-04-03T12:11:00.000Z",
    })
  );
  draft.documentReadings.push(
    createReading({
      documentId: "doc-mileage-log",
      kind: "spreadsheet",
      lastReadAt: "2026-04-03T12:12:00.000Z",
      detailLines: ["Mileage log mixes business, commuting, and personal travel."],
    }),
    createReading({
      documentId: "doc-home-office",
      kind: "pdf",
      lastReadAt: "2026-04-03T12:13:00.000Z",
      detailLines: ["Home office square footage and utility allocation support are partial."],
    })
  );
  draft.sourceFacts.push({
    id: "fact-mixed-use-vehicle",
    sourceDocumentId: "doc-mileage-log",
    label: "Mixed personal/business clue",
    value: "Vehicle, travel, and home office amounts appear partially personal and partially business.",
    confidence: "high",
    capturedAt: "2026-04-03T12:14:00.000Z",
  });
  draft.reviewerFinal.lines.push(
    {
      id: "rf-travel-mixed",
      kind: "expense",
      layer: "reviewer_final",
      label: "Travel expense candidate",
      amount: 3200,
      status: "needs_attention",
      summary: "Travel still needs mixed-use separation.",
      sourceDocumentIds: ["doc-mileage-log"],
      sourceFactIds: ["fact-mixed-use-vehicle"],
      issueIds: [],
      derivedFromLineIds: [],
      cleanupSuggestionIds: [],
      taxAdjustmentIds: [],
    },
    {
      id: "rf-other-mixed",
      kind: "expense",
      layer: "reviewer_final",
      label: "Other expenses candidate",
      amount: 2100,
      status: "needs_attention",
      summary: "Home office and vehicle support remain mixed-use sensitive.",
      sourceDocumentIds: ["doc-mileage-log", "doc-home-office"],
      sourceFactIds: ["fact-mixed-use-vehicle"],
      issueIds: [],
      derivedFromLineIds: [],
      cleanupSuggestionIds: [],
      taxAdjustmentIds: [],
    }
  );
  draft.scheduleCDraft.fields.push(
    {
      id: "line-24a-travel",
      lineNumber: "Line 24a",
      label: "Travel",
      amount: 3200,
      status: "needs_attention",
      summary: "Travel needs mixed-use separation.",
      reviewerFinalLineIds: ["rf-travel-mixed"],
      taxAdjustmentIds: [],
      sourceDocumentIds: ["doc-mileage-log"],
    },
    {
      id: "line-27a-other-expenses-mixed",
      lineNumber: "Line 27a",
      label: "Other expenses",
      amount: 2100,
      status: "needs_attention",
      summary: "Home office and vehicle support remain mixed-use sensitive.",
      reviewerFinalLineIds: ["rf-other-mixed"],
      taxAdjustmentIds: [],
      sourceDocumentIds: ["doc-mileage-log", "doc-home-office"],
    }
  );
  return draft;
}

function buildRelatedPartyPaymentsDraft(): TinaWorkspaceDraft {
  const draft = buildDirtyBooksDraft();
  draft.profile.businessName = "Atlas Family Property Services LLC";
  draft.profile.principalBusinessActivity = "Property management and family-owned project coordination";
  draft.profile.naicsCode = "531311";
  draft.profile.notes =
    "Related-party management fees, family warehouse rent, and intercompany transfers are mixed into ordinary books.";
  draft.documents.push(
    createDocument({
      id: "doc-related-ledger",
      name: "related-party-ledger.csv",
      category: "supporting_document",
      uploadedAt: "2026-04-03T12:20:00.000Z",
      mimeType: "text/csv",
    }),
    createDocument({
      id: "doc-management-agreement",
      name: "family-management-agreement.pdf",
      category: "supporting_document",
      uploadedAt: "2026-04-03T12:21:00.000Z",
    })
  );
  draft.documentReadings.push(
    createReading({
      documentId: "doc-related-ledger",
      kind: "spreadsheet",
      lastReadAt: "2026-04-03T12:22:00.000Z",
      detailLines: ["Ledger shows due-to owner, related-party rent, and intercompany recharge activity."],
    }),
    createReading({
      documentId: "doc-management-agreement",
      kind: "pdf",
      lastReadAt: "2026-04-03T12:23:00.000Z",
      detailLines: ["Management agreement references family-owned related-party service charges."],
    })
  );
  draft.sourceFacts.push(
    {
      id: "fact-related-party",
      sourceDocumentId: "doc-management-agreement",
      label: "Related-party clue",
      value: "Family-owned management company and related-party rent are charged through the books.",
      confidence: "high",
      capturedAt: "2026-04-03T12:24:00.000Z",
    },
    {
      id: "fact-intercompany",
      sourceDocumentId: "doc-related-ledger",
      label: "Intercompany transfer clue",
      value: "Intercompany and due-to owner transfers are mixed into ordinary expense and balance flows.",
      confidence: "high",
      capturedAt: "2026-04-03T12:25:00.000Z",
    }
  );
  return draft;
}

function buildPriorReturnDriftDraft(): TinaWorkspaceDraft {
  const draft = requireDraft("sole-prop-supported-core");
  draft.profile.businessName = "Signal Ridge Works LLC";
  draft.profile.taxElection = "s_corp";
  draft.profile.notes =
    "Prior return shows Schedule C, but current Form 2553 and current-year election paperwork indicate an S corporation path.";
  draft.documents.push(
    createDocument({
      id: "doc-current-2553",
      name: "current-form-2553.pdf",
      category: "supporting_document",
      uploadedAt: "2026-04-03T12:30:00.000Z",
      requestId: "entity-election",
      requestLabel: "Entity election proof",
    }),
    createDocument({
      id: "doc-formation-minutes",
      name: "corporate-election-minutes.pdf",
      category: "supporting_document",
      uploadedAt: "2026-04-03T12:31:00.000Z",
      requestId: "formation-papers",
      requestLabel: "Formation or election papers",
    })
  );
  draft.documentReadings.push(
    createReading({
      documentId: "doc-current-2553",
      kind: "pdf",
      lastReadAt: "2026-04-03T12:32:00.000Z",
      detailLines: ["Form 2553 and S corporation election language appear in the current-year packet."],
    }),
    createReading({
      documentId: "doc-formation-minutes",
      kind: "pdf",
      lastReadAt: "2026-04-03T12:33:00.000Z",
      detailLines: ["Board minutes reference a current-year S corporation election and corporate tax treatment."],
    })
  );
  draft.sourceFacts.push({
    id: "fact-current-election",
    sourceDocumentId: "doc-current-2553",
    label: "Entity election clue",
    value: "Current-year Form 2553 and S corporation election paperwork conflict with the older Schedule C prior return.",
    confidence: "high",
    capturedAt: "2026-04-03T12:34:00.000Z",
  });
  return draft;
}

function buildDriftedPackageDraft(): TinaWorkspaceDraft {
  const draft = requireDraft("sole-prop-supported-core");
  draft.packageReadiness = {
    ...draft.packageReadiness,
    status: "complete",
    level: "ready_for_cpa",
    summary: "Package was ready for CPA review.",
    nextStep: "Capture immutable snapshot.",
    items: [],
    lastRunAt: "2026-04-03T12:00:00.000Z",
  };
  const snapshot = createTinaPackageSnapshotRecord(draft, "2026-04-03T12:01:00.000Z");
  const decision = recordTinaReviewerDecision({
    snapshotId: snapshot.id,
    reviewerName: "Senior Reviewer",
    decision: "approved",
    decidedAt: "2026-04-03T12:02:00.000Z",
  });
  draft.packageSnapshots = [snapshot];
  draft.reviewerDecisions = [decision];

  draft.reviewerFinal.lines = draft.reviewerFinal.lines.map((line) =>
    line.id === "rf-advertising"
      ? {
          ...line,
          amount: 8500,
          summary: "Advertising amount changed after signoff.",
        }
      : line
  );
  draft.scheduleCDraft.fields = draft.scheduleCDraft.fields.map((field) =>
    field.id === "line-8-advertising"
      ? {
          ...field,
          amount: 8500,
          summary: "Advertising changed after signoff.",
        }
      : field
  );

  return draft;
}

export const TINA_SKILL_REVIEW_FIXTURE_METADATA: TinaSkillReviewFixture[] = [
  {
    id: "supported-core",
    title: "Supported sole-prop core",
    summary: "Clean supported Schedule C lane with coherent books and reviewer-grade structure.",
  },
  {
    id: "spouse-community-property",
    title: "Spouse community-property edge case",
    summary: "Two-owner spouse file that should stay under reviewer control until proof is complete.",
  },
  {
    id: "uneven-multi-owner",
    title: "Uneven multi-owner LLC",
    summary: "70/30 ownership split that should route to partnership handling instead of Schedule C.",
  },
  {
    id: "s-corp-election",
    title: "S-corp election conflict",
    summary: "Entity-election clues that should route away from Schedule C immediately.",
  },
  {
    id: "buyout-year",
    title: "Buyout-year LLC",
    summary: "Three-owner transition year with former-owner payments and partnership-grade complexity.",
  },
  {
    id: "thin-proof",
    title: "Thin-proof Schedule C",
    summary: "One-bank-statement file that looks deceptively simple but should not earn reviewer-grade confidence.",
  },
  {
    id: "dirty-books",
    title: "Dirty-books Schedule C",
    summary: "Contaminated books with owner flows, mixed use, worker overlap, related parties, and multiple EINs.",
  },
  {
    id: "sales-tax-authority",
    title: "Sales-tax authority file",
    summary: "Retail file with stronger authority posture around sales-tax exclusion treatment.",
  },
  {
    id: "creator-media",
    title: "Creator/media file",
    summary: "Industry-specific payout, sponsorship, and mixed-use creator business.",
  },
  {
    id: "drifted-package",
    title: "Signed-off then drifted package",
    summary: "Package snapshot was approved, then the live draft changed underneath it.",
  },
  {
    id: "payroll-contractor-overlap",
    title: "Payroll plus contractors overlap",
    summary: "Crew labor is split across payroll and 1099 flows, forcing worker-classification and books separation review.",
  },
  {
    id: "heavy-depreciation-year",
    title: "Heavy depreciation year",
    summary: "Asset-heavy year with a large depreciation number and Form 4562 pressure.",
  },
  {
    id: "inventory-heavy-retailer",
    title: "Inventory-heavy retailer",
    summary: "Retail file with year-end counts, COGS rollforward pressure, and inventory-specific attachment needs.",
  },
  {
    id: "mixed-use-home-office-vehicle",
    title: "Home office plus vehicle mixed-use file",
    summary: "Schedule C file with home office, mileage, travel, and mixed-use separation pressure.",
  },
  {
    id: "related-party-payments",
    title: "Related-party payments file",
    summary: "Books contain related-party management fees and intercompany transfers that should stay under review.",
  },
  {
    id: "prior-return-drift",
    title: "Prior-return drift against current facts",
    summary: "Older Schedule C history conflicts with current-year entity-election evidence.",
  },
];

export const TINA_SKILL_REVIEW_DRAFTS: Record<string, TinaWorkspaceDraft> = {
  "supported-core": requireDraft("sole-prop-supported-core"),
  "spouse-community-property": requireDraft("spouse-community-property-llc"),
  "uneven-multi-owner": requireDraft("uneven-multi-owner-llc"),
  "s-corp-election": requireDraft("s-corp-elected-llc"),
  "buyout-year": requireDraft("buyout-year-llc"),
  "thin-proof": buildThinProofDraft(),
  "dirty-books": buildDirtyBooksDraft(),
  "sales-tax-authority": buildSalesTaxAuthorityDraft(),
  "creator-media": buildCreatorMediaDraft(),
  "drifted-package": buildDriftedPackageDraft(),
  "payroll-contractor-overlap": buildPayrollContractorOverlapDraft(),
  "heavy-depreciation-year": buildHeavyDepreciationDraft(),
  "inventory-heavy-retailer": buildInventoryHeavyRetailDraft(),
  "mixed-use-home-office-vehicle": buildMixedUseHomeOfficeVehicleDraft(),
  "related-party-payments": buildRelatedPartyPaymentsDraft(),
  "prior-return-drift": buildPriorReturnDriftDraft(),
};
