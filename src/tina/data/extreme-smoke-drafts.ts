import { buildTinaProfileFingerprint } from "@/tina/lib/profile-fingerprint";
import { createDefaultTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import type {
  TinaDocumentReading,
  TinaFilingLaneId,
  TinaFormReadinessLevel,
  TinaPackageReadinessLevel,
  TinaStoredDocument,
  TinaStoredDocumentCategory,
  TinaWorkspaceDraft,
} from "@/tina/types";

export interface TinaExtremeSmokeDraftCase {
  id: string;
  title: string;
  summary: string;
  expected: {
    route: "supported" | "review_only" | "blocked";
    laneId: TinaFilingLaneId;
    formReadiness: TinaFormReadinessLevel;
    packageReadiness: TinaPackageReadinessLevel;
  };
  draft: TinaWorkspaceDraft;
}

function createDocument(args: {
  id: string;
  name: string;
  category: TinaStoredDocumentCategory;
  requestId: string | null;
  requestLabel: string | null;
  uploadedAt: string;
  mimeType?: string;
}): TinaStoredDocument {
  return {
    id: args.id,
    name: args.name,
    size: 100,
    mimeType: args.mimeType ?? "application/pdf",
    storagePath: `tina/smoke/${args.name}`,
    category: args.category,
    requestId: args.requestId,
    requestLabel: args.requestLabel,
    uploadedAt: args.uploadedAt,
  };
}

function createReading(args: {
  documentId: string;
  kind: TinaDocumentReading["kind"];
  lastReadAt: string;
}): TinaDocumentReading {
  return {
    documentId: args.documentId,
    status: "complete",
    kind: args.kind,
    summary: "Read",
    nextStep: "Keep going",
    facts: [],
    detailLines: [],
    rowCount: args.kind === "spreadsheet" ? 12 : null,
    headers: args.kind === "spreadsheet" ? ["Date", "Amount", "Memo"] : [],
    sheetNames: args.kind === "spreadsheet" ? ["Sheet1"] : [],
    lastReadAt: args.lastReadAt,
  };
}

function buildCleanSupportedScheduleCDraft(): TinaWorkspaceDraft {
  const draft = createDefaultTinaWorkspaceDraft();
  const profile = {
    ...draft.profile,
    businessName: "North Pine Studio LLC",
    taxYear: "2025",
    principalBusinessActivity: "Brand design consulting",
    naicsCode: "541430",
    entityType: "single_member_llc" as const,
  };
  const profileFingerprint = buildTinaProfileFingerprint(profile);

  return {
    ...draft,
    profile,
    priorReturn: {
      fileName: "2024-return.pdf",
      fileSize: 1200,
      fileType: "application/pdf",
      lastModified: 1,
      capturedAt: "2026-03-27T04:00:00.000Z",
    },
    priorReturnDocumentId: "doc-prior-return",
    documents: [
      createDocument({
        id: "doc-prior-return",
        name: "2024-return.pdf",
        category: "prior_return",
        requestId: "prior-return",
        requestLabel: "Last year's return",
        uploadedAt: "2026-03-27T04:00:00.000Z",
      }),
      createDocument({
        id: "doc-qb",
        name: "quickbooks.csv",
        category: "supporting_document",
        requestId: "quickbooks",
        requestLabel: "QuickBooks or your profit-and-loss report",
        uploadedAt: "2026-03-27T04:01:00.000Z",
        mimeType: "text/csv",
      }),
      createDocument({
        id: "doc-bank",
        name: "bank.pdf",
        category: "supporting_document",
        requestId: "bank-support",
        requestLabel: "Business bank and card statements",
        uploadedAt: "2026-03-27T04:02:00.000Z",
      }),
    ],
    documentReadings: [
      createReading({
        documentId: "doc-prior-return",
        kind: "pdf",
        lastReadAt: "2026-03-27T04:10:00.000Z",
      }),
      createReading({
        documentId: "doc-qb",
        kind: "spreadsheet",
        lastReadAt: "2026-03-27T04:11:00.000Z",
      }),
      createReading({
        documentId: "doc-bank",
        kind: "pdf",
        lastReadAt: "2026-03-27T04:12:00.000Z",
      }),
    ],
    sourceFacts: [
      {
        id: "fact-income",
        sourceDocumentId: "doc-qb",
        label: "Gross receipts support",
        value: "QuickBooks income summary shows gross receipts for the year.",
        confidence: "high",
        capturedAt: "2026-03-27T04:13:00.000Z",
      },
      {
        id: "fact-advertising",
        sourceDocumentId: "doc-qb",
        label: "Advertising support",
        value: "Advertising expense ledger matches the saved books export.",
        confidence: "high",
        capturedAt: "2026-03-27T04:14:00.000Z",
      },
    ],
    bootstrapReview: {
      ...draft.bootstrapReview,
      status: "complete",
      lastRunAt: "2026-03-27T05:00:00.000Z",
      profileFingerprint,
      summary: "Current",
      nextStep: "Keep going",
      facts: [],
      items: [],
    },
    issueQueue: {
      ...draft.issueQueue,
      status: "complete",
      lastRunAt: "2026-03-27T05:01:00.000Z",
      profileFingerprint,
      summary: "Current",
      nextStep: "Keep going",
      items: [],
      records: [],
    },
    reviewerFinal: {
      ...draft.reviewerFinal,
      status: "complete",
      lastRunAt: "2026-03-27T05:02:00.000Z",
      summary: "Ready",
      nextStep: "Keep going",
      lines: [
        {
          id: "rf-income",
          kind: "income",
          layer: "reviewer_final",
          label: "Gross receipts candidate",
          amount: 120000,
          status: "ready",
          summary: "Ready",
          sourceDocumentIds: ["doc-qb", "doc-bank"],
          sourceFactIds: ["fact-income"],
          issueIds: [],
          derivedFromLineIds: [],
          cleanupSuggestionIds: [],
          taxAdjustmentIds: [],
        },
        {
          id: "rf-advertising",
          kind: "expense",
          layer: "reviewer_final",
          label: "Advertising expense candidate",
          amount: 5000,
          status: "ready",
          summary: "Ready",
          sourceDocumentIds: ["doc-qb", "doc-bank"],
          sourceFactIds: ["fact-advertising"],
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
      lastRunAt: "2026-03-27T05:03:00.000Z",
      summary: "Ready",
      nextStep: "Review it",
      fields: [
        {
          id: "line-1-gross-receipts",
          lineNumber: "Line 1",
          label: "Gross receipts or sales",
          amount: 120000,
          status: "ready",
          summary: "Ready",
          reviewerFinalLineIds: ["rf-income"],
          taxAdjustmentIds: [],
          sourceDocumentIds: ["doc-qb"],
        },
        {
          id: "line-8-advertising",
          lineNumber: "Line 8",
          label: "Advertising",
          amount: 5000,
          status: "ready",
          summary: "Ready",
          reviewerFinalLineIds: ["rf-advertising"],
          taxAdjustmentIds: [],
          sourceDocumentIds: ["doc-qb"],
        },
      ],
      notes: [],
    },
  };
}

function buildSpouseCommunityPropertyDraft(): TinaWorkspaceDraft {
  const draft = createDefaultTinaWorkspaceDraft();
  return {
    ...draft,
    profile: {
      ...draft.profile,
      businessName: "Hearth & Harbor Design LLC",
      taxYear: "2025",
      principalBusinessActivity: "Interior design consulting",
      naicsCode: "541410",
      entityType: "single_member_llc",
      ownerCount: 2,
      spouseCommunityPropertyTreatment: "confirmed",
      notes: "Spouses say they file as community property.",
    },
    documents: [
      createDocument({
        id: "doc-owners",
        name: "owner-notes.pdf",
        category: "supporting_document",
        requestId: null,
        requestLabel: null,
        uploadedAt: "2026-03-27T04:00:00.000Z",
      }),
    ],
    sourceFacts: [
      {
        id: "fact-multi-owner",
        sourceDocumentId: "doc-owners",
        label: "Multi-owner clue",
        value: "This paper may show more than one owner, partner, member, K-1, or ownership split.",
        confidence: "high",
        capturedAt: "2026-03-27T04:01:00.000Z",
      },
      {
        id: "fact-community-property",
        sourceDocumentId: "doc-owners",
        label: "Community property clue",
        value: "This paper may show spouse community-property treatment or a husband-and-wife ownership setup.",
        confidence: "high",
        capturedAt: "2026-03-27T04:02:00.000Z",
      },
    ],
  };
}

function buildUnevenMultiOwnerDraft(): TinaWorkspaceDraft {
  const draft = createDefaultTinaWorkspaceDraft();
  return {
    ...draft,
    profile: {
      ...draft.profile,
      businessName: "Split Signal Ventures LLC",
      taxYear: "2025",
      principalBusinessActivity: "Consulting",
      naicsCode: "541611",
      entityType: "multi_member_llc",
      ownerCount: 2,
      notes: "Ownership split is 70/30.",
    },
    documents: [
      createDocument({
        id: "doc-1065",
        name: "partnership-return-draft.pdf",
        category: "supporting_document",
        requestId: null,
        requestLabel: null,
        uploadedAt: "2026-03-27T04:00:00.000Z",
      }),
    ],
    sourceFacts: [
      {
        id: "fact-multi-owner",
        sourceDocumentId: "doc-1065",
        label: "Multi-owner clue",
        value: "This paper may show more than one owner, partner, member, K-1, or ownership split.",
        confidence: "high",
        capturedAt: "2026-03-27T04:01:00.000Z",
      },
      {
        id: "fact-return-hint-1065",
        sourceDocumentId: "doc-1065",
        label: "Return hint",
        value: "Form 1065 partnership return draft",
        confidence: "high",
        capturedAt: "2026-03-27T04:02:00.000Z",
      },
    ],
  };
}

function buildSCorpElectionDraft(): TinaWorkspaceDraft {
  const draft = createDefaultTinaWorkspaceDraft();
  return {
    ...draft,
    profile: {
      ...draft.profile,
      businessName: "Cascade Creative LLC",
      taxYear: "2025",
      principalBusinessActivity: "Marketing consulting",
      naicsCode: "541613",
      entityType: "single_member_llc",
      taxElection: "s_corp",
      notes: "Client says an S-corp election was made.",
    },
    documents: [
      createDocument({
        id: "doc-2553",
        name: "s-election.pdf",
        category: "supporting_document",
        requestId: "entity-election",
        requestLabel: "Entity election proof",
        uploadedAt: "2026-03-27T04:00:00.000Z",
      }),
    ],
    sourceFacts: [
      {
        id: "fact-return-hint-1120s",
        sourceDocumentId: "doc-2553",
        label: "Return hint",
        value: "1120-S / S corp election correspondence",
        confidence: "high",
        capturedAt: "2026-03-27T04:01:00.000Z",
      },
    ],
  };
}

function buildBuyoutYearDraft(): TinaWorkspaceDraft {
  const draft = createDefaultTinaWorkspaceDraft();
  return {
    ...draft,
    profile: {
      ...draft.profile,
      businessName: "Hydra Exit Partners LLC",
      taxYear: "2025",
      principalBusinessActivity: "Liquidation consulting",
      naicsCode: "541611",
      entityType: "multi_member_llc",
      ownerCount: 3,
      ownershipChangedDuringYear: true,
      hasOwnerBuyoutOrRedemption: true,
      hasFormerOwnerPayments: true,
      notes: "One owner is being bought out and company funds are paying the former owner.",
    },
    documents: [
      createDocument({
        id: "doc-buyout",
        name: "buyout-agreement.pdf",
        category: "supporting_document",
        requestId: null,
        requestLabel: null,
        uploadedAt: "2026-03-27T04:00:00.000Z",
      }),
    ],
    sourceFacts: [
      {
        id: "fact-multi-owner",
        sourceDocumentId: "doc-buyout",
        label: "Multi-owner clue",
        value: "This paper may show more than one owner, partner, member, K-1, or ownership split.",
        confidence: "high",
        capturedAt: "2026-03-27T04:01:00.000Z",
      },
      {
        id: "fact-ownership-change",
        sourceDocumentId: "doc-buyout",
        label: "Ownership change clue",
        value: "This paper may show an ownership change.",
        confidence: "high",
        capturedAt: "2026-03-27T04:02:00.000Z",
      },
      {
        id: "fact-former-owner-payment",
        sourceDocumentId: "doc-buyout",
        label: "Former owner payment clue",
        value: "This paper may show payments to a retired owner, former member, or buyout target.",
        confidence: "high",
        capturedAt: "2026-03-27T04:03:00.000Z",
      },
      {
        id: "fact-return-hint-1065",
        sourceDocumentId: "doc-buyout",
        label: "Return hint",
        value: "Form 1065 partnership return draft",
        confidence: "high",
        capturedAt: "2026-03-27T04:04:00.000Z",
      },
    ],
  };
}

export const TINA_EXTREME_SMOKE_DRAFTS: TinaExtremeSmokeDraftCase[] = [
  {
    id: "sole-prop-supported-core",
    title: "Supported sole prop core",
    summary: "Clean supported Schedule C lane with reviewer-grade evidence support.",
    expected: {
      route: "supported",
      laneId: "schedule_c_single_member_llc",
      formReadiness: "reviewer_ready",
      packageReadiness: "ready_for_cpa",
    },
    draft: buildCleanSupportedScheduleCDraft(),
  },
  {
    id: "spouse-community-property-llc",
    title: "Spouse community-property LLC",
    summary: "Two-owner spouse file that may stay near Schedule C but must remain under reviewer control until proof is uploaded.",
    expected: {
      route: "review_only",
      laneId: "schedule_c_single_member_llc",
      formReadiness: "not_ready",
      packageReadiness: "blocked",
    },
    draft: buildSpouseCommunityPropertyDraft(),
  },
  {
    id: "uneven-multi-owner-llc",
    title: "Uneven multi-owner LLC",
    summary: "Two-owner 70/30 file that should route away from Schedule C toward partnership handling.",
    expected: {
      route: "review_only",
      laneId: "1065",
      formReadiness: "not_ready",
      packageReadiness: "blocked",
    },
    draft: buildUnevenMultiOwnerDraft(),
  },
  {
    id: "s-corp-elected-llc",
    title: "S-corp elected LLC",
    summary: "LLC file with S-election clues that Tina should route away from Schedule C immediately.",
    expected: {
      route: "review_only",
      laneId: "1120_s",
      formReadiness: "not_ready",
      packageReadiness: "blocked",
    },
    draft: buildSCorpElectionDraft(),
  },
  {
    id: "buyout-year-llc",
    title: "Buyout-year multi-owner LLC",
    summary: "Three-owner buyout year with former-owner payments that must stay blocked and routed to partnership-grade review.",
    expected: {
      route: "blocked",
      laneId: "1065",
      formReadiness: "not_ready",
      packageReadiness: "blocked",
    },
    draft: buildBuyoutYearDraft(),
  },
];
