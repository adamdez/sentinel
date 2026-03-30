import type {
  TinaAiCleanupSnapshot,
  TinaAuthorityBackgroundRun,
  TinaAuthorityBackgroundRunStatus,
  TinaAuthorityCitation,
  TinaAuthorityChallengeVerdict,
  TinaCpaHandoffArtifact,
  TinaCpaHandoffSnapshot,
  TinaBooksConnectionSnapshot,
  TinaBooksImportDocument,
  TinaBooksImportSnapshot,
  TinaCleanupPlan,
  TinaCleanupSuggestion,
  TinaPackageReadinessItem,
  TinaPackageReadinessSnapshot,
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
  TinaFinalSignoffCheck,
  TinaFinalSignoffSnapshot,
  TinaOfficialFormDraft,
  TinaOfficialFormLine,
  TinaOfficialFormPacketSnapshot,
  TinaOfficialFormSupportRow,
  TinaOfficialFormSupportSchedule,
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
  TinaWorkpaperLine,
  TinaWorkpaperSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";
import { createDefaultTinaAiCleanupSnapshot } from "@/tina/lib/ai-cleanup";
import { createDefaultTinaAuthorityWorkItem } from "@/tina/lib/authority-work";
import { createDefaultTinaBooksConnection } from "@/tina/lib/books-connection";
import { createDefaultTinaBooksImport } from "@/tina/lib/books-import";
import { createDefaultTinaBootstrapReview } from "@/tina/lib/bootstrap-review";
import { createDefaultTinaCpaHandoff } from "@/tina/lib/cpa-handoff";
import { createDefaultTinaCleanupPlan } from "@/tina/lib/cleanup-plan";
import { createDefaultTinaFinalSignoff } from "@/tina/lib/final-signoff";
import { createDefaultTinaIssueQueue } from "@/tina/lib/issue-queue";
import { createDefaultTinaOfficialFormPacket } from "@/tina/lib/official-form-packet";
import { createDefaultTinaPackageReadiness } from "@/tina/lib/package-readiness";
import { createDefaultTinaReviewerFinalSnapshot } from "@/tina/lib/reviewer-final";
import { createDefaultTinaScheduleCDraft } from "@/tina/lib/schedule-c-draft";
import { createDefaultTinaTaxAdjustmentSnapshot } from "@/tina/lib/tax-adjustments";
import { createDefaultTinaWorkpaperSnapshot } from "@/tina/lib/workpapers";
import { sanitizeTinaAiText, sanitizeTinaAiTextList } from "@/tina/lib/ai-text-normalization";

export const TINA_WORKSPACE_STORAGE_KEY = "tina.workspace.v1";

export function createDefaultTinaProfile(): TinaBusinessTaxProfile {
  return {
    businessName: "",
    taxYear: String(new Date().getFullYear() - 1),
    entityType: "unsure",
    llcFederalTaxTreatment: "default",
    llcCommunityPropertyStatus: "not_applicable",
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

export function createDefaultTinaWorkspaceDraft(): TinaWorkspaceDraft {
  return {
    version: 1,
    savedAt: null,
    priorReturn: null,
    priorReturnDocumentId: null,
    documents: [],
    documentReadings: [],
    booksConnection: createDefaultTinaBooksConnection(),
    booksImport: createDefaultTinaBooksImport(),
    sourceFacts: [],
    bootstrapReview: createDefaultTinaBootstrapReview(),
    issueQueue: createDefaultTinaIssueQueue(),
    workpapers: createDefaultTinaWorkpaperSnapshot(),
    cleanupPlan: createDefaultTinaCleanupPlan(),
    aiCleanup: createDefaultTinaAiCleanupSnapshot(),
    taxAdjustments: createDefaultTinaTaxAdjustmentSnapshot(),
    reviewerFinal: createDefaultTinaReviewerFinalSnapshot(),
    scheduleCDraft: createDefaultTinaScheduleCDraft(),
    officialFormPacket: createDefaultTinaOfficialFormPacket(),
    packageReadiness: createDefaultTinaPackageReadiness(),
    cpaHandoff: createDefaultTinaCpaHandoff(),
    finalSignoff: createDefaultTinaFinalSignoff(),
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

function normalizeBooksConnection(value: unknown): TinaBooksConnectionSnapshot {
  const fallback = createDefaultTinaBooksConnection();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaBooksConnectionSnapshot>;
  return {
    provider: "quickbooks",
    status:
      raw.status === "upload_only" ||
      raw.status === "planning_live_sync" ||
      raw.status === "connected" ||
      raw.status === "needs_attention"
        ? raw.status
        : "not_connected",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    connectedAt: typeof raw.connectedAt === "string" ? raw.connectedAt : null,
    lastSyncAt: typeof raw.lastSyncAt === "string" ? raw.lastSyncAt : null,
    companyName: typeof raw.companyName === "string" ? raw.companyName : "",
    realmId: typeof raw.realmId === "string" ? raw.realmId : null,
  };
}

function normalizeBooksImportDocument(value: unknown): TinaBooksImportDocument | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaBooksImportDocument>;
  if (
    typeof raw.documentId !== "string" ||
    typeof raw.name !== "string" ||
    typeof raw.summary !== "string"
  ) {
    return null;
  }

  return {
    documentId: raw.documentId,
    name: raw.name,
    status:
      raw.status === "needs_attention" || raw.status === "waiting" ? raw.status : "ready",
    summary: raw.summary,
    rowCount: typeof raw.rowCount === "number" ? raw.rowCount : null,
    coverageStart: typeof raw.coverageStart === "string" ? raw.coverageStart : null,
    coverageEnd: typeof raw.coverageEnd === "string" ? raw.coverageEnd : null,
    moneyIn: typeof raw.moneyIn === "number" ? raw.moneyIn : null,
    moneyOut: typeof raw.moneyOut === "number" ? raw.moneyOut : null,
    clueLabels: Array.isArray(raw.clueLabels)
      ? raw.clueLabels.filter((label): label is string => typeof label === "string")
      : [],
    lastReadAt: typeof raw.lastReadAt === "string" ? raw.lastReadAt : null,
  };
}

function normalizeBooksImport(value: unknown): TinaBooksImportSnapshot {
  const fallback = createDefaultTinaBooksImport();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaBooksImportSnapshot>;
  const documents = Array.isArray(raw.documents)
    ? raw.documents
        .map((document) => normalizeBooksImportDocument(document))
        .filter((document): document is TinaBooksImportDocument => document !== null)
    : [];

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    documentCount: typeof raw.documentCount === "number" ? raw.documentCount : documents.length,
    coverageStart: typeof raw.coverageStart === "string" ? raw.coverageStart : null,
    coverageEnd: typeof raw.coverageEnd === "string" ? raw.coverageEnd : null,
    moneyInTotal: typeof raw.moneyInTotal === "number" ? raw.moneyInTotal : null,
    moneyOutTotal: typeof raw.moneyOutTotal === "number" ? raw.moneyOutTotal : null,
    clueLabels: Array.isArray(raw.clueLabels)
      ? raw.clueLabels.filter((label): label is string => typeof label === "string")
      : [],
    documents,
  };
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

function normalizeAuthorityChallengeVerdict(value: unknown): TinaAuthorityChallengeVerdict {
  return value === "did_not_finish" ||
    value === "survives" ||
    value === "needs_care" ||
    value === "likely_fails"
    ? value
    : "not_run";
}

function normalizeAuthorityBackgroundRunStatus(value: unknown): TinaAuthorityBackgroundRunStatus {
  return value === "queued" ||
    value === "running" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "rate_limited"
    ? value
    : "idle";
}

function normalizeAuthorityBackgroundRun(value: unknown): TinaAuthorityBackgroundRun {
  const fallback = createDefaultTinaAuthorityWorkItem("authority-run-fallback").researchRun;
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaAuthorityBackgroundRun>;

  return {
    status: normalizeAuthorityBackgroundRunStatus(raw.status),
    jobId: typeof raw.jobId === "string" ? raw.jobId : null,
    queuedAt: typeof raw.queuedAt === "string" ? raw.queuedAt : null,
    startedAt: typeof raw.startedAt === "string" ? raw.startedAt : null,
    finishedAt: typeof raw.finishedAt === "string" ? raw.finishedAt : null,
    retryAt: typeof raw.retryAt === "string" ? raw.retryAt : null,
    error: typeof raw.error === "string" ? sanitizeTinaAiText(raw.error) : null,
  };
}

function normalizeAuthorityCitation(value: unknown): TinaAuthorityCitation | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaAuthorityCitation>;
  if (typeof raw.id !== "string") return null;

  return {
    id: raw.id,
    title: typeof raw.title === "string" ? sanitizeTinaAiText(raw.title) : "",
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
    note: typeof raw.note === "string" ? sanitizeTinaAiText(raw.note) : "",
  };
}

function normalizeAuthorityWorkItem(value: unknown): TinaAuthorityWorkItem | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaAuthorityWorkItem>;
  if (typeof raw.ideaId !== "string") return null;

  const fallback = createDefaultTinaAuthorityWorkItem(raw.ideaId);
  const reviewerDecision = normalizeAuthorityReviewerDecision(raw.reviewerDecision);

  return {
    ...fallback,
    status:
      reviewerDecision === "do_not_use"
        ? "rejected"
        : normalizeAuthorityWorkStatus(raw.status),
    reviewerDecision,
    disclosureDecision: normalizeAuthorityDisclosureDecision(raw.disclosureDecision),
    challengeVerdict: normalizeAuthorityChallengeVerdict(raw.challengeVerdict),
    memo: typeof raw.memo === "string" ? sanitizeTinaAiText(raw.memo) : "",
    challengeMemo: typeof raw.challengeMemo === "string" ? sanitizeTinaAiText(raw.challengeMemo) : "",
    reviewerNotes: typeof raw.reviewerNotes === "string" ? sanitizeTinaAiText(raw.reviewerNotes) : "",
    missingAuthority: Array.isArray(raw.missingAuthority)
      ? sanitizeTinaAiTextList(
          raw.missingAuthority.filter((item): item is string => typeof item === "string")
        )
      : [],
    challengeWarnings: Array.isArray(raw.challengeWarnings)
      ? sanitizeTinaAiTextList(
          raw.challengeWarnings.filter((item): item is string => typeof item === "string")
        )
      : [],
    challengeQuestions: Array.isArray(raw.challengeQuestions)
      ? sanitizeTinaAiTextList(
          raw.challengeQuestions.filter((item): item is string => typeof item === "string")
        )
      : [],
    citations: Array.isArray(raw.citations)
      ? raw.citations
          .map((citation) => normalizeAuthorityCitation(citation))
          .filter((citation): citation is TinaAuthorityCitation => citation !== null)
      : [],
    researchRun: normalizeAuthorityBackgroundRun(raw.researchRun),
    challengeRun: normalizeAuthorityBackgroundRun(raw.challengeRun),
    lastAiRunAt: typeof raw.lastAiRunAt === "string" ? raw.lastAiRunAt : null,
    lastChallengeRunAt: typeof raw.lastChallengeRunAt === "string" ? raw.lastChallengeRunAt : null,
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

function normalizeOfficialFormLine(value: unknown): TinaOfficialFormLine | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaOfficialFormLine>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.lineNumber !== "string" ||
    typeof raw.label !== "string" ||
    typeof raw.value !== "string" ||
    typeof raw.summary !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    lineNumber: raw.lineNumber,
    label: raw.label,
    value: raw.value,
    state:
      raw.state === "filled" || raw.state === "review" || raw.state === "blank"
        ? raw.state
        : "blank",
    summary: raw.summary,
    scheduleCDraftFieldIds: Array.isArray(raw.scheduleCDraftFieldIds)
      ? raw.scheduleCDraftFieldIds.filter((id): id is string => typeof id === "string")
      : [],
    scheduleCDraftNoteIds: Array.isArray(raw.scheduleCDraftNoteIds)
      ? raw.scheduleCDraftNoteIds.filter((id): id is string => typeof id === "string")
      : [],
    sourceDocumentIds: Array.isArray(raw.sourceDocumentIds)
      ? raw.sourceDocumentIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function normalizeOfficialFormSupportRow(value: unknown): TinaOfficialFormSupportRow | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaOfficialFormSupportRow>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.label !== "string" ||
    typeof raw.summary !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    label: raw.label,
    amount: typeof raw.amount === "number" ? raw.amount : null,
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

function normalizeOfficialFormSupportSchedule(
  value: unknown
): TinaOfficialFormSupportSchedule | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaOfficialFormSupportSchedule>;
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
    rows: Array.isArray(raw.rows)
      ? raw.rows
          .map((row) => normalizeOfficialFormSupportRow(row))
          .filter((row): row is TinaOfficialFormSupportRow => row !== null)
      : [],
    sourceDocumentIds: Array.isArray(raw.sourceDocumentIds)
      ? raw.sourceDocumentIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function normalizeOfficialFormDraft(value: unknown): TinaOfficialFormDraft | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaOfficialFormDraft>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.formNumber !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.taxYear !== "string" ||
    typeof raw.revisionYear !== "string" ||
    typeof raw.summary !== "string" ||
    typeof raw.nextStep !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    formNumber: raw.formNumber,
    title: raw.title,
    taxYear: raw.taxYear,
    revisionYear: raw.revisionYear,
    status:
      raw.status === "ready" || raw.status === "needs_review" || raw.status === "blocked"
        ? raw.status
        : "blocked",
    summary: raw.summary,
    nextStep: raw.nextStep,
    lines: Array.isArray(raw.lines)
      ? raw.lines
          .map((line) => normalizeOfficialFormLine(line))
          .filter((line): line is TinaOfficialFormLine => line !== null)
      : [],
    supportSchedules: Array.isArray(raw.supportSchedules)
      ? raw.supportSchedules
          .map((schedule) => normalizeOfficialFormSupportSchedule(schedule))
          .filter((schedule): schedule is TinaOfficialFormSupportSchedule => schedule !== null)
      : [],
    relatedNoteIds: Array.isArray(raw.relatedNoteIds)
      ? raw.relatedNoteIds.filter((id): id is string => typeof id === "string")
      : [],
    sourceDocumentIds: Array.isArray(raw.sourceDocumentIds)
      ? raw.sourceDocumentIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function normalizeOfficialFormPacket(value: unknown): TinaOfficialFormPacketSnapshot {
  const fallback = createDefaultTinaOfficialFormPacket();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaOfficialFormPacketSnapshot>;
  const forms = Array.isArray(raw.forms)
    ? raw.forms
        .map((form) => normalizeOfficialFormDraft(form))
        .filter((form): form is TinaOfficialFormDraft => form !== null)
    : [];

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    forms,
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
    status:
      raw.status === "ready" || raw.status === "waiting" || raw.status === "blocked"
        ? raw.status
        : "blocked",
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

function normalizeFinalSignoffCheck(value: unknown): TinaFinalSignoffCheck | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaFinalSignoffCheck>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.label !== "string" ||
    typeof raw.helpText !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    label: raw.label,
    helpText: raw.helpText,
    checked: raw.checked === true,
  };
}

function normalizeFinalSignoff(value: unknown): TinaFinalSignoffSnapshot {
  const fallback = createDefaultTinaFinalSignoff();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaFinalSignoffSnapshot>;
  const checks = Array.isArray(raw.checks)
    ? raw.checks
        .map((check) => normalizeFinalSignoffCheck(check))
        .filter((check): check is TinaFinalSignoffCheck => check !== null)
    : fallback.checks;

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    level: raw.level === "waiting" || raw.level === "ready" ? raw.level : "blocked",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    checks,
    reviewerName: typeof raw.reviewerName === "string" ? raw.reviewerName : "",
    reviewerNote: typeof raw.reviewerNote === "string" ? raw.reviewerNote : "",
    reviewPacketId: typeof raw.reviewPacketId === "string" ? raw.reviewPacketId : null,
    reviewPacketVersion:
      typeof raw.reviewPacketVersion === "string" ? raw.reviewPacketVersion : null,
    reviewPacketFingerprint:
      typeof raw.reviewPacketFingerprint === "string" ? raw.reviewPacketFingerprint : null,
    confirmedAt: typeof raw.confirmedAt === "string" ? raw.confirmedAt : null,
    confirmedPacketId: typeof raw.confirmedPacketId === "string" ? raw.confirmedPacketId : null,
    confirmedPacketVersion:
      typeof raw.confirmedPacketVersion === "string" ? raw.confirmedPacketVersion : null,
    confirmedPacketFingerprint:
      typeof raw.confirmedPacketFingerprint === "string"
        ? raw.confirmedPacketFingerprint
        : null,
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

    return {
      ...createDefaultTinaWorkspaceDraft(),
      ...parsed,
      priorReturnDocumentId:
        typeof parsed.priorReturnDocumentId === "string" ? parsed.priorReturnDocumentId : null,
      documents: normalizedDocuments,
      documentReadings: normalizedReadings,
      booksConnection: normalizeBooksConnection(parsed.booksConnection),
      booksImport: normalizeBooksImport(parsed.booksImport),
      sourceFacts: normalizedSourceFacts,
      bootstrapReview: normalizeBootstrapReview(parsed.bootstrapReview),
      issueQueue: normalizeIssueQueue(parsed.issueQueue),
      workpapers: normalizeWorkpapers(parsed.workpapers),
      cleanupPlan: normalizeCleanupPlan(parsed.cleanupPlan),
      aiCleanup: normalizeAiCleanup(parsed.aiCleanup),
      taxAdjustments: normalizeTaxAdjustments(parsed.taxAdjustments),
      reviewerFinal: normalizeReviewerFinal(parsed.reviewerFinal),
      scheduleCDraft: normalizeScheduleCDraft(parsed.scheduleCDraft),
      officialFormPacket: normalizeOfficialFormPacket(parsed.officialFormPacket),
      packageReadiness: normalizePackageReadiness(parsed.packageReadiness),
      cpaHandoff: normalizeCpaHandoff(parsed.cpaHandoff),
      finalSignoff: normalizeFinalSignoff(parsed.finalSignoff),
      authorityWork: normalizedAuthorityWork,
      profile: {
        ...createDefaultTinaProfile(),
        ...(parsed.profile ?? {}),
      },
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
