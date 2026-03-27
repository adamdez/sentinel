"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  FileUp,
  FolderOpen,
  Loader2,
  RefreshCcw,
  Trash2,
  Save,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";
import { cn } from "@/lib/utils";
import { TinaStageCard } from "@/tina/components/tina-stage-card";
import { TINA_STAGES } from "@/tina/data/foundation";
import { useTinaDraft } from "@/tina/hooks/use-tina-draft";
import { buildTinaAuthorityWorkItems, createDefaultTinaAuthorityCitation } from "@/tina/lib/authority-work";
import { buildTinaChecklist } from "@/tina/lib/checklist";
import { findTinaDocumentReading } from "@/tina/lib/document-readings";
import { buildTinaResearchDossiers } from "@/tina/lib/research-dossiers";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import { buildTinaResearchIdeas } from "@/tina/lib/research-ideas";
import { describeTinaResearchPolicy } from "@/tina/lib/research-policy";
import { resolveTinaPriorReturnDocument } from "@/tina/lib/workspace-draft";
import type {
  TinaAiCleanupSnapshot,
  TinaAccountingMethod,
  TinaAuthorityCitationEffect,
  TinaAuthorityCitationSourceClass,
  TinaAuthorityDisclosureDecision,
  TinaAuthorityReviewerDecision,
  TinaAuthorityWorkStatus,
  TinaBootstrapReview,
  TinaChecklistItem,
  TinaCleanupPlan,
  TinaCleanupSuggestion,
  TinaCleanupSuggestionPriority,
  TinaCleanupSuggestionStatus,
  TinaDocumentReading,
  TinaEntityType,
  TinaCpaHandoffSnapshot,
  TinaIssueQueue,
  TinaPackageReadinessSnapshot,
  TinaScheduleCDraftSnapshot,
  TinaStoredDocument,
  TinaTaxAdjustment,
  TinaTaxAdjustmentSnapshot,
  TinaWorkpaperLine,
  TinaWorkpaperSnapshot,
} from "@/tina/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSavedAt(value: string | null): string {
  if (!value) return "Not saved yet";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoneyAmount(value: number | null): string {
  if (value === null) return "No dollar amount";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getWorkpaperStatusLabel(workpapers: TinaWorkpaperSnapshot): string {
  if (workpapers.status === "complete") return "Built";
  if (workpapers.status === "stale") return "Needs a fresh build";
  if (workpapers.lastRunAt) return "Need more papers first";
  return "Not built yet";
}

function formatDocumentReadingKind(reading: TinaDocumentReading): string {
  switch (reading.kind) {
    case "spreadsheet":
      return "Spreadsheet";
    case "pdf":
      return "PDF";
    case "word":
      return "Word document";
    case "image":
      return "Image";
    default:
      return "Saved paper";
  }
}

const ENTITY_OPTIONS: Array<{ value: TinaEntityType; label: string }> = [
  { value: "unsure", label: "I'm not sure yet" },
  { value: "sole_prop", label: "Sole proprietor" },
  { value: "single_member_llc", label: "Single-member LLC" },
  { value: "s_corp", label: "S-corp" },
  { value: "multi_member_llc", label: "Multi-member LLC" },
  { value: "partnership", label: "Partnership" },
];

const ACCOUNTING_METHOD_OPTIONS: Array<{ value: TinaAccountingMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "accrual", label: "Accrual" },
  { value: "unsure", label: "I'm not sure yet" },
];

const SUPPORT_STYLES = {
  supported: "border-emerald-300/20 bg-emerald-300/10 text-emerald-50",
  future: "border-amber-300/20 bg-amber-300/10 text-amber-50",
  blocked: "border-rose-300/20 bg-rose-300/10 text-rose-50",
} as const;

const PRIORITY_STYLES = {
  required: "border-rose-300/18 bg-rose-300/8 text-rose-100",
  recommended: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  watch: "border-amber-300/18 bg-amber-300/8 text-amber-50",
} as const;

const REVIEW_STYLES = {
  blocking: "border-rose-300/18 bg-rose-300/8 text-rose-50",
  needs_attention: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  watch: "border-white/10 bg-white/5 text-zinc-200",
} as const;

const PREP_RECORD_STYLES = {
  ready: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  needs_attention: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  waiting: "border-white/10 bg-white/5 text-zinc-200",
} as const;

const WORKPAPER_LINE_STYLES = {
  ready: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  needs_attention: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  waiting: "border-white/10 bg-white/5 text-zinc-200",
} as const;

const WORKPAPER_LINE_LABELS: Record<TinaWorkpaperLine["status"], string> = {
  ready: "ready",
  needs_attention: "needs review",
  waiting: "waiting",
};

const CLEANUP_PRIORITY_STYLES = {
  important: "border-rose-300/18 bg-rose-300/8 text-rose-50",
  helpful: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  watch: "border-white/10 bg-white/5 text-zinc-200",
} as const;

const CLEANUP_STATUS_STYLES = {
  suggested: "border-white/10 bg-white/5 text-zinc-200",
  reviewing: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  approved: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  rejected: "border-rose-300/18 bg-rose-300/8 text-rose-50",
} as const;

const CLEANUP_STATUS_LABELS: Record<TinaCleanupSuggestionStatus, string> = {
  suggested: "suggested",
  reviewing: "reviewing",
  approved: "approved",
  rejected: "rejected",
};

const CLEANUP_PRIORITY_LABELS: Record<TinaCleanupSuggestionPriority, string> = {
  important: "important",
  helpful: "helpful",
  watch: "watch",
};

const TAX_ADJUSTMENT_STATUS_STYLES = {
  needs_authority: "border-white/10 bg-white/5 text-zinc-200",
  ready_for_review: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  approved: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  rejected: "border-rose-300/18 bg-rose-300/8 text-rose-50",
} as const;

const TAX_ADJUSTMENT_STATUS_LABELS: Record<TinaTaxAdjustment["status"], string> = {
  needs_authority: "needs proof first",
  ready_for_review: "ready for review",
  approved: "approved",
  rejected: "rejected",
};

const TAX_ADJUSTMENT_RISK_STYLES = {
  low: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  medium: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  high: "border-rose-300/18 bg-rose-300/8 text-rose-50",
} as const;

const TAX_ADJUSTMENT_RISK_LABELS: Record<TinaTaxAdjustment["risk"], string> = {
  low: "lower risk",
  medium: "medium risk",
  high: "higher risk",
};

const PACKAGE_LEVEL_STYLES = {
  blocked: "border-rose-300/18 bg-rose-300/8 text-rose-50",
  needs_review: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  ready_for_cpa: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
} as const;

const PACKAGE_LEVEL_LABELS = {
  blocked: "blocked",
  needs_review: "needs review",
  ready_for_cpa: "ready for CPA handoff",
} as const;

const CPA_HANDOFF_ARTIFACT_STYLES = {
  ready: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  waiting: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  blocked: "border-rose-300/18 bg-rose-300/8 text-rose-50",
} as const;

const CPA_HANDOFF_ARTIFACT_LABELS = {
  ready: "ready",
  waiting: "waiting",
  blocked: "blocked",
} as const;

const RESEARCH_BUCKET_STYLES = {
  authoritative_and_usable: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  usable_with_disclosure: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  interesting_but_unsupported: "border-white/10 bg-white/5 text-zinc-200",
  reject: "border-rose-300/18 bg-rose-300/8 text-rose-50",
} as const;

const RESEARCH_BUCKET_LABELS = {
  authoritative_and_usable: "ready after review",
  usable_with_disclosure: "review + disclosure",
  interesting_but_unsupported: "idea only",
  reject: "do not use",
} as const;

const DOSSIER_STATUS_STYLES = {
  review_ready: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  needs_disclosure_review: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  needs_primary_authority: "border-white/10 bg-white/5 text-zinc-200",
  rejected: "border-rose-300/18 bg-rose-300/8 text-rose-50",
} as const;

const DOSSIER_STATUS_LABELS = {
  review_ready: "ready for review",
  needs_disclosure_review: "needs disclosure review",
  needs_primary_authority: "needs proof",
  rejected: "rejected",
} as const;

const DOSSIER_STEP_STYLES = {
  done: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  ready: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  waiting: "border-white/10 bg-white/5 text-zinc-200",
} as const;

const AUTHORITY_REVIEWER_STYLES = {
  not_ready: "border-white/10 bg-white/5 text-zinc-200",
  review_needed: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  can_consider: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  do_not_use: "border-rose-300/18 bg-rose-300/8 text-rose-50",
} as const;

const AUTHORITY_REVIEWER_LABELS = {
  not_ready: "not ready yet",
  review_needed: "review carefully",
  can_consider: "review can decide",
  do_not_use: "do not use",
} as const;

const AUTHORITY_DISCLOSURE_LABELS = {
  not_needed_yet: "not in play yet",
  review_if_supported: "check before filing",
  likely_needed: "likely needs disclosure",
  not_applicable: "not applicable",
} as const;

const AUTHORITY_WORK_STATUS_STYLES = {
  not_started: "border-white/10 bg-white/5 text-zinc-200",
  researching: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  ready_for_reviewer: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  reviewed: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  rejected: "border-rose-300/18 bg-rose-300/8 text-rose-50",
} as const;

const AUTHORITY_WORK_STATUS_LABELS: Record<TinaAuthorityWorkStatus, string> = {
  not_started: "not started",
  researching: "researching",
  ready_for_reviewer: "ready for reviewer",
  reviewed: "reviewed",
  rejected: "rejected",
};

const AUTHORITY_REVIEWER_DECISION_LABELS: Record<TinaAuthorityReviewerDecision, string> = {
  pending: "Pending",
  use_it: "Use it",
  need_more_support: "Need more support",
  do_not_use: "Do not use",
};

const AUTHORITY_DISCLOSURE_DECISION_LABELS: Record<TinaAuthorityDisclosureDecision, string> = {
  unknown: "Not sure yet",
  not_needed: "Not needed",
  needs_review: "Needs review",
  required: "Required",
};

const AUTHORITY_SOURCE_CLASS_LABELS: Record<TinaAuthorityCitationSourceClass, string> = {
  primary_authority: "Primary authority",
  secondary_analysis: "Secondary analysis",
  internal_signal: "Tina clue",
  community_lead: "Community lead",
  low_trust_lead: "Low-trust lead",
  unknown: "Unknown",
};

const AUTHORITY_CITATION_EFFECT_LABELS: Record<TinaAuthorityCitationEffect, string> = {
  supports: "Supports it",
  warns: "Warns against it",
  background: "Background only",
};

export function TinaWorkspace() {
  const {
    draft,
    hydrated,
    syncStatus,
    updateProfile,
    attachPriorReturn,
    clearPriorReturn,
    addUploadedDocument,
    removeDocument,
    saveDocumentReading,
    saveBootstrapReview,
    saveIssueQueue,
    saveWorkpapers,
    saveCleanupPlan,
    saveAiCleanup,
    saveTaxAdjustments,
    saveReviewerFinal,
    saveScheduleCDraft,
    savePackageReadiness,
    saveCpaHandoff,
    updateCleanupSuggestion,
    updateTaxAdjustment,
    saveAuthorityWorkItem,
    updateAuthorityWorkItem,
    addAuthorityCitation,
    updateAuthorityCitation,
    removeAuthorityCitation,
    resetDraft,
  } = useTinaDraft();
  const inputId = useId();
  const supportingInputId = useId();
  const supportingInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "error">("idle");
  const [reviewState, setReviewState] = useState<"idle" | "running" | "error">("idle");
  const [issueState, setIssueState] = useState<"idle" | "running" | "error">("idle");
  const [readingDocumentId, setReadingDocumentId] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [issueMessage, setIssueMessage] = useState<string | null>(null);
  const [workpaperMessage, setWorkpaperMessage] = useState<string | null>(null);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [aiCleanupMessage, setAiCleanupMessage] = useState<string | null>(null);
  const [taxAdjustmentMessage, setTaxAdjustmentMessage] = useState<string | null>(null);
  const [reviewerFinalMessage, setReviewerFinalMessage] = useState<string | null>(null);
  const [scheduleCMessage, setScheduleCMessage] = useState<string | null>(null);
  const [packageReadinessMessage, setPackageReadinessMessage] = useState<string | null>(null);
  const [cpaHandoffMessage, setCpaHandoffMessage] = useState<string | null>(null);
  const [authorityMessage, setAuthorityMessage] = useState<string | null>(null);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
  const [removingDocumentId, setRemovingDocumentId] = useState<string | null>(null);
  const [activeUploadTarget, setActiveUploadTarget] = useState<string | null>(null);
  const [researchingIdeaId, setResearchingIdeaId] = useState<string | null>(null);
  const [selectedChecklistItem, setSelectedChecklistItem] = useState<TinaChecklistItem | null>(null);
  const [workpaperState, setWorkpaperState] = useState<"idle" | "running" | "error">("idle");
  const [cleanupState, setCleanupState] = useState<"idle" | "running" | "error">("idle");
  const [aiCleanupState, setAiCleanupState] = useState<"idle" | "running" | "error">("idle");
  const [taxAdjustmentState, setTaxAdjustmentState] = useState<"idle" | "running" | "error">(
    "idle"
  );
  const [reviewerFinalState, setReviewerFinalState] = useState<"idle" | "running" | "error">(
    "idle"
  );
  const [scheduleCState, setScheduleCState] = useState<"idle" | "running" | "error">("idle");
  const [packageReadinessState, setPackageReadinessState] = useState<
    "idle" | "running" | "error"
  >("idle");
  const [cpaHandoffState, setCpaHandoffState] = useState<"idle" | "running" | "error">("idle");
  const recommendation = recommendTinaFilingLane(draft.profile);
  const checklist = buildTinaChecklist(draft, recommendation);
  const neededChecklist = checklist.filter((item) => item.status === "needed");
  const review = draft.bootstrapReview;
  const issueQueue = draft.issueQueue;
  const workpapers = draft.workpapers;
  const cleanupPlan = draft.cleanupPlan;
  const aiCleanup = draft.aiCleanup;
  const taxAdjustments = draft.taxAdjustments;
  const reviewerFinal = draft.reviewerFinal;
  const scheduleCDraft = draft.scheduleCDraft;
  const packageReadiness = draft.packageReadiness;
  const cpaHandoff = draft.cpaHandoff;
  const storedPriorReturn = useMemo(() => resolveTinaPriorReturnDocument(draft), [draft]);
  const researchIdeas = useMemo(() => buildTinaResearchIdeas(draft), [draft]);
  const researchDossiers = useMemo(() => buildTinaResearchDossiers(draft), [draft]);
  const authorityWorkItems = useMemo(() => buildTinaAuthorityWorkItems(draft), [draft]);
  const researchPolicyLines = useMemo(() => describeTinaResearchPolicy(), []);
  const authorityWorkMap = useMemo(
    () => new Map(authorityWorkItems.map((item) => [item.ideaId, item])),
    [authorityWorkItems]
  );
  const reviewerFinalMap = useMemo(
    () => new Map(reviewerFinal.lines.map((line) => [line.id, line])),
    [reviewerFinal.lines]
  );
  const documentMap = useMemo(
    () => new Map(draft.documents.map((document) => [document.id, document])),
    [draft.documents]
  );
  const sourceFactMap = useMemo(
    () => new Map(draft.sourceFacts.map((fact) => [fact.id, fact])),
    [draft.sourceFacts]
  );

  if (!hydrated) {
    return (
      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl">
        <CardContent className="p-6 text-sm text-zinc-300">
          Loading Tina workspace...
        </CardContent>
      </Card>
    );
  }

  const coveredChecklistCount = checklist.filter((item) => item.status === "covered").length;
  const openReviewItems = review.items.filter((item) => item.status === "open");
  const blockingReviewCount = openReviewItems.filter((item) => item.severity === "blocking").length;
  const attentionReviewCount = openReviewItems.filter(
    (item) => item.severity === "needs_attention"
  ).length;
  const openIssueItems = issueQueue.items.filter((item) => item.status === "open");
  const blockingIssueCount = openIssueItems.filter((item) => item.severity === "blocking").length;
  const attentionIssueCount = openIssueItems.filter(
    (item) => item.severity === "needs_attention"
  ).length;
  const workpaperAttentionCount = workpapers.lines.filter(
    (line) => line.status === "needs_attention"
  ).length;
  const moneyLineCount = workpapers.lines.filter(
    (line) => line.kind === "income" || line.kind === "expense" || line.kind === "net"
  ).length;
  const cleanupApprovedCount = cleanupPlan.suggestions.filter(
    (suggestion) => suggestion.status === "approved"
  ).length;
  const aiCleanupLineCount = aiCleanup.lines.length;
  const taxAdjustmentCount = taxAdjustments.adjustments.length;
  const authorityBlockedAdjustmentCount = taxAdjustments.adjustments.filter(
    (adjustment) => adjustment.status === "needs_authority"
  ).length;
  const approvedTaxAdjustmentCount = taxAdjustments.adjustments.filter(
    (adjustment) => adjustment.status === "approved"
  ).length;
  const reviewerFinalLineCount = reviewerFinal.lines.length;
  const reviewerFinalAttentionCount = reviewerFinal.lines.filter(
    (line) => line.status === "needs_attention"
  ).length;
  const scheduleCFieldCount = scheduleCDraft.fields.length;
  const scheduleCNoteCount = scheduleCDraft.notes.length;
  const packageReadinessBlockingCount = packageReadiness.items.filter(
    (item) => item.severity === "blocking"
  ).length;
  const packageReadinessReviewCount = packageReadiness.items.filter(
    (item) => item.severity === "needs_attention"
  ).length;
  const cpaHandoffReadyCount = cpaHandoff.artifacts.filter(
    (artifact) => artifact.status === "ready"
  ).length;
  const cpaHandoffWaitingCount = cpaHandoff.artifacts.filter(
    (artifact) => artifact.status === "waiting"
  ).length;
  const cpaHandoffBlockedCount = cpaHandoff.artifacts.filter(
    (artifact) => artifact.status === "blocked"
  ).length;

  function renderIssueContext(documentId?: string | null, factId?: string | null) {
    const linkedDocument = documentId ? documentMap.get(documentId) ?? null : null;
    const linkedFact = factId ? sourceFactMap.get(factId) ?? null : null;

    if (!linkedDocument && !linkedFact) return null;

    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        {linkedFact ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
            From fact: {linkedFact.label}
          </span>
        ) : null}
        {linkedDocument ? (
          <>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              Paper: {linkedDocument.requestLabel ?? linkedDocument.name}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
              onClick={() => void openSavedDocument(linkedDocument)}
              disabled={openingDocumentId === linkedDocument.id}
            >
              {openingDocumentId === linkedDocument.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Open paper
            </Button>
          </>
        ) : null}
      </div>
    );
  }

  function addSourceToAuthorityWork(ideaId: string) {
    addAuthorityCitation(ideaId, createDefaultTinaAuthorityCitation());
  }

  function renderWorkpaperContext(line: TinaWorkpaperLine) {
    const firstDocumentId = line.sourceDocumentIds[0] ?? null;
    const firstFactId = line.sourceFactIds[0] ?? null;
    const linkedDocumentCount = line.sourceDocumentIds.length;
    const linkedIssueCount = line.issueIds.length;
    const linkedDocument = firstDocumentId ? documentMap.get(firstDocumentId) ?? null : null;
    const linkedFact = firstFactId ? sourceFactMap.get(firstFactId) ?? null : null;

    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        {linkedDocumentCount > 0 ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
            {linkedDocumentCount} linked paper{linkedDocumentCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {linkedIssueCount > 0 ? (
          <span className="rounded-full border border-amber-300/18 bg-amber-300/8 px-2.5 py-1 text-amber-50">
            {linkedIssueCount} linked issue{linkedIssueCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {linkedFact ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
            From fact: {linkedFact.label}
          </span>
        ) : null}
        {linkedDocument ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
            onClick={() => void openSavedDocument(linkedDocument)}
            disabled={openingDocumentId === linkedDocument.id}
          >
            {openingDocumentId === linkedDocument.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Open paper
          </Button>
        ) : null}
      </div>
    );
  }

  async function runAuthorityResearch(ideaId: string) {
    setResearchingIdeaId(ideaId);
    setAuthorityMessage("Tina is researching this idea with a deeper authority pass...");

    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/research/run", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft, ideaId }),
      });

      const payload = (await res.json()) as {
        workItem?: ReturnType<typeof buildTinaAuthorityWorkItems>[number];
        error?: string;
      };

      if (!res.ok || !payload.workItem) {
        throw new Error(payload.error || "research failed");
      }

      saveAuthorityWorkItem(payload.workItem);
      setAuthorityMessage("Tina finished the authority search and saved the result.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Tina could not finish this authority search.";
      setAuthorityMessage(message);
    } finally {
      setResearchingIdeaId(null);
    }
  }

  async function runWorkpaperBuild() {
    setWorkpaperState("running");
    setWorkpaperMessage("Tina is building the first money story from your papers...");

    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/workpapers/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft }),
      });

      if (!res.ok) throw new Error("workpaper build failed");

      const payload = (await res.json()) as {
        workpapers?: TinaWorkpaperSnapshot;
      };
      if (!payload.workpapers) throw new Error("missing workpapers");

      saveWorkpapers(payload.workpapers);
      setWorkpaperState("idle");
      setWorkpaperMessage("Tina finished the first money story.");
    } catch {
      setWorkpaperState("error");
      setWorkpaperMessage("Tina could not build the money story yet. Try again in a moment.");
    }
  }

  function renderCleanupContext(suggestion: TinaCleanupSuggestion) {
    const firstDocumentId = suggestion.sourceDocumentIds[0] ?? null;
    const firstFactId = suggestion.sourceFactIds[0] ?? null;
    const linkedDocument = firstDocumentId ? documentMap.get(firstDocumentId) ?? null : null;
    const linkedLineCount = suggestion.workpaperLineIds.length;

    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        {linkedLineCount > 0 ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
            {linkedLineCount} linked cleanup line{linkedLineCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {suggestion.issueIds.length > 0 ? (
          <span className="rounded-full border border-amber-300/18 bg-amber-300/8 px-2.5 py-1 text-amber-50">
            {suggestion.issueIds.length} linked issue{suggestion.issueIds.length === 1 ? "" : "s"}
          </span>
        ) : null}
        {firstFactId ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
            From fact: {sourceFactMap.get(firstFactId)?.label ?? "Saved fact"}
          </span>
        ) : null}
        {linkedDocument ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
            onClick={() => void openSavedDocument(linkedDocument)}
            disabled={openingDocumentId === linkedDocument.id}
          >
            {openingDocumentId === linkedDocument.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Open paper
          </Button>
        ) : null}
      </div>
    );
  }

  function renderTaxAdjustmentContext(adjustment: TinaTaxAdjustment) {
    const firstDocumentId = adjustment.sourceDocumentIds[0] ?? null;
    const firstFactId = adjustment.sourceFactIds[0] ?? null;
    const linkedDocument = firstDocumentId ? documentMap.get(firstDocumentId) ?? null : null;

    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        {adjustment.aiCleanupLineIds.length > 0 ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
            From {adjustment.aiCleanupLineIds.length} AI cleanup line
            {adjustment.aiCleanupLineIds.length === 1 ? "" : "s"}
          </span>
        ) : null}
        {adjustment.authorityWorkIdeaIds.length > 0
          ? adjustment.authorityWorkIdeaIds.map((ideaId) => (
              <span
                key={`${adjustment.id}-${ideaId}`}
                className="rounded-full border border-amber-300/18 bg-amber-300/8 px-2.5 py-1 text-amber-50"
              >
                Proof: {authorityWorkMap.get(ideaId)?.title ?? ideaId}
              </span>
            ))
          : null}
        {firstFactId ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
            From fact: {sourceFactMap.get(firstFactId)?.label ?? "Saved fact"}
          </span>
        ) : null}
        {linkedDocument ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
            onClick={() => void openSavedDocument(linkedDocument)}
            disabled={openingDocumentId === linkedDocument.id}
          >
            {openingDocumentId === linkedDocument.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Open paper
          </Button>
        ) : null}
      </div>
    );
  }

  function renderScheduleCFieldContext(field: TinaScheduleCDraftSnapshot["fields"][number]) {
    const linkedReviewerLines = field.reviewerFinalLineIds
      .map((lineId) => reviewerFinalMap.get(lineId))
      .filter((line): line is TinaWorkpaperLine => Boolean(line));
    const firstDocumentId = field.sourceDocumentIds[0] ?? null;
    const linkedDocument = firstDocumentId ? documentMap.get(firstDocumentId) ?? null : null;

    if (linkedReviewerLines.length === 0 && !linkedDocument) return null;

    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        {linkedReviewerLines.map((line) => (
          <span
            key={`${field.id}-${line.id}`}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1"
          >
            From: {line.label}
          </span>
        ))}
        {linkedDocument ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
            onClick={() => void openSavedDocument(linkedDocument)}
            disabled={openingDocumentId === linkedDocument.id}
          >
            {openingDocumentId === linkedDocument.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Open paper
          </Button>
        ) : null}
      </div>
    );
  }

  function renderScheduleCNoteContext(note: TinaScheduleCDraftSnapshot["notes"][number]) {
    const linkedReviewerLines = note.reviewerFinalLineIds
      .map((lineId) => reviewerFinalMap.get(lineId))
      .filter((line): line is TinaWorkpaperLine => Boolean(line));
    const firstDocumentId = note.sourceDocumentIds[0] ?? null;
    const linkedDocument = firstDocumentId ? documentMap.get(firstDocumentId) ?? null : null;

    if (linkedReviewerLines.length === 0 && !linkedDocument) return null;

    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        {linkedReviewerLines.map((line) => (
          <span
            key={`${note.id}-${line.id}`}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1"
          >
            Linked line: {line.label}
          </span>
        ))}
        {linkedDocument ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
            onClick={() => void openSavedDocument(linkedDocument)}
            disabled={openingDocumentId === linkedDocument.id}
          >
            {openingDocumentId === linkedDocument.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Open paper
          </Button>
        ) : null}
      </div>
    );
  }

  function renderCpaHandoffArtifactContext(artifact: TinaCpaHandoffSnapshot["artifacts"][number]) {
    const relatedFields = artifact.relatedFieldIds
      .map((fieldId) => scheduleCDraft.fields.find((field) => field.id === fieldId))
      .filter((field): field is TinaScheduleCDraftSnapshot["fields"][number] => Boolean(field));
    const relatedNotes = artifact.relatedNoteIds
      .map((noteId) => scheduleCDraft.notes.find((note) => note.id === noteId))
      .filter((note): note is TinaScheduleCDraftSnapshot["notes"][number] => Boolean(note));
    const linkedDocument = artifact.sourceDocumentIds[0]
      ? documentMap.get(artifact.sourceDocumentIds[0]) ?? null
      : null;

    if (relatedFields.length === 0 && relatedNotes.length === 0 && !linkedDocument) return null;

    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        {relatedFields.map((field) => (
          <span
            key={`${artifact.id}-${field.id}`}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1"
          >
            Draft box: {field.lineNumber}
          </span>
        ))}
        {relatedNotes.map((note) => (
          <span
            key={`${artifact.id}-${note.id}`}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1"
          >
            Note: {note.title}
          </span>
        ))}
        {linkedDocument ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
            onClick={() => void openSavedDocument(linkedDocument)}
            disabled={openingDocumentId === linkedDocument.id}
          >
            {openingDocumentId === linkedDocument.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Open paper
          </Button>
        ) : null}
      </div>
    );
  }

  async function runCleanupBuild() {
    setCleanupState("running");
    setCleanupMessage("Tina is turning the money story into cleanup ideas...");

    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/cleanup-plan/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft }),
      });

      if (!res.ok) throw new Error("cleanup build failed");

      const payload = (await res.json()) as {
        cleanupPlan?: TinaCleanupPlan;
      };
      if (!payload.cleanupPlan) throw new Error("missing cleanup plan");

      saveCleanupPlan(payload.cleanupPlan);
      setCleanupState("idle");
      setCleanupMessage("Tina finished her cleanup idea pass.");
    } catch {
      setCleanupState("error");
      setCleanupMessage("Tina could not build cleanup ideas yet. Try again in a moment.");
    }
  }

  async function runAiCleanupBuild() {
    setAiCleanupState("running");
    setAiCleanupMessage("Tina is carrying approved cleanup ideas into the AI cleanup layer...");

    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/ai-cleanup/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft }),
      });

      if (!res.ok) throw new Error("ai cleanup build failed");

      const payload = (await res.json()) as {
        aiCleanup?: TinaAiCleanupSnapshot;
      };
      if (!payload.aiCleanup) throw new Error("missing ai cleanup");

      saveAiCleanup(payload.aiCleanup);
      setAiCleanupState("idle");
      setAiCleanupMessage("Tina finished the AI cleanup layer.");
    } catch {
      setAiCleanupState("error");
      setAiCleanupMessage("Tina could not build the AI cleanup layer yet. Try again in a moment.");
    }
  }

  async function runTaxAdjustmentBuild() {
    setTaxAdjustmentState("running");
    setTaxAdjustmentMessage("Tina is turning the cleanup layer into tax review ideas...");

    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/tax-adjustments/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft }),
      });

      if (!res.ok) throw new Error("tax adjustment build failed");

      const payload = (await res.json()) as {
        taxAdjustments?: TinaTaxAdjustmentSnapshot;
      };
      if (!payload.taxAdjustments) throw new Error("missing tax adjustments");

      saveTaxAdjustments(payload.taxAdjustments);
      setTaxAdjustmentState("idle");
      setTaxAdjustmentMessage("Tina finished her first tax-adjustment pass.");
    } catch {
      setTaxAdjustmentState("error");
      setTaxAdjustmentMessage(
        "Tina could not build tax adjustments yet. Try again in a moment."
      );
    }
  }

  async function runReviewerFinalBuild() {
    setReviewerFinalState("running");
    setReviewerFinalMessage("Tina is building the first return-facing review layer...");

    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/reviewer-final/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft }),
      });

      if (!res.ok) throw new Error("reviewer final build failed");

      const payload = (await res.json()) as {
        reviewerFinal?: TinaWorkpaperSnapshot;
      };
      if (!payload.reviewerFinal) throw new Error("missing reviewer final");

      saveReviewerFinal(payload.reviewerFinal);
      setReviewerFinalState("idle");
      setReviewerFinalMessage("Tina finished the first return-facing review layer.");
    } catch {
      setReviewerFinalState("error");
      setReviewerFinalMessage(
        "Tina could not build the return-facing review layer yet. Try again in a moment."
      );
    }
  }

  async function runScheduleCBuild() {
    setScheduleCState("running");
    setScheduleCMessage("Tina is mapping the safe pieces into a small Schedule C draft...");

    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/schedule-c/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft }),
      });

      if (!res.ok) throw new Error("schedule c build failed");

      const payload = (await res.json()) as {
        scheduleCDraft?: TinaScheduleCDraftSnapshot;
      };
      if (!payload.scheduleCDraft) throw new Error("missing schedule c draft");

      saveScheduleCDraft(payload.scheduleCDraft);
      setScheduleCState("idle");
      setScheduleCMessage("Tina finished the first Schedule C draft.");
    } catch {
      setScheduleCState("error");
      setScheduleCMessage("Tina could not build the Schedule C draft yet. Try again in a moment.");
    }
  }

  async function runPackageReadinessBuild() {
    setPackageReadinessState("running");
    setPackageReadinessMessage("Tina is checking what still blocks a filing-ready package...");

    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/package-readiness/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft }),
      });

      if (!res.ok) throw new Error("package readiness build failed");

      const payload = (await res.json()) as {
        packageReadiness?: TinaPackageReadinessSnapshot;
      };
      if (!payload.packageReadiness) throw new Error("missing package readiness");

      savePackageReadiness(payload.packageReadiness);
      setPackageReadinessState("idle");
      setPackageReadinessMessage("Tina finished the filing-package check.");
    } catch {
      setPackageReadinessState("error");
      setPackageReadinessMessage(
        "Tina could not finish the filing-package check yet. Try again in a moment."
      );
    }
  }

  async function runCpaHandoffBuild() {
    setCpaHandoffState("running");
    setCpaHandoffMessage("Tina is laying out the first CPA review packet...");

    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/cpa-handoff/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft }),
      });

      if (!res.ok) throw new Error("cpa handoff build failed");

      const payload = (await res.json()) as {
        cpaHandoff?: TinaCpaHandoffSnapshot;
      };
      if (!payload.cpaHandoff) throw new Error("missing cpa handoff");

      saveCpaHandoff(payload.cpaHandoff);
      setCpaHandoffState("idle");
      setCpaHandoffMessage("Tina finished the first CPA review packet view.");
    } catch {
      setCpaHandoffState("error");
      setCpaHandoffMessage(
        "Tina could not build the CPA review packet yet. Try again in a moment."
      );
    }
  }

  async function uploadPriorReturn(file: File) {
    setUploadState("uploading");
    setActiveUploadTarget("prior-return");
    setUploadMessage("Saving last year's return to Tina...");

    try {
      const headers = await sentinelAuthHeaders(false);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "prior_return");
      formData.append("taxYear", draft.profile.taxYear || "unknown-year");
      formData.append("requestId", "prior-return");
      formData.append("requestLabel", "Last year's tax return");

      const res = await fetch("/api/tina/documents", {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) throw new Error("upload failed");

      const payload = (await res.json()) as { document?: TinaStoredDocument };
      if (!payload.document) throw new Error("missing document");

      addUploadedDocument(payload.document, true);
      setUploadState("idle");
      setUploadMessage("Last year's return is now saved in Tina.");
    } catch {
      attachPriorReturn(file);
      setUploadState("error");
      setUploadMessage("Tina kept the file name on this device, but the secure upload needs another try.");
    } finally {
      setActiveUploadTarget(null);
    }
  }

  async function uploadChecklistDocument(file: File, item: TinaChecklistItem) {
    setUploadState("uploading");
    setActiveUploadTarget(item.id);
    setUploadMessage(`Saving ${item.label.toLowerCase()} to Tina...`);

    try {
      const headers = await sentinelAuthHeaders(false);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "supporting_document");
      formData.append("taxYear", draft.profile.taxYear || "unknown-year");
      formData.append("requestId", item.id);
      formData.append("requestLabel", item.label);

      const res = await fetch("/api/tina/documents", {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) throw new Error("upload failed");

      const payload = (await res.json()) as { document?: TinaStoredDocument };
      if (!payload.document) throw new Error("missing document");

      addUploadedDocument(payload.document);
      setUploadState("idle");
      setUploadMessage(`Tina saved ${item.label.toLowerCase()}.`);
    } catch {
      setUploadState("error");
      setUploadMessage(`Tina could not save ${item.label.toLowerCase()} yet. Try again in a moment.`);
    } finally {
      setActiveUploadTarget(null);
      setSelectedChecklistItem(null);
    }
  }

  async function removePriorReturn() {
    if (storedPriorReturn) {
      setRemovingDocumentId(storedPriorReturn.id);
      try {
        const headers = await sentinelAuthHeaders();
        const res = await fetch("/api/tina/documents", {
          method: "DELETE",
          headers,
          body: JSON.stringify({ storagePath: storedPriorReturn.storagePath }),
        });
        if (!res.ok) throw new Error("delete failed");
        removeDocument(storedPriorReturn.id);
        clearPriorReturn();
        setUploadState("idle");
        setUploadMessage("Tina removed that saved return.");
      } catch {
        setUploadState("error");
        setUploadMessage("Tina could not remove that file yet. Try again in a moment.");
      } finally {
        setRemovingDocumentId(null);
      }
      return;
    }

    clearPriorReturn();
    setUploadState("idle");
    setUploadMessage("Tina cleared the local return note.");
  }

  async function openSavedDocument(document: TinaStoredDocument) {
    setOpeningDocumentId(document.id);

    try {
      const headers = await sentinelAuthHeaders();
      const params = new URLSearchParams({ storagePath: document.storagePath });
      const res = await fetch(`/api/tina/documents/link?${params.toString()}`, {
        method: "GET",
        headers,
      });

      if (!res.ok) throw new Error("link failed");

      const payload = (await res.json()) as { url?: string };
      if (!payload.url) throw new Error("missing url");

      window.open(payload.url, "_blank", "noopener,noreferrer");
      setUploadState("idle");
      setUploadMessage(`Opening ${document.name}.`);
    } catch {
      setUploadState("error");
      setUploadMessage("Tina could not open that paper yet. Try again in a moment.");
    } finally {
      setOpeningDocumentId(null);
    }
  }

  async function readSavedDocument(document: TinaStoredDocument) {
    setReadingDocumentId(document.id);
    setUploadState("uploading");
    setUploadMessage(`Tina is reading ${document.name}...`);

    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/documents/read", {
        method: "POST",
        headers,
        body: JSON.stringify({ document }),
      });

      if (!res.ok) throw new Error("read failed");

      const payload = (await res.json()) as { reading?: TinaDocumentReading };
      if (!payload.reading) throw new Error("missing reading");

      saveDocumentReading(payload.reading);
      setUploadState("idle");
      setUploadMessage(`Tina finished reading ${document.name}.`);
    } catch {
      setUploadState("error");
      setUploadMessage("Tina could not read that paper yet. Try again in a moment.");
    } finally {
      setReadingDocumentId(null);
    }
  }

  async function runBootstrapReview() {
    setReviewState("running");
    setReviewMessage("Tina is checking what she already knows...");

    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/bootstrap-review", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft }),
      });

      if (!res.ok) throw new Error("review failed");

      const payload = (await res.json()) as { review?: TinaBootstrapReview };
      if (!payload.review) throw new Error("missing review");

      saveBootstrapReview(payload.review);
      setReviewState("idle");
      setReviewMessage("Tina finished her first setup check.");
    } catch {
      setReviewState("error");
      setReviewMessage("Tina could not finish the setup check yet. Try again in a moment.");
    }
  }

  async function runIssueQueueCheck() {
    setIssueState("running");
    setIssueMessage("Tina is checking your papers for conflicts...");

    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/issue-queue", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft }),
      });

      if (!res.ok) throw new Error("issue check failed");

      const payload = (await res.json()) as { issueQueue?: TinaIssueQueue };
      if (!payload.issueQueue) throw new Error("missing issue queue");

      saveIssueQueue(payload.issueQueue);
      setIssueState("idle");
      setIssueMessage("Tina finished the conflict check.");
    } catch {
      setIssueState("error");
      setIssueMessage("Tina could not finish the conflict check yet. Try again in a moment.");
    }
  }

  function beginChecklistUpload(item: TinaChecklistItem) {
    setSelectedChecklistItem(item);
    supportingInputRef.current?.click();
  }

  const isVaultBusy =
    uploadState === "uploading" ||
    removingDocumentId !== null ||
    openingDocumentId !== null ||
    readingDocumentId !== null;

  return (
    <div className="space-y-5">
      <Card className="border-emerald-300/14 bg-emerald-300/8 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardContent className="grid gap-3 p-5 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/80">Step 1</p>
            <p className="mt-2 text-sm font-medium text-white">Add last year's return if you have it.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/80">Step 2</p>
            <p className="mt-2 text-sm font-medium text-white">Answer the easy business questions below.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/80">Step 3</p>
            <p className="mt-2 text-sm font-medium text-white">Bring the papers Tina asks for next.</p>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-white">Step 1: Start with last year</CardTitle>
              <p className="text-sm leading-6 text-zinc-300">
                If you have last year's tax return, add it here first. That helps Tina fill in a lot of the basics for you.
              </p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-200">
              Strongly preferred
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-emerald-300/14 bg-emerald-300/8 px-4 py-3 text-sm leading-6 text-emerald-50">
              You do not need to understand tax language here. If you have the file, add it. If you do not, Tina can still keep going.
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                id={inputId}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.heic"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) await uploadPriorReturn(file);
                  event.currentTarget.value = "";
                }}
              />
              <Button asChild disabled={uploadState === "uploading"}>
                <label htmlFor={inputId} className="cursor-pointer">
                  {uploadState === "uploading" && activeUploadTarget === "prior-return" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileUp className="h-4 w-4" />
                  )}
                  {uploadState === "uploading" && activeUploadTarget === "prior-return"
                    ? "Saving..."
                    : "Add last year's return"}
                </label>
              </Button>
              {(storedPriorReturn || draft.priorReturn) && (
                <Button
                  variant="ghost"
                  className="text-zinc-300 hover:bg-white/8 hover:text-white"
                  onClick={removePriorReturn}
                  disabled={removingDocumentId !== null}
                >
                  {removingDocumentId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Remove
                </Button>
              )}
            </div>

            {uploadMessage && (
              <div className={cn(
                "rounded-2xl border px-4 py-3 text-sm leading-6",
                uploadState === "error"
                  ? "border-amber-300/14 bg-amber-300/8 text-amber-50"
                  : "border-white/10 bg-black/15 text-zinc-200"
              )}>
                {uploadMessage}
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              {storedPriorReturn ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                    Last year's return is saved in Tina
                  </div>
                  <p className="text-sm text-zinc-100">{storedPriorReturn.name}</p>
                  <p className="text-sm text-zinc-400">
                    {formatBytes(storedPriorReturn.size)} | saved in your Tina vault
                  </p>
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                    Uploaded {formatSavedAt(storedPriorReturn.uploadedAt)}
                  </p>
                </div>
              ) : draft.priorReturn ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                    Last year's return is noted on this device
                  </div>
                  <p className="text-sm text-zinc-100">{draft.priorReturn.fileName}</p>
                  <p className="text-sm text-zinc-400">
                    {formatBytes(draft.priorReturn.fileSize)} | waiting for secure upload
                  </p>
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                    Saved locally on this device at {formatSavedAt(draft.priorReturn.capturedAt)}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 text-sm text-zinc-300">
                  <div className="flex items-center gap-2 font-medium text-white">
                    <FolderOpen className="h-4 w-4 text-emerald-200" />
                    No return added yet
                  </div>
                  <p>No problem. Tina can still keep going and ask for more papers later.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
          <CardHeader className="space-y-3">
            <CardTitle className="text-white">Workspace draft</CardTitle>
            <p className="text-sm leading-6 text-zinc-300">
              Tina is saving your answers on this device so you do not lose your place.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <Save className="h-4 w-4 text-emerald-200" />
                Last local save
              </div>
              <p className="mt-2 text-sm text-zinc-300">{formatSavedAt(draft.savedAt)}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                {syncStatus === "loading" && "Checking your saved Tina draft..."}
                {syncStatus === "local_only" && "Saved on this device for now. Tina will try to save to your account next."}
                {syncStatus === "saving" && "Saving Tina to your account..."}
                {syncStatus === "saved" && "Saved to your account too."}
                {syncStatus === "error" && "Tina kept your draft on this device, but account sync needs another try."}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Checklist coverage
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {coveredChecklistCount}/{checklist.length}
              </p>
              <p className="mt-1 text-sm text-zinc-300">Known bootstrap items already covered.</p>
            </div>

            <Button variant="outline" className="w-full border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8" onClick={resetDraft}>
              <RefreshCcw className="h-4 w-4" />
              Start this draft over
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Papers Tina has saved</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            This is the simple paper list for Tina's vault. Tina keeps the papers you add tied to the job they help finish.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={supportingInputRef}
            id={supportingInputId}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.heic"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file && selectedChecklistItem) {
                await uploadChecklistDocument(file, selectedChecklistItem);
              }
              event.currentTarget.value = "";
            }}
          />
          {draft.documents.length > 0 ? (
            draft.documents.map((document) => {
              const reading = findTinaDocumentReading(draft.documentReadings, document.id);

              return (
                <div key={document.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-200">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{document.name}</p>
                        <p className="text-sm text-zinc-400">
                          {document.requestLabel ??
                            (document.category === "prior_return"
                              ? "Last year's return"
                              : "Supporting paper")}{" "}
                          | {formatBytes(document.size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => readSavedDocument(document)}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/8"
                        disabled={
                          readingDocumentId === document.id ||
                          removingDocumentId === document.id ||
                          openingDocumentId === document.id
                        }
                      >
                        {readingDocumentId === document.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-4 w-4" />
                        )}
                        {reading ? "Read again" : "Let Tina read this"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openSavedDocument(document)}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/8"
                        disabled={
                          openingDocumentId === document.id ||
                          removingDocumentId === document.id ||
                          readingDocumentId === document.id
                        }
                      >
                        {openingDocumentId === document.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ExternalLink className="h-4 w-4" />
                        )}
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setRemovingDocumentId(document.id);
                          try {
                            const headers = await sentinelAuthHeaders();
                            const res = await fetch("/api/tina/documents", {
                              method: "DELETE",
                              headers,
                              body: JSON.stringify({ storagePath: document.storagePath }),
                            });
                            if (!res.ok) throw new Error("delete failed");
                            removeDocument(document.id);
                            setUploadState("idle");
                            setUploadMessage("Tina removed that saved paper.");
                          } catch {
                            setUploadState("error");
                            setUploadMessage("Tina could not remove that file yet. Try again in a moment.");
                          } finally {
                            setRemovingDocumentId(null);
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/8"
                        disabled={
                          removingDocumentId === document.id ||
                          openingDocumentId === document.id ||
                          readingDocumentId === document.id
                        }
                      >
                        {removingDocumentId === document.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        Remove
                      </button>
                    </div>
                  </div>

                  {reading ? (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-white">{formatDocumentReadingKind(reading)} reading</p>
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                            reading.status === "complete"
                              ? "border-emerald-300/18 bg-emerald-300/8 text-emerald-50"
                              : reading.status === "waiting_for_ai"
                                ? "border-amber-300/18 bg-amber-300/8 text-amber-50"
                                : "border-white/10 bg-black/15 text-zinc-200"
                          )}
                        >
                          {reading.status === "waiting_for_ai" ? "waiting for deeper read" : reading.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-zinc-300">{reading.summary}</p>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">{reading.nextStep}</p>
                      {reading.facts.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {reading.facts.map((fact) => (
                            <div
                              key={fact.id}
                              className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium text-white">{fact.label}</p>
                                <span
                                  className={cn(
                                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                                    fact.confidence === "high"
                                      ? "border-emerald-300/18 bg-emerald-300/8 text-emerald-50"
                                      : fact.confidence === "medium"
                                        ? "border-amber-300/18 bg-amber-300/8 text-amber-50"
                                        : "border-white/10 bg-white/5 text-zinc-200"
                                  )}
                                >
                                  {fact.confidence}
                                </span>
                              </div>
                              <p className="mt-2 text-sm leading-6 text-zinc-300">{fact.value}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {reading.detailLines.length > 0 ? (
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
                          {reading.detailLines.map((line) => (
                            <li key={line} className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2">
                              {line}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
              No papers saved yet. Start by adding last year's return.
            </div>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.95fr)]">
        <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-white">Step 2: Answer a few easy questions</CardTitle>
            <p className="text-sm leading-6 text-zinc-300">
              If you are not sure about an answer, pick the closest fit or leave a note. Tina will ask for backup papers later when needed.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Business name</span>
                <p className="text-xs leading-5 text-zinc-400">The name on your tax return or business papers.</p>
                <Input
                  value={draft.profile.businessName}
                  onChange={(event) => updateProfile("businessName", event.target.value)}
                  placeholder="Tina's Feed & Field Services LLC"
                  className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Tax year</span>
                <p className="text-xs leading-5 text-zinc-400">The year you are filing for, like 2025.</p>
                <Input
                  value={draft.profile.taxYear}
                  onChange={(event) => updateProfile("taxYear", event.target.value)}
                  placeholder="2025"
                  className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Entity type</span>
                <p className="text-xs leading-5 text-zinc-400">What kind of business this is on paper. Choose "I'm not sure yet" if needed.</p>
                <select
                  value={draft.profile.entityType}
                  onChange={(event) => updateProfile("entityType", event.target.value as TinaEntityType)}
                  className="flex h-9 w-full rounded-[12px] border border-white/10 bg-white/5 px-3 py-1 text-sm text-white outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {ENTITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} className="bg-zinc-950 text-white">
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Accounting method</span>
                <p className="text-xs leading-5 text-zinc-400">Most small businesses use cash. If you do not know, that is okay.</p>
                <select
                  value={draft.profile.accountingMethod}
                  onChange={(event) => updateProfile("accountingMethod", event.target.value as TinaAccountingMethod)}
                  className="flex h-9 w-full rounded-[12px] border border-white/10 bg-white/5 px-3 py-1 text-sm text-white outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {ACCOUNTING_METHOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} className="bg-zinc-950 text-white">
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Formation state</span>
                <p className="text-xs leading-5 text-zinc-400">The state where the business was formed, like WA.</p>
                <Input
                  value={draft.profile.formationState}
                  onChange={(event) => updateProfile("formationState", event.target.value.toUpperCase())}
                  placeholder="WA"
                  className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Formation date</span>
                <p className="text-xs leading-5 text-zinc-400">When the business was started or formed.</p>
                <Input
                  type="date"
                  value={draft.profile.formationDate}
                  onChange={(event) => updateProfile("formationDate", event.target.value)}
                  className="border-white/10 bg-white/5 text-white"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">NAICS code or activity hint</span>
                <p className="text-xs leading-5 text-zinc-400">A short description like "landscaping" is enough if you do not know the code.</p>
                <Input
                  value={draft.profile.naicsCode}
                  onChange={(event) => updateProfile("naicsCode", event.target.value)}
                  placeholder="Example: 561730 or 'landscaping services'"
                  className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-zinc-200">
                <Checkbox
                  checked={draft.profile.hasPayroll}
                  onChange={(event) => updateProfile("hasPayroll", event.target.checked)}
                  className="mt-0.5 border-white/20 bg-white/5"
                />
                <span>We ran payroll / W-2 wages</span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-zinc-200">
                <Checkbox
                  checked={draft.profile.paysContractors}
                  onChange={(event) => updateProfile("paysContractors", event.target.checked)}
                  className="mt-0.5 border-white/20 bg-white/5"
                />
                <span>We paid contractors / 1099 vendors</span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-zinc-200">
                <Checkbox
                  checked={draft.profile.hasInventory}
                  onChange={(event) => updateProfile("hasInventory", event.target.checked)}
                  className="mt-0.5 border-white/20 bg-white/5"
                />
                <span>We hold inventory</span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-zinc-200">
                <Checkbox
                  checked={draft.profile.hasFixedAssets}
                  onChange={(event) => updateProfile("hasFixedAssets", event.target.checked)}
                  className="mt-0.5 border-white/20 bg-white/5"
                />
                <span>We bought or carry fixed assets</span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-zinc-200">
                <Checkbox
                  checked={draft.profile.collectsSalesTax}
                  onChange={(event) => updateProfile("collectsSalesTax", event.target.checked)}
                  className="mt-0.5 border-white/20 bg-white/5"
                />
                <span>We collect sales tax</span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-zinc-200">
                <Checkbox
                  checked={draft.profile.hasIdahoActivity}
                  onChange={(event) => updateProfile("hasIdahoActivity", event.target.checked)}
                  className="mt-0.5 border-white/20 bg-white/5"
                />
                <span>We had Idaho activity or possible nexus</span>
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Notes for Tina</span>
              <p className="text-xs leading-5 text-zinc-400">Tell Tina anything important in plain words.</p>
              <Textarea
                value={draft.profile.notes}
                onChange={(event) => updateProfile("notes", event.target.value)}
                placeholder="Anything Tina should know before she builds the document request list."
                className="min-h-[110px] border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
              />
            </label>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
            <CardHeader className="space-y-3">
              <CardTitle className="text-white">What Tina thinks your return type is</CardTitle>
              <p className="text-sm leading-6 text-zinc-300">
                Tina uses a rule-based check here so she does not guess. If she is not ready, she will say so clearly.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={cn("rounded-2xl border px-4 py-4", SUPPORT_STYLES[recommendation.support])}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">
                      Recommendation
                    </p>
                    <p className="mt-2 text-lg font-semibold">{recommendation.title}</p>
                  </div>
                  {recommendation.support === "supported" ? (
                    <ShieldCheck className="h-6 w-6" />
                  ) : (
                    <AlertTriangle className="h-6 w-6" />
                  )}
                </div>
                <p className="mt-3 text-sm leading-6 opacity-90">{recommendation.summary}</p>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Why Tina chose this</p>
                <ul className="space-y-2 text-sm leading-6 text-zinc-300">
                  {recommendation.reasons.map((reason) => (
                    <li key={reason} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>

              {recommendation.blockers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">What still needs an answer</p>
                  <ul className="space-y-2 text-sm leading-6 text-zinc-300">
                    {recommendation.blockers.map((blocker) => (
                      <li key={blocker} className="rounded-2xl border border-rose-300/14 bg-rose-300/8 px-4 py-3 text-rose-50">
                        {blocker}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-white">What Tina will ask for next</CardTitle>
              <p className="text-sm leading-6 text-zinc-300">
                This is Tina's first simple list of papers to gather. She should keep this list short, clear, and easy to follow.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {checklist.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]", PRIORITY_STYLES[item.priority])}>
                        {item.priority}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                          item.status === "covered"
                            ? "border-emerald-300/18 bg-emerald-300/8 text-emerald-50"
                            : "border-white/10 bg-white/5 text-zinc-200"
                        )}
                      >
                        {item.status === "covered" ? "covered" : "needed"}
                      </span>
                      {item.status === "needed" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                          onClick={() => beginChecklistUpload(item)}
                          disabled={isVaultBusy}
                        >
                          {uploadState === "uploading" && activeUploadTarget === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileUp className="h-4 w-4" />
                          )}
                          Add this paper
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{item.reason}</p>
                </div>
              ))}
              {neededChecklist.length === 0 ? (
                <div className="rounded-2xl border border-emerald-300/14 bg-emerald-300/8 px-4 py-3 text-sm leading-6 text-emerald-50">
                  Nice work. Tina has the first round of papers she needs and can keep moving.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
        <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
          <CardHeader className="space-y-3">
            <CardTitle className="text-white">Let Tina check what she has</CardTitle>
            <p className="text-sm leading-6 text-zinc-300">
              This is Tina&apos;s first setup check. She looks at your answers and saved papers, then tells you what is ready and what still needs help.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Review status</p>
                <p className="mt-2 text-sm font-medium text-white">
                  {review.status === "complete"
                    ? "Checked"
                    : review.status === "stale"
                      ? "Needs a fresh check"
                      : "Not checked yet"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Blocking items</p>
                <p className="mt-2 text-2xl font-semibold text-white">{blockingReviewCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Important next items</p>
                <p className="mt-2 text-2xl font-semibold text-white">{attentionReviewCount}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <p className="text-sm font-medium text-white">{review.summary}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">{review.nextStep}</p>
              {review.lastRunAt ? (
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                  Last checked {formatSavedAt(review.lastRunAt)}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runBootstrapReview} disabled={reviewState === "running"}>
                {reviewState === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {review.status === "complete" ? "Check again" : "Check my setup"}
              </Button>
              {reviewMessage ? (
                <p
                  className={cn(
                    "text-sm",
                    reviewState === "error" ? "text-amber-200" : "text-zinc-300"
                  )}
                >
                  {reviewMessage}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-white">What Tina already knows</CardTitle>
            <p className="text-sm leading-6 text-zinc-300">
              These are the basics Tina picked up from your answers and saved papers so far.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {review.facts.length > 0 ? (
              review.facts.map((fact) => (
                <div key={fact.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">{fact.label}</p>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                        fact.status === "review"
                          ? "border-amber-300/18 bg-amber-300/8 text-amber-50"
                          : "border-emerald-300/18 bg-emerald-300/8 text-emerald-50"
                      )}
                    >
                      {fact.status === "review" ? "review" : "ready"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{fact.value}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
                Tina has not built the first fact list yet. Ask her to check your setup when you are ready.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Tina&apos;s first inbox</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            This is the short list Tina wants you to know about right now. She keeps the hard stuff separate so the next step stays clear.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {openReviewItems.length > 0 ? (
            openReviewItems.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                      REVIEW_STYLES[item.severity]
                    )}
                  >
                    {item.severity === "needs_attention" ? "important" : item.severity}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{item.summary}</p>
                {renderIssueContext(item.documentId, item.factId)}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-emerald-300/14 bg-emerald-300/8 px-4 py-4 text-sm leading-6 text-emerald-50">
              Tina does not have any open setup issues yet. Run the setup check any time you want a fresh look.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Facts Tina pulled from papers</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            These are structured facts Tina pulled from saved papers so far. They are the first building blocks for deeper tax prep.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.sourceFacts.length > 0 ? (
            draft.sourceFacts.map((fact) => (
              <div key={fact.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">{fact.label}</p>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                      fact.confidence === "high"
                        ? "border-emerald-300/18 bg-emerald-300/8 text-emerald-50"
                        : fact.confidence === "medium"
                          ? "border-amber-300/18 bg-amber-300/8 text-amber-50"
                          : "border-white/10 bg-white/5 text-zinc-200"
                    )}
                  >
                    {fact.confidence}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{fact.value}</p>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
              Tina has not pulled structured facts from saved papers yet. Reading a prior return or other document is the best next step.
            </div>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,1fr)]">
        <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
          <CardHeader className="space-y-3">
            <CardTitle className="text-white">Let Tina look for conflicts</CardTitle>
            <p className="text-sm leading-6 text-zinc-300">
              This check is a little deeper than the setup review. Tina compares your answers, your saved papers, and the facts she already pulled out.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Conflict check</p>
                <p className="mt-2 text-sm font-medium text-white">
                  {issueQueue.status === "complete"
                    ? "Checked"
                    : issueQueue.status === "stale"
                      ? "Needs a fresh check"
                      : "Not checked yet"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Blocking conflicts</p>
                <p className="mt-2 text-2xl font-semibold text-white">{blockingIssueCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Important reviews</p>
                <p className="mt-2 text-2xl font-semibold text-white">{attentionIssueCount}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
              <p className="text-sm font-medium text-white">{issueQueue.summary}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">{issueQueue.nextStep}</p>
              {issueQueue.lastRunAt ? (
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                  Last checked {formatSavedAt(issueQueue.lastRunAt)}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runIssueQueueCheck} disabled={issueState === "running"}>
                {issueState === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                {issueQueue.status === "complete" ? "Check again" : "Check for conflicts"}
              </Button>
              {issueMessage ? (
                <p
                  className={cn(
                    "text-sm",
                    issueState === "error" ? "text-amber-200" : "text-zinc-300"
                  )}
                >
                  {issueMessage}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-white">Tina&apos;s prep board</CardTitle>
            <p className="text-sm leading-6 text-zinc-300">
              This is Tina&apos;s simple prep map. It shows which parts of the tax story feel ready and which parts still need a closer look.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {issueQueue.records.length > 0 ? (
              issueQueue.records.map((record) => (
                <div key={record.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">{record.label}</p>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                        PREP_RECORD_STYLES[record.status]
                      )}
                    >
                      {record.status === "needs_attention" ? "needs review" : record.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{record.summary}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
                Tina has not built the prep board yet. Run the conflict check when you want a deeper look.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Tina&apos;s first money story</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            This is Tina&apos;s first clean money picture from your papers. It is still early, but now the numbers have a paper trail.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Money story</p>
              <p className="mt-2 text-sm font-medium text-white">
                {getWorkpaperStatusLabel(workpapers)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Money lines</p>
              <p className="mt-2 text-2xl font-semibold text-white">{moneyLineCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Need review</p>
              <p className="mt-2 text-2xl font-semibold text-white">{workpaperAttentionCount}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
            <p className="text-sm font-medium text-white">{workpapers.summary}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{workpapers.nextStep}</p>
            {workpapers.lastRunAt ? (
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                Last built {formatSavedAt(workpapers.lastRunAt)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runWorkpaperBuild} disabled={workpaperState === "running"}>
              {workpaperState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {workpapers.status === "complete" ? "Build again" : "Build the money story"}
            </Button>
            {workpaperMessage ? (
              <p
                className={cn(
                  "text-sm",
                  workpaperState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {workpaperMessage}
              </p>
            ) : null}
          </div>

          {workpapers.lines.length > 0 ? (
            <div className="space-y-3">
              {workpapers.lines.map((line) => (
                <div key={line.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{line.label}</p>
                      <p className="mt-1 text-sm leading-6 text-zinc-300">{line.summary}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-zinc-300">
                        {line.kind.replace("_", " ")}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                          WORKPAPER_LINE_STYLES[line.status]
                        )}
                      >
                        {WORKPAPER_LINE_LABELS[line.status]}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {formatMoneyAmount(line.amount)}
                  </p>
                  {renderWorkpaperContext(line)}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
              Tina has not built any money lines yet. Once she has read your books or bank papers, this will become the start of her real workpapers.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Cleanup ideas Tina wants reviewed</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            These are Tina&apos;s next cleanup moves. They stay separate from tax adjustments until a human says yes.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Cleanup plan</p>
              <p className="mt-2 text-sm font-medium text-white">
                {cleanupPlan.status === "complete"
                  ? "Built"
                  : cleanupPlan.status === "stale"
                    ? "Needs a fresh build"
                    : cleanupPlan.lastRunAt
                      ? "Waiting on the money story"
                      : "Not built yet"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Cleanup ideas</p>
              <p className="mt-2 text-2xl font-semibold text-white">{cleanupPlan.suggestions.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Approved</p>
              <p className="mt-2 text-2xl font-semibold text-white">{cleanupApprovedCount}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
            <p className="text-sm font-medium text-white">{cleanupPlan.summary}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{cleanupPlan.nextStep}</p>
            {cleanupPlan.lastRunAt ? (
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                Last built {formatSavedAt(cleanupPlan.lastRunAt)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runCleanupBuild} disabled={cleanupState === "running"}>
              {cleanupState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {cleanupPlan.status === "complete" ? "Build again" : "Build cleanup ideas"}
            </Button>
            {cleanupMessage ? (
              <p
                className={cn(
                  "text-sm",
                  cleanupState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {cleanupMessage}
              </p>
            ) : null}
          </div>

          {cleanupPlan.suggestions.length > 0 ? (
            <div className="space-y-3">
              {cleanupPlan.suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{suggestion.title}</p>
                      <p className="mt-1 text-sm leading-6 text-zinc-300">{suggestion.summary}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                          CLEANUP_PRIORITY_STYLES[suggestion.priority]
                        )}
                      >
                        {CLEANUP_PRIORITY_LABELS[suggestion.priority]}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                          CLEANUP_STATUS_STYLES[suggestion.status]
                        )}
                      >
                        {CLEANUP_STATUS_LABELS[suggestion.status]}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    <span className="font-medium text-white">Why this matters:</span>{" "}
                    {suggestion.whyItMatters}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    <span className="font-medium text-white">What Tina wants to do:</span>{" "}
                    {suggestion.suggestedAction}
                  </p>
                  {renderCleanupContext(suggestion)}
                  <div className="mt-4 grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                    <label className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Review call
                      </span>
                      <select
                        className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                        value={suggestion.status}
                        onChange={(event) =>
                          updateCleanupSuggestion(suggestion.id, (current) => ({
                            ...current,
                            status: event.target.value as TinaCleanupSuggestionStatus,
                          }))
                        }
                      >
                        {Object.entries(CLEANUP_STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        Review note
                      </span>
                      <Textarea
                        value={suggestion.reviewerNotes}
                        onChange={(event) =>
                          updateCleanupSuggestion(suggestion.id, (current) => ({
                            ...current,
                            reviewerNotes: event.target.value,
                          }))
                        }
                        placeholder="What should Tina remember before this cleanup idea moves forward?"
                        className="min-h-24 border-white/10 bg-black/20 text-white placeholder:text-zinc-500"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
              Tina does not have cleanup ideas ready yet. She needs a trusted money story first.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">What Tina can safely carry forward</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            These are the approved cleanup lines Tina can carry into her `ai_cleanup` layer. They are still not tax adjustments.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">AI cleanup</p>
              <p className="mt-2 text-sm font-medium text-white">
                {aiCleanup.status === "complete"
                  ? "Built"
                  : aiCleanup.status === "stale"
                    ? "Needs a fresh build"
                    : aiCleanup.lastRunAt
                      ? "Waiting on approvals"
                      : "Not built yet"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">AI cleanup lines</p>
              <p className="mt-2 text-2xl font-semibold text-white">{aiCleanupLineCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Approved ideas</p>
              <p className="mt-2 text-2xl font-semibold text-white">{cleanupApprovedCount}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
            <p className="text-sm font-medium text-white">{aiCleanup.summary}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{aiCleanup.nextStep}</p>
            {aiCleanup.lastRunAt ? (
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                Last built {formatSavedAt(aiCleanup.lastRunAt)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runAiCleanupBuild} disabled={aiCleanupState === "running"}>
              {aiCleanupState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {aiCleanup.status === "complete" ? "Build again" : "Build AI cleanup"}
            </Button>
            {aiCleanupMessage ? (
              <p
                className={cn(
                  "text-sm",
                  aiCleanupState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {aiCleanupMessage}
              </p>
            ) : null}
          </div>

          {aiCleanup.lines.length > 0 ? (
            <div className="space-y-3">
              {aiCleanup.lines.map((line) => (
                <div key={line.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{line.label}</p>
                      <p className="mt-1 text-sm leading-6 text-zinc-300">{line.summary}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-zinc-300">
                        {line.layer.replace("_", " ")}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                          WORKPAPER_LINE_STYLES[line.status]
                        )}
                      >
                        {WORKPAPER_LINE_LABELS[line.status]}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {formatMoneyAmount(line.amount)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    {line.derivedFromLineIds.length > 0 ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                        From {line.derivedFromLineIds.length} original line{line.derivedFromLineIds.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {line.cleanupSuggestionIds.length > 0 ? (
                      <span className="rounded-full border border-emerald-300/18 bg-emerald-300/8 px-2.5 py-1 text-emerald-50">
                        Approved by {line.cleanupSuggestionIds.length} cleanup idea{line.cleanupSuggestionIds.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                  {renderWorkpaperContext(line)}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
              Tina does not have approved cleanup lines to carry forward yet. Approve the cleanup ideas you trust first.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Tax adjustments Tina wants checked</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            This is still not the real return. Tina is only building a careful review list for tax treatment.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Tax adjustments
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {taxAdjustments.status === "complete"
                  ? "Built"
                  : taxAdjustments.status === "stale"
                    ? "Needs a fresh build"
                    : taxAdjustments.lastRunAt
                      ? "Waiting on cleanup"
                      : "Not built yet"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Review items
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{taxAdjustmentCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Needs proof first
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {authorityBlockedAdjustmentCount}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
            <p className="text-sm font-medium text-white">{taxAdjustments.summary}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{taxAdjustments.nextStep}</p>
            {taxAdjustments.lastRunAt ? (
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                Last built {formatSavedAt(taxAdjustments.lastRunAt)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runTaxAdjustmentBuild} disabled={taxAdjustmentState === "running"}>
              {taxAdjustmentState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {taxAdjustments.status === "complete"
                ? "Build again"
                : "Build tax adjustments"}
            </Button>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-zinc-300">
              Approved by human: {approvedTaxAdjustmentCount}
            </div>
            {taxAdjustmentMessage ? (
              <p
                className={cn(
                  "text-sm",
                  taxAdjustmentState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {taxAdjustmentMessage}
              </p>
            ) : null}
          </div>

          {taxAdjustments.adjustments.length > 0 ? (
            <div className="space-y-3">
              {taxAdjustments.adjustments.map((adjustment) => {
                const authorityLocked =
                  adjustment.requiresAuthority && adjustment.status === "needs_authority";

                return (
                  <div
                    key={adjustment.id}
                    className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{adjustment.title}</p>
                        <p className="mt-1 text-sm leading-6 text-zinc-300">
                          {adjustment.summary}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                            TAX_ADJUSTMENT_STATUS_STYLES[adjustment.status]
                          )}
                        >
                          {TAX_ADJUSTMENT_STATUS_LABELS[adjustment.status]}
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                            TAX_ADJUSTMENT_RISK_STYLES[adjustment.risk]
                          )}
                        >
                          {TAX_ADJUSTMENT_RISK_LABELS[adjustment.risk]}
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 text-xl font-semibold text-white">
                      {formatMoneyAmount(adjustment.amount)}
                    </p>
                    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Tina suggests
                        </p>
                        <p className="mt-2 text-sm leading-6 text-zinc-200">
                          {adjustment.suggestedTreatment}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Why this matters
                        </p>
                        <p className="mt-2 text-sm leading-6 text-zinc-200">
                          {adjustment.whyItMatters}
                        </p>
                      </div>
                    </div>
                    {authorityLocked ? (
                      <div className="mt-3 rounded-2xl border border-amber-300/18 bg-amber-300/8 px-3 py-3 text-sm leading-6 text-amber-50">
                        Tina still needs real proof before this can move into human tax review.
                      </div>
                    ) : null}
                    {renderTaxAdjustmentContext(adjustment)}
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Review state
                        </span>
                        <select
                          className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                          value={adjustment.status}
                          onChange={(event) =>
                            updateTaxAdjustment(adjustment.id, (current) => ({
                              ...current,
                              status: event.target.value as TinaTaxAdjustment["status"],
                            }))
                          }
                        >
                          {authorityLocked ? (
                            <>
                              <option value="needs_authority">Needs proof first</option>
                              <option value="rejected">Rejected</option>
                            </>
                          ) : (
                            <>
                              <option value="ready_for_review">Ready for review</option>
                              <option value="approved">Approved</option>
                              <option value="rejected">Rejected</option>
                            </>
                          )}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Review note
                        </span>
                        <Textarea
                          value={adjustment.reviewerNotes}
                          onChange={(event) =>
                            updateTaxAdjustment(adjustment.id, (current) => ({
                              ...current,
                              reviewerNotes: event.target.value,
                            }))
                          }
                          placeholder="What should Tina remember before this tax move goes any further?"
                          className="min-h-24 border-white/10 bg-black/20 text-white placeholder:text-zinc-500"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
              Tina does not have tax adjustments ready yet. She needs approved cleanup lines first.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">What Tina could carry into the return next</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            These are the first return-facing review lines. Tina still needs a human before anything becomes a filing package.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Return-facing layer
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {reviewerFinal.status === "complete"
                  ? "Built"
                  : reviewerFinal.status === "stale"
                    ? "Needs a fresh build"
                    : reviewerFinal.lastRunAt
                      ? "Waiting on approvals"
                      : "Not built yet"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Review lines
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{reviewerFinalLineCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Still needs care
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {reviewerFinalAttentionCount}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
            <p className="text-sm font-medium text-white">{reviewerFinal.summary}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{reviewerFinal.nextStep}</p>
            {reviewerFinal.lastRunAt ? (
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                Last built {formatSavedAt(reviewerFinal.lastRunAt)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runReviewerFinalBuild} disabled={reviewerFinalState === "running"}>
              {reviewerFinalState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {reviewerFinal.status === "complete"
                ? "Build again"
                : "Build return-facing review"}
            </Button>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-zinc-300">
              Human-approved tax moves: {approvedTaxAdjustmentCount}
            </div>
            {reviewerFinalMessage ? (
              <p
                className={cn(
                  "text-sm",
                  reviewerFinalState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {reviewerFinalMessage}
              </p>
            ) : null}
          </div>

          {reviewerFinal.lines.length > 0 ? (
            <div className="space-y-3">
              {reviewerFinal.lines.map((line) => (
                <div key={line.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{line.label}</p>
                      <p className="mt-1 text-sm leading-6 text-zinc-300">{line.summary}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-zinc-300">
                        {line.layer.replace("_", " ")}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                          WORKPAPER_LINE_STYLES[line.status]
                        )}
                      >
                        {WORKPAPER_LINE_LABELS[line.status]}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {formatMoneyAmount(line.amount)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    {line.taxAdjustmentIds && line.taxAdjustmentIds.length > 0 ? (
                      <span className="rounded-full border border-emerald-300/18 bg-emerald-300/8 px-2.5 py-1 text-emerald-50">
                        From {line.taxAdjustmentIds.length} approved tax move
                        {line.taxAdjustmentIds.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {line.derivedFromLineIds.length > 0 ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                        From {line.derivedFromLineIds.length} AI cleanup line
                        {line.derivedFromLineIds.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                  {renderWorkpaperContext(line)}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
              Tina does not have return-facing review lines yet. Approve the tax adjustments you trust first.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Tina&apos;s first Schedule C draft</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            This is the first tiny form preview Tina can defend today. It is still not the finished return or filing package.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Schedule C draft
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {scheduleCDraft.status === "complete"
                  ? "Built"
                  : scheduleCDraft.status === "stale"
                    ? "Needs a fresh build"
                    : scheduleCDraft.lastRunAt
                      ? "Waiting on return lines"
                      : "Not built yet"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Draft boxes
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{scheduleCFieldCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Human review notes
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{scheduleCNoteCount}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
            <p className="text-sm font-medium text-white">{scheduleCDraft.summary}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{scheduleCDraft.nextStep}</p>
            {scheduleCDraft.lastRunAt ? (
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                Last built {formatSavedAt(scheduleCDraft.lastRunAt)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runScheduleCBuild} disabled={scheduleCState === "running"}>
              {scheduleCState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {scheduleCDraft.status === "complete" ? "Build again" : "Build Schedule C draft"}
            </Button>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-zinc-300">
              Return-facing lines ready: {reviewerFinalLineCount}
            </div>
            {scheduleCMessage ? (
              <p
                className={cn(
                  "text-sm",
                  scheduleCState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {scheduleCMessage}
              </p>
            ) : null}
          </div>

          {scheduleCDraft.fields.length > 0 ? (
            <div className="space-y-3">
              {scheduleCDraft.fields.map((field) => (
                <div key={field.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {field.lineNumber}: {field.label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-zinc-300">{field.summary}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                        WORKPAPER_LINE_STYLES[field.status]
                      )}
                    >
                      {WORKPAPER_LINE_LABELS[field.status]}
                    </span>
                  </div>
                  <p className="mt-3 text-xl font-semibold text-white">
                    {formatMoneyAmount(field.amount)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    {field.reviewerFinalLineIds.length > 0 ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                        From {field.reviewerFinalLineIds.length} return-facing line
                        {field.reviewerFinalLineIds.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {field.taxAdjustmentIds.length > 0 ? (
                      <span className="rounded-full border border-emerald-300/18 bg-emerald-300/8 px-2.5 py-1 text-emerald-50">
                        Backed by {field.taxAdjustmentIds.length} approved tax move
                        {field.taxAdjustmentIds.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                  {renderScheduleCFieldContext(field)}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
              Tina does not have a Schedule C draft yet. She needs supported return-facing lines first.
            </div>
          )}

          {scheduleCDraft.notes.length > 0 ? (
            <div className="space-y-3">
              {scheduleCDraft.notes.map((note) => (
                <div key={note.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">{note.title}</p>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                        REVIEW_STYLES[note.severity]
                      )}
                    >
                      {note.severity === "needs_attention" ? "important" : note.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{note.summary}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    {note.reviewerFinalLineIds.length > 0 ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                        Linked to {note.reviewerFinalLineIds.length} return-facing line
                        {note.reviewerFinalLineIds.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    {note.taxAdjustmentIds.length > 0 ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                        From {note.taxAdjustmentIds.length} tax move
                        {note.taxAdjustmentIds.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                  {renderScheduleCNoteContext(note)}
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">What still blocks the filing package</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            Tina uses this check to decide whether the package is blocked, still needs review, or is ready for CPA handoff.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Package state
              </p>
              <div className="mt-2">
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                    PACKAGE_LEVEL_STYLES[packageReadiness.level]
                  )}
                >
                  {PACKAGE_LEVEL_LABELS[packageReadiness.level]}
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Blocking items
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {packageReadinessBlockingCount}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Review items
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {packageReadinessReviewCount}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
            <p className="text-sm font-medium text-white">{packageReadiness.summary}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{packageReadiness.nextStep}</p>
            {packageReadiness.lastRunAt ? (
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                Last checked {formatSavedAt(packageReadiness.lastRunAt)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={runPackageReadinessBuild}
              disabled={packageReadinessState === "running"}
            >
              {packageReadinessState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {packageReadiness.status === "complete"
                ? "Check again"
                : "Check filing package"}
            </Button>
            {packageReadinessMessage ? (
              <p
                className={cn(
                  "text-sm",
                  packageReadinessState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {packageReadinessMessage}
              </p>
            ) : null}
          </div>

          {packageReadiness.items.length > 0 ? (
            <div className="space-y-3">
              {packageReadiness.items.map((item) => {
                const linkedDocument = item.sourceDocumentIds[0]
                  ? documentMap.get(item.sourceDocumentIds[0]) ?? null
                  : null;

                return (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">{item.title}</p>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                          item.severity === "blocking"
                            ? REVIEW_STYLES.blocking
                            : REVIEW_STYLES.needs_attention
                        )}
                      >
                        {item.severity === "blocking" ? "blocking" : "needs review"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">{item.summary}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      {item.relatedFieldIds.map((fieldId) => {
                        const field = scheduleCDraft.fields.find((candidate) => candidate.id === fieldId);
                        if (!field) return null;
                        return (
                          <span
                            key={`${item.id}-${fieldId}`}
                            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1"
                          >
                            Draft box: {field.lineNumber}
                          </span>
                        );
                      })}
                      {item.relatedNoteIds.map((noteId) => {
                        const note = scheduleCDraft.notes.find((candidate) => candidate.id === noteId);
                        if (!note) return null;
                        return (
                          <span
                            key={`${item.id}-${noteId}`}
                            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1"
                          >
                            Note: {note.title}
                          </span>
                        );
                      })}
                      {linkedDocument ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                          onClick={() => void openSavedDocument(linkedDocument)}
                          disabled={openingDocumentId === linkedDocument.id}
                        >
                          {openingDocumentId === linkedDocument.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ExternalLink className="h-4 w-4" />
                          )}
                          Open paper
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-300/14 bg-emerald-300/8 px-4 py-4 text-sm leading-6 text-emerald-50">
              Tina does not see anything blocking the filing package right now.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Paper-linked issues Tina found</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            These issues are tied to saved papers or facts Tina pulled from them. This is the start of Tina&apos;s real tax work queue.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {openIssueItems.length > 0 ? (
            openIssueItems.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                      REVIEW_STYLES[item.severity]
                    )}
                  >
                    {item.severity === "needs_attention" ? "important" : item.severity}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{item.summary}</p>
                {renderIssueContext(item.documentId, item.factId)}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-emerald-300/14 bg-emerald-300/8 px-4 py-4 text-sm leading-6 text-emerald-50">
              Tina does not see any paper-linked conflicts yet. As she reads more papers, this queue will become more useful.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">CPA handoff packet</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            This shows what Tina would hand to a reviewer right now, what is ready, and what still needs care before download makes sense.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Packet status
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {cpaHandoff.status === "complete"
                  ? "Built"
                  : cpaHandoff.status === "stale"
                    ? "Needs a fresh build"
                    : cpaHandoff.lastRunAt
                      ? "Waiting on packet pieces"
                      : "Not built yet"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Ready
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{cpaHandoffReadyCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Waiting
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{cpaHandoffWaitingCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Blocked
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{cpaHandoffBlockedCount}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
            <p className="text-sm font-medium text-white">{cpaHandoff.summary}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{cpaHandoff.nextStep}</p>
            {cpaHandoff.lastRunAt ? (
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                Last built {formatSavedAt(cpaHandoff.lastRunAt)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runCpaHandoffBuild} disabled={cpaHandoffState === "running"}>
              {cpaHandoffState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {cpaHandoff.status === "complete" ? "Build again" : "Build CPA packet"}
            </Button>
            {cpaHandoffMessage ? (
              <p
                className={cn(
                  "text-sm",
                  cpaHandoffState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {cpaHandoffMessage}
              </p>
            ) : null}
          </div>

          {cpaHandoff.artifacts.length > 0 ? (
            <div className="space-y-3">
              {cpaHandoff.artifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{artifact.title}</p>
                      <p className="mt-1 text-sm leading-6 text-zinc-300">{artifact.summary}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                        CPA_HANDOFF_ARTIFACT_STYLES[artifact.status]
                      )}
                    >
                      {CPA_HANDOFF_ARTIFACT_LABELS[artifact.status]}
                    </span>
                  </div>
                  {artifact.includes.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {artifact.includes.map((item) => (
                        <span
                          key={`${artifact.id}-${item}`}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {renderCpaHandoffArtifactContext(artifact)}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
              Tina has not laid out the CPA packet yet. Build it once the filing-package check is up to date.
            </div>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-white">What Tina wants to research next</CardTitle>
            <p className="text-sm leading-6 text-zinc-300">
              These are good ideas Tina wants to investigate for savings or safety. They are not going onto the return yet.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {researchIdeas.length > 0 ? (
              researchIdeas.map((idea) => (
                <div key={idea.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">{idea.title}</p>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                        RESEARCH_BUCKET_STYLES[idea.decisionBucket]
                      )}
                    >
                      {RESEARCH_BUCKET_LABELS[idea.decisionBucket]}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{idea.summary}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{idea.whyItMatters}</p>
                  {idea.sourceLabels.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {idea.sourceLabels.map((label) => (
                        <span
                          key={`${idea.id}-${label}`}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm leading-6 text-zinc-300">
                    <span className="font-medium text-white">Next step:</span> {idea.nextStep}
                  </div>
                  {renderIssueContext(idea.documentIds[0] ?? null, idea.factIds[0] ?? null)}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
                Tina has not built the first research list yet. More papers and cleaner facts will help her spot stronger opportunities.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-white">How Tina handles deep tax ideas</CardTitle>
            <p className="text-sm leading-6 text-zinc-300">
              Tina is allowed to think broadly, but she must prove ideas before they can change the return.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {researchPolicyLines.map((line) => (
              <div key={line} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm leading-6 text-zinc-300">
                {line}
              </div>
            ))}
            <div className="rounded-2xl border border-amber-300/14 bg-amber-300/8 px-4 py-4 text-sm leading-6 text-amber-50">
              Tina may use forums or community chatter to find leads, but she may only trust primary authority when it is time to file.
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">What Tina still has to prove</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            Each idea needs proof before it can affect the return. This is Tina&apos;s simple proof checklist.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {researchDossiers.length > 0 ? (
            researchDossiers.map((dossier) => {
              const authorityWork = authorityWorkMap.get(dossier.id);

              return (
                <div key={dossier.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">{dossier.title}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                          DOSSIER_STATUS_STYLES[dossier.status]
                        )}
                      >
                        {DOSSIER_STATUS_LABELS[dossier.status]}
                      </span>
                      {authorityWork ? (
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                            AUTHORITY_WORK_STATUS_STYLES[authorityWork.status]
                          )}
                        >
                          {AUTHORITY_WORK_STATUS_LABELS[authorityWork.status]}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{dossier.summary}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {dossier.steps.map((step) => (
                      <div
                        key={`${dossier.id}-${step.id}`}
                        className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-white">{step.label}</p>
                          <span
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                              DOSSIER_STEP_STYLES[step.status]
                            )}
                          >
                            {step.status}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-300">{step.reason}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm leading-6 text-zinc-300">
                    <span className="font-medium text-white">Authority step:</span> {dossier.nextStep}
                  </div>
                  {authorityWork ? (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                            AUTHORITY_REVIEWER_STYLES[
                              authorityWork.status === "rejected"
                                ? "do_not_use"
                                : authorityWork.status === "ready_for_reviewer" ||
                                    authorityWork.status === "reviewed"
                                  ? "can_consider"
                                  : "not_ready"
                            ]
                          )}
                        >
                          {AUTHORITY_REVIEWER_LABELS[
                            authorityWork.status === "rejected"
                              ? "do_not_use"
                              : authorityWork.status === "ready_for_reviewer" ||
                                  authorityWork.status === "reviewed"
                                ? "can_consider"
                                : "not_ready"
                          ]}
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-zinc-300">
                          disclosure: {AUTHORITY_DISCLOSURE_DECISION_LABELS[authorityWork.disclosureDecision]}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-zinc-300">{authorityWork.summary}</p>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">
                        <span className="font-medium text-white">What Tina will try to prove:</span>{" "}
                        {authorityWork.memoFocus}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">
                        <span className="font-medium text-white">Reviewer question:</span>{" "}
                        {authorityWork.reviewerQuestion}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {authorityWork.authorityTargets.map((target) => (
                          <span
                            key={`${dossier.id}-${target}`}
                            className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-[11px] text-zinc-300"
                          >
                            Need from law: {target}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <label className="space-y-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Work status
                          </span>
                          <select
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                            value={authorityWork.status}
                            onChange={(event) =>
                              updateAuthorityWorkItem(dossier.id, (current) => ({
                                ...current,
                                status: event.target.value as TinaAuthorityWorkStatus,
                              }))
                            }
                          >
                            {Object.entries(AUTHORITY_WORK_STATUS_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Reviewer call
                          </span>
                          <select
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                            value={authorityWork.reviewerDecision}
                            onChange={(event) =>
                              updateAuthorityWorkItem(dossier.id, (current) => ({
                                ...current,
                                reviewerDecision: event.target.value as TinaAuthorityReviewerDecision,
                              }))
                            }
                          >
                            {Object.entries(AUTHORITY_REVIEWER_DECISION_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Disclosure check
                          </span>
                          <select
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                            value={authorityWork.disclosureDecision}
                            onChange={(event) =>
                              updateAuthorityWorkItem(dossier.id, (current) => ({
                                ...current,
                                disclosureDecision:
                                  event.target.value as TinaAuthorityDisclosureDecision,
                              }))
                            }
                          >
                            {Object.entries(AUTHORITY_DISCLOSURE_DECISION_LABELS).map(
                              ([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              )
                            )}
                          </select>
                        </label>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void runAuthorityResearch(dossier.id)}
                          disabled={researchingIdeaId === dossier.id}
                        >
                          {researchingIdeaId === dossier.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCcw className="h-4 w-4" />
                          )}
                          {researchingIdeaId === dossier.id
                            ? "Researching..."
                            : authorityWork.lastAiRunAt
                              ? "Run again"
                              : "Let Tina research this"}
                        </Button>
                        {authorityWork.lastAiRunAt ? (
                          <p className="text-sm text-zinc-400">
                            Last AI run {formatSavedAt(authorityWork.lastAiRunAt)}
                          </p>
                        ) : null}
                        {authorityMessage && researchingIdeaId === null ? (
                          <p className="text-sm text-zinc-300">{authorityMessage}</p>
                        ) : null}
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        <label className="space-y-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Tina note
                          </span>
                          <Textarea
                            value={authorityWork.memo}
                            onChange={(event) =>
                              updateAuthorityWorkItem(dossier.id, (current) => ({
                                ...current,
                                memo: event.target.value,
                              }))
                            }
                            placeholder="Tina's plain-language note about this idea and what she still needs."
                            className="min-h-28 border-white/10 bg-black/20 text-white placeholder:text-zinc-500"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                            Reviewer note
                          </span>
                          <Textarea
                            value={authorityWork.reviewerNotes}
                            onChange={(event) =>
                              updateAuthorityWorkItem(dossier.id, (current) => ({
                                ...current,
                                reviewerNotes: event.target.value,
                              }))
                            }
                            placeholder="Human review note, decision reminder, or follow-up question."
                            className="min-h-28 border-white/10 bg-black/20 text-white placeholder:text-zinc-500"
                          />
                        </label>
                      </div>
                      <div className="mt-4 space-y-2">
                        <p className="text-sm font-medium text-white">What proof is still missing</p>
                        {authorityWork.missingAuthority.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {authorityWork.missingAuthority.map((item) => (
                              <span
                                key={`${dossier.id}-${item}`}
                                className="rounded-full border border-amber-300/18 bg-amber-300/8 px-2.5 py-1 text-[11px] text-amber-50"
                              >
                                {item}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm leading-6 text-zinc-300">
                            Tina has not listed any missing authority pieces yet.
                          </div>
                        )}
                      </div>
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-white">Sources Tina saved</p>
                            <p className="text-sm leading-6 text-zinc-400">
                              Save authority links and notes here as Tina or a reviewer finds them.
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                            onClick={() => addSourceToAuthorityWork(dossier.id)}
                          >
                            <FileText className="h-4 w-4" />
                            Add source
                          </Button>
                        </div>
                        {authorityWork.citations.length > 0 ? (
                          authorityWork.citations.map((citation) => (
                            <div
                              key={citation.id}
                              className="rounded-2xl border border-white/10 bg-black/15 px-3 py-3"
                            >
                              <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
                                <label className="space-y-2">
                                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                                    Source name
                                  </span>
                                  <Input
                                    value={citation.title}
                                    onChange={(event) =>
                                      updateAuthorityCitation(dossier.id, citation.id, (current) => ({
                                        ...current,
                                        title: event.target.value,
                                      }))
                                    }
                                    placeholder="IRS notice, WA DOR page, court case..."
                                    className="border-white/10 bg-black/20 text-white placeholder:text-zinc-500"
                                  />
                                </label>
                                <label className="space-y-2">
                                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                                    Link
                                  </span>
                                  <Input
                                    value={citation.url}
                                    onChange={(event) =>
                                      updateAuthorityCitation(dossier.id, citation.id, (current) => ({
                                        ...current,
                                        url: event.target.value,
                                      }))
                                    }
                                    placeholder="https://..."
                                    className="border-white/10 bg-black/20 text-white placeholder:text-zinc-500"
                                  />
                                </label>
                                <div className="flex items-end">
                                  <div className="flex flex-wrap gap-2">
                                    {citation.url ? (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        className="text-zinc-300 hover:bg-white/8 hover:text-white"
                                        asChild
                                      >
                                        <a href={citation.url} target="_blank" rel="noreferrer">
                                          <ExternalLink className="h-4 w-4" />
                                          Open
                                        </a>
                                      </Button>
                                    ) : null}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="text-zinc-300 hover:bg-white/8 hover:text-white"
                                      onClick={() => removeAuthorityCitation(dossier.id, citation.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Remove
                                    </Button>
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <label className="space-y-2">
                                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                                    Source type
                                  </span>
                                  <select
                                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                                    value={citation.sourceClass}
                                    onChange={(event) =>
                                      updateAuthorityCitation(dossier.id, citation.id, (current) => ({
                                        ...current,
                                        sourceClass:
                                          event.target.value as TinaAuthorityCitationSourceClass,
                                      }))
                                    }
                                  >
                                    {Object.entries(AUTHORITY_SOURCE_CLASS_LABELS).map(
                                      ([value, label]) => (
                                        <option key={value} value={value}>
                                          {label}
                                        </option>
                                      )
                                    )}
                                  </select>
                                </label>
                                <label className="space-y-2">
                                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                                    What this source does
                                  </span>
                                  <select
                                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none"
                                    value={citation.effect}
                                    onChange={(event) =>
                                      updateAuthorityCitation(dossier.id, citation.id, (current) => ({
                                        ...current,
                                        effect: event.target.value as TinaAuthorityCitationEffect,
                                      }))
                                    }
                                  >
                                    {Object.entries(AUTHORITY_CITATION_EFFECT_LABELS).map(
                                      ([value, label]) => (
                                        <option key={value} value={value}>
                                          {label}
                                        </option>
                                      )
                                    )}
                                  </select>
                                </label>
                              </div>
                              <label className="mt-3 block space-y-2">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                                  Source note
                                </span>
                                <Textarea
                                  value={citation.note}
                                  onChange={(event) =>
                                    updateAuthorityCitation(dossier.id, citation.id, (current) => ({
                                      ...current,
                                      note: event.target.value,
                                    }))
                                  }
                                  placeholder="Plain-language note about why this source helps, warns, or only provides background."
                                  className="min-h-24 border-white/10 bg-black/20 text-white placeholder:text-zinc-500"
                                />
                              </label>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
                            Tina has not saved any authority sources for this idea yet.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                  {renderIssueContext(dossier.documentIds[0] ?? null, dossier.factIds[0] ?? null)}
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
              Tina has not built any proof cards yet. As she finds more tax ideas, they will show up here with the proof they still need.
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Stage map</p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">The simple path Tina is building</h3>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {TINA_STAGES.map((stage) => (
            <TinaStageCard key={stage.id} stage={stage} />
          ))}
        </div>
      </section>
    </div>
  );
}
