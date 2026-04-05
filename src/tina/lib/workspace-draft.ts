import type {
  TinaAppendixItem,
  TinaAppendixSnapshot,
  TinaAiCleanupSnapshot,
  TinaAuthorityCitation,
  TinaCpaHandoffArtifact,
  TinaCpaHandoffSnapshot,
  TinaCleanupPlan,
  TinaCleanupSuggestion,
  TinaOperationalStatusSnapshot,
  TinaPackageReadinessItem,
  TinaPackageReadinessSnapshot,
  TinaPackageSnapshotRecord,
  TinaAuthorityDisclosureDecision,
  TinaAuthorityReviewerDecision,
  TinaAuthorityWorkItem,
  TinaAuthorityWorkStatus,
  TinaBootstrapFact,
  TinaBootstrapReview,
  TinaDocumentFactConfidence,
  TinaDocumentReading,
  TinaDocumentReadingFact,
  TinaIssueQueue,
  TinaSourceFact,
  TinaReviewItem,
  TinaScheduleCDraftField,
  TinaScheduleCDraftNote,
  TinaScheduleCDraftSnapshot,
  TinaBusinessTaxProfile,
  TinaPriorReturnSnapshot,
  TinaStoredDocument,
  TinaStoredDocumentCategory,
  TinaTaxAdjustment,
  TinaTaxAdjustmentSnapshot,
  TinaReviewerDecisionRecord,
  TinaReviewerSignoffSnapshot,
  TinaQuickBooksConnectionSnapshot,
  TinaReviewerObservedDeltaRecord,
  TinaSpouseCommunityPropertyTreatment,
  TinaTaxElection,
  TinaWorkpaperLine,
  TinaWorkpaperSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";
import { createDefaultTinaAiCleanupSnapshot } from "@/tina/lib/ai-cleanup";
import { createDefaultTinaAppendix } from "@/tina/lib/appendix";
import { createDefaultTinaAuthorityWorkItem } from "@/tina/lib/authority-work";
import { createDefaultTinaBootstrapReview } from "@/tina/lib/bootstrap-review";
import { createDefaultTinaCpaHandoff } from "@/tina/lib/cpa-handoff";
import { createDefaultTinaCleanupPlan } from "@/tina/lib/cleanup-plan";
import { createDefaultTinaIssueQueue } from "@/tina/lib/issue-queue";
import { createDefaultTinaOperationalStatus } from "@/tina/lib/operational-status";
import { createDefaultTinaPackageReadiness } from "@/tina/lib/package-readiness";
import { createDefaultTinaReviewerSignoffSnapshot } from "@/tina/lib/package-state";
import { createDefaultTinaReviewerFinalSnapshot } from "@/tina/lib/reviewer-final";
import { createDefaultTinaScheduleCDraft } from "@/tina/lib/schedule-c-draft";
import { createDefaultTinaTaxAdjustmentSnapshot } from "@/tina/lib/tax-adjustments";
import { createDefaultTinaWorkpaperSnapshot } from "@/tina/lib/workpapers";

export const TINA_WORKSPACE_STORAGE_KEY = "tina.workspace.v1";

export function createDefaultTinaProfile(): TinaBusinessTaxProfile {
  return {
    businessName: "",
    taxYear: String(new Date().getFullYear() - 1),
    principalBusinessActivity: "",
    entityType: "unsure",
    ownerCount: null,
    ownershipChangedDuringYear: false,
    taxElection: "unsure",
    spouseCommunityPropertyTreatment: "unknown",
    hasOwnerBuyoutOrRedemption: false,
    hasFormerOwnerPayments: false,
    formationState: "WA",
    formationDate: "",
    accountingMethod: "cash",
    naicsCode: "",
    hasPayroll: false,
    paysContractors: false,
    hasInventory: false,
    hasFixedAssets: false,
    collectsSalesTax: false,
    hasIdahoActivity: false,
    notes: "",
  };
}

export function createDefaultTinaQuickBooksConnection(): TinaQuickBooksConnectionSnapshot {
  return {
    status: "not_connected",
    connectedAt: null,
    lastSyncAt: null,
    companyName: "",
    realmId: "",
    summary: "QuickBooks is not connected yet.",
    nextStep: "Upload a QuickBooks export or connect QuickBooks when that live sync path is ready.",
    lastError: "",
    importedDocumentIds: [],
  };
}

function normalizeTaxElection(value: unknown): TinaTaxElection {
  return value === "default" || value === "s_corp" || value === "c_corp" ? value : "unsure";
}

function normalizeSpouseCommunityPropertyTreatment(
  value: unknown
): TinaSpouseCommunityPropertyTreatment {
  return value === "no" || value === "possible" || value === "confirmed" ? value : "unknown";
}

function normalizeProfile(value: unknown): TinaBusinessTaxProfile {
  const fallback = createDefaultTinaProfile();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaBusinessTaxProfile>;
  const ownerCount =
    typeof raw.ownerCount === "number" &&
    Number.isInteger(raw.ownerCount) &&
    raw.ownerCount > 0
      ? raw.ownerCount
      : null;

  return {
    businessName: typeof raw.businessName === "string" ? raw.businessName : fallback.businessName,
    taxYear: typeof raw.taxYear === "string" ? raw.taxYear : fallback.taxYear,
    principalBusinessActivity:
      typeof raw.principalBusinessActivity === "string"
        ? raw.principalBusinessActivity
        : fallback.principalBusinessActivity,
    entityType:
      raw.entityType === "sole_prop" ||
      raw.entityType === "single_member_llc" ||
      raw.entityType === "s_corp" ||
      raw.entityType === "c_corp" ||
      raw.entityType === "partnership" ||
      raw.entityType === "multi_member_llc"
        ? raw.entityType
        : fallback.entityType,
    ownerCount,
    ownershipChangedDuringYear: Boolean(raw.ownershipChangedDuringYear),
    taxElection: normalizeTaxElection(raw.taxElection),
    spouseCommunityPropertyTreatment: normalizeSpouseCommunityPropertyTreatment(
      raw.spouseCommunityPropertyTreatment
    ),
    hasOwnerBuyoutOrRedemption: Boolean(raw.hasOwnerBuyoutOrRedemption),
    hasFormerOwnerPayments: Boolean(raw.hasFormerOwnerPayments),
    formationState:
      typeof raw.formationState === "string" ? raw.formationState : fallback.formationState,
    formationDate:
      typeof raw.formationDate === "string" ? raw.formationDate : fallback.formationDate,
    accountingMethod:
      raw.accountingMethod === "cash" || raw.accountingMethod === "accrual"
        ? raw.accountingMethod
        : fallback.accountingMethod,
    naicsCode: typeof raw.naicsCode === "string" ? raw.naicsCode : fallback.naicsCode,
    hasPayroll: Boolean(raw.hasPayroll),
    paysContractors: Boolean(raw.paysContractors),
    hasInventory: Boolean(raw.hasInventory),
    hasFixedAssets: Boolean(raw.hasFixedAssets),
    collectsSalesTax: Boolean(raw.collectsSalesTax),
    hasIdahoActivity: Boolean(raw.hasIdahoActivity),
    notes: typeof raw.notes === "string" ? raw.notes : fallback.notes,
  };
}

export function createDefaultTinaWorkspaceDraft(): TinaWorkspaceDraft {
  return {
    version: 1,
    savedAt: null,
    priorReturn: null,
    priorReturnDocumentId: null,
    documents: [],
    documentReadings: [],
    sourceFacts: [],
    bootstrapReview: createDefaultTinaBootstrapReview(),
    issueQueue: createDefaultTinaIssueQueue(),
    workpapers: createDefaultTinaWorkpaperSnapshot(),
    cleanupPlan: createDefaultTinaCleanupPlan(),
    aiCleanup: createDefaultTinaAiCleanupSnapshot(),
    taxAdjustments: createDefaultTinaTaxAdjustmentSnapshot(),
    reviewerFinal: createDefaultTinaReviewerFinalSnapshot(),
    scheduleCDraft: createDefaultTinaScheduleCDraft(),
    packageReadiness: createDefaultTinaPackageReadiness(),
    cpaHandoff: createDefaultTinaCpaHandoff(),
    reviewerSignoff: createDefaultTinaReviewerSignoffSnapshot(),
    reviewerDecisions: [],
    reviewerObservedDeltas: [],
    packageSnapshots: [],
    appendix: createDefaultTinaAppendix(),
    operationalStatus: createDefaultTinaOperationalStatus(),
    quickBooksConnection: createDefaultTinaQuickBooksConnection(),
    authorityWork: [],
    profile: createDefaultTinaProfile(),
  };
}

function normalizeDocumentCategory(value: unknown): TinaStoredDocumentCategory {
  return value === "prior_return" ? "prior_return" : "supporting_document";
}

function normalizeStoredDocument(value: unknown): TinaStoredDocument | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaStoredDocument>;

  if (
    typeof raw.id !== "string" ||
    typeof raw.name !== "string" ||
    typeof raw.size !== "number" ||
    typeof raw.mimeType !== "string" ||
    typeof raw.storagePath !== "string" ||
    typeof raw.uploadedAt !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    name: raw.name,
    size: raw.size,
    mimeType: raw.mimeType,
    storagePath: raw.storagePath,
    category: normalizeDocumentCategory(raw.category),
    requestId: typeof raw.requestId === "string" ? raw.requestId : null,
    requestLabel: typeof raw.requestLabel === "string" ? raw.requestLabel : null,
    uploadedAt: raw.uploadedAt,
  };
}

function normalizeDocumentReading(value: unknown): TinaDocumentReading | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaDocumentReading>;

  if (
    typeof raw.documentId !== "string" ||
    typeof raw.summary !== "string" ||
    typeof raw.nextStep !== "string"
  ) {
    return null;
  }

  return {
    documentId: raw.documentId,
    status:
      raw.status === "complete" || raw.status === "waiting_for_ai" || raw.status === "error"
        ? raw.status
        : "not_started",
    kind:
      raw.kind === "spreadsheet" ||
      raw.kind === "pdf" ||
      raw.kind === "word" ||
      raw.kind === "image"
        ? raw.kind
        : "unknown",
    summary: raw.summary,
    nextStep: raw.nextStep,
    facts: Array.isArray(raw.facts)
      ? raw.facts
          .map((fact) => normalizeDocumentReadingFact(fact))
          .filter((fact): fact is TinaDocumentReadingFact => fact !== null)
      : [],
    detailLines: Array.isArray(raw.detailLines)
      ? raw.detailLines.filter((line): line is string => typeof line === "string")
      : [],
    rowCount: typeof raw.rowCount === "number" ? raw.rowCount : null,
    headers: Array.isArray(raw.headers)
      ? raw.headers.filter((header): header is string => typeof header === "string")
      : [],
    sheetNames: Array.isArray(raw.sheetNames)
      ? raw.sheetNames.filter((sheet): sheet is string => typeof sheet === "string")
      : [],
    lastReadAt: typeof raw.lastReadAt === "string" ? raw.lastReadAt : null,
  };
}

function normalizeDocumentFactConfidence(value: unknown): TinaDocumentFactConfidence {
  return value === "high" || value === "low" ? value : "medium";
}

function normalizeAuthorityWorkStatus(value: unknown): TinaAuthorityWorkStatus {
  return value === "researching" ||
    value === "ready_for_reviewer" ||
    value === "reviewed" ||
    value === "rejected"
    ? value
    : "not_started";
}

function normalizeAuthorityReviewerDecision(value: unknown): TinaAuthorityReviewerDecision {
  return value === "use_it" || value === "need_more_support" || value === "do_not_use"
    ? value
    : "pending";
}

function normalizeAuthorityDisclosureDecision(value: unknown): TinaAuthorityDisclosureDecision {
  return value === "not_needed" || value === "needs_review" || value === "required"
    ? value
    : "unknown";
}

function normalizeAuthorityCitation(value: unknown): TinaAuthorityCitation | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaAuthorityCitation>;
  if (typeof raw.id !== "string") return null;

  return {
    id: raw.id,
    title: typeof raw.title === "string" ? raw.title : "",
    url: typeof raw.url === "string" ? raw.url : "",
    sourceClass:
      raw.sourceClass === "primary_authority" ||
      raw.sourceClass === "secondary_analysis" ||
      raw.sourceClass === "internal_signal" ||
      raw.sourceClass === "community_lead" ||
      raw.sourceClass === "low_trust_lead"
        ? raw.sourceClass
        : "unknown",
    effect: raw.effect === "warns" || raw.effect === "background" ? raw.effect : "supports",
    note: typeof raw.note === "string" ? raw.note : "",
  };
}

function normalizeAuthorityWorkItem(value: unknown): TinaAuthorityWorkItem | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaAuthorityWorkItem>;
  if (typeof raw.ideaId !== "string") return null;

  const fallback = createDefaultTinaAuthorityWorkItem(raw.ideaId);
  return {
    ...fallback,
    status: normalizeAuthorityWorkStatus(raw.status),
    reviewerDecision: normalizeAuthorityReviewerDecision(raw.reviewerDecision),
    disclosureDecision: normalizeAuthorityDisclosureDecision(raw.disclosureDecision),
    memo: typeof raw.memo === "string" ? raw.memo : "",
    reviewerNotes: typeof raw.reviewerNotes === "string" ? raw.reviewerNotes : "",
    missingAuthority: Array.isArray(raw.missingAuthority)
      ? raw.missingAuthority.filter((item): item is string => typeof item === "string")
      : [],
    citations: Array.isArray(raw.citations)
      ? raw.citations
          .map((citation) => normalizeAuthorityCitation(citation))
          .filter((citation): citation is TinaAuthorityCitation => citation !== null)
      : [],
    lastAiRunAt: typeof raw.lastAiRunAt === "string" ? raw.lastAiRunAt : null,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

function normalizeSourceFact(value: unknown): TinaSourceFact | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaSourceFact>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.sourceDocumentId !== "string" ||
    typeof raw.label !== "string" ||
    typeof raw.value !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    sourceDocumentId: raw.sourceDocumentId,
    label: raw.label,
    value: raw.value,
    confidence: normalizeDocumentFactConfidence(raw.confidence),
    capturedAt: typeof raw.capturedAt === "string" ? raw.capturedAt : null,
  };
}

function normalizeDocumentReadingFact(value: unknown): TinaDocumentReadingFact | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaDocumentReadingFact>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.label !== "string" ||
    typeof raw.value !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    label: raw.label,
    value: raw.value,
    confidence: normalizeDocumentFactConfidence(raw.confidence),
  };
}

function normalizeBootstrapFact(value: unknown): TinaBootstrapFact | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<TinaBootstrapFact>;

  if (
    typeof raw.id !== "string" ||
    typeof raw.label !== "string" ||
    typeof raw.value !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    label: raw.label,
    value: raw.value,
    source:
      raw.source === "prior_return" || raw.source === "document_vault"
        ? raw.source
        : "organizer",
    status: raw.status === "review" ? "review" : "ready",
  };
}

function normalizeReviewItem(value: unknown): TinaReviewItem | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<TinaReviewItem>;

  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.summary !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    title: raw.title,
    summary: raw.summary,
    severity:
      raw.severity === "blocking" || raw.severity === "watch"
        ? raw.severity
        : "needs_attention",
    status: raw.status === "resolved" ? "resolved" : "open",
    category:
      raw.category === "document_followup" ||
      raw.category === "fact_mismatch" ||
      raw.category === "continuity" ||
      raw.category === "state_scope" ||
      raw.category === "books"
        ? raw.category
        : "setup",
    requestId: typeof raw.requestId === "string" ? raw.requestId : null,
    documentId: typeof raw.documentId === "string" ? raw.documentId : null,
    factId: typeof raw.factId === "string" ? raw.factId : null,
  };
}

function normalizeBootstrapReview(value: unknown): TinaBootstrapReview {
  const fallback = createDefaultTinaBootstrapReview();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaBootstrapReview>;
  const facts = Array.isArray(raw.facts)
    ? raw.facts
        .map((fact) => normalizeBootstrapFact(fact))
        .filter((fact): fact is TinaBootstrapFact => fact !== null)
    : [];
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((item) => normalizeReviewItem(item))
        .filter((item): item is TinaReviewItem => item !== null)
    : [];

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    profileFingerprint: typeof raw.profileFingerprint === "string" ? raw.profileFingerprint : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    facts,
    items,
  };
}

function normalizeIssueQueue(value: unknown): TinaIssueQueue {
  const fallback = createDefaultTinaIssueQueue();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaIssueQueue>;
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((item) => normalizeReviewItem(item))
        .filter((item): item is TinaReviewItem => item !== null)
    : [];
  const records = Array.isArray(raw.records)
    ? raw.records
        .map((record) => normalizePrepRecord(record))
        .filter((record): record is TinaIssueQueue["records"][number] => record !== null)
    : [];

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    profileFingerprint: typeof raw.profileFingerprint === "string" ? raw.profileFingerprint : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    items,
    records,
  };
}

function normalizeWorkpaperLine(value: unknown): TinaWorkpaperLine | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaWorkpaperLine>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.label !== "string" ||
    typeof raw.summary !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    kind:
      raw.kind === "income" ||
      raw.kind === "expense" ||
      raw.kind === "net" ||
      raw.kind === "coverage"
        ? raw.kind
        : "signal",
    layer:
      raw.layer === "ai_cleanup" ||
      raw.layer === "tax_adjustment" ||
      raw.layer === "reviewer_final"
        ? raw.layer
        : "book_original",
    label: raw.label,
    amount: typeof raw.amount === "number" ? raw.amount : null,
    status: raw.status === "needs_attention" || raw.status === "waiting" ? raw.status : "ready",
    summary: raw.summary,
    sourceDocumentIds: Array.isArray(raw.sourceDocumentIds)
      ? raw.sourceDocumentIds.filter((id): id is string => typeof id === "string")
      : [],
    sourceFactIds: Array.isArray(raw.sourceFactIds)
      ? raw.sourceFactIds.filter((id): id is string => typeof id === "string")
      : [],
    issueIds: Array.isArray(raw.issueIds)
      ? raw.issueIds.filter((id): id is string => typeof id === "string")
      : [],
    derivedFromLineIds: Array.isArray(raw.derivedFromLineIds)
      ? raw.derivedFromLineIds.filter((id): id is string => typeof id === "string")
      : [],
    cleanupSuggestionIds: Array.isArray(raw.cleanupSuggestionIds)
      ? raw.cleanupSuggestionIds.filter((id): id is string => typeof id === "string")
      : [],
    taxAdjustmentIds: Array.isArray(raw.taxAdjustmentIds)
      ? raw.taxAdjustmentIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function normalizeWorkpapers(value: unknown): TinaWorkpaperSnapshot {
  const fallback = createDefaultTinaWorkpaperSnapshot();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaWorkpaperSnapshot>;
  const lines = Array.isArray(raw.lines)
    ? raw.lines
        .map((line) => normalizeWorkpaperLine(line))
        .filter((line): line is TinaWorkpaperLine => line !== null)
    : [];

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    lines,
  };
}

function normalizeAiCleanup(value: unknown): TinaAiCleanupSnapshot {
  const fallback = createDefaultTinaAiCleanupSnapshot();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaAiCleanupSnapshot>;
  const lines = Array.isArray(raw.lines)
    ? raw.lines
        .map((line) => normalizeWorkpaperLine(line))
        .filter((line): line is TinaWorkpaperLine => line !== null)
    : [];

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    lines,
  };
}

function normalizeReviewerFinal(value: unknown): TinaWorkpaperSnapshot {
  const fallback = createDefaultTinaReviewerFinalSnapshot();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaWorkpaperSnapshot>;
  const lines = Array.isArray(raw.lines)
    ? raw.lines
        .map((line) => normalizeWorkpaperLine(line))
        .filter((line): line is TinaWorkpaperLine => line !== null)
    : [];

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    lines,
  };
}

function normalizeTaxAdjustment(value: unknown): TinaTaxAdjustment | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaTaxAdjustment>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.summary !== "string" ||
    typeof raw.suggestedTreatment !== "string" ||
    typeof raw.whyItMatters !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    kind:
      raw.kind === "timing_review" ||
      raw.kind === "sales_tax_exclusion" ||
      raw.kind === "payroll_classification" ||
      raw.kind === "contractor_classification" ||
      raw.kind === "inventory_treatment" ||
      raw.kind === "multistate_scope"
        ? raw.kind
        : "carryforward_line",
    status:
      raw.status === "ready_for_review" ||
      raw.status === "approved" ||
      raw.status === "rejected"
        ? raw.status
        : "needs_authority",
    risk: raw.risk === "low" || raw.risk === "high" ? raw.risk : "medium",
    requiresAuthority: Boolean(raw.requiresAuthority),
    title: raw.title,
    summary: raw.summary,
    suggestedTreatment: raw.suggestedTreatment,
    whyItMatters: raw.whyItMatters,
    amount: typeof raw.amount === "number" ? raw.amount : null,
    authorityWorkIdeaIds: Array.isArray(raw.authorityWorkIdeaIds)
      ? raw.authorityWorkIdeaIds.filter((id): id is string => typeof id === "string")
      : [],
    aiCleanupLineIds: Array.isArray(raw.aiCleanupLineIds)
      ? raw.aiCleanupLineIds.filter((id): id is string => typeof id === "string")
      : [],
    sourceDocumentIds: Array.isArray(raw.sourceDocumentIds)
      ? raw.sourceDocumentIds.filter((id): id is string => typeof id === "string")
      : [],
    sourceFactIds: Array.isArray(raw.sourceFactIds)
      ? raw.sourceFactIds.filter((id): id is string => typeof id === "string")
      : [],
    reviewerNotes: typeof raw.reviewerNotes === "string" ? raw.reviewerNotes : "",
  };
}

function normalizeTaxAdjustments(value: unknown): TinaTaxAdjustmentSnapshot {
  const fallback = createDefaultTinaTaxAdjustmentSnapshot();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaTaxAdjustmentSnapshot>;
  const adjustments = Array.isArray(raw.adjustments)
    ? raw.adjustments
        .map((adjustment) => normalizeTaxAdjustment(adjustment))
        .filter((adjustment): adjustment is TinaTaxAdjustment => adjustment !== null)
    : [];

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    adjustments,
  };
}

function normalizeScheduleCDraftField(value: unknown): TinaScheduleCDraftField | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaScheduleCDraftField>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.lineNumber !== "string" ||
    typeof raw.label !== "string" ||
    typeof raw.summary !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    lineNumber: raw.lineNumber,
    label: raw.label,
    amount: typeof raw.amount === "number" ? raw.amount : null,
    status: raw.status === "needs_attention" || raw.status === "waiting" ? raw.status : "ready",
    summary: raw.summary,
    reviewerFinalLineIds: Array.isArray(raw.reviewerFinalLineIds)
      ? raw.reviewerFinalLineIds.filter((id): id is string => typeof id === "string")
      : [],
    taxAdjustmentIds: Array.isArray(raw.taxAdjustmentIds)
      ? raw.taxAdjustmentIds.filter((id): id is string => typeof id === "string")
      : [],
    sourceDocumentIds: Array.isArray(raw.sourceDocumentIds)
      ? raw.sourceDocumentIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function normalizeScheduleCDraftNote(value: unknown): TinaScheduleCDraftNote | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaScheduleCDraftNote>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.summary !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    title: raw.title,
    summary: raw.summary,
    severity: raw.severity === "watch" ? "watch" : "needs_attention",
    reviewerFinalLineIds: Array.isArray(raw.reviewerFinalLineIds)
      ? raw.reviewerFinalLineIds.filter((id): id is string => typeof id === "string")
      : [],
    taxAdjustmentIds: Array.isArray(raw.taxAdjustmentIds)
      ? raw.taxAdjustmentIds.filter((id): id is string => typeof id === "string")
      : [],
    sourceDocumentIds: Array.isArray(raw.sourceDocumentIds)
      ? raw.sourceDocumentIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function normalizeScheduleCDraft(value: unknown): TinaScheduleCDraftSnapshot {
  const fallback = createDefaultTinaScheduleCDraft();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaScheduleCDraftSnapshot>;
  const fields = Array.isArray(raw.fields)
    ? raw.fields
        .map((field) => normalizeScheduleCDraftField(field))
        .filter((field): field is TinaScheduleCDraftField => field !== null)
    : [];
  const notes = Array.isArray(raw.notes)
    ? raw.notes
        .map((note) => normalizeScheduleCDraftNote(note))
        .filter((note): note is TinaScheduleCDraftNote => note !== null)
    : [];

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    fields,
    notes,
  };
}

function normalizePackageReadinessItem(value: unknown): TinaPackageReadinessItem | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaPackageReadinessItem>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.summary !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    title: raw.title,
    summary: raw.summary,
    severity: raw.severity === "needs_attention" ? "needs_attention" : "blocking",
    relatedFieldIds: Array.isArray(raw.relatedFieldIds)
      ? raw.relatedFieldIds.filter((id): id is string => typeof id === "string")
      : [],
    relatedNoteIds: Array.isArray(raw.relatedNoteIds)
      ? raw.relatedNoteIds.filter((id): id is string => typeof id === "string")
      : [],
    relatedReviewItemIds: Array.isArray(raw.relatedReviewItemIds)
      ? raw.relatedReviewItemIds.filter((id): id is string => typeof id === "string")
      : [],
    sourceDocumentIds: Array.isArray(raw.sourceDocumentIds)
      ? raw.sourceDocumentIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function normalizePackageReadiness(value: unknown): TinaPackageReadinessSnapshot {
  const fallback = createDefaultTinaPackageReadiness();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaPackageReadinessSnapshot>;
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((item) => normalizePackageReadinessItem(item))
        .filter((item): item is TinaPackageReadinessItem => item !== null)
    : [];

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    level:
      raw.level === "needs_review" || raw.level === "ready_for_cpa"
        ? raw.level
        : "blocked",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    items,
  };
}

function normalizeCpaHandoffArtifact(value: unknown): TinaCpaHandoffArtifact | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaCpaHandoffArtifact>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.summary !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    title: raw.title,
    status: raw.status === "waiting" || raw.status === "blocked" ? raw.status : "ready",
    summary: raw.summary,
    includes: Array.isArray(raw.includes)
      ? raw.includes.filter((item): item is string => typeof item === "string")
      : [],
    relatedFieldIds: Array.isArray(raw.relatedFieldIds)
      ? raw.relatedFieldIds.filter((id): id is string => typeof id === "string")
      : [],
    relatedNoteIds: Array.isArray(raw.relatedNoteIds)
      ? raw.relatedNoteIds.filter((id): id is string => typeof id === "string")
      : [],
    relatedReadinessItemIds: Array.isArray(raw.relatedReadinessItemIds)
      ? raw.relatedReadinessItemIds.filter((id): id is string => typeof id === "string")
      : [],
    sourceDocumentIds: Array.isArray(raw.sourceDocumentIds)
      ? raw.sourceDocumentIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function normalizeCpaHandoff(value: unknown): TinaCpaHandoffSnapshot {
  const fallback = createDefaultTinaCpaHandoff();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaCpaHandoffSnapshot>;
  const artifacts = Array.isArray(raw.artifacts)
    ? raw.artifacts
        .map((artifact) => normalizeCpaHandoffArtifact(artifact))
        .filter((artifact): artifact is TinaCpaHandoffArtifact => artifact !== null)
    : [];

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    artifacts,
  };
}

function normalizeReviewerDecisionRecord(value: unknown): TinaReviewerDecisionRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<TinaReviewerDecisionRecord>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.snapshotId !== "string" ||
    typeof raw.reviewerName !== "string" ||
    typeof raw.decidedAt !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    snapshotId: raw.snapshotId,
    decision:
      raw.decision === "approved" || raw.decision === "changes_requested" || raw.decision === "revoked"
        ? raw.decision
        : "changes_requested",
    reviewerName: raw.reviewerName,
    notes: typeof raw.notes === "string" ? raw.notes : "",
    decidedAt: raw.decidedAt,
  };
}

function normalizeReviewerObservedDeltaRecord(value: unknown): TinaReviewerObservedDeltaRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<TinaReviewerObservedDeltaRecord>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.occurredAt !== "string" ||
    typeof raw.summary !== "string" ||
    typeof raw.trustEffect !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    title: raw.title,
    domain:
      raw.domain === "entity_route" ||
      raw.domain === "evidence_books" ||
      raw.domain === "treatment_authority" ||
      raw.domain === "form_execution" ||
      raw.domain === "workflow_governance" ||
      raw.domain === "planning"
        ? raw.domain
        : "general",
    kind:
      raw.kind === "accepted_first_pass" ||
      raw.kind === "accepted_after_adjustment" ||
      raw.kind === "change_requested" ||
      raw.kind === "rejected" ||
      raw.kind === "stale_after_acceptance"
        ? raw.kind
        : "change_requested",
    severity:
      raw.severity === "info" || raw.severity === "blocking"
        ? raw.severity
        : "needs_attention",
    occurredAt: raw.occurredAt,
    reviewerName: typeof raw.reviewerName === "string" ? raw.reviewerName : null,
    summary: raw.summary,
    trustEffect: raw.trustEffect,
    ownerEngines: Array.isArray(raw.ownerEngines)
      ? raw.ownerEngines.filter((item): item is string => typeof item === "string")
      : [],
    benchmarkScenarioIds: Array.isArray(raw.benchmarkScenarioIds)
      ? raw.benchmarkScenarioIds.filter((item): item is string => typeof item === "string")
      : [],
    relatedDecisionId: typeof raw.relatedDecisionId === "string" ? raw.relatedDecisionId : null,
    relatedSnapshotId: typeof raw.relatedSnapshotId === "string" ? raw.relatedSnapshotId : null,
    relatedAuthorityWorkIdeaId:
      typeof raw.relatedAuthorityWorkIdeaId === "string" ? raw.relatedAuthorityWorkIdeaId : null,
  };
}

function normalizePackageSnapshotRecord(value: unknown): TinaPackageSnapshotRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<TinaPackageSnapshotRecord>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.createdAt !== "string" ||
    typeof raw.packageFingerprint !== "string" ||
    typeof raw.summary !== "string" ||
    typeof raw.exportFileName !== "string" ||
    typeof raw.exportContents !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    createdAt: raw.createdAt,
    packageFingerprint: raw.packageFingerprint,
    packageState:
      raw.packageState === "ready_for_cpa_review" ||
      raw.packageState === "blocked" ||
      raw.packageState === "signed_off" ||
      raw.packageState === "signed_off_stale"
        ? raw.packageState
        : "provisional",
    readinessLevel:
      raw.readinessLevel === "needs_review" || raw.readinessLevel === "ready_for_cpa"
        ? raw.readinessLevel
        : "blocked",
    blockerCount: typeof raw.blockerCount === "number" ? raw.blockerCount : 0,
    attentionCount: typeof raw.attentionCount === "number" ? raw.attentionCount : 0,
    summary: raw.summary,
    exportFileName: raw.exportFileName,
    exportContents: raw.exportContents,
  };
}

function normalizeReviewerSignoffSnapshot(value: unknown): TinaReviewerSignoffSnapshot {
  const fallback = createDefaultTinaReviewerSignoffSnapshot();
  if (typeof value !== "object" || value === null) return fallback;
  const raw = value as Partial<TinaReviewerSignoffSnapshot>;

  return {
    lastEvaluatedAt: typeof raw.lastEvaluatedAt === "string" ? raw.lastEvaluatedAt : null,
    packageState:
      raw.packageState === "ready_for_cpa_review" ||
      raw.packageState === "blocked" ||
      raw.packageState === "signed_off" ||
      raw.packageState === "signed_off_stale"
        ? raw.packageState
        : "provisional",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    activeSnapshotId: typeof raw.activeSnapshotId === "string" ? raw.activeSnapshotId : null,
    activeDecisionId: typeof raw.activeDecisionId === "string" ? raw.activeDecisionId : null,
    currentPackageFingerprint:
      typeof raw.currentPackageFingerprint === "string" ? raw.currentPackageFingerprint : null,
    signedOffPackageFingerprint:
      typeof raw.signedOffPackageFingerprint === "string"
        ? raw.signedOffPackageFingerprint
        : null,
    hasDriftSinceSignoff: Boolean(raw.hasDriftSinceSignoff),
  };
}

function normalizeAppendixItem(value: unknown): TinaAppendixItem | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<TinaAppendixItem>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.summary !== "string" ||
    typeof raw.whyItMatters !== "string" ||
    typeof raw.category !== "string" ||
    typeof raw.nextStep !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    title: raw.title,
    summary: raw.summary,
    whyItMatters: raw.whyItMatters,
    taxPositionBucket:
      raw.taxPositionBucket === "use" ||
      raw.taxPositionBucket === "review" ||
      raw.taxPositionBucket === "reject"
        ? raw.taxPositionBucket
        : "appendix",
    category: raw.category,
    nextStep: raw.nextStep,
    authoritySummary: typeof raw.authoritySummary === "string" ? raw.authoritySummary : "",
    reviewerQuestion: typeof raw.reviewerQuestion === "string" ? raw.reviewerQuestion : "",
    disclosureFlag: typeof raw.disclosureFlag === "string" ? raw.disclosureFlag : "unknown",
    authorityTargets: Array.isArray(raw.authorityTargets)
      ? raw.authorityTargets.filter((item): item is string => typeof item === "string")
      : [],
    sourceLabels: Array.isArray(raw.sourceLabels)
      ? raw.sourceLabels.filter((item): item is string => typeof item === "string")
      : [],
    factIds: Array.isArray(raw.factIds)
      ? raw.factIds.filter((item): item is string => typeof item === "string")
      : [],
    documentIds: Array.isArray(raw.documentIds)
      ? raw.documentIds.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function normalizeAppendix(value: unknown): TinaAppendixSnapshot {
  const fallback = createDefaultTinaAppendix();
  if (typeof value !== "object" || value === null) return fallback;
  const raw = value as Partial<TinaAppendixSnapshot>;
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((item) => normalizeAppendixItem(item))
        .filter((item): item is TinaAppendixItem => item !== null)
    : [];

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    items,
  };
}

function normalizeOperationalStatus(value: unknown): TinaOperationalStatusSnapshot {
  const fallback = createDefaultTinaOperationalStatus();
  if (typeof value !== "object" || value === null) return fallback;
  const raw = value as Partial<TinaOperationalStatusSnapshot>;

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    maturity:
      raw.maturity === "schedule_c_core" || raw.maturity === "reviewer_grade_core"
        ? raw.maturity
        : "foundation",
    packageState:
      raw.packageState === "ready_for_cpa_review" ||
      raw.packageState === "blocked" ||
      raw.packageState === "signed_off" ||
      raw.packageState === "signed_off_stale"
        ? raw.packageState
        : "provisional",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    truths: Array.isArray(raw.truths)
      ? raw.truths.filter((item): item is string => typeof item === "string")
      : fallback.truths,
    blockers: Array.isArray(raw.blockers)
      ? raw.blockers.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function normalizeQuickBooksConnection(value: unknown): TinaQuickBooksConnectionSnapshot {
  const fallback = createDefaultTinaQuickBooksConnection();
  if (typeof value !== "object" || value === null) return fallback;
  const raw = value as Partial<TinaQuickBooksConnectionSnapshot>;

  return {
    status:
      raw.status === "connecting" ||
      raw.status === "connected" ||
      raw.status === "syncing" ||
      raw.status === "error"
        ? raw.status
        : "not_connected",
    connectedAt: typeof raw.connectedAt === "string" ? raw.connectedAt : null,
    lastSyncAt: typeof raw.lastSyncAt === "string" ? raw.lastSyncAt : null,
    companyName: typeof raw.companyName === "string" ? raw.companyName : "",
    realmId: typeof raw.realmId === "string" ? raw.realmId : "",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    lastError: typeof raw.lastError === "string" ? raw.lastError : "",
    importedDocumentIds: Array.isArray(raw.importedDocumentIds)
      ? raw.importedDocumentIds.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function normalizeCleanupSuggestion(value: unknown): TinaCleanupSuggestion | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaCleanupSuggestion>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.summary !== "string" ||
    typeof raw.suggestedAction !== "string" ||
    typeof raw.whyItMatters !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    type:
      raw.type === "confirm_scope" || raw.type === "request_document"
        ? raw.type
        : "reconcile_line",
    priority:
      raw.priority === "important" || raw.priority === "watch" ? raw.priority : "helpful",
    status:
      raw.status === "reviewing" || raw.status === "approved" || raw.status === "rejected"
        ? raw.status
        : "suggested",
    title: raw.title,
    summary: raw.summary,
    suggestedAction: raw.suggestedAction,
    whyItMatters: raw.whyItMatters,
    workpaperLineIds: Array.isArray(raw.workpaperLineIds)
      ? raw.workpaperLineIds.filter((id): id is string => typeof id === "string")
      : [],
    issueIds: Array.isArray(raw.issueIds)
      ? raw.issueIds.filter((id): id is string => typeof id === "string")
      : [],
    sourceDocumentIds: Array.isArray(raw.sourceDocumentIds)
      ? raw.sourceDocumentIds.filter((id): id is string => typeof id === "string")
      : [],
    sourceFactIds: Array.isArray(raw.sourceFactIds)
      ? raw.sourceFactIds.filter((id): id is string => typeof id === "string")
      : [],
    reviewerNotes: typeof raw.reviewerNotes === "string" ? raw.reviewerNotes : "",
  };
}

function normalizeCleanupPlan(value: unknown): TinaCleanupPlan {
  const fallback = createDefaultTinaCleanupPlan();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaCleanupPlan>;
  const suggestions = Array.isArray(raw.suggestions)
    ? raw.suggestions
        .map((suggestion) => normalizeCleanupSuggestion(suggestion))
        .filter((suggestion): suggestion is TinaCleanupSuggestion => suggestion !== null)
    : [];

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    suggestions,
  };
}

function normalizePrepRecord(value: unknown): TinaIssueQueue["records"][number] | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaIssueQueue["records"][number]>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.label !== "string" ||
    typeof raw.summary !== "string" ||
    !Array.isArray(raw.issueIds)
  ) {
    return null;
  }

  return {
    id: raw.id,
    label: raw.label,
    status:
      raw.status === "ready" || raw.status === "needs_attention" ? raw.status : "waiting",
    summary: raw.summary,
    issueIds: raw.issueIds.filter((id): id is string => typeof id === "string"),
  };
}

export function parseTinaWorkspaceDraft(raw: string | null): TinaWorkspaceDraft {
  if (!raw) return createDefaultTinaWorkspaceDraft();

  try {
    const parsed = JSON.parse(raw) as Partial<TinaWorkspaceDraft>;
    const normalizedDocuments = Array.isArray(parsed.documents)
      ? parsed.documents
          .map((document) => normalizeStoredDocument(document))
          .filter((document): document is TinaStoredDocument => document !== null)
      : [];
    const normalizedReadings = Array.isArray(parsed.documentReadings)
      ? parsed.documentReadings
          .map((reading) => normalizeDocumentReading(reading))
          .filter((reading): reading is TinaDocumentReading => reading !== null)
      : [];
    const normalizedSourceFacts = Array.isArray(parsed.sourceFacts)
      ? parsed.sourceFacts
          .map((fact) => normalizeSourceFact(fact))
          .filter((fact): fact is TinaSourceFact => fact !== null)
      : [];
    const normalizedAuthorityWork = Array.isArray(parsed.authorityWork)
      ? parsed.authorityWork
          .map((item) => normalizeAuthorityWorkItem(item))
          .filter((item): item is TinaAuthorityWorkItem => item !== null)
      : [];
    const reviewerDecisionsRaw = (parsed as Record<string, unknown>).reviewerDecisions;
    const normalizedReviewerDecisions = Array.isArray(reviewerDecisionsRaw)
      ? reviewerDecisionsRaw
          .map((item) => normalizeReviewerDecisionRecord(item))
          .filter((item): item is TinaReviewerDecisionRecord => item !== null)
      : [];
    const reviewerObservedDeltasRaw = (parsed as Record<string, unknown>).reviewerObservedDeltas;
    const normalizedReviewerObservedDeltas = Array.isArray(reviewerObservedDeltasRaw)
      ? reviewerObservedDeltasRaw
          .map((item) => normalizeReviewerObservedDeltaRecord(item))
          .filter((item): item is TinaReviewerObservedDeltaRecord => item !== null)
      : [];
    const packageSnapshotsRaw = (parsed as Record<string, unknown>).packageSnapshots;
    const normalizedPackageSnapshots = Array.isArray(packageSnapshotsRaw)
      ? packageSnapshotsRaw
          .map((item) => normalizePackageSnapshotRecord(item))
          .filter((item): item is TinaPackageSnapshotRecord => item !== null)
      : [];

    return {
      ...createDefaultTinaWorkspaceDraft(),
      ...parsed,
      priorReturnDocumentId:
        typeof parsed.priorReturnDocumentId === "string" ? parsed.priorReturnDocumentId : null,
      documents: normalizedDocuments,
      documentReadings: normalizedReadings,
      sourceFacts: normalizedSourceFacts,
      bootstrapReview: normalizeBootstrapReview(parsed.bootstrapReview),
      issueQueue: normalizeIssueQueue(parsed.issueQueue),
      workpapers: normalizeWorkpapers(parsed.workpapers),
      cleanupPlan: normalizeCleanupPlan(parsed.cleanupPlan),
      aiCleanup: normalizeAiCleanup(parsed.aiCleanup),
      taxAdjustments: normalizeTaxAdjustments(parsed.taxAdjustments),
      reviewerFinal: normalizeReviewerFinal(parsed.reviewerFinal),
      scheduleCDraft: normalizeScheduleCDraft(parsed.scheduleCDraft),
      packageReadiness: normalizePackageReadiness(parsed.packageReadiness),
      cpaHandoff: normalizeCpaHandoff(parsed.cpaHandoff),
      reviewerSignoff: normalizeReviewerSignoffSnapshot(
        (parsed as Record<string, unknown>).reviewerSignoff
      ),
      reviewerDecisions: normalizedReviewerDecisions,
      reviewerObservedDeltas: normalizedReviewerObservedDeltas,
      packageSnapshots: normalizedPackageSnapshots,
      appendix: normalizeAppendix((parsed as Record<string, unknown>).appendix),
      operationalStatus: normalizeOperationalStatus(
        (parsed as Record<string, unknown>).operationalStatus
      ),
      quickBooksConnection: normalizeQuickBooksConnection(
        (parsed as Record<string, unknown>).quickBooksConnection
      ),
      authorityWork: normalizedAuthorityWork,
      profile: normalizeProfile(parsed.profile),
    };
  } catch {
    return createDefaultTinaWorkspaceDraft();
  }
}

export function toPriorReturnSnapshot(file: File): TinaPriorReturnSnapshot {
  return {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || "application/octet-stream",
    lastModified: file.lastModified,
    capturedAt: new Date().toISOString(),
  };
}

export function resolveTinaPriorReturnDocument(
  draft: TinaWorkspaceDraft
): TinaStoredDocument | null {
  if (!draft.priorReturnDocumentId) return null;
  return draft.documents.find((document) => document.id === draft.priorReturnDocumentId) ?? null;
}

function toTimestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function pickLatestTinaWorkspaceDraft(
  localDraft: TinaWorkspaceDraft,
  remoteDraft: TinaWorkspaceDraft | null
): TinaWorkspaceDraft {
  if (!remoteDraft) return localDraft;
  return toTimestamp(remoteDraft.savedAt) > toTimestamp(localDraft.savedAt)
    ? remoteDraft
    : localDraft;
}
