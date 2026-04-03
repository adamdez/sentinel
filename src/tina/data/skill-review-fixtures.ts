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
};
