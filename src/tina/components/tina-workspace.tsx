"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type RefObject, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
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
import { buildTinaArtifactManifest, type TinaArtifactManifestItem } from "@/tina/lib/artifact-manifest";
import {
  buildTinaAuthorityBackgroundProgress,
  buildTinaAuthorityBackgroundQueueState,
  buildTinaAuthorityWorkItems,
  createDefaultTinaAuthorityCitation,
  isTinaAuthorityBackgroundRunActive,
} from "@/tina/lib/authority-work";
import {
  createPlanningLiveSyncTinaBooksConnection,
  createUploadOnlyTinaBooksConnection,
} from "@/tina/lib/books-connection";
import { buildTinaChecklist } from "@/tina/lib/checklist";
import { findTinaDocumentReading } from "@/tina/lib/document-readings";
import { canConfirmTinaFinalSignoff } from "@/tina/lib/final-signoff";
import { canExportTinaOfficialFormPacket } from "@/tina/lib/official-form-coverage";
import { selectTinaVisibleChecklist } from "@/tina/lib/next-asks";
import { buildTinaPacketComparison } from "@/tina/lib/packet-comparison";
import { buildTinaResearchDossiers } from "@/tina/lib/research-dossiers";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import {
  TINA_IRS_AUTHORITY_REGISTRY_VERIFIED_AT,
  TINA_IRS_AUTHORITY_SUPPORTED_TAX_YEAR,
  getTinaIrsAuthorityRegistryStatus,
  listTinaIrsAuthoritySources,
} from "@/tina/lib/irs-authority-registry";
import { buildTinaResearchIdeas } from "@/tina/lib/research-ideas";
import { describeTinaResearchPolicy } from "@/tina/lib/research-policy";
import { resolveTinaPriorReturnDocument } from "@/tina/lib/workspace-draft";
import type {
  TinaAiCleanupSnapshot,
  TinaAccountingMethod,
  TinaAuthorityBackgroundRun,
  TinaAuthorityCitationEffect,
  TinaAuthorityCitationSourceClass,
  TinaAuthorityChallengeVerdict,
  TinaAuthorityDisclosureDecision,
  TinaAuthorityReviewerDecision,
  TinaAuthorityWorkStatus,
  TinaBooksConnectionStatus,
  TinaBooksImportSnapshot,
  TinaBooksImportDocumentStatus,
  TinaBootstrapReview,
  TinaChecklistAction,
  TinaChecklistItem,
  TinaCleanupPlan,
  TinaCleanupSuggestion,
  TinaCleanupSuggestionPriority,
  TinaCleanupSuggestionStatus,
  TinaDocumentReading,
  TinaEntityType,
  TinaCpaHandoffSnapshot,
  TinaFinalSignoffSnapshot,
  TinaIssueQueue,
  TinaLlcCommunityPropertyStatus,
  TinaLlcFederalTaxTreatment,
  TinaOfficialFormDraft,
  TinaOfficialFormPacketSnapshot,
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

function formatShortDate(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatEstimatedRemainingDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));

  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}:${minutes.toString().padStart(2, "0")}`;
  }

  return `${totalMinutes} min`;
}

function getAuthorityRunButtonLabel(
  run: TinaAuthorityBackgroundRun,
  options: {
    idleLabel: string;
    rerunLabel: string;
    queuedLabel: string;
    runningLabel: string;
    rateLimitedLabel: string;
  }
): string {
  switch (run.status) {
    case "queued":
      return options.queuedLabel;
    case "running":
      return options.runningLabel;
    case "rate_limited":
      return options.rateLimitedLabel;
    default:
      return run.finishedAt ? options.rerunLabel : options.idleLabel;
  }
}

function getAuthorityRunSummary(
  run: TinaAuthorityBackgroundRun,
  waitingLabel: string
): string | null {
  if (run.status === "queued") {
    return "Tina queued this deeper pass and will keep working while you stay in the workspace.";
  }
  if (run.status === "running") {
    return "Tina is working on this in the background.";
  }
  if (run.status === "rate_limited") {
    return run.retryAt
      ? `${waitingLabel} ${formatSavedAt(run.retryAt)}.`
      : `${waitingLabel} in a moment.`;
  }
  if (run.status === "failed" && run.error) {
    return run.error;
  }
  return null;
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

function getBooksImportStatusLabel(status: TinaWorkpaperSnapshot["status"]): string {
  if (status === "complete") return "sorted";
  if (status === "stale") return "needs a fresh sort";
  if (status === "running") return "sorting";
  return "not sorted yet";
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

const LLC_TAX_TREATMENT_OPTIONS: Array<{
  value: TinaLlcFederalTaxTreatment;
  label: string;
}> = [
  { value: "default", label: "Use the normal IRS default" },
  { value: "owner_return", label: "On the owner's return" },
  { value: "partnership_return", label: "As a partnership return" },
  { value: "s_corp_return", label: "As an S-corp return" },
  { value: "c_corp_return", label: "As a corporation return" },
  { value: "unsure", label: "I'm not sure yet" },
];

const LLC_COMMUNITY_PROPERTY_OPTIONS: Array<{
  value: TinaLlcCommunityPropertyStatus;
  label: string;
}> = [
  { value: "unsure", label: "I'm not sure yet" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const SUPPORT_STYLES = {
  supported: "border-emerald-300/20 bg-emerald-300/10 text-emerald-50",
  future: "border-amber-300/20 bg-amber-300/10 text-amber-50",
  blocked: "border-rose-300/20 bg-rose-300/10 text-rose-50",
} as const;

const BOOKS_CONNECTION_STYLES = {
  not_connected: "border-white/10 bg-white/5 text-zinc-200",
  upload_only: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  planning_live_sync: "border-sky-300/18 bg-sky-300/8 text-sky-50",
  connected: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  needs_attention: "border-amber-300/18 bg-amber-300/8 text-amber-50",
} as const;

const BOOKS_CONNECTION_LABELS: Record<TinaBooksConnectionStatus, string> = {
  not_connected: "not connected",
  upload_only: "using uploads",
  planning_live_sync: "live sync later",
  connected: "connected",
  needs_attention: "needs help",
};

const BOOKS_IMPORT_DOCUMENT_STYLES = {
  ready: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  needs_attention: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  waiting: "border-white/10 bg-white/5 text-zinc-200",
} as const;

const BOOKS_IMPORT_DOCUMENT_LABELS: Record<TinaBooksImportDocumentStatus, string> = {
  ready: "ready",
  needs_attention: "needs attention",
  waiting: "waiting",
};

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

function getChecklistActionLabel(item: TinaChecklistItem): string {
  if (item.actionLabel) return item.actionLabel;
  if (item.action === "answer") return "Answer this above";
  if (item.action === "review") return "Review this with Tina";

  switch (item.id) {
    case "prior-return":
      return "Add last year's return";
    case "quickbooks":
      return "Add QuickBooks or P&L";
    case "bank-support":
      return "Add bank statements";
    case "contractors":
      return "Add contractor papers";
    case "payroll":
      return "Add payroll papers";
    case "sales-tax":
      return "Add sales tax papers";
    case "inventory":
      return "Add inventory papers";
    case "assets":
      return "Add big purchase papers";
    default:
      return "Add this paper";
  }
}

function getChecklistSourceLabel(item: TinaChecklistItem): string {
  if (item.kind === "replacement") return "full-year fix";
  if (item.source === "document_clue") return "paper clue";
  if (item.source === "lane_support") return "human check";
  return "starter step";
}

function getChecklistSourceSummary(item: TinaChecklistItem): string {
  if (item.kind === "replacement") {
    return "Tina is asking for a fuller year view before she trusts these books.";
  }
  if (item.source === "document_clue") {
    return "Tina is asking because one of your saved papers hinted at this.";
  }
  if (item.source === "lane_support") {
    return "Tina is asking for a human check before she goes deeper here.";
  }
  return "This is part of Tina's normal starter list.";
}

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

const FINAL_SIGNOFF_LEVEL_STYLES = {
  blocked: "border-rose-300/18 bg-rose-300/8 text-rose-50",
  waiting: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  ready: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
} as const;

const FINAL_SIGNOFF_LEVEL_LABELS = {
  blocked: "blocked",
  waiting: "waiting on review",
  ready: "ready for final signoff",
} as const;

const ARTIFACT_STATUS_STYLES = {
  ready: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  waiting: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  blocked: "border-rose-300/18 bg-rose-300/8 text-rose-50",
} as const;

const ARTIFACT_STATUS_LABELS = {
  ready: "ready",
  waiting: "waiting",
  blocked: "blocked",
} as const;

const PACKET_COMPARISON_STYLES = {
  same: "border-white/10 bg-white/5 text-zinc-100",
  calmer: "border-emerald-300/18 bg-emerald-300/8 text-emerald-100",
  riskier: "border-rose-300/18 bg-rose-300/8 text-rose-100",
  different: "border-amber-300/18 bg-amber-300/8 text-amber-100",
} as const;

const ARTIFACT_DELIVERY_STYLES = {
  bundle_only: "border-white/10 bg-white/5 text-zinc-200",
  direct: "border-sky-300/18 bg-sky-300/8 text-sky-50",
  bundle_and_direct: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
} as const;

const ARTIFACT_DELIVERY_LABELS = {
  bundle_only: "inside bundle",
  direct: "own download",
  bundle_and_direct: "bundle + own download",
} as const;

const OFFICIAL_FORM_STATUS_STYLES = {
  ready: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  needs_review: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  blocked: "border-rose-300/18 bg-rose-300/8 text-rose-50",
} as const;

const OFFICIAL_FORM_STATUS_LABELS = {
  ready: "ready",
  needs_review: "needs review",
  blocked: "blocked",
} as const;

const OFFICIAL_FORM_LINE_STYLES = {
  filled: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  review: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  blank: "border-white/10 bg-white/5 text-zinc-200",
} as const;

const OFFICIAL_FORM_LINE_LABELS = {
  filled: "filled",
  review: "needs review",
  blank: "blank",
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

const AUTHORITY_CHALLENGE_STYLES: Record<TinaAuthorityChallengeVerdict, string> = {
  not_run: "border-white/10 bg-white/5 text-zinc-200",
  did_not_finish: "border-orange-300/18 bg-orange-300/8 text-orange-50",
  survives: "border-emerald-300/18 bg-emerald-300/8 text-emerald-50",
  needs_care: "border-amber-300/18 bg-amber-300/8 text-amber-50",
  likely_fails: "border-rose-300/18 bg-rose-300/8 text-rose-50",
};

const AUTHORITY_CHALLENGE_LABELS: Record<TinaAuthorityChallengeVerdict, string> = {
  not_run: "not stress-tested",
  did_not_finish: "stress test did not finish",
  survives: "survives stress test",
  needs_care: "survives with caution",
  likely_fails: "likely fails",
};

export function TinaWorkspace() {
  const searchParams = useSearchParams();
  const {
    draft,
    irsAuthorityWatchStatus,
    packetVersions,
    selectedPacketVersion,
    selectedPacketState,
    openingPacketFingerprint,
    selectedPacketMessage,
    hydrated,
    syncStatus,
    refreshPacketVersions,
    saveDraftNow,
    pauseDraftSync,
    resumeDraftSync,
    openPacketVersion,
    clearSelectedPacketVersion,
    updateProfile,
    attachPriorReturn,
    clearPriorReturn,
    addUploadedDocument,
    removeDocument,
    saveDocumentReading,
    updateBooksConnection,
    saveBooksImport,
    saveBootstrapReview,
    saveIssueQueue,
    saveWorkpapers,
    saveCleanupPlan,
    saveAiCleanup,
    saveTaxAdjustments,
    saveReviewerFinal,
    saveScheduleCDraft,
    saveOfficialFormPacket,
    savePackageReadiness,
    saveCpaHandoff,
    saveFinalSignoff,
    updateCleanupSuggestion,
    updateTaxAdjustment,
    saveAuthorityWorkItem,
    updateAuthorityWorkItem,
    addAuthorityCitation,
    updateAuthorityCitation,
    removeAuthorityCitation,
    updateFinalSignoffCheck,
    updateFinalSignoffReviewerName,
    updateFinalSignoffReviewerNote,
    confirmFinalSignoff,
    clearFinalSignoffConfirmation,
    resetDraft,
  } = useTinaDraft();
  const inputId = useId();
  const supportingInputId = useId();
  const supportingInputRef = useRef<HTMLInputElement | null>(null);
  const organizerSectionRef = useRef<HTMLDivElement | null>(null);
  const returnTypeSectionRef = useRef<HTMLDivElement | null>(null);
  const naicsFieldRef = useRef<HTMLLabelElement | null>(null);
  const idahoFieldRef = useRef<HTMLLabelElement | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "error">("idle");
  const [reviewState, setReviewState] = useState<"idle" | "running" | "error">("idle");
  const [issueState, setIssueState] = useState<"idle" | "running" | "error">("idle");
  const [readingDocumentId, setReadingDocumentId] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [issueMessage, setIssueMessage] = useState<string | null>(null);
  const [booksImportMessage, setBooksImportMessage] = useState<string | null>(null);
  const [workpaperMessage, setWorkpaperMessage] = useState<string | null>(null);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [aiCleanupMessage, setAiCleanupMessage] = useState<string | null>(null);
  const [taxAdjustmentMessage, setTaxAdjustmentMessage] = useState<string | null>(null);
  const [reviewerFinalMessage, setReviewerFinalMessage] = useState<string | null>(null);
  const [scheduleCMessage, setScheduleCMessage] = useState<string | null>(null);
  const [officialFormMessage, setOfficialFormMessage] = useState<string | null>(null);
  const [officialFormDownloadMessage, setOfficialFormDownloadMessage] = useState<string | null>(null);
  const [officialFormPdfMessage, setOfficialFormPdfMessage] = useState<string | null>(null);
  const [packageReadinessMessage, setPackageReadinessMessage] = useState<string | null>(null);
  const [cpaHandoffMessage, setCpaHandoffMessage] = useState<string | null>(null);
  const [cpaDownloadMessage, setCpaDownloadMessage] = useState<string | null>(null);
  const [htmlPacketMessage, setHtmlPacketMessage] = useState<string | null>(null);
  const [reviewBookMessage, setReviewBookMessage] = useState<string | null>(null);
  const [finalSignoffMessage, setFinalSignoffMessage] = useState<string | null>(null);
  const [bundleDownloadMessage, setBundleDownloadMessage] = useState<string | null>(null);
  const [authorityMessage, setAuthorityMessage] = useState<string | null>(null);
  const [challengeMessage, setChallengeMessage] = useState<string | null>(null);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
  const [removingDocumentId, setRemovingDocumentId] = useState<string | null>(null);
  const [activeUploadTarget, setActiveUploadTarget] = useState<string | null>(null);
  const [researchingIdeaId, setResearchingIdeaId] = useState<string | null>(null);
  const [challengingIdeaId, setChallengingIdeaId] = useState<string | null>(null);
  const [authorityProgressNow, setAuthorityProgressNow] = useState(() => Date.now());
  const [authorityQueueNow, setAuthorityQueueNow] = useState(() => Date.now());
  const [selectedChecklistItem, setSelectedChecklistItem] = useState<TinaChecklistItem | null>(null);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [workpaperState, setWorkpaperState] = useState<"idle" | "running" | "error">("idle");
  const [booksImportState, setBooksImportState] = useState<"idle" | "running" | "error">("idle");
  const [cleanupState, setCleanupState] = useState<"idle" | "running" | "error">("idle");
  const [aiCleanupState, setAiCleanupState] = useState<"idle" | "running" | "error">("idle");
  const [taxAdjustmentState, setTaxAdjustmentState] = useState<"idle" | "running" | "error">(
    "idle"
  );
  const [reviewerFinalState, setReviewerFinalState] = useState<"idle" | "running" | "error">(
    "idle"
  );
  const [scheduleCState, setScheduleCState] = useState<"idle" | "running" | "error">("idle");
  const [officialFormState, setOfficialFormState] = useState<"idle" | "running" | "error">("idle");
  const [officialFormDownloadState, setOfficialFormDownloadState] = useState<
    "idle" | "running" | "error"
  >("idle");
  const [officialFormPdfState, setOfficialFormPdfState] = useState<"idle" | "running" | "error">(
    "idle"
  );
  const [packageReadinessState, setPackageReadinessState] = useState<
    "idle" | "running" | "error"
  >("idle");
  const [cpaHandoffState, setCpaHandoffState] = useState<"idle" | "running" | "error">("idle");
  const [cpaDownloadState, setCpaDownloadState] = useState<"idle" | "running" | "error">("idle");
  const [htmlPacketState, setHtmlPacketState] = useState<"idle" | "running" | "error">("idle");
  const [reviewBookState, setReviewBookState] = useState<"idle" | "running" | "error">("idle");
  const [finalSignoffState, setFinalSignoffState] = useState<"idle" | "running" | "error">("idle");
  const [bundleDownloadState, setBundleDownloadState] = useState<"idle" | "running" | "error">("idle");
  const recommendation = recommendTinaFilingLane(draft.profile, draft.sourceFacts);
  const artifactManifest = useMemo(() => buildTinaArtifactManifest(draft), [draft]);
  const selectedPacketArtifactManifest = useMemo(
    () => (selectedPacketVersion ? buildTinaArtifactManifest(selectedPacketVersion.draft) : null),
    [selectedPacketVersion]
  );
  const selectedPacketComparison = useMemo(
    () =>
      selectedPacketVersion ? buildTinaPacketComparison(selectedPacketVersion.draft, draft) : null,
    [draft, selectedPacketVersion]
  );
  const checklist = buildTinaChecklist(draft, recommendation);
  const neededChecklist = checklist.filter((item) => item.status === "needed");
  const visibleChecklist = selectTinaVisibleChecklist(checklist, 3);
  const hiddenChecklistCount = Math.max(neededChecklist.length - visibleChecklist.length, 0);
  const quickbooksChecklistItem = checklist.find((item) => item.id === "quickbooks") ?? null;
  const review = draft.bootstrapReview;
  const issueQueue = draft.issueQueue;
  const booksConnection = draft.booksConnection;
  const booksImport = draft.booksImport;
  const workpapers = draft.workpapers;
  const cleanupPlan = draft.cleanupPlan;
  const aiCleanup = draft.aiCleanup;
  const taxAdjustments = draft.taxAdjustments;
  const reviewerFinal = draft.reviewerFinal;
  const scheduleCDraft = draft.scheduleCDraft;
  const officialFormPacket = draft.officialFormPacket;
  const packageReadiness = draft.packageReadiness;
  const cpaHandoff = draft.cpaHandoff;
  const finalSignoff = draft.finalSignoff;
  const storedPriorReturn = useMemo(() => resolveTinaPriorReturnDocument(draft), [draft]);
  const quickbooksDocuments = useMemo(
    () => draft.documents.filter((document) => document.requestId === "quickbooks"),
    [draft.documents]
  );
  const researchIdeas = useMemo(() => buildTinaResearchIdeas(draft), [draft]);
  const researchDossiers = useMemo(() => buildTinaResearchDossiers(draft), [draft]);
  const authorityWorkItems = useMemo(() => buildTinaAuthorityWorkItems(draft), [draft]);
  const authorityBackgroundProgress = useMemo(
    () => buildTinaAuthorityBackgroundProgress(authorityWorkItems, authorityProgressNow),
    [authorityProgressNow, authorityWorkItems]
  );
  const authorityQueueState = useMemo(
    () => buildTinaAuthorityBackgroundQueueState(authorityWorkItems, { now: authorityQueueNow }),
    [authorityQueueNow, authorityWorkItems]
  );
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

  useEffect(() => {
    if (authorityBackgroundProgress.remainingTaskCount === 0) return;

    setAuthorityProgressNow(Date.now());
    const interval = window.setInterval(() => {
      setAuthorityProgressNow(Date.now());
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [authorityBackgroundProgress.remainingTaskCount]);

  useEffect(() => {
    if (!authorityQueueState.hasPendingWork) return;
    if (researchingIdeaId !== null || challengingIdeaId !== null) return;

    const delayMs = authorityQueueState.nextPollDelayMs ?? 0;
    const timeout = window.setTimeout(() => {
      void processAuthorityQueue(authorityQueueState.nextTask);
    }, delayMs);

    return () => window.clearTimeout(timeout);
  }, [
    authorityQueueState,
    challengingIdeaId,
    researchingIdeaId,
  ]);

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
  const officialFormCount = officialFormPacket.forms.length;
  const officialFormLineCount = officialFormPacket.forms.reduce(
    (total, form) => total + form.lines.length,
    0
  );
  const officialFormPacketExportReady = canExportTinaOfficialFormPacket(draft, {
    irsAuthorityWatchStatus,
  });
  const irsAuthorityStatus = getTinaIrsAuthorityRegistryStatus(
    recommendation.laneId,
    draft.profile.taxYear
  );
  const irsAuthoritySourceCount = listTinaIrsAuthoritySources({
    laneId: recommendation.laneId,
    includeAnnualWatch: true,
    includeSupportingReference: true,
  }).length;
  const hasExplicitPacketTaxYear = /^\d{4}$/.test(draft.profile.taxYear.trim());
  const irsAuthorityStatusLabel = !hasExplicitPacketTaxYear
    ? "Waiting on tax year"
    : irsAuthorityStatus.level === "ready"
      ? `${draft.profile.taxYear.trim()} certified`
      : `${draft.profile.taxYear.trim()} not certified`;
  const irsWatchStatusLabel =
    !irsAuthorityWatchStatus
      ? "Watch unavailable"
      : irsAuthorityWatchStatus.level === "not_run"
        ? "Watch not run"
        : irsAuthorityWatchStatus.level === "needs_review"
          ? "Review watch"
          : irsAuthorityWatchStatus.newCount === irsAuthorityWatchStatus.checkedCount &&
              irsAuthorityWatchStatus.checkedCount > 0
            ? "Baseline ready"
            : "Watch clean";
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
  const finalSignoffCheckedCount = finalSignoff.checks.filter((check) => check.checked).length;
  const canConfirmFinalSignoff = canConfirmTinaFinalSignoff(finalSignoff);
  const artifactManifestReadyCount = artifactManifest.readyCount;
  const artifactManifestWaitingCount = artifactManifest.waitingCount;
  const artifactManifestBlockedCount = artifactManifest.blockedCount;
  const fullHandoffPacketItem =
    artifactManifest.items.find((item) => item.id === "full-handoff-packet") ?? null;
  const restoredPacketFingerprint = searchParams.get("restoredPacket");
  const latestStoredPacketVersion = packetVersions[0] ?? null;
  const selectedPacketMatchesLive =
    selectedPacketVersion?.fingerprint === artifactManifest.packetIdentity.fingerprint;
  const selectedPacketLabel = selectedPacketVersion
    ? `${selectedPacketVersion.packetId} (${selectedPacketVersion.packetVersion})`
    : null;
  const selectedPacketReadyCount = selectedPacketArtifactManifest?.readyCount ?? 0;
  const selectedPacketWaitingCount = selectedPacketArtifactManifest?.waitingCount ?? 0;
  const selectedPacketBlockedCount = selectedPacketArtifactManifest?.blockedCount ?? 0;
  const currentChecklistFocus = visibleChecklist[0] ?? null;
  const upcomingChecklist = currentChecklistFocus
    ? visibleChecklist.filter((item) => item.id !== currentChecklistFocus.id)
    : visibleChecklist;
  const currentChecklistFocusTitle = currentChecklistFocus
    ? currentChecklistFocus.action === "upload"
      ? `Next, add ${currentChecklistFocus.focusLabel ?? currentChecklistFocus.label.toLowerCase()}.`
      : currentChecklistFocus.action === "answer"
        ? `Next, answer ${currentChecklistFocus.focusLabel ?? currentChecklistFocus.label.toLowerCase()}.`
        : `Next, check ${currentChecklistFocus.focusLabel ?? currentChecklistFocus.label.toLowerCase()}.`
    : "Tina has the first round of basics she needs.";
  const currentChecklistFocusSummary = currentChecklistFocus
    ? currentChecklistFocus.reason
    : "Tina can keep moving with what she already has, and the deeper review tools are ready when you want them.";

  async function withPacketExportBody<T>(
    packetFingerprint: string | undefined,
    run: (body: string) => Promise<T>
  ) {
    pauseDraftSync();

    try {
      const body = packetFingerprint
        ? JSON.stringify({ packetFingerprint })
        : JSON.stringify({ draft: await saveDraftNow() });

      return await run(body);
    } finally {
      resumeDraftSync();
    }
  }

  async function getFreshDraftForAction() {
    pauseDraftSync();

    try {
      return await saveDraftNow();
    } finally {
      resumeDraftSync();
    }
  }

  function formatPacketOriginLabel(origin: string) {
    return origin.replace(/_/g, " ");
  }

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
    setAuthorityMessage("Tina queued a deeper authority pass and will keep working in the background.");

    try {
      await getFreshDraftForAction();
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/research/run", {
        method: "POST",
        headers,
        body: JSON.stringify({ ideaId, action: "queue" }),
      });

      const payload = (await res.json()) as {
        workItem?: ReturnType<typeof buildTinaAuthorityWorkItems>[number];
        error?: string;
      };

      if (!res.ok || !payload.workItem) {
        throw new Error(payload.error || "research failed");
      }

      saveAuthorityWorkItem(payload.workItem);
      setAuthorityMessage("Tina queued the authority pass. You can keep moving while she works.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Tina could not finish this authority search.";
      setAuthorityMessage(message);
    } finally {
      setResearchingIdeaId(null);
    }
  }

  async function runAuthorityChallenge(ideaId: string) {
    setChallengingIdeaId(ideaId);
    setChallengeMessage("Tina queued the stress test and will keep working in the background.");

    try {
      await getFreshDraftForAction();
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/research/challenge", {
        method: "POST",
        headers,
        body: JSON.stringify({ ideaId, action: "queue" }),
      });

      const payload = (await res.json()) as {
        workItem?: ReturnType<typeof buildTinaAuthorityWorkItems>[number];
        error?: string;
      };

      if (!res.ok || !payload.workItem) {
        throw new Error(payload.error || "challenge failed");
      }

      saveAuthorityWorkItem(payload.workItem);
      setChallengeMessage("Tina queued the stress test. You can keep moving while she works.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Tina could not finish this stress test.";
      setChallengeMessage(message);
    } finally {
      setChallengingIdeaId(null);
    }
  }

  async function processAuthorityQueue(
    expectedTask:
      | {
          kind: "research" | "challenge";
          ideaId: string;
        }
      | null
  ) {
    if (expectedTask?.kind === "research") {
      setResearchingIdeaId(expectedTask.ideaId);
    } else if (expectedTask?.kind === "challenge") {
      setChallengingIdeaId(expectedTask.ideaId);
    }

    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/research/process-queue", {
        method: "POST",
        headers,
      });

      const payload = (await res.json()) as {
        processed?: boolean;
        task?: {
          kind: "research" | "challenge";
          ideaId: string;
        } | null;
        workItem?: ReturnType<typeof buildTinaAuthorityWorkItems>[number] | null;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(payload.error || "authority queue failed");
      }

      if (payload.workItem) {
        saveAuthorityWorkItem(payload.workItem);
      }

      const completedTask = payload.task ?? expectedTask;
      if (!payload.processed || !payload.workItem || !completedTask) {
        return;
      }

      if (completedTask.kind === "research") {
        if (payload.workItem.researchRun.status === "succeeded") {
          setAuthorityMessage("Tina finished the authority search and saved the result.");
        } else if (payload.workItem.researchRun.status === "rate_limited") {
          setAuthorityMessage("Tina hit a temporary limit, saved her place, and will retry soon.");
        } else if (payload.workItem.researchRun.status === "failed") {
          setAuthorityMessage(
            payload.workItem.researchRun.error || "Tina could not finish this authority search."
          );
        }
        return;
      }

      if (payload.workItem.challengeRun.status === "succeeded") {
        setChallengeMessage("Tina finished the stress test and saved the weak spots.");
      } else if (payload.workItem.challengeRun.status === "rate_limited") {
        setChallengeMessage("Tina hit a temporary limit, saved her place, and will retry soon.");
      } else if (payload.workItem.challengeRun.status === "failed") {
        setChallengeMessage(
          payload.workItem.challengeRun.error || "Tina could not finish this stress test."
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : expectedTask?.kind === "challenge"
            ? "Tina could not finish this stress test."
            : "Tina could not finish this authority search.";

      if (expectedTask?.kind === "challenge") {
        setChallengeMessage(message);
      } else {
        setAuthorityMessage(message);
      }
    } finally {
      setResearchingIdeaId(null);
      setChallengingIdeaId(null);
      setAuthorityQueueNow(Date.now());
    }
  }

  async function runWorkpaperBuild() {
    setWorkpaperState("running");
    setWorkpaperMessage("Tina is building the first money story from your papers...");

    try {
      const freshDraft = await getFreshDraftForAction();
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/workpapers/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft: freshDraft }),
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

  function renderOfficialFormLineContext(
    form: TinaOfficialFormDraft,
    line: TinaOfficialFormDraft["lines"][number]
  ) {
    const relatedFields = line.scheduleCDraftFieldIds
      .map((fieldId) => scheduleCDraft.fields.find((field) => field.id === fieldId))
      .filter((field): field is TinaScheduleCDraftSnapshot["fields"][number] => Boolean(field));
    const relatedNotes = line.scheduleCDraftNoteIds
      .map((noteId) => scheduleCDraft.notes.find((note) => note.id === noteId))
      .filter((note): note is TinaScheduleCDraftSnapshot["notes"][number] => Boolean(note));
    const linkedDocument = line.sourceDocumentIds[0]
      ? documentMap.get(line.sourceDocumentIds[0]) ?? null
      : null;

    if (relatedFields.length === 0 && relatedNotes.length === 0 && !linkedDocument) return null;

    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        {relatedFields.map((field) => (
          <span
            key={`${form.id}-${line.id}-${field.id}`}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1"
          >
            Draft box: {field.lineNumber}
          </span>
        ))}
        {relatedNotes.map((note) => (
          <span
            key={`${form.id}-${line.id}-${note.id}`}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1"
          >
            Review note: {note.title}
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

  function renderArtifactDelivery(item: TinaArtifactManifestItem) {
    return (
      <span
        className={cn(
          "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
          ARTIFACT_DELIVERY_STYLES[item.delivery]
        )}
      >
        {ARTIFACT_DELIVERY_LABELS[item.delivery]}
      </span>
    );
  }

  async function runCleanupBuild() {
    setCleanupState("running");
    setCleanupMessage("Tina is turning the money story into cleanup ideas...");

    try {
      const freshDraft = await getFreshDraftForAction();
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/cleanup-plan/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft: freshDraft }),
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
      const freshDraft = await getFreshDraftForAction();
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/ai-cleanup/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft: freshDraft }),
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
      const freshDraft = await getFreshDraftForAction();
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/tax-adjustments/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft: freshDraft }),
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
      const freshDraft = await getFreshDraftForAction();
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/reviewer-final/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft: freshDraft }),
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
      const freshDraft = await getFreshDraftForAction();
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/schedule-c/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft: freshDraft }),
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

  async function runOfficialFormBuild() {
    setOfficialFormState("running");
    setOfficialFormMessage(
      "Tina is laying the approved draft into the federal business form packet..."
    );

    try {
      const freshDraft = await getFreshDraftForAction();
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/official-forms/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft: freshDraft }),
      });

      if (!res.ok) throw new Error("official form build failed");

      const payload = (await res.json()) as {
        officialFormPacket?: TinaOfficialFormPacketSnapshot;
      };
      if (!payload.officialFormPacket) throw new Error("missing official form packet");

      saveOfficialFormPacket(payload.officialFormPacket);
      setOfficialFormState("idle");
      setOfficialFormMessage("Tina finished the first federal business form packet check.");
    } catch {
      setOfficialFormState("error");
      setOfficialFormMessage(
        "Tina could not build the federal business form packet yet. Try again in a moment."
      );
    }
  }

  async function downloadOfficialFormPacket(packetFingerprint?: string, packetLabel?: string) {
    setOfficialFormDownloadState("running");
    setOfficialFormDownloadMessage(
      packetFingerprint
        ? `Tina is reopening ${packetLabel ?? "that saved packet"} and packing the federal business form packet...`
        : "Tina is packing the federal business form packet into one file..."
    );

    try {
      const headers = await sentinelAuthHeaders();
      const res = await withPacketExportBody(packetFingerprint, async (body) =>
        fetch("/api/tina/official-forms/export", {
          method: "POST",
          headers,
          body,
        })
      );

      if (!res.ok) throw new Error("official form export failed");

      const payload = (await res.json()) as {
        fileName?: string;
        mimeType?: string;
        contents?: string;
      };

      if (!payload.fileName || !payload.mimeType || typeof payload.contents !== "string") {
        throw new Error("missing official form export");
      }

      const blob = new Blob([payload.contents], { type: payload.mimeType });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      await refreshPacketVersions();
      setOfficialFormDownloadState("idle");
      setOfficialFormDownloadMessage(
        packetFingerprint
          ? `Tina downloaded the saved federal business form packet for ${packetLabel ?? "that packet"}.`
          : "Tina downloaded the federal business form packet."
      );
    } catch (error) {
      setOfficialFormDownloadState("error");
      setOfficialFormDownloadMessage(
        error instanceof Error
          ? error.message
          : "Tina could not download the federal business form packet yet. Try again in a moment."
      );
    }
  }

  async function downloadOfficialFormPacketPdf(packetFingerprint?: string, packetLabel?: string) {
    setOfficialFormPdfState("running");
    setOfficialFormPdfMessage(
      packetFingerprint
        ? `Tina is reopening ${packetLabel ?? "that saved packet"} and turning it into a printable PDF...`
        : "Tina is turning the federal business form packet into a printable PDF..."
    );

    try {
      const headers = await sentinelAuthHeaders();
      const res = await withPacketExportBody(packetFingerprint, async (body) =>
        fetch("/api/tina/official-forms/pdf", {
          method: "POST",
          headers,
          body,
        })
      );

      if (!res.ok) {
        const maybeJson = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(maybeJson?.error || "official form pdf export failed");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const fileNameMatch = disposition.match(/filename="([^"]+)"/);
      const fileName = fileNameMatch?.[1] || "tina-official-form-packet.pdf";
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      await refreshPacketVersions();
      setOfficialFormPdfState("idle");
      setOfficialFormPdfMessage(
        packetFingerprint
          ? `Tina downloaded the saved federal business form PDF for ${packetLabel ?? "that packet"}.`
          : "Tina downloaded the federal business form packet as a PDF."
      );
    } catch (error) {
      setOfficialFormPdfState("error");
      setOfficialFormPdfMessage(
        error instanceof Error
          ? error.message
          : "Tina could not download the PDF form packet yet. Try again in a moment."
      );
    }
  }

  async function runPackageReadinessBuild() {
    setPackageReadinessState("running");
    setPackageReadinessMessage(
      "Tina is checking what still blocks a filing-ready federal business packet..."
    );

    try {
      const freshDraft = await getFreshDraftForAction();
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/package-readiness/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft: freshDraft }),
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
      const freshDraft = await getFreshDraftForAction();
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/cpa-handoff/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft: freshDraft }),
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

  async function downloadCpaPacket(packetFingerprint?: string, packetLabel?: string) {
    setCpaDownloadState("running");
    setCpaDownloadMessage(
      packetFingerprint
        ? `Tina is reopening ${packetLabel ?? "that saved packet"} and packing the CPA review notes...`
        : "Tina is packing your CPA review notes into a file..."
    );

    try {
      const headers = await sentinelAuthHeaders();
      const res = await withPacketExportBody(packetFingerprint, async (body) =>
        fetch("/api/tina/cpa-packet/export", {
          method: "POST",
          headers,
          body,
        })
      );

      if (!res.ok) throw new Error("packet export failed");

      const payload = (await res.json()) as {
        fileName?: string;
        mimeType?: string;
        contents?: string;
      };

      if (!payload.fileName || !payload.mimeType || typeof payload.contents !== "string") {
        throw new Error("missing export payload");
      }

      const blob = new Blob([payload.contents], { type: payload.mimeType });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      await refreshPacketVersions();
      setCpaDownloadState("idle");
      setCpaDownloadMessage(
        packetFingerprint
          ? `Tina downloaded the saved CPA review notes for ${packetLabel ?? "that packet"}.`
          : "Tina downloaded the CPA review notes."
      );
    } catch {
      setCpaDownloadState("error");
      setCpaDownloadMessage("Tina could not download the CPA notes yet. Try again in a moment.");
    }
  }

  async function downloadReviewPacketHtml(packetFingerprint?: string, packetLabel?: string) {
    setHtmlPacketState("running");
    setHtmlPacketMessage(
      packetFingerprint
        ? `Tina is reopening ${packetLabel ?? "that saved packet"} and building the saved review packet...`
        : "Tina is building a cleaner review packet you can open in one file..."
    );

    try {
      const headers = await sentinelAuthHeaders();
      const res = await withPacketExportBody(packetFingerprint, async (body) =>
        fetch("/api/tina/review-packet-html/export", {
          method: "POST",
          headers,
          body,
        })
      );

      if (!res.ok) throw new Error("html packet export failed");

      const payload = (await res.json()) as {
        fileName?: string;
        mimeType?: string;
        contents?: string;
      };

      if (!payload.fileName || !payload.mimeType || typeof payload.contents !== "string") {
        throw new Error("missing html export payload");
      }

      const blob = new Blob([payload.contents], { type: payload.mimeType });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      await refreshPacketVersions();
      setHtmlPacketState("idle");
      setHtmlPacketMessage(
        packetFingerprint
          ? `Tina downloaded the saved review packet for ${packetLabel ?? "that packet"}.`
          : "Tina downloaded the review packet as one clean HTML file."
      );
    } catch {
      setHtmlPacketState("error");
      setHtmlPacketMessage(
        "Tina could not download the HTML review packet yet. Try again in a moment."
      );
    }
  }

  async function downloadReviewBook(packetFingerprint?: string, packetLabel?: string) {
    setReviewBookState("running");
    setReviewBookMessage(
      packetFingerprint
        ? `Tina is reopening ${packetLabel ?? "that saved packet"} and assembling its full handoff packet...`
        : "Tina is assembling the full handoff packet into one printable file..."
    );

    try {
      const headers = await sentinelAuthHeaders();
      const res = await withPacketExportBody(packetFingerprint, async (body) =>
        fetch("/api/tina/review-book/export", {
          method: "POST",
          headers,
          body,
        })
      );

      if (!res.ok) {
        const maybeJson = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(maybeJson?.error || "full handoff export failed");
      }

      const payload = (await res.json()) as {
        fileName?: string;
        mimeType?: string;
        contents?: string;
      };

      if (!payload.fileName || !payload.mimeType || typeof payload.contents !== "string") {
        throw new Error("missing full handoff export");
      }

      const blob = new Blob([payload.contents], { type: payload.mimeType });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      await refreshPacketVersions();
      setReviewBookState("idle");
      setReviewBookMessage(
        packetFingerprint
          ? `Tina downloaded the saved full handoff packet for ${packetLabel ?? "that packet"}.`
          : "Tina downloaded the full handoff packet."
      );
    } catch (error) {
      setReviewBookState("error");
      setReviewBookMessage(
        error instanceof Error
          ? error.message
          : "Tina could not download the full handoff packet yet. Try again in a moment."
      );
    }
  }

  async function runFinalSignoffBuild() {
    setFinalSignoffState("running");
    setFinalSignoffMessage("Tina is checking whether this packet is ready for a human signoff...");

    try {
      const freshDraft = await getFreshDraftForAction();
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/final-signoff/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft: freshDraft }),
      });

      if (!res.ok) throw new Error("final signoff build failed");

      const payload = (await res.json()) as {
        finalSignoff?: TinaFinalSignoffSnapshot;
      };
      if (!payload.finalSignoff) throw new Error("missing final signoff");

      saveFinalSignoff(payload.finalSignoff);
      setFinalSignoffState("idle");
      setFinalSignoffMessage("Tina finished the final signoff check.");
    } catch {
      setFinalSignoffState("error");
      setFinalSignoffMessage(
        "Tina could not finish the final signoff check yet. Try again in a moment."
      );
    }
  }

  async function downloadReviewBundle(packetFingerprint?: string, packetLabel?: string) {
    setBundleDownloadState("running");
    setBundleDownloadMessage(
      packetFingerprint
        ? `Tina is reopening ${packetLabel ?? "that saved packet"} and packing its full review bundle...`
        : "Tina is packing the full review bundle into one file..."
    );

    try {
      const headers = await sentinelAuthHeaders();
      const res = await withPacketExportBody(packetFingerprint, async (body) =>
        fetch("/api/tina/review-bundle/package", {
          method: "POST",
          headers,
          body,
        })
      );

      if (!res.ok) throw new Error("bundle export failed");

      const payload = (await res.json()) as {
        fileName?: string;
        mimeType?: string;
        contents?: string;
      };

      if (!payload.fileName || !payload.mimeType || typeof payload.contents !== "string") {
        throw new Error("missing bundle file");
      }

      const blob = new Blob([payload.contents], { type: payload.mimeType });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = payload.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);

      await refreshPacketVersions();
      setBundleDownloadState("idle");
      setBundleDownloadMessage(
        packetFingerprint
          ? `Tina downloaded the saved bundle for ${packetLabel ?? "that packet"}.`
          : "Tina downloaded the full review bundle package."
      );
    } catch {
      setBundleDownloadState("error");
      setBundleDownloadMessage("Tina could not download the full review bundle package yet.");
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
      const freshDraft = await getFreshDraftForAction();
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/bootstrap-review", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft: freshDraft }),
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
      const freshDraft = await getFreshDraftForAction();
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/issue-queue", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft: freshDraft }),
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

  function switchBooksLaneToUploads() {
    updateBooksConnection(createUploadOnlyTinaBooksConnection(quickbooksDocuments.length, booksConnection));
    setBooksImportState("idle");
    setBooksImportMessage("Tina will use uploaded books files in this lane.");
  }

  function planLiveQuickBooksLane() {
    updateBooksConnection(
      createPlanningLiveSyncTinaBooksConnection(quickbooksDocuments.length, booksConnection)
    );
    setBooksImportState("idle");
    setBooksImportMessage("Tina saved this spot for a live QuickBooks link later.");
  }

  async function runBooksImportBuild() {
    setBooksImportState("running");
    setBooksImportMessage("Tina is sorting the books files she already has...");

    try {
      const freshDraft = await getFreshDraftForAction();
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/books/import/build", {
        method: "POST",
        headers,
        body: JSON.stringify({ draft: freshDraft }),
      });

      if (!res.ok) throw new Error("books import failed");

      const payload = (await res.json()) as { booksImport?: TinaBooksImportSnapshot };
      if (!payload.booksImport) throw new Error("missing books import");

      saveBooksImport(payload.booksImport);
      setBooksImportState("idle");
      setBooksImportMessage("Tina finished sorting the books lane.");
    } catch {
      setBooksImportState("error");
      setBooksImportMessage("Tina could not sort the books lane yet. Try again in a moment.");
    }
  }

  function beginChecklistUpload(item: TinaChecklistItem) {
    setSelectedChecklistItem(item);
    supportingInputRef.current?.click();
  }

  function scrollToSection(ref: RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToField(ref: RefObject<HTMLElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusTarget = ref.current?.querySelector<HTMLElement>("input, button, textarea, select");
    focusTarget?.focus();
  }

  function runChecklistAction(item: TinaChecklistItem) {
    if (item.action === "upload") {
      beginChecklistUpload(item);
      return;
    }

    if (item.action === "answer") {
      if (item.id === "naics") {
        scrollToField(naicsFieldRef);
        return;
      }

      if (item.id === "idaho-activity") {
        scrollToField(idahoFieldRef);
        return;
      }

      scrollToSection(organizerSectionRef);
      return;
    }

    scrollToSection(returnTypeSectionRef);
  }

  const isVaultBusy =
    uploadState === "uploading" ||
    removingDocumentId !== null ||
    openingDocumentId !== null ||
    readingDocumentId !== null;

  return (
    <div className="space-y-5">
      {restoredPacketFingerprint ? (
        <Card className="border-emerald-300/18 bg-emerald-300/8 backdrop-blur-2xl">
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <ShieldCheck className="h-4 w-4 text-emerald-200" />
              Tina loaded a saved packet back into today&apos;s workspace
            </div>
            <p className="text-sm leading-6 text-emerald-50">
              This live workspace now matches saved packet{" "}
              <span className="font-mono text-emerald-100">{restoredPacketFingerprint}</span>.
              Look over the steps below before you keep going.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-emerald-300/14 bg-emerald-300/8 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100/80">
                Today with Tina
              </p>
              <h3 className="text-xl font-semibold tracking-tight text-white">
                {currentChecklistFocusTitle}
              </h3>
              {currentChecklistFocus ? (
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/80">
                  <span className="rounded-full border border-emerald-200/20 bg-emerald-200/10 px-2.5 py-1">
                    {getChecklistSourceLabel(currentChecklistFocus)}
                  </span>
                  <span>{getChecklistSourceSummary(currentChecklistFocus)}</span>
                </div>
              ) : null}
              <p className="max-w-2xl text-sm leading-6 text-emerald-50">
                {currentChecklistFocusSummary}
              </p>
              {currentChecklistFocus?.substituteHint ? (
                <p className="max-w-2xl text-xs leading-5 text-emerald-100/80">
                  If you do not have that exact paper, this also works: {currentChecklistFocus.substituteHint}
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-zinc-100">
              {visibleChecklist.length > 0 ? (
                <>
                  Tina is only showing the next {visibleChecklist.length} ask
                  {visibleChecklist.length === 1 ? "" : "s"} right now.
                  {hiddenChecklistCount > 0 ? ` ${hiddenChecklistCount} more can wait.` : ""}
                </>
              ) : (
                "The first asks are covered. Tina can move into the deeper review steps next."
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {currentChecklistFocus ? (
              <Button
                type="button"
                onClick={() => runChecklistAction(currentChecklistFocus)}
                disabled={currentChecklistFocus.action === "upload" && isVaultBusy}
              >
                {currentChecklistFocus.action === "upload" ? (
                  <FileUp className="h-4 w-4" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {getChecklistActionLabel(currentChecklistFocus)}
              </Button>
            ) : (
              <Button type="button" onClick={() => setShowAdvancedTools(true)}>
                <ChevronDown className="h-4 w-4" />
                Open Tina&apos;s deeper review tools
              </Button>
            )}
            {currentChecklistFocus?.action !== "upload" ? (
              <p className="text-xs leading-5 text-emerald-100/80">
                Tina will scroll you to the right spot instead of asking for another upload.
              </p>
            ) : null}
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
            <p className="text-sm leading-6 text-zinc-300">
              If you have the file, add it here. If you do not, Tina can still keep going and ask
              for more papers later.
            </p>

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
            <CardTitle className="text-white">Saved progress</CardTitle>
            <p className="text-sm leading-6 text-zinc-300">
              Tina keeps your place so you can come back without starting over.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <Save className="h-4 w-4 text-emerald-200" />
                Last save
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
                Starter list covered
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {coveredChecklistCount}/{checklist.length}
              </p>
              <p className="mt-1 text-sm text-zinc-300">Tina already has this many of the first basics covered.</p>
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
          <CardTitle className="text-white">Your saved papers</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            This is the paper shelf Tina is using right now. Each file stays tied to the job it helps finish.
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
        <div ref={organizerSectionRef}>
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

              {draft.profile.entityType === "single_member_llc" ||
              draft.profile.entityType === "multi_member_llc" ? (
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">LLC tax path</span>
                  <p className="text-xs leading-5 text-zinc-400">
                    How this LLC files federally. If nothing special was elected, pick the normal IRS default.
                  </p>
                  <select
                    value={draft.profile.llcFederalTaxTreatment}
                    onChange={(event) =>
                      updateProfile(
                        "llcFederalTaxTreatment",
                        event.target.value as TinaLlcFederalTaxTreatment
                      )
                    }
                    className="flex h-9 w-full rounded-[12px] border border-white/10 bg-white/5 px-3 py-1 text-sm text-white outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {LLC_TAX_TREATMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-zinc-950 text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {draft.profile.entityType === "multi_member_llc" &&
              draft.profile.llcFederalTaxTreatment === "owner_return" ? (
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Spouse community-property case</span>
                  <p className="text-xs leading-5 text-zinc-400">
                    Only answer yes if the only owners are spouses using the owner-return path in a community-property state.
                  </p>
                  <select
                    value={
                      draft.profile.llcCommunityPropertyStatus === "not_applicable"
                        ? "unsure"
                        : draft.profile.llcCommunityPropertyStatus
                    }
                    onChange={(event) =>
                      updateProfile(
                        "llcCommunityPropertyStatus",
                        event.target.value as TinaLlcCommunityPropertyStatus
                      )
                    }
                    className="flex h-9 w-full rounded-[12px] border border-white/10 bg-white/5 px-3 py-1 text-sm text-white outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {LLC_COMMUNITY_PROPERTY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-zinc-950 text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

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

              <label ref={naicsFieldRef} className="space-y-2 md:col-span-2">
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
              <label ref={idahoFieldRef} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-zinc-200">
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
        </div>

        <div className="space-y-4">
          <div ref={returnTypeSectionRef}>
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
          </div>

          <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
            <CardHeader className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-white">QuickBooks or your main book report</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                      quickbooksChecklistItem?.status === "covered"
                        ? "border-emerald-300/18 bg-emerald-300/8 text-emerald-50"
                        : "border-white/10 bg-white/5 text-zinc-200"
                    )}
                  >
                    {quickbooksChecklistItem?.status === "covered" ? "covered" : "needed"}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                      BOOKS_CONNECTION_STYLES[booksConnection.status]
                    )}
                  >
                    {BOOKS_CONNECTION_LABELS[booksConnection.status]}
                  </span>
                </div>
              </div>
              <p className="text-sm leading-6 text-zinc-300">
                Tina needs one clear view of your business books. A QuickBooks export is best. A
                profit-and-loss report is also okay.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Books lane
                  </p>
                  <p className="mt-2 text-sm font-medium text-white">{booksConnection.summary}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{booksConnection.nextStep}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Tina&apos;s books sort
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-200">
                      {getBooksImportStatusLabel(booksImport.status)}
                    </span>
                    {booksImport.lastRunAt ? (
                      <span className="text-xs text-zinc-500">
                        last sorted {formatSavedAt(booksImport.lastRunAt)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm font-medium text-white">{booksImport.summary}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{booksImport.nextStep}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-300/14 bg-emerald-300/8 px-4 py-3 text-sm leading-6 text-emerald-50">
                Good files here are a QuickBooks export, profit-and-loss report, general ledger,
                or another clean books file for this tax year.
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={() => quickbooksChecklistItem && beginChecklistUpload(quickbooksChecklistItem)}
                  disabled={isVaultBusy || !quickbooksChecklistItem}
                >
                  {uploadState === "uploading" && activeUploadTarget === "quickbooks" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileUp className="h-4 w-4" />
                  )}
                  {quickbooksDocuments.length > 0 ? "Add another books file" : "Add QuickBooks or P&L"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={switchBooksLaneToUploads}
                  disabled={booksImportState === "running"}
                >
                  Use uploads for now
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={planLiveQuickBooksLane}
                  disabled={booksImportState === "running"}
                >
                  Plan live QuickBooks link
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={runBooksImportBuild}
                  disabled={booksImportState === "running" || quickbooksDocuments.length === 0}
                >
                  {booksImportState === "running" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  Let Tina sort these books
                </Button>
                <p className="text-xs leading-5 text-zinc-500">
                  Tina will plug a real QuickBooks connection into this same spot later. For now,
                  uploads work here.
                </p>
              </div>

              {booksImportMessage ? (
                <div
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-sm leading-6",
                    booksImportState === "error"
                      ? "border-rose-300/18 bg-rose-300/8 text-rose-50"
                      : "border-white/10 bg-black/15 text-zinc-200"
                  )}
                >
                  {booksImportMessage}
                </div>
              ) : null}

              {booksImport.documents.length > 0 ? (
                <div className="space-y-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">What Tina sees in the books lane</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        This is Tina&apos;s first clean bookkeeping view before the money story build.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                      {booksImport.coverageStart || booksImport.coverageEnd ? (
                        <span>
                          coverage {booksImport.coverageStart ?? "?"} through {booksImport.coverageEnd ?? "?"}
                        </span>
                      ) : null}
                      {booksImport.moneyInTotal !== null || booksImport.moneyOutTotal !== null ? (
                        <span>
                          in {formatMoneyAmount(booksImport.moneyInTotal)} / out {formatMoneyAmount(booksImport.moneyOutTotal)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {booksImport.clueLabels.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {booksImport.clueLabels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-amber-300/18 bg-amber-300/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-50"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    {booksImport.documents.map((document) => (
                      <div
                        key={document.documentId}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-white">{document.name}</p>
                            <p className="mt-1 text-xs text-zinc-500">{document.summary}</p>
                          </div>
                          <span
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                              BOOKS_IMPORT_DOCUMENT_STYLES[document.status]
                            )}
                          >
                            {BOOKS_IMPORT_DOCUMENT_LABELS[document.status]}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-400">
                          {document.rowCount !== null ? <span>{document.rowCount} rows</span> : null}
                          {document.coverageStart || document.coverageEnd ? (
                            <span>
                              {document.coverageStart ?? "?"} through {document.coverageEnd ?? "?"}
                            </span>
                          ) : null}
                          {document.moneyIn !== null || document.moneyOut !== null ? (
                            <span>
                              in {formatMoneyAmount(document.moneyIn)} / out {formatMoneyAmount(document.moneyOut)}
                            </span>
                          ) : null}
                          {document.lastReadAt ? <span>read {formatSavedAt(document.lastReadAt)}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {quickbooksDocuments.length > 0 ? (
                <div className="space-y-3">
                  {quickbooksDocuments.map((document) => {
                    const reading = findTinaDocumentReading(draft.documentReadings, document.id);
                    return (
                      <div
                        key={document.id}
                        className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-white">{document.name}</p>
                            <p className="mt-1 text-xs text-zinc-500">
                              Uploaded {formatSavedAt(document.uploadedAt)}
                            </p>
                          </div>
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-200">
                            {reading?.status === "complete"
                              ? "read"
                              : reading?.status === "waiting_for_ai"
                                ? "waiting to read"
                                : "not read yet"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
                  No books file here yet. If you do not know which file to choose, start with your
                  profit-and-loss report for this tax year.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
            <CardHeader className="space-y-2">
              <CardTitle className="text-white">Tina&apos;s next few asks</CardTitle>
              <p className="text-sm leading-6 text-zinc-300">
                Tina should keep this list short. The current step is shown above, so this list only
                shows what may come right after it.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingChecklist.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-200">
                        {getChecklistSourceLabel(item)}
                      </span>
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
                          onClick={() => runChecklistAction(item)}
                          disabled={item.action === "upload" ? isVaultBusy : false}
                        >
                          {item.action === "upload" &&
                          uploadState === "uploading" &&
                          activeUploadTarget === item.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : item.action === "upload" ? (
                            <FileUp className="h-4 w-4" />
                          ) : (
                            <ArrowRight className="h-4 w-4" />
                          )}
                          {getChecklistActionLabel(item)}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">
                    {getChecklistSourceSummary(item)}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{item.reason}</p>
                  {item.substituteHint ? (
                    <p className="mt-2 text-xs leading-5 text-zinc-400">
                      This also works: {item.substituteHint}
                    </p>
                  ) : null}
                </div>
              ))}
              {upcomingChecklist.length === 0 && neededChecklist.length > 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm leading-6 text-zinc-300">
                  Finish the step at the top and Tina will show the next ask here.
                </div>
              ) : null}
              {hiddenChecklistCount > 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm leading-6 text-zinc-300">
                  Tina is holding back {hiddenChecklistCount} more ask
                  {hiddenChecklistCount === 1 ? "" : "s"} until these first steps are done.
                </div>
              ) : null}
              {neededChecklist.length === 0 ? (
                <div className="rounded-2xl border border-emerald-300/14 bg-emerald-300/8 px-4 py-3 text-sm leading-6 text-emerald-50">
                  Nice work. Tina has the first round of papers she needs and can keep moving.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="space-y-1">
            <p className="text-sm font-medium text-white">Deeper review tools</p>
            <p className="text-sm leading-6 text-zinc-300">
              Tina can go much deeper, but most owners should not need all of that at once.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
            onClick={() => setShowAdvancedTools((current) => !current)}
          >
            {showAdvancedTools ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            {showAdvancedTools ? "Hide deeper Tina tools" : "Show deeper Tina tools"}
          </Button>
        </CardContent>
      </Card>

      {showAdvancedTools ? (
        <>
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
          <CardTitle className="text-white">Federal business form packet</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            This is Tina&apos;s IRS-facing business paperwork layer for the supported Schedule C lane. Tina only lets you download it when the required in-scope federal business forms are covered.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={cn(
              "rounded-2xl border px-4 py-4",
              irsAuthorityStatus.level === "ready"
                ? "border-emerald-300/18 bg-emerald-300/8"
                : "border-amber-300/18 bg-amber-300/8"
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">IRS support check</p>
                <p className="mt-1 text-sm leading-6 text-zinc-200">
                  {irsAuthorityStatus.summary}
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  {irsAuthorityStatus.nextStep}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                  irsAuthorityStatus.level === "ready"
                    ? "border-emerald-300/18 bg-emerald-300/8 text-emerald-50"
                    : "border-amber-300/18 bg-amber-300/8 text-amber-100"
                )}
              >
                {irsAuthorityStatusLabel}
              </span>
            </div>
            <p className="mt-3 text-xs uppercase tracking-[0.14em] text-zinc-500">
              {irsAuthoritySourceCount > 0
                ? `${irsAuthoritySourceCount} watched IRS sources`
                : `Registry is currently built for Tina's supported ${TINA_IRS_AUTHORITY_SUPPORTED_TAX_YEAR} Schedule C lane`}
              {" | "}Verified {formatShortDate(TINA_IRS_AUTHORITY_REGISTRY_VERIFIED_AT)}
            </p>
          </div>

          {irsAuthorityWatchStatus ? (
            <div
              className={cn(
                "rounded-2xl border px-4 py-4",
                irsAuthorityWatchStatus.level === "healthy"
                  ? "border-emerald-300/18 bg-emerald-300/8"
                  : "border-amber-300/18 bg-amber-300/8"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">IRS freshness watch</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-200">
                    {irsAuthorityWatchStatus.summary}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    {irsAuthorityWatchStatus.nextStep}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                    irsAuthorityWatchStatus.level === "healthy"
                      ? "border-emerald-300/18 bg-emerald-300/8 text-emerald-50"
                      : "border-amber-300/18 bg-amber-300/8 text-amber-100"
                  )}
                >
                  {irsWatchStatusLabel}
                </span>
              </div>
              <p className="mt-3 text-xs uppercase tracking-[0.14em] text-zinc-500">
                {irsAuthorityWatchStatus.checkedCount > 0
                  ? `${irsAuthorityWatchStatus.checkedCount} watched IRS sources`
                  : "No stored IRS watch run yet"}
                {irsAuthorityWatchStatus.generatedAt
                  ? ` | Last checked ${formatSavedAt(irsAuthorityWatchStatus.generatedAt)}`
                  : ""}
              </p>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Form packet
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {officialFormPacket.status === "complete"
                  ? officialFormPacketExportReady
                    ? "Built"
                    : "Built, but not export-ready"
                  : officialFormPacket.status === "stale"
                    ? "Needs a fresh build"
                    : officialFormPacket.lastRunAt
                      ? "Waiting on draft checks"
                      : "Not built yet"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Forms inside
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{officialFormCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Mapped lines
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{officialFormLineCount}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
            <p className="text-sm font-medium text-white">{officialFormPacket.summary}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{officialFormPacket.nextStep}</p>
            {officialFormPacket.lastRunAt ? (
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                Last built {formatSavedAt(officialFormPacket.lastRunAt)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runOfficialFormBuild} disabled={officialFormState === "running"}>
              {officialFormState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {officialFormPacket.status === "complete"
                ? "Build again"
                : "Build federal form packet"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
              onClick={() => void downloadOfficialFormPacket()}
              disabled={
                officialFormDownloadState === "running" || !officialFormPacketExportReady
              }
            >
              {officialFormDownloadState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Download federal form packet (HTML)
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
              onClick={() => void downloadOfficialFormPacketPdf()}
              disabled={
                officialFormPdfState === "running" || !officialFormPacketExportReady
              }
            >
              {officialFormPdfState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Download federal form packet (PDF)
            </Button>
            {officialFormMessage ? (
              <p
                className={cn(
                  "text-sm",
                  officialFormState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {officialFormMessage}
              </p>
            ) : null}
            {officialFormDownloadMessage ? (
              <p
                className={cn(
                  "text-sm",
                  officialFormDownloadState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {officialFormDownloadMessage}
              </p>
            ) : null}
            {officialFormPdfMessage ? (
              <p
                className={cn(
                  "text-sm",
                  officialFormPdfState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {officialFormPdfMessage}
              </p>
            ) : null}
          </div>

          {officialFormPacket.forms.length > 0 ? (
            <div className="space-y-4">
              {officialFormPacket.forms.map((form) => (
                <div
                  key={form.id}
                  className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {form.formNumber} for {form.taxYear}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-zinc-300">{form.summary}</p>
                      <p className="mt-1 text-sm leading-6 text-zinc-400">{form.nextStep}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                        OFFICIAL_FORM_STATUS_STYLES[form.status]
                      )}
                    >
                      {OFFICIAL_FORM_STATUS_LABELS[form.status]}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {form.lines.map((line) => (
                      <div
                        key={line.id}
                        className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-white">
                              {line.lineNumber}: {line.label}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-zinc-300">
                              {line.summary}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                              OFFICIAL_FORM_LINE_STYLES[line.state]
                            )}
                          >
                            {OFFICIAL_FORM_LINE_LABELS[line.state]}
                          </span>
                        </div>
                        <p className="mt-3 text-xl font-semibold text-white">
                          {line.value || "Blank for now"}
                        </p>
                        {renderOfficialFormLineContext(form, line)}
                      </div>
                    ))}

                    {form.supportSchedules.length > 0 ? (
                      <div className="space-y-3">
                        {form.supportSchedules.map((schedule) => (
                          <div
                            key={schedule.id}
                            className="rounded-2xl border border-white/10 bg-[#11140f] px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-white">{schedule.title}</p>
                                <p className="mt-1 text-sm leading-6 text-zinc-300">
                                  {schedule.summary}
                                </p>
                              </div>
                              <span className="rounded-full border border-emerald-300/18 bg-emerald-300/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-50">
                                Support sheet
                              </span>
                            </div>

                            <div className="mt-4 space-y-3">
                              {schedule.rows.map((row) => (
                                <div
                                  key={row.id}
                                  className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-medium text-white">{row.label}</p>
                                      <p className="mt-1 text-sm leading-6 text-zinc-300">
                                        {row.summary}
                                      </p>
                                    </div>
                                    <p className="text-lg font-semibold text-white">
                                      {formatMoneyAmount(row.amount)}
                                    </p>
                                  </div>
                                  {row.sourceDocumentIds.length > 0 ? (
                                    <p className="mt-3 text-xs uppercase tracking-[0.14em] text-zinc-500">
                                      Backed by {row.sourceDocumentIds.length} saved paper
                                      {row.sourceDocumentIds.length === 1 ? "" : "s"}.
                                    </p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 text-sm leading-6 text-zinc-300">
              Tina does not have a federal business form packet yet. She needs the Schedule C draft and package check first.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">What still blocks the filing package</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            Tina uses this check to decide whether the federal business packet is blocked, still needs review, or is ready for CPA handoff.
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
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
              onClick={() => void downloadCpaPacket()}
              disabled={cpaDownloadState === "running" || cpaHandoff.status !== "complete"}
            >
              {cpaDownloadState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Download packet notes
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
              onClick={() => void downloadReviewPacketHtml()}
              disabled={htmlPacketState === "running" || cpaHandoff.status !== "complete"}
            >
              {htmlPacketState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Download review packet (HTML)
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
            {cpaDownloadMessage ? (
              <p
                className={cn(
                  "text-sm",
                  cpaDownloadState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {cpaDownloadMessage}
              </p>
            ) : null}
            {htmlPacketMessage ? (
              <p
                className={cn(
                  "text-sm",
                  htmlPacketState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {htmlPacketMessage}
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

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Final signoff</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            This is Tina&apos;s last calm checkpoint before you hand the packet to a real reviewer.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Signoff state
              </p>
              <div className="mt-2">
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                    FINAL_SIGNOFF_LEVEL_STYLES[finalSignoff.level]
                  )}
                >
                  {FINAL_SIGNOFF_LEVEL_LABELS[finalSignoff.level]}
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Checks done
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {finalSignoffCheckedCount}/{finalSignoff.checks.length}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Reviewer
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {finalSignoff.reviewerName || "Not added yet"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Confirmed
              </p>
              <p className="mt-2 text-sm font-medium text-white">
                {finalSignoff.confirmedAt ? formatSavedAt(finalSignoff.confirmedAt) : "Not confirmed yet"}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {finalSignoff.confirmedPacketId && finalSignoff.confirmedPacketVersion
                  ? `${finalSignoff.confirmedPacketId} (${finalSignoff.confirmedPacketVersion})`
                  : "No packet revision pinned yet"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
            <p className="text-sm font-medium text-white">{finalSignoff.summary}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{finalSignoff.nextStep}</p>
            {finalSignoff.lastRunAt ? (
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-zinc-500">
                Last checked {formatSavedAt(finalSignoff.lastRunAt)}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runFinalSignoffBuild} disabled={finalSignoffState === "running"}>
              {finalSignoffState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {finalSignoff.status === "complete" ? "Check again" : "Check final signoff"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
              onClick={() => void downloadReviewBundle()}
              disabled={bundleDownloadState === "running" || finalSignoff.status !== "complete"}
            >
              {bundleDownloadState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Download bundle package
            </Button>
            <Button
              type="button"
              variant={finalSignoff.confirmedAt ? "outline" : "default"}
              className={
                finalSignoff.confirmedAt
                  ? "border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                  : undefined
              }
              onClick={() => {
                if (finalSignoff.confirmedAt) {
                  clearFinalSignoffConfirmation();
                  setFinalSignoffMessage("Tina cleared the saved signoff confirmation.");
                  return;
                }

                if (!canConfirmFinalSignoff) {
                  setFinalSignoffMessage(
                    "Tina still needs all signoff checks done and a reviewer name before confirmation."
                  );
                  return;
                }

                confirmFinalSignoff();
                setFinalSignoffMessage("Tina saved the final signoff confirmation.");
              }}
            >
              {finalSignoff.confirmedAt ? "Clear confirmation" : "Mark confirmed"}
            </Button>
            {finalSignoffMessage ? (
              <p
                className={cn(
                  "text-sm",
                  finalSignoffState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {finalSignoffMessage}
              </p>
            ) : null}
            {bundleDownloadMessage ? (
              <p
                className={cn(
                  "text-sm",
                  bundleDownloadState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {bundleDownloadMessage}
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            {finalSignoff.checks.map((check) => (
              <label
                key={check.id}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm text-zinc-200"
              >
                <Checkbox
                  checked={check.checked}
                  onChange={(event) => updateFinalSignoffCheck(check.id, event.target.checked)}
                  className="mt-0.5 border-white/20 bg-white/5"
                />
                <span className="space-y-1">
                  <span className="block font-medium text-white">{check.label}</span>
                  <span className="block text-sm leading-6 text-zinc-400">{check.helpText}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Reviewer name
              </span>
              <Input
                value={finalSignoff.reviewerName}
                onChange={(event) => updateFinalSignoffReviewerName(event.target.value)}
                placeholder="Who is doing the final human review?"
                className="border-white/10 bg-black/20 text-white placeholder:text-zinc-500"
              />
            </label>
            <label className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Reviewer note
              </span>
              <Textarea
                value={finalSignoff.reviewerNote}
                onChange={(event) => updateFinalSignoffReviewerNote(event.target.value)}
                placeholder="Any last plain-language note Tina should keep with the packet."
                className="min-h-24 border-white/10 bg-black/20 text-white placeholder:text-zinc-500"
              />
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-white">Packet files Tina can hand over</CardTitle>
          <p className="text-sm leading-6 text-zinc-300">
            This is Tina&apos;s simple file map. It shows which packet files are ready, which ones are still waiting, and which ones should not be treated like final handoff pieces yet.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Ready files
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{artifactManifestReadyCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Waiting files
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{artifactManifestWaitingCount}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Blocked files
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">{artifactManifestBlockedCount}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
            <p className="text-sm font-medium text-white">{artifactManifest.summary}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{artifactManifest.nextStep}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Saved packet history
            </p>
            <p className="mt-2 text-sm font-medium text-white">
              {packetVersions.length === 0
                ? "Tina has not saved a server packet version yet."
                : `${packetVersions.length} packet revision${packetVersions.length === 1 ? "" : "s"} saved on the server.`}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              {latestStoredPacketVersion
                ? `Newest saved packet: ${latestStoredPacketVersion.packetId} (${latestStoredPacketVersion.packetVersion}). Tina saved it ${formatSavedAt(latestStoredPacketVersion.lastStoredAt)}.`
                : "The first export or bundle download will pin a packet revision on the server so Tina and a reviewer can come back to the same packet later."}
            </p>
            {selectedPacketMessage ? (
              <p
                className={cn(
                  "mt-3 text-sm",
                  selectedPacketState === "error" ? "text-rose-200" : "text-zinc-300"
                )}
              >
                {selectedPacketMessage}
              </p>
            ) : null}
            {selectedPacketVersion && selectedPacketArtifactManifest ? (
              <div className="mt-4 rounded-2xl border border-emerald-300/18 bg-emerald-300/8 px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">Opened saved packet</p>
                    <p className="mt-1 text-sm leading-6 text-zinc-300">
                      Tina is showing the exact saved packet for {selectedPacketLabel}. This view is
                      read-only, so you can inspect an older packet without changing today&apos;s draft.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                        selectedPacketMatchesLive
                          ? "border-emerald-300/18 bg-emerald-300/8 text-emerald-100"
                          : "border-amber-300/18 bg-amber-300/8 text-amber-100"
                      )}
                    >
                      {selectedPacketMatchesLive ? "matches live packet" : "older saved packet"}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                      onClick={clearSelectedPacketVersion}
                    >
                      Hide snapshot
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Ready files then
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">{selectedPacketReadyCount}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Waiting files then
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {selectedPacketWaitingCount}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      Blocked files then
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-white">
                      {selectedPacketBlockedCount}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                      Saved {formatSavedAt(selectedPacketVersion.lastStoredAt)}
                    </span>
                    {selectedPacketVersion.draft.finalSignoff.confirmedAt ? (
                      <span className="rounded-full border border-emerald-300/18 bg-emerald-300/8 px-2.5 py-1 text-emerald-100">
                        Confirmed {formatSavedAt(selectedPacketVersion.draft.finalSignoff.confirmedAt)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm font-medium text-white">
                    {selectedPacketArtifactManifest.summary}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    {selectedPacketArtifactManifest.nextStep}
                  </p>
                  {selectedPacketComparison && !selectedPacketMatchesLive ? (
                    <div
                      className={cn(
                        "mt-4 rounded-2xl border px-4 py-4",
                        PACKET_COMPARISON_STYLES[selectedPacketComparison.tone]
                      )}
                    >
                      <p className="text-sm font-medium text-white">
                        What changed since this packet was saved
                      </p>
                      <p className="mt-2 text-sm leading-6">{selectedPacketComparison.summary}</p>
                      <p className="mt-2 text-xs leading-5 text-zinc-300">
                        {selectedPacketComparison.nextStep}
                      </p>
                      {selectedPacketComparison.items.length > 0 ? (
                        <div className="mt-4 space-y-3">
                          {selectedPacketComparison.items.map((item) => (
                            <div
                              key={`${selectedPacketVersion.fingerprint}-${item.id}`}
                              className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                            >
                              <p className="text-sm font-medium text-white">{item.title}</p>
                              <p className="mt-2 text-sm leading-6 text-zinc-200">
                                {item.summary}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-4 space-y-3">
                    {selectedPacketArtifactManifest.items.map((item) => (
                      <div
                        key={`${selectedPacketVersion.fingerprint}-${item.id}`}
                        className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-white">{item.title}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">
                              {item.format} • {item.fileName}
                            </p>
                          </div>
                          {renderArtifactDelivery(item)}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-zinc-300">{item.summary}</p>
                        <p className="mt-2 text-xs leading-5 text-zinc-500">{item.nextStep}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      asChild
                      type="button"
                      variant="outline"
                      className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                    >
                      <Link href={`/tina/packets/${selectedPacketVersion.fingerprint}`}>
                        <FolderOpen className="h-4 w-4" />
                        Open full review page
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                      onClick={() =>
                        void downloadReviewBundle(
                          selectedPacketVersion.fingerprint,
                          selectedPacketLabel ?? undefined
                        )
                      }
                      disabled={bundleDownloadState === "running"}
                    >
                      <Save className="h-4 w-4" />
                      Download this bundle again
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                      onClick={() =>
                        void downloadReviewBook(
                          selectedPacketVersion.fingerprint,
                          selectedPacketLabel ?? undefined
                        )
                      }
                      disabled={reviewBookState === "running"}
                    >
                      <Save className="h-4 w-4" />
                      Download this handoff file
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                      onClick={() =>
                        void downloadCpaPacket(
                          selectedPacketVersion.fingerprint,
                          selectedPacketLabel ?? undefined
                        )
                      }
                      disabled={cpaDownloadState === "running"}
                    >
                      <Save className="h-4 w-4" />
                      Download these CPA notes
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
            {packetVersions.length > 0 ? (
              <div className="mt-4 space-y-3">
                {packetVersions.slice(0, 5).map((packet) => {
                  const packetLabel = `${packet.packetId} (${packet.packetVersion})`;
                  return (
                    <div
                      key={packet.fingerprint}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">{packet.packetId}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-zinc-500">
                            {packet.packetVersion}
                          </p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
                          {packet.packageLevel.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-zinc-300">{packet.packageSummary}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                        <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                          Saved {formatSavedAt(packet.lastStoredAt)}
                        </span>
                        {packet.reviewedAt ? (
                          <span className="rounded-full border border-emerald-300/18 bg-emerald-300/8 px-2.5 py-1 text-emerald-100">
                            {packet.reviewDecision.replace(/_/g, " ")} {formatSavedAt(packet.reviewedAt)}
                          </span>
                        ) : null}
                        {packet.reviewerName ? (
                          <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1">
                            Reviewer: {packet.reviewerName}
                          </span>
                        ) : null}
                        {packet.confirmedAt ? (
                          <span className="rounded-full border border-emerald-300/18 bg-emerald-300/8 px-2.5 py-1 text-emerald-100">
                            Confirmed {formatSavedAt(packet.confirmedAt)}
                          </span>
                        ) : null}
                        {packet.origins.map((origin) => (
                          <span
                            key={`${packet.fingerprint}-${origin}`}
                            className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1"
                          >
                            {formatPacketOriginLabel(origin)}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Button
                          asChild
                          type="button"
                          variant="outline"
                          className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                        >
                          <Link href={`/tina/packets/${packet.fingerprint}`}>
                            <ExternalLink className="h-4 w-4" />
                            Review page
                          </Link>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                          onClick={() => void openPacketVersion(packet.fingerprint)}
                          disabled={selectedPacketState === "loading"}
                        >
                          {selectedPacketState === "loading" &&
                          openingPacketFingerprint === packet.fingerprint ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FolderOpen className="h-4 w-4" />
                          )}
                          {selectedPacketVersion?.fingerprint === packet.fingerprint
                            ? "Opened"
                            : "Open snapshot"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                          onClick={() => void downloadReviewBundle(packet.fingerprint, packetLabel)}
                          disabled={bundleDownloadState === "running"}
                        >
                          <Save className="h-4 w-4" />
                          Bundle again
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                          onClick={() => void downloadReviewPacketHtml(packet.fingerprint, packetLabel)}
                          disabled={htmlPacketState === "running"}
                        >
                          <Save className="h-4 w-4" />
                          Review packet again
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                          onClick={() => void downloadOfficialFormPacketPdf(packet.fingerprint, packetLabel)}
                          disabled={officialFormPdfState === "running"}
                        >
                          <Save className="h-4 w-4" />
                          PDF again
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
              onClick={() => void downloadReviewBook()}
              disabled={
                reviewBookState === "running" ||
                draft.cpaHandoff.status !== "complete" ||
                !officialFormPacketExportReady ||
                draft.finalSignoff.status !== "complete"
              }
            >
              {reviewBookState === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Download full handoff packet
            </Button>
            {fullHandoffPacketItem ? (
              <p className="text-sm text-zinc-400">
                Tina marks this file as <span className="text-zinc-200">{ARTIFACT_STATUS_LABELS[fullHandoffPacketItem.status]}</span> right now.
              </p>
            ) : null}
            {reviewBookMessage ? (
              <p
                className={cn(
                  "text-sm",
                  reviewBookState === "error" ? "text-amber-200" : "text-zinc-300"
                )}
              >
                {reviewBookMessage}
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            {artifactManifest.items.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-zinc-300">{item.summary}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {renderArtifactDelivery(item)}
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                        ARTIFACT_STATUS_STYLES[item.status]
                      )}
                    >
                      {ARTIFACT_STATUS_LABELS[item.status]}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                    {item.format}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                    {item.fileName}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{item.nextStep}</p>
              </div>
            ))}
          </div>
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
            Each idea needs proof before it can affect the federal return or reviewer packet. This is Tina&apos;s simple proof checklist.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm leading-6 text-zinc-300">
            <span className="font-medium text-white">Federal return stays first.</span> State proof cards
            only check whether Washington or another state changes the federal package or needs a
            separate reviewer note.
          </div>
          {authorityBackgroundProgress.trackedTaskCount > 0 ? (
            <div className="rounded-2xl border border-sky-300/18 bg-sky-300/8 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white">Background research progress</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-200">
                    {authorityBackgroundProgress.completedTaskCount} of{" "}
                    {authorityBackgroundProgress.trackedTaskCount} deeper passes complete.
                    {authorityBackgroundProgress.remainingTaskCount > 0 &&
                    authorityBackgroundProgress.estimatedRemainingMs !== null
                      ? ` About ${formatEstimatedRemainingDuration(authorityBackgroundProgress.estimatedRemainingMs)} remaining.`
                      : " Tina saved the deeper results."}
                  </p>
                </div>
                <span className="rounded-full border border-sky-300/18 bg-black/20 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-sky-50">
                  {authorityBackgroundProgress.progressPercent}% done
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/20">
                <div
                  className="h-full rounded-full bg-sky-300/70 transition-all"
                  style={{ width: `${authorityBackgroundProgress.progressPercent}%` }}
                />
              </div>
            </div>
          ) : null}
          {researchDossiers.length > 0 ? (
            researchDossiers.map((dossier) => {
              const authorityWork = authorityWorkMap.get(dossier.id);
              const researchRun = authorityWork?.researchRun ?? null;
              const challengeRun = authorityWork?.challengeRun ?? null;
              const researchBusy =
                researchingIdeaId === dossier.id || researchRun?.status === "running";
              const challengeBusy =
                challengingIdeaId === dossier.id || challengeRun?.status === "running";
              const researchDisabled =
                researchBusy || (researchRun ? isTinaAuthorityBackgroundRunActive(researchRun) : false);
              const challengeDisabled =
                challengeBusy || (challengeRun ? isTinaAuthorityBackgroundRunActive(challengeRun) : false);
              const researchRunSummary = researchRun
                ? getAuthorityRunSummary(researchRun, "Tina will retry this authority pass after")
                : null;
              const challengeRunSummary = challengeRun
                ? getAuthorityRunSummary(challengeRun, "Tina will retry this stress test after")
                : null;
              const isStateScopeDossier =
                dossier.id === "wa-state-review" || dossier.id === "multistate-review";

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
                  {isStateScopeDossier ? (
                    <div className="mt-3 rounded-2xl border border-sky-300/18 bg-sky-300/8 px-3 py-3 text-sm leading-6 text-zinc-200">
                      Tina is checking this state issue only to protect the federal package or add
                      a reviewer note. It should not become a federal return position unless the
                      facts and primary authority clearly support that move.
                    </div>
                  ) : null}
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
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.14em]",
                            AUTHORITY_CHALLENGE_STYLES[authorityWork.challengeVerdict]
                          )}
                        >
                          {AUTHORITY_CHALLENGE_LABELS[authorityWork.challengeVerdict]}
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
                          disabled={researchDisabled}
                        >
                          {researchBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCcw className="h-4 w-4" />
                          )}
                          {researchRun
                            ? getAuthorityRunButtonLabel(researchRun, {
                                idleLabel: "Let Tina research this",
                                rerunLabel: "Run again",
                                queuedLabel: "Queued...",
                                runningLabel: "Working...",
                                rateLimitedLabel: "Waiting to retry...",
                              })
                            : "Let Tina research this"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8"
                          onClick={() => void runAuthorityChallenge(dossier.id)}
                          disabled={challengeDisabled}
                        >
                          {challengeBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ShieldCheck className="h-4 w-4" />
                          )}
                          {challengeRun
                            ? getAuthorityRunButtonLabel(challengeRun, {
                                idleLabel: "Stress test this",
                                rerunLabel: "Stress test again",
                                queuedLabel: "Queued...",
                                runningLabel: "Working...",
                                rateLimitedLabel: "Waiting to retry...",
                              })
                            : "Stress test this"}
                        </Button>
                        {authorityWork.lastAiRunAt ? (
                          <p className="text-sm text-zinc-400">
                            Last AI run {formatSavedAt(authorityWork.lastAiRunAt)}
                          </p>
                        ) : null}
                        {authorityWork.lastChallengeRunAt ? (
                          <p className="text-sm text-zinc-400">
                            Last stress test {formatSavedAt(authorityWork.lastChallengeRunAt)}
                          </p>
                        ) : null}
                      </div>
                      {researchRunSummary ? (
                        <p className="mt-3 text-sm leading-6 text-zinc-300">{researchRunSummary}</p>
                      ) : null}
                      {challengeRunSummary ? (
                        <p className="mt-2 text-sm leading-6 text-zinc-300">{challengeRunSummary}</p>
                      ) : null}
                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-white">Why this idea might fail</p>
                          <span
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.14em]",
                              AUTHORITY_CHALLENGE_STYLES[authorityWork.challengeVerdict]
                            )}
                          >
                            {AUTHORITY_CHALLENGE_LABELS[authorityWork.challengeVerdict]}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-300">
                          {authorityWork.challengeMemo.trim().length > 0
                            ? authorityWork.challengeMemo
                            : "Tina has not tried to break this idea yet. Run the stress test to look for weak spots, narrow fact fits, and disclosure pressure."}
                        </p>
                        {authorityWork.challengeWarnings.length > 0 ? (
                          <div className="mt-3">
                            <p className="text-sm font-medium text-white">Weak spots Tina found</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {authorityWork.challengeWarnings.map((warning) => (
                                <span
                                  key={`${dossier.id}-warning-${warning}`}
                                  className="rounded-full border border-amber-300/18 bg-amber-300/8 px-2.5 py-1 text-[11px] text-amber-50"
                                >
                                  {warning}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {authorityWork.challengeQuestions.length > 0 ? (
                          <div className="mt-3">
                            <p className="text-sm font-medium text-white">Questions a reviewer should answer</p>
                            <div className="mt-2 space-y-2">
                              {authorityWork.challengeQuestions.map((question) => (
                                <p
                                  key={`${dossier.id}-question-${question}`}
                                  className="text-sm leading-6 text-zinc-300"
                                >
                                  {question}
                                </p>
                              ))}
                            </div>
                          </div>
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
        </>
      ) : null}
    </div>
  );
}
