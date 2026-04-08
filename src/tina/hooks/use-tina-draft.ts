"use client";

import { useEffect, useRef, useState } from "react";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";
import type {
  TinaAiCleanupSnapshot,
  TinaAuthorityCitation,
  TinaBenchmarkProposalDecisionStatus,
  TinaCpaHandoffSnapshot,
  TinaAuthorityWorkItem,
  TinaBookTieOutSnapshot,
  TinaBootstrapReview,
  TinaBusinessTaxProfile,
  TinaCleanupPlan,
  TinaCleanupSuggestion,
  TinaDocumentReading,
  TinaDraftSyncStatus,
  TinaIssueQueue,
  TinaPackageReadinessSnapshot,
  TinaReviewerOutcomeMemory,
  TinaReviewerOutcomeRecord,
  TinaReviewerOverrideRecord,
  TinaScheduleCDraftSnapshot,
  TinaStoredDocument,
  TinaTaxAdjustment,
  TinaTaxAdjustmentSnapshot,
  TinaTaxPositionMemorySnapshot,
  TinaWorkpaperSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";
import { markTinaAiCleanupStale } from "@/tina/lib/ai-cleanup";
import {
  createDefaultTinaAuthorityWorkItem,
  upsertTinaAuthorityWorkItem,
} from "@/tina/lib/authority-work";
import { markTinaBookTieOutStale } from "@/tina/lib/book-tie-out";
import { markTinaBootstrapReviewStale } from "@/tina/lib/bootstrap-review";
import { markTinaCpaHandoffStale } from "@/tina/lib/cpa-handoff";
import { markTinaCleanupPlanStale } from "@/tina/lib/cleanup-plan";
import { markTinaIssueQueueStale } from "@/tina/lib/issue-queue";
import { markTinaPackageReadinessStale } from "@/tina/lib/package-readiness";
import { markTinaReviewerFinalStale } from "@/tina/lib/reviewer-final";
import {
  ingestTinaReviewerTraffic,
  upsertTinaReviewerOutcomeMemory,
} from "@/tina/lib/reviewer-outcomes";
import { importTinaReviewerTraffic } from "@/tina/lib/reviewer-traffic-import";
import { markTinaScheduleCDraftStale } from "@/tina/lib/schedule-c-draft";
import { deriveTinaSourceFactsFromReading } from "@/tina/lib/source-facts";
import { buildTinaBenchmarkProposalDecisionId } from "@/tina/lib/benchmark-rescore";
import { markTinaTaxAdjustmentsStale } from "@/tina/lib/tax-adjustments";
import { markTinaTaxPositionMemoryStale } from "@/tina/lib/tax-position-memory";
import { markTinaWorkpapersStale } from "@/tina/lib/workpapers";
import {
  createDefaultTinaWorkspaceDraft,
  pickLatestTinaWorkspaceDraft,
  parseTinaWorkspaceDraft,
  TINA_WORKSPACE_STORAGE_KEY,
  toPriorReturnSnapshot,
} from "@/tina/lib/workspace-draft";

function stampDraft(next: TinaWorkspaceDraft): TinaWorkspaceDraft {
  return {
    ...next,
    savedAt: new Date().toISOString(),
  };
}

function withStaleReview(next: TinaWorkspaceDraft): TinaWorkspaceDraft {
  return {
    ...next,
    bootstrapReview: markTinaBootstrapReviewStale(next.bootstrapReview),
    issueQueue: markTinaIssueQueueStale(next.issueQueue),
    bookTieOut: markTinaBookTieOutStale(next.bookTieOut),
    workpapers: markTinaWorkpapersStale(next.workpapers),
    cleanupPlan: markTinaCleanupPlanStale(next.cleanupPlan),
    aiCleanup: markTinaAiCleanupStale(next.aiCleanup),
    taxAdjustments: markTinaTaxAdjustmentsStale(next.taxAdjustments),
    taxPositionMemory: markTinaTaxPositionMemoryStale(next.taxPositionMemory),
    reviewerFinal: markTinaReviewerFinalStale(next.reviewerFinal),
    scheduleCDraft: markTinaScheduleCDraftStale(next.scheduleCDraft),
    packageReadiness: markTinaPackageReadinessStale(next.packageReadiness),
    cpaHandoff: markTinaCpaHandoffStale(next.cpaHandoff),
  };
}

export function useTinaDraft() {
  const [draft, setDraft] = useState<TinaWorkspaceDraft>(createDefaultTinaWorkspaceDraft);
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<TinaDraftSyncStatus>("loading");
  const lastSyncedSerializedRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      const stored = window.localStorage.getItem(TINA_WORKSPACE_STORAGE_KEY);
      const localDraft = parseTinaWorkspaceDraft(stored);

      try {
        const headers = await sentinelAuthHeaders();
        const res = await fetch("/api/tina/workspace", {
          method: "GET",
          headers,
        });

        if (!res.ok) throw new Error("load failed");

        const payload = (await res.json()) as { draft?: TinaWorkspaceDraft };
        const remoteDraft = payload.draft
          ? parseTinaWorkspaceDraft(JSON.stringify(payload.draft))
          : null;
        const resolved = pickLatestTinaWorkspaceDraft(localDraft, remoteDraft);

        if (cancelled) return;

        setDraft(resolved);
        lastSyncedSerializedRef.current = remoteDraft ? JSON.stringify(remoteDraft) : null;
        setHydrated(true);
        hydratedRef.current = true;
        setSyncStatus(remoteDraft ? "saved" : "local_only");
      } catch {
        if (cancelled) return;
        setDraft(localDraft);
        setHydrated(true);
        hydratedRef.current = true;
        setSyncStatus("local_only");
      }
    }

    void loadDraft();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(TINA_WORKSPACE_STORAGE_KEY, JSON.stringify(draft));
  }, [draft, hydrated]);

  useEffect(() => {
    if (!hydratedRef.current) return;

    const serialized = JSON.stringify(draft);
    if (serialized === lastSyncedSerializedRef.current) return;

    const timeout = window.setTimeout(async () => {
      try {
        setSyncStatus("saving");
        const headers = await sentinelAuthHeaders();
        const res = await fetch("/api/tina/workspace", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ draft }),
        });

        if (!res.ok) throw new Error("save failed");

        const payload = (await res.json()) as { draft?: TinaWorkspaceDraft };
        const savedDraft = payload.draft
          ? parseTinaWorkspaceDraft(JSON.stringify(payload.draft))
          : draft;
        const savedSerialized = JSON.stringify(savedDraft);

        lastSyncedSerializedRef.current = savedSerialized;
        setDraft(savedDraft);
        setSyncStatus("saved");
      } catch {
        setSyncStatus("error");
      }
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [draft]);

  function updateProfile<K extends keyof TinaBusinessTaxProfile>(
    key: K,
    value: TinaBusinessTaxProfile[K]
  ) {
    setDraft((current) =>
      stampDraft({
        ...withStaleReview(current),
        profile: {
          ...current.profile,
          [key]: value,
        },
      })
    );
  }

  function attachPriorReturn(file: File) {
    setDraft((current) =>
      stampDraft({
        ...withStaleReview(current),
        priorReturn: toPriorReturnSnapshot(file),
      })
    );
  }

  function clearPriorReturn() {
    setDraft((current) =>
      stampDraft({
        ...withStaleReview(current),
        priorReturn: null,
        priorReturnDocumentId: null,
      })
    );
  }

  function addUploadedDocument(document: TinaStoredDocument, markAsPriorReturn = false) {
    setDraft((current) => {
      const withoutExisting = current.documents.filter((item) => item.id !== document.id);
      return stampDraft({
        ...withStaleReview(current),
        priorReturn: markAsPriorReturn ? null : current.priorReturn,
        priorReturnDocumentId: markAsPriorReturn ? document.id : current.priorReturnDocumentId,
        documents: [document, ...withoutExisting].sort((a, b) =>
          Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt)
        ),
      });
    });
  }

  function removeDocument(documentId: string) {
    setDraft((current) =>
      stampDraft({
        ...withStaleReview(current),
        priorReturnDocumentId:
          current.priorReturnDocumentId === documentId ? null : current.priorReturnDocumentId,
        documents: current.documents.filter((item) => item.id !== documentId),
        documentReadings: current.documentReadings.filter((reading) => reading.documentId !== documentId),
        sourceFacts: current.sourceFacts.filter((fact) => fact.sourceDocumentId !== documentId),
      })
    );
  }

  function saveDocumentReading(reading: TinaDocumentReading) {
    setDraft((current) => {
      const sourceDocument = current.documents.find((document) => document.id === reading.documentId);
      const withoutExisting = current.documentReadings.filter(
        (item) => item.documentId !== reading.documentId
      );
      const withoutFactSet = current.sourceFacts.filter(
        (fact) => fact.sourceDocumentId !== reading.documentId
      );
      const nextSourceFacts = sourceDocument
        ? [...deriveTinaSourceFactsFromReading(sourceDocument, reading), ...withoutFactSet]
        : withoutFactSet;

      return stampDraft({
        ...withStaleReview(current),
        documentReadings: [reading, ...withoutExisting].sort((a, b) => {
          const aTime = a.lastReadAt ? Date.parse(a.lastReadAt) : 0;
          const bTime = b.lastReadAt ? Date.parse(b.lastReadAt) : 0;
          return bTime - aTime;
        }),
        sourceFacts: nextSourceFacts,
      });
    });
  }

  function saveBootstrapReview(review: TinaBootstrapReview) {
    setDraft((current) =>
      stampDraft({
        ...current,
        bootstrapReview: review,
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
      })
    );
  }

  function saveIssueQueue(issueQueue: TinaIssueQueue) {
    setDraft((current) =>
      stampDraft({
        ...current,
        issueQueue,
        bookTieOut: markTinaBookTieOutStale(current.bookTieOut),
        workpapers: markTinaWorkpapersStale(current.workpapers),
        cleanupPlan: markTinaCleanupPlanStale(current.cleanupPlan),
        aiCleanup: markTinaAiCleanupStale(current.aiCleanup),
        taxAdjustments: markTinaTaxAdjustmentsStale(current.taxAdjustments),
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
      })
    );
  }

  function saveWorkpapers(workpapers: TinaWorkpaperSnapshot) {
    setDraft((current) =>
      stampDraft({
        ...current,
        workpapers,
        cleanupPlan: markTinaCleanupPlanStale(current.cleanupPlan),
        aiCleanup: markTinaAiCleanupStale(current.aiCleanup),
        taxAdjustments: markTinaTaxAdjustmentsStale(current.taxAdjustments),
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
      })
    );
  }

  function saveCleanupPlan(cleanupPlan: TinaCleanupPlan) {
    setDraft((current) =>
      stampDraft({
        ...current,
        cleanupPlan,
        aiCleanup: markTinaAiCleanupStale(current.aiCleanup),
        taxAdjustments: markTinaTaxAdjustmentsStale(current.taxAdjustments),
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
      })
    );
  }

  function saveAiCleanup(aiCleanup: TinaAiCleanupSnapshot) {
    setDraft((current) =>
      stampDraft({
        ...current,
        aiCleanup,
        taxAdjustments: markTinaTaxAdjustmentsStale(current.taxAdjustments),
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
      })
    );
  }

  function saveTaxAdjustments(taxAdjustments: TinaTaxAdjustmentSnapshot) {
    setDraft((current) =>
      stampDraft({
        ...current,
        taxAdjustments,
        taxPositionMemory: markTinaTaxPositionMemoryStale(current.taxPositionMemory),
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
      })
    );
  }

  function saveTaxPositionMemory(taxPositionMemory: TinaTaxPositionMemorySnapshot) {
    setDraft((current) =>
      stampDraft({
        ...current,
        taxPositionMemory,
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
      })
    );
  }

  function saveReviewerFinal(reviewerFinal: TinaWorkpaperSnapshot) {
    setDraft((current) =>
      stampDraft({
        ...current,
        reviewerFinal,
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
      })
    );
  }

  function saveScheduleCDraft(scheduleCDraft: TinaScheduleCDraftSnapshot) {
    setDraft((current) =>
      stampDraft({
        ...current,
        scheduleCDraft,
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
      })
    );
  }

  function savePackageReadiness(packageReadiness: TinaPackageReadinessSnapshot) {
    setDraft((current) =>
      stampDraft({
        ...current,
        packageReadiness,
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
      })
    );
  }

  function saveCpaHandoff(cpaHandoff: TinaCpaHandoffSnapshot) {
    setDraft((current) =>
      stampDraft({
        ...current,
        cpaHandoff,
      })
    );
  }

  function saveBookTieOut(bookTieOut: TinaBookTieOutSnapshot) {
    setDraft((current) =>
      stampDraft({
        ...current,
        bookTieOut,
        workpapers: markTinaWorkpapersStale(current.workpapers),
        cleanupPlan: markTinaCleanupPlanStale(current.cleanupPlan),
        aiCleanup: markTinaAiCleanupStale(current.aiCleanup),
        taxAdjustments: markTinaTaxAdjustmentsStale(current.taxAdjustments),
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
      })
    );
  }

  function saveReviewerOutcomeMemory(reviewerOutcomeMemory: TinaReviewerOutcomeMemory) {
    setDraft((current) =>
      stampDraft({
        ...current,
        reviewerOutcomeMemory,
        taxPositionMemory: markTinaTaxPositionMemoryStale(current.taxPositionMemory),
      })
    );
  }

  function addReviewerOverride(override: TinaReviewerOverrideRecord) {
    setDraft((current) =>
      stampDraft({
        ...current,
        reviewerOutcomeMemory: upsertTinaReviewerOutcomeMemory(current.reviewerOutcomeMemory, {
          override,
        }),
        taxPositionMemory: markTinaTaxPositionMemoryStale(current.taxPositionMemory),
      })
    );
  }

  function addReviewerOutcome(outcome: TinaReviewerOutcomeRecord) {
    setDraft((current) =>
      stampDraft({
        ...current,
        reviewerOutcomeMemory: upsertTinaReviewerOutcomeMemory(current.reviewerOutcomeMemory, {
          outcome,
        }),
        taxPositionMemory: markTinaTaxPositionMemoryStale(current.taxPositionMemory),
      })
    );
  }

  function ingestReviewerTraffic(input: {
    overrides?: TinaReviewerOverrideRecord[];
    outcomes?: TinaReviewerOutcomeRecord[];
  }) {
    setDraft((current) =>
      stampDraft({
        ...current,
        reviewerOutcomeMemory: ingestTinaReviewerTraffic(current.reviewerOutcomeMemory, input),
        taxPositionMemory: markTinaTaxPositionMemoryStale(current.taxPositionMemory),
      })
    );
  }

  function importReviewerTrafficBatch(input: {
    content: string;
    format?: "json" | "csv";
    defaultDecidedBy?: string | null;
  }) {
    const imported = importTinaReviewerTraffic(input);

    setDraft((current) =>
      stampDraft({
        ...current,
        reviewerOutcomeMemory: ingestTinaReviewerTraffic(current.reviewerOutcomeMemory, {
          overrides: imported.overrides,
          outcomes: imported.outcomes,
        }),
        taxPositionMemory: markTinaTaxPositionMemoryStale(current.taxPositionMemory),
      })
    );

    return imported;
  }

  function saveBenchmarkProposalDecision(args: {
    skillId: string;
    cohortTag: TinaWorkspaceDraft["benchmarkProposalDecisions"][number]["cohortTag"];
    status: TinaBenchmarkProposalDecisionStatus;
    rationale?: string;
    decidedBy?: string | null;
  }) {
    setDraft((current) => {
      const id = buildTinaBenchmarkProposalDecisionId(args.skillId, args.cohortTag);
      const decision = {
        id,
        skillId: args.skillId,
        cohortTag: args.cohortTag,
        status: args.status,
        rationale: args.rationale?.trim() ?? "",
        decidedAt: new Date().toISOString(),
        decidedBy: args.decidedBy ?? null,
      };

      return stampDraft({
        ...current,
        benchmarkProposalDecisions: [
          decision,
          ...current.benchmarkProposalDecisions.filter((item) => item.id !== id),
        ],
      });
    });
  }

  function updateCleanupSuggestion(
    suggestionId: string,
    updater: (current: TinaCleanupSuggestion) => TinaCleanupSuggestion
  ) {
    setDraft((current) =>
      stampDraft({
        ...current,
        cleanupPlan: {
          ...current.cleanupPlan,
          suggestions: current.cleanupPlan.suggestions.map((suggestion) =>
            suggestion.id === suggestionId ? updater(suggestion) : suggestion
          ),
        },
        aiCleanup: markTinaAiCleanupStale(current.aiCleanup),
        taxAdjustments: markTinaTaxAdjustmentsStale(current.taxAdjustments),
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
      })
    );
  }

  function updateTaxAdjustment(
    adjustmentId: string,
    updater: (current: TinaTaxAdjustment) => TinaTaxAdjustment
  ) {
    setDraft((current) =>
      stampDraft({
        ...current,
        taxAdjustments: {
          ...current.taxAdjustments,
          adjustments: current.taxAdjustments.adjustments.map((adjustment) =>
            adjustment.id === adjustmentId ? updater(adjustment) : adjustment
          ),
        },
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
      })
    );
  }

  function saveAuthorityWorkItem(workItem: TinaAuthorityWorkItem) {
    setDraft((current) =>
      stampDraft({
        ...current,
        authorityWork: upsertTinaAuthorityWorkItem(current.authorityWork, workItem),
        taxAdjustments: markTinaTaxAdjustmentsStale(current.taxAdjustments),
        taxPositionMemory: markTinaTaxPositionMemoryStale(current.taxPositionMemory),
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
      })
    );
  }

  function updateAuthorityWorkItem(
    ideaId: string,
    updater: (current: TinaAuthorityWorkItem) => TinaAuthorityWorkItem
  ) {
    setDraft((current) => {
      const existing =
        current.authorityWork.find((item) => item.ideaId === ideaId) ??
        createDefaultTinaAuthorityWorkItem(ideaId);
      return stampDraft({
        ...current,
        authorityWork: upsertTinaAuthorityWorkItem(current.authorityWork, updater(existing)),
        taxAdjustments: markTinaTaxAdjustmentsStale(current.taxAdjustments),
        taxPositionMemory: markTinaTaxPositionMemoryStale(current.taxPositionMemory),
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
      });
    });
  }

  function addAuthorityCitation(ideaId: string, citation: TinaAuthorityCitation) {
    updateAuthorityWorkItem(ideaId, (current) => ({
      ...current,
      citations: [...current.citations, citation],
    }));
  }

  function updateAuthorityCitation(
    ideaId: string,
    citationId: string,
    updater: (citation: TinaAuthorityCitation) => TinaAuthorityCitation
  ) {
    updateAuthorityWorkItem(ideaId, (current) => ({
      ...current,
      citations: current.citations.map((citation) =>
        citation.id === citationId ? updater(citation) : citation
      ),
    }));
  }

  function removeAuthorityCitation(ideaId: string, citationId: string) {
    updateAuthorityWorkItem(ideaId, (current) => ({
      ...current,
      citations: current.citations.filter((citation) => citation.id !== citationId),
    }));
  }

  function resetDraft() {
    setDraft(stampDraft(createDefaultTinaWorkspaceDraft()));
  }

  return {
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
    saveBookTieOut,
    saveWorkpapers,
    saveCleanupPlan,
    saveAiCleanup,
    saveTaxAdjustments,
    saveTaxPositionMemory,
    saveReviewerFinal,
    saveScheduleCDraft,
    savePackageReadiness,
    saveCpaHandoff,
    saveReviewerOutcomeMemory,
    updateCleanupSuggestion,
    updateTaxAdjustment,
    saveAuthorityWorkItem,
    updateAuthorityWorkItem,
    addAuthorityCitation,
    updateAuthorityCitation,
    removeAuthorityCitation,
    addReviewerOverride,
    addReviewerOutcome,
    ingestReviewerTraffic,
    importReviewerTrafficBatch,
    saveBenchmarkProposalDecision,
    resetDraft,
  };
}
