import type {
  TinaAiCleanupSnapshot,
  TinaAuthorityCitation,
  TinaBenchmarkProposalDecision,
  TinaBenchmarkProposalDecisionStatus,
  TinaCpaHandoffArtifact,
  TinaCpaHandoffSnapshot,
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
  TinaSourceFact,
  TinaReviewItem,
  TinaReviewerOutcomeMemory,
  TinaReviewerOutcomeCaseTag,
  TinaReviewerOutcomePhase,
  TinaReviewerOutcomeRecord,
  TinaReviewerOutcomeVerdict,
  TinaReviewerOverrideRecord,
  TinaReviewerOverrideSeverity,
  TinaReviewerOverrideTargetType,
  TinaScheduleCDraftField,
  TinaScheduleCDraftNote,
  TinaScheduleCDraftSnapshot,
  TinaBusinessTaxProfile,
  TinaPriorReturnSnapshot,
  TinaStoredDocument,
  TinaStoredDocumentCategory,
  TinaTaxAdjustment,
  TinaTaxAdjustmentSnapshot,
  TinaTaxPositionMemorySnapshot,
  TinaTaxPositionRecord,
  TinaWorkpaperLine,
  TinaWorkpaperSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";
import { createDefaultTinaAiCleanupSnapshot } from "@/tina/lib/ai-cleanup";
import { createDefaultTinaAuthorityWorkItem } from "@/tina/lib/authority-work";
import { createDefaultTinaBookTieOutSnapshot } from "@/tina/lib/book-tie-out";
import { createDefaultTinaBootstrapReview } from "@/tina/lib/bootstrap-review";
import { createDefaultTinaCpaHandoff } from "@/tina/lib/cpa-handoff";
import { createDefaultTinaCleanupPlan } from "@/tina/lib/cleanup-plan";
import { createDefaultTinaIssueQueue } from "@/tina/lib/issue-queue";
import { createDefaultTinaPackageReadiness } from "@/tina/lib/package-readiness";
import {
  buildTinaReviewerOutcomeMemoryState,
  createDefaultTinaReviewerOutcomeMemory,
} from "@/tina/lib/reviewer-outcomes";
import { createDefaultTinaReviewerFinalSnapshot } from "@/tina/lib/reviewer-final";
import { createDefaultTinaScheduleCDraft } from "@/tina/lib/schedule-c-draft";
import { createDefaultTinaTaxAdjustmentSnapshot } from "@/tina/lib/tax-adjustments";
import { createDefaultTinaTaxPositionMemorySnapshot } from "@/tina/lib/tax-position-memory";
import { createDefaultTinaWorkpaperSnapshot } from "@/tina/lib/workpapers";

export const TINA_WORKSPACE_STORAGE_KEY = "tina.workspace.v1";

export function createDefaultTinaProfile(): TinaBusinessTaxProfile {
  return {
    businessName: "",
    taxYear: String(new Date().getFullYear() - 1),
    entityType: "unsure",
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
    sourceFacts: [],
    bootstrapReview: createDefaultTinaBootstrapReview(),
    issueQueue: createDefaultTinaIssueQueue(),
    bookTieOut: createDefaultTinaBookTieOutSnapshot(),
    workpapers: createDefaultTinaWorkpaperSnapshot(),
    cleanupPlan: createDefaultTinaCleanupPlan(),
    aiCleanup: createDefaultTinaAiCleanupSnapshot(),
    taxAdjustments: createDefaultTinaTaxAdjustmentSnapshot(),
    reviewerFinal: createDefaultTinaReviewerFinalSnapshot(),
    scheduleCDraft: createDefaultTinaScheduleCDraft(),
    packageReadiness: createDefaultTinaPackageReadiness(),
    cpaHandoff: createDefaultTinaCpaHandoff(),
    authorityWork: [],
    reviewerOutcomeMemory: createDefaultTinaReviewerOutcomeMemory(),
    taxPositionMemory: createDefaultTinaTaxPositionMemorySnapshot(),
    benchmarkProposalDecisions: [],
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

function normalizeReviewerOverrideTargetType(value: unknown): TinaReviewerOverrideTargetType {
  return value === "cleanup_suggestion" ||
    value === "tax_adjustment" ||
    value === "reviewer_final_line" ||
    value === "schedule_c_field" ||
    value === "authority_work_item" ||
    value === "package_readiness_item" ||
    value === "cpa_handoff_artifact"
    ? value
    : "review_item";
}

function normalizeReviewerOverrideSeverity(value: unknown): TinaReviewerOverrideSeverity {
  return value === "minor" || value === "material" ? value : "blocking";
}

function normalizeReviewerOutcomeVerdict(value: unknown): TinaReviewerOutcomeVerdict {
  return value === "accepted" || value === "revised" ? value : "rejected";
}

function normalizeReviewerOutcomePhase(value: unknown): TinaReviewerOutcomePhase {
  return value === "intake" || value === "cleanup" || value === "tax_review"
    ? value
    : "package";
}

function normalizeReviewerOutcomeCaseTag(value: unknown): TinaReviewerOutcomeCaseTag | null {
  return value === "clean_books" ||
    value === "messy_books" ||
    value === "authority_heavy" ||
    value === "commingled_entity" ||
    value === "schedule_c" ||
    value === "payroll" ||
    value === "contractor" ||
    value === "sales_tax" ||
    value === "inventory" ||
    value === "owner_flow" ||
    value === "transfer" ||
    value === "related_party" ||
    value === "continuity" ||
    value === "depreciation" ||
    value === "s_corp" ||
    value === "partnership" ||
    value === "state_scope"
    ? value
    : null;
}

function normalizeBenchmarkProposalDecisionStatus(
  value: unknown
): TinaBenchmarkProposalDecisionStatus {
  return value === "accepted" || value === "rejected" ? value : "deferred";
}

function normalizeBenchmarkProposalDecision(
  value: unknown
): TinaBenchmarkProposalDecision | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaBenchmarkProposalDecision>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.skillId !== "string" ||
    typeof raw.decidedAt !== "string"
  ) {
    return null;
  }

  const cohortTag = normalizeReviewerOutcomeCaseTag(raw.cohortTag);
  if (!cohortTag) return null;

  return {
    id: raw.id,
    skillId: raw.skillId,
    cohortTag,
    status: normalizeBenchmarkProposalDecisionStatus(raw.status),
    rationale: typeof raw.rationale === "string" ? raw.rationale : "",
    decidedAt: raw.decidedAt,
    decidedBy: typeof raw.decidedBy === "string" ? raw.decidedBy : null,
  };
}

function normalizeReviewerOverrideRecord(value: unknown): TinaReviewerOverrideRecord | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaReviewerOverrideRecord>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.targetId !== "string" ||
    typeof raw.reason !== "string" ||
    typeof raw.beforeState !== "string" ||
    typeof raw.afterState !== "string" ||
    typeof raw.lesson !== "string" ||
    typeof raw.decidedAt !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    targetType: normalizeReviewerOverrideTargetType(raw.targetType),
    targetId: raw.targetId,
    severity: normalizeReviewerOverrideSeverity(raw.severity),
    reason: raw.reason,
    beforeState: raw.beforeState,
    afterState: raw.afterState,
    lesson: raw.lesson,
    sourceDocumentIds: Array.isArray(raw.sourceDocumentIds)
      ? raw.sourceDocumentIds.filter((item): item is string => typeof item === "string")
      : [],
    decidedAt: raw.decidedAt,
    decidedBy: typeof raw.decidedBy === "string" ? raw.decidedBy : null,
  };
}

function normalizeReviewerOutcomeRecord(value: unknown): TinaReviewerOutcomeRecord | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaReviewerOutcomeRecord>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.targetId !== "string" ||
    typeof raw.summary !== "string" ||
    typeof raw.decidedAt !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    title: raw.title,
    phase: normalizeReviewerOutcomePhase(raw.phase),
    verdict: normalizeReviewerOutcomeVerdict(raw.verdict),
    targetType: normalizeReviewerOverrideTargetType(raw.targetType),
    targetId: raw.targetId,
    summary: raw.summary,
    lessons: Array.isArray(raw.lessons)
      ? raw.lessons.filter((item): item is string => typeof item === "string")
      : [],
    caseTags: Array.isArray(raw.caseTags)
      ? raw.caseTags
          .map((item) => normalizeReviewerOutcomeCaseTag(item))
          .filter((item): item is TinaReviewerOutcomeCaseTag => item !== null)
      : [],
    overrideIds: Array.isArray(raw.overrideIds)
      ? raw.overrideIds.filter((item): item is string => typeof item === "string")
      : [],
    decidedAt: raw.decidedAt,
    decidedBy: typeof raw.decidedBy === "string" ? raw.decidedBy : null,
  };
}

function normalizeReviewerOutcomeMemory(value: unknown): TinaReviewerOutcomeMemory {
  const fallback = createDefaultTinaReviewerOutcomeMemory();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaReviewerOutcomeMemory>;
  const overrides = Array.isArray(raw.overrides)
    ? raw.overrides
        .map((item) => normalizeReviewerOverrideRecord(item))
        .filter((item): item is TinaReviewerOverrideRecord => item !== null)
    : [];
  const outcomes = Array.isArray(raw.outcomes)
    ? raw.outcomes
        .map((item) => normalizeReviewerOutcomeRecord(item))
        .filter((item): item is TinaReviewerOutcomeRecord => item !== null)
    : [];

  return {
    overrides,
    outcomes,
    ...buildTinaReviewerOutcomeMemoryState(overrides, outcomes),
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

function normalizeBookTieOut(value: unknown): TinaWorkspaceDraft["bookTieOut"] {
  const fallback = createDefaultTinaBookTieOutSnapshot();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaWorkspaceDraft["bookTieOut"]>;
  const entries = Array.isArray(raw.entries)
    ? raw.entries.filter(
        (
          entry
        ): entry is TinaWorkspaceDraft["bookTieOut"]["entries"][number] =>
          typeof entry === "object" &&
          entry !== null &&
          typeof entry.id === "string" &&
          typeof entry.documentId === "string" &&
          typeof entry.label === "string"
      )
    : [];
  const variances = Array.isArray(raw.variances)
    ? raw.variances.filter(
        (
          variance
        ): variance is TinaWorkspaceDraft["bookTieOut"]["variances"][number] =>
          typeof variance === "object" &&
          variance !== null &&
          typeof variance.id === "string" &&
          typeof variance.title === "string" &&
          typeof variance.summary === "string"
      )
    : [];

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    totalMoneyIn: typeof raw.totalMoneyIn === "number" ? raw.totalMoneyIn : null,
    totalMoneyOut: typeof raw.totalMoneyOut === "number" ? raw.totalMoneyOut : null,
    totalNet: typeof raw.totalNet === "number" ? raw.totalNet : null,
    entries: entries.map((entry) => ({
      ...entry,
      status:
        entry.status === "ready" || entry.status === "needs_attention"
          ? entry.status
          : "waiting",
      moneyIn: typeof entry.moneyIn === "number" ? entry.moneyIn : null,
      moneyOut: typeof entry.moneyOut === "number" ? entry.moneyOut : null,
      net: typeof entry.net === "number" ? entry.net : null,
      dateCoverage: typeof entry.dateCoverage === "string" ? entry.dateCoverage : null,
      sourceFactIds: Array.isArray(entry.sourceFactIds)
        ? entry.sourceFactIds.filter((item): item is string => typeof item === "string")
        : [],
      issueIds: Array.isArray(entry.issueIds)
        ? entry.issueIds.filter((item): item is string => typeof item === "string")
        : [],
    })),
    variances: variances.map((variance) => ({
      ...variance,
      severity: variance.severity === "needs_attention" ? "needs_attention" : "blocking",
      documentIds: Array.isArray(variance.documentIds)
        ? variance.documentIds.filter((item): item is string => typeof item === "string")
        : [],
      sourceFactIds: Array.isArray(variance.sourceFactIds)
        ? variance.sourceFactIds.filter((item): item is string => typeof item === "string")
        : [],
    })),
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
      raw.kind === "owner_flow_separation" ||
      raw.kind === "transfer_classification" ||
      raw.kind === "related_party_review" ||
      raw.kind === "continuity_review" ||
      raw.kind === "depreciation_review" ||
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

function normalizeTaxPositionRecord(value: unknown): TinaTaxPositionRecord | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as Partial<TinaTaxPositionRecord>;
  if (
    typeof raw.id !== "string" ||
    typeof raw.adjustmentId !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.summary !== "string" ||
    typeof raw.treatmentSummary !== "string" ||
    typeof raw.reviewerGuidance !== "string"
  ) {
    return null;
  }

  return {
    id: raw.id,
    adjustmentId: raw.adjustmentId,
    title: raw.title,
    status:
      raw.status === "blocked" || raw.status === "ready" ? raw.status : "needs_review",
    confidence:
      raw.confidence === "low" || raw.confidence === "high" ? raw.confidence : "medium",
    summary: raw.summary,
    treatmentSummary: raw.treatmentSummary,
    reviewerGuidance: raw.reviewerGuidance,
    authorityWorkIdeaIds: Array.isArray(raw.authorityWorkIdeaIds)
      ? raw.authorityWorkIdeaIds.filter((id): id is string => typeof id === "string")
      : [],
    sourceDocumentIds: Array.isArray(raw.sourceDocumentIds)
      ? raw.sourceDocumentIds.filter((id): id is string => typeof id === "string")
      : [],
    sourceFactIds: Array.isArray(raw.sourceFactIds)
      ? raw.sourceFactIds.filter((id): id is string => typeof id === "string")
      : [],
    reviewerOutcomeIds: Array.isArray(raw.reviewerOutcomeIds)
      ? raw.reviewerOutcomeIds.filter((id): id is string => typeof id === "string")
      : [],
    reviewerOverrideIds: Array.isArray(raw.reviewerOverrideIds)
      ? raw.reviewerOverrideIds.filter((id): id is string => typeof id === "string")
      : [],
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
  };
}

function normalizeTaxPositionMemory(value: unknown): TinaTaxPositionMemorySnapshot {
  const fallback = createDefaultTinaTaxPositionMemorySnapshot();
  if (typeof value !== "object" || value === null) return fallback;

  const raw = value as Partial<TinaTaxPositionMemorySnapshot>;
  const records = Array.isArray(raw.records)
    ? raw.records
        .map((record) => normalizeTaxPositionRecord(record))
        .filter((record): record is TinaTaxPositionRecord => record !== null)
    : [];

  return {
    lastRunAt: typeof raw.lastRunAt === "string" ? raw.lastRunAt : null,
    status:
      raw.status === "stale" || raw.status === "running" || raw.status === "complete"
        ? raw.status
        : "idle",
    summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
    nextStep: typeof raw.nextStep === "string" ? raw.nextStep : fallback.nextStep,
    records,
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
    const normalizedBenchmarkProposalDecisions = Array.isArray(parsed.benchmarkProposalDecisions)
      ? parsed.benchmarkProposalDecisions
          .map((item) => normalizeBenchmarkProposalDecision(item))
          .filter((item): item is TinaBenchmarkProposalDecision => item !== null)
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
      bookTieOut: normalizeBookTieOut(parsed.bookTieOut),
      workpapers: normalizeWorkpapers(parsed.workpapers),
      cleanupPlan: normalizeCleanupPlan(parsed.cleanupPlan),
      aiCleanup: normalizeAiCleanup(parsed.aiCleanup),
      taxAdjustments: normalizeTaxAdjustments(parsed.taxAdjustments),
      reviewerFinal: normalizeReviewerFinal(parsed.reviewerFinal),
      scheduleCDraft: normalizeScheduleCDraft(parsed.scheduleCDraft),
      packageReadiness: normalizePackageReadiness(parsed.packageReadiness),
      cpaHandoff: normalizeCpaHandoff(parsed.cpaHandoff),
      authorityWork: normalizedAuthorityWork,
      reviewerOutcomeMemory: normalizeReviewerOutcomeMemory(parsed.reviewerOutcomeMemory),
      taxPositionMemory: normalizeTaxPositionMemory(parsed.taxPositionMemory),
      benchmarkProposalDecisions: normalizedBenchmarkProposalDecisions,
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
