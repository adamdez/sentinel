"use client";

import { useEffect, useRef, useState } from "react";
import { sentinelAuthHeaders } from "@/lib/sentinel-auth-headers";
import {
  parseTinaStoredPacketVersion,
  type TinaStoredPacketVersion,
  type TinaStoredPacketVersionSummary,
} from "@/tina/lib/packet-versions";
import type {
  TinaAiCleanupSnapshot,
  TinaAuthorityCitation,
  TinaBooksConnectionSnapshot,
  TinaBooksImportSnapshot,
  TinaCpaHandoffSnapshot,
  TinaAuthorityWorkItem,
  TinaBootstrapReview,
  TinaBusinessTaxProfile,
  TinaCleanupPlan,
  TinaCleanupSuggestion,
  TinaDocumentReading,
  TinaDraftSyncStatus,
  TinaIrsAuthorityWatchStatus,
  TinaIssueQueue,
  TinaFinalSignoffSnapshot,
  TinaOfficialFormPacketSnapshot,
  TinaPackageReadinessSnapshot,
  TinaScheduleCDraftSnapshot,
  TinaStoredDocument,
  TinaTaxAdjustment,
  TinaTaxAdjustmentSnapshot,
  TinaWorkpaperSnapshot,
  TinaWorkspaceDraft,
} from "@/tina/types";
import { markTinaAiCleanupStale } from "@/tina/lib/ai-cleanup";
import {
  createDefaultTinaAuthorityWorkItem,
} from "@/tina/lib/authority-work";
import { applyTinaAuthorityWorkItemToDraft } from "@/tina/lib/authority-work-draft";
import { markTinaBooksImportStale } from "@/tina/lib/books-import";
import { markTinaBootstrapReviewStale } from "@/tina/lib/bootstrap-review";
import { syncTinaBooksConnectionWithDocuments } from "@/tina/lib/books-connection";
import { markTinaCpaHandoffStale } from "@/tina/lib/cpa-handoff";
import { markTinaCleanupPlanStale } from "@/tina/lib/cleanup-plan";
import { canConfirmTinaFinalSignoff, markTinaFinalSignoffStale } from "@/tina/lib/final-signoff";
import { markTinaIssueQueueStale } from "@/tina/lib/issue-queue";
import {
  getTinaDraftSyncStatusAfterSave,
  isTinaDraftSaveOutdated,
  shouldReplaceLocalTinaDraftAfterSave,
} from "@/tina/lib/draft-sync";
import { markTinaOfficialFormPacketStale } from "@/tina/lib/official-form-packet";
import { markTinaPackageReadinessStale } from "@/tina/lib/package-readiness";
import { buildTinaPacketIdentity } from "@/tina/lib/packet-identity";
import { markTinaReviewerFinalStale } from "@/tina/lib/reviewer-final";
import { markTinaScheduleCDraftStale } from "@/tina/lib/schedule-c-draft";
import { deriveTinaSourceFactsFromReading } from "@/tina/lib/source-facts";
import { markTinaTaxAdjustmentsStale } from "@/tina/lib/tax-adjustments";
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

function clearFinalSignoffConfirmationState(
  finalSignoff: TinaFinalSignoffSnapshot
): TinaFinalSignoffSnapshot {
  return {
    ...finalSignoff,
    confirmedAt: null,
    confirmedPacketId: null,
    confirmedPacketVersion: null,
    confirmedPacketFingerprint: null,
  };
}

function withStaleReview(next: TinaWorkspaceDraft): TinaWorkspaceDraft {
  return {
    ...next,
    bootstrapReview: markTinaBootstrapReviewStale(next.bootstrapReview),
    issueQueue: markTinaIssueQueueStale(next.issueQueue),
    workpapers: markTinaWorkpapersStale(next.workpapers),
    cleanupPlan: markTinaCleanupPlanStale(next.cleanupPlan),
    aiCleanup: markTinaAiCleanupStale(next.aiCleanup),
    taxAdjustments: markTinaTaxAdjustmentsStale(next.taxAdjustments),
    reviewerFinal: markTinaReviewerFinalStale(next.reviewerFinal),
    scheduleCDraft: markTinaScheduleCDraftStale(next.scheduleCDraft),
    officialFormPacket: markTinaOfficialFormPacketStale(next.officialFormPacket),
    packageReadiness: markTinaPackageReadinessStale(next.packageReadiness),
    cpaHandoff: markTinaCpaHandoffStale(next.cpaHandoff),
    finalSignoff: markTinaFinalSignoffStale(next.finalSignoff),
  };
}

export function useTinaDraft() {
  const [draft, setDraft] = useState<TinaWorkspaceDraft>(createDefaultTinaWorkspaceDraft);
  const [irsAuthorityWatchStatus, setIrsAuthorityWatchStatus] =
    useState<TinaIrsAuthorityWatchStatus | null>(null);
  const [packetVersions, setPacketVersions] = useState<TinaStoredPacketVersionSummary[]>([]);
  const [selectedPacketVersion, setSelectedPacketVersion] = useState<TinaStoredPacketVersion | null>(null);
  const [selectedPacketState, setSelectedPacketState] = useState<"idle" | "loading" | "error">(
    "idle"
  );
  const [openingPacketFingerprint, setOpeningPacketFingerprint] = useState<string | null>(null);
  const [selectedPacketMessage, setSelectedPacketMessage] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [syncStatus, setSyncStatus] = useState<TinaDraftSyncStatus>("loading");
  const [syncPaused, setSyncPaused] = useState(false);
  const lastSyncedSerializedRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const draftRef = useRef(draft);
  const saveRequestIdRef = useRef(0);
  const latestResolvedSaveRequestIdRef = useRef(0);

  function replaceDraft(nextDraft: TinaWorkspaceDraft) {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }

  function updateDraft(updater: (current: TinaWorkspaceDraft) => TinaWorkspaceDraft) {
    setDraft((current) => {
      const nextDraft = updater(current);
      draftRef.current = nextDraft;
      return nextDraft;
    });
  }

  async function saveDraftNow(
    candidateDraft: TinaWorkspaceDraft = draftRef.current
  ): Promise<TinaWorkspaceDraft> {
    const requestId = ++saveRequestIdRef.current;
    setSyncStatus("saving");
    const headers = await sentinelAuthHeaders();
    const res = await fetch("/api/tina/workspace", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ draft: candidateDraft }),
    });

    if (!res.ok) {
      if (requestId >= latestResolvedSaveRequestIdRef.current) {
        setSyncStatus("error");
      }
      throw new Error("save failed");
    }

    const payload = (await res.json()) as {
      draft?: TinaWorkspaceDraft;
      irsAuthorityWatchStatus?: TinaIrsAuthorityWatchStatus;
      packetVersions?: TinaStoredPacketVersionSummary[];
      saveAccepted?: boolean;
    };
    const savedDraft = payload.draft
      ? parseTinaWorkspaceDraft(JSON.stringify(payload.draft))
      : candidateDraft;
    const savedSerialized = JSON.stringify(savedDraft);

    if (isTinaDraftSaveOutdated(requestId, latestResolvedSaveRequestIdRef.current)) {
      return savedDraft;
    }

    latestResolvedSaveRequestIdRef.current = requestId;
    lastSyncedSerializedRef.current = savedSerialized;
    setPacketVersions(Array.isArray(payload.packetVersions) ? payload.packetVersions : []);
    setIrsAuthorityWatchStatus(payload.irsAuthorityWatchStatus ?? null);

    if (payload.saveAccepted === false) {
      replaceDraft(savedDraft);
      setSyncStatus("saved");
      return savedDraft;
    }

    if (shouldReplaceLocalTinaDraftAfterSave(candidateDraft, draftRef.current)) {
      replaceDraft(savedDraft);
      setSyncStatus("saved");
      return savedDraft;
    }

    setSyncStatus(getTinaDraftSyncStatusAfterSave(draftRef.current, savedDraft));

    return savedDraft;
  }

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

        const payload = (await res.json()) as {
          draft?: TinaWorkspaceDraft;
          irsAuthorityWatchStatus?: TinaIrsAuthorityWatchStatus;
          packetVersions?: TinaStoredPacketVersionSummary[];
        };
        const remoteDraft = payload.draft
          ? parseTinaWorkspaceDraft(JSON.stringify(payload.draft))
          : null;
        const resolved = pickLatestTinaWorkspaceDraft(localDraft, remoteDraft);

        if (cancelled) return;

        replaceDraft(resolved);
        setPacketVersions(Array.isArray(payload.packetVersions) ? payload.packetVersions : []);
        setIrsAuthorityWatchStatus(payload.irsAuthorityWatchStatus ?? null);
        lastSyncedSerializedRef.current = remoteDraft ? JSON.stringify(remoteDraft) : null;
        setHydrated(true);
        hydratedRef.current = true;
        setSyncStatus(remoteDraft ? "saved" : "local_only");
      } catch {
        if (cancelled) return;
        replaceDraft(localDraft);
        setPacketVersions([]);
        setIrsAuthorityWatchStatus(null);
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
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (syncPaused) return;

    const serialized = JSON.stringify(draft);
    if (serialized === lastSyncedSerializedRef.current) return;

    const timeout = window.setTimeout(async () => {
      try {
        await saveDraftNow(draft);
      } catch {
        setSyncStatus("error");
      }
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [draft, syncPaused]);

  async function refreshPacketVersions() {
    try {
      const headers = await sentinelAuthHeaders();
      const res = await fetch("/api/tina/packets", {
        method: "GET",
        headers,
      });

      if (!res.ok) throw new Error("refresh failed");

      const payload = (await res.json()) as {
        packetVersions?: TinaStoredPacketVersionSummary[];
      };

      setPacketVersions(Array.isArray(payload.packetVersions) ? payload.packetVersions : []);
    } catch {
      // Keep the current packet history view if a refresh fails.
    }
  }

  async function openPacketVersion(fingerprint: string) {
    const safeFingerprint = fingerprint.trim();
    if (!safeFingerprint) return;

    try {
      setSelectedPacketState("loading");
      setOpeningPacketFingerprint(safeFingerprint);
      setSelectedPacketMessage("Tina is reopening that saved packet...");
      const headers = await sentinelAuthHeaders();
      const res = await fetch(`/api/tina/packets/${encodeURIComponent(safeFingerprint)}`, {
        method: "GET",
        headers,
      });

      if (!res.ok) throw new Error("packet load failed");

      const payload = (await res.json()) as {
        packet?: unknown;
      };
      const parsedPacket = parseTinaStoredPacketVersion(payload.packet);

      if (!parsedPacket) throw new Error("packet parse failed");

      setSelectedPacketVersion(parsedPacket);
      setSelectedPacketState("idle");
      setSelectedPacketMessage(
        `Tina reopened ${parsedPacket.packetId} (${parsedPacket.packetVersion}).`
      );
    } catch {
      setSelectedPacketState("error");
      setSelectedPacketMessage(
        "Tina could not reopen that saved packet right now. Try again in a moment."
      );
    } finally {
      setOpeningPacketFingerprint(null);
    }
  }

  function clearSelectedPacketVersion() {
    setSelectedPacketVersion(null);
    setSelectedPacketState("idle");
    setOpeningPacketFingerprint(null);
    setSelectedPacketMessage(null);
  }

  function pauseDraftSync() {
    setSyncPaused(true);
  }

  function resumeDraftSync() {
    setSyncPaused(false);
  }

  function updateProfile<K extends keyof TinaBusinessTaxProfile>(
    key: K,
    value: TinaBusinessTaxProfile[K]
  ) {
    updateDraft((current) =>
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
    updateDraft((current) =>
      stampDraft({
        ...withStaleReview(current),
        priorReturn: toPriorReturnSnapshot(file),
      })
    );
  }

  function clearPriorReturn() {
    updateDraft((current) =>
      stampDraft({
        ...withStaleReview(current),
        priorReturn: null,
        priorReturnDocumentId: null,
      })
    );
  }

  function addUploadedDocument(document: TinaStoredDocument, markAsPriorReturn = false) {
    updateDraft((current) => {
      const withoutExisting = current.documents.filter((item) => item.id !== document.id);
      const nextDocuments = [document, ...withoutExisting].sort(
        (a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt)
      );
      return stampDraft({
        ...withStaleReview(current),
        priorReturn: markAsPriorReturn ? null : current.priorReturn,
        priorReturnDocumentId: markAsPriorReturn ? document.id : current.priorReturnDocumentId,
        documents: nextDocuments,
        booksConnection: syncTinaBooksConnectionWithDocuments(current.booksConnection, nextDocuments),
        booksImport: markTinaBooksImportStale(current.booksImport),
      });
    });
  }

  function removeDocument(documentId: string) {
    updateDraft((current) => {
      const nextDocuments = current.documents.filter((item) => item.id !== documentId);
      return stampDraft({
        ...withStaleReview(current),
        priorReturnDocumentId:
          current.priorReturnDocumentId === documentId ? null : current.priorReturnDocumentId,
        documents: nextDocuments,
        documentReadings: current.documentReadings.filter((reading) => reading.documentId !== documentId),
        sourceFacts: current.sourceFacts.filter((fact) => fact.sourceDocumentId !== documentId),
        booksConnection: syncTinaBooksConnectionWithDocuments(current.booksConnection, nextDocuments),
        booksImport: markTinaBooksImportStale(current.booksImport),
      });
    });
  }

  function saveDocumentReading(reading: TinaDocumentReading) {
    updateDraft((current) => {
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
        booksImport: markTinaBooksImportStale(current.booksImport),
      });
    });
  }

  function updateBooksConnection(booksConnection: TinaBooksConnectionSnapshot) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        booksConnection: syncTinaBooksConnectionWithDocuments(booksConnection, current.documents),
      })
    );
  }

  function saveBooksImport(booksImport: TinaBooksImportSnapshot) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        booksImport,
      })
    );
  }

  function saveBootstrapReview(review: TinaBootstrapReview) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        bootstrapReview: review,
        officialFormPacket: markTinaOfficialFormPacketStale(current.officialFormPacket),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
        finalSignoff: markTinaFinalSignoffStale(current.finalSignoff),
      })
    );
  }

  function saveIssueQueue(issueQueue: TinaIssueQueue) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        issueQueue,
        workpapers: markTinaWorkpapersStale(current.workpapers),
        cleanupPlan: markTinaCleanupPlanStale(current.cleanupPlan),
        aiCleanup: markTinaAiCleanupStale(current.aiCleanup),
        taxAdjustments: markTinaTaxAdjustmentsStale(current.taxAdjustments),
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        officialFormPacket: markTinaOfficialFormPacketStale(current.officialFormPacket),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
        finalSignoff: markTinaFinalSignoffStale(current.finalSignoff),
      })
    );
  }

  function saveWorkpapers(workpapers: TinaWorkpaperSnapshot) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        workpapers,
        cleanupPlan: markTinaCleanupPlanStale(current.cleanupPlan),
        aiCleanup: markTinaAiCleanupStale(current.aiCleanup),
        taxAdjustments: markTinaTaxAdjustmentsStale(current.taxAdjustments),
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        officialFormPacket: markTinaOfficialFormPacketStale(current.officialFormPacket),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
        finalSignoff: markTinaFinalSignoffStale(current.finalSignoff),
      })
    );
  }

  function saveCleanupPlan(cleanupPlan: TinaCleanupPlan) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        cleanupPlan,
        aiCleanup: markTinaAiCleanupStale(current.aiCleanup),
        taxAdjustments: markTinaTaxAdjustmentsStale(current.taxAdjustments),
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        officialFormPacket: markTinaOfficialFormPacketStale(current.officialFormPacket),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
        finalSignoff: markTinaFinalSignoffStale(current.finalSignoff),
      })
    );
  }

  function saveAiCleanup(aiCleanup: TinaAiCleanupSnapshot) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        aiCleanup,
        taxAdjustments: markTinaTaxAdjustmentsStale(current.taxAdjustments),
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        officialFormPacket: markTinaOfficialFormPacketStale(current.officialFormPacket),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
        finalSignoff: markTinaFinalSignoffStale(current.finalSignoff),
      })
    );
  }

  function saveTaxAdjustments(taxAdjustments: TinaTaxAdjustmentSnapshot) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        taxAdjustments,
        reviewerFinal: markTinaReviewerFinalStale(current.reviewerFinal),
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        officialFormPacket: markTinaOfficialFormPacketStale(current.officialFormPacket),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
        finalSignoff: markTinaFinalSignoffStale(current.finalSignoff),
      })
    );
  }

  function saveReviewerFinal(reviewerFinal: TinaWorkpaperSnapshot) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        reviewerFinal,
        scheduleCDraft: markTinaScheduleCDraftStale(current.scheduleCDraft),
        officialFormPacket: markTinaOfficialFormPacketStale(current.officialFormPacket),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
        finalSignoff: markTinaFinalSignoffStale(current.finalSignoff),
      })
    );
  }

  function saveScheduleCDraft(scheduleCDraft: TinaScheduleCDraftSnapshot) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        scheduleCDraft,
        officialFormPacket: markTinaOfficialFormPacketStale(current.officialFormPacket),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
        finalSignoff: markTinaFinalSignoffStale(current.finalSignoff),
      })
    );
  }

  function saveOfficialFormPacket(officialFormPacket: TinaOfficialFormPacketSnapshot) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        officialFormPacket,
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
        finalSignoff: markTinaFinalSignoffStale(current.finalSignoff),
      })
    );
  }

  function savePackageReadiness(packageReadiness: TinaPackageReadinessSnapshot) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        officialFormPacket: markTinaOfficialFormPacketStale(current.officialFormPacket),
        packageReadiness,
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
        finalSignoff: markTinaFinalSignoffStale(current.finalSignoff),
      })
    );
  }

  function saveCpaHandoff(cpaHandoff: TinaCpaHandoffSnapshot) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        cpaHandoff,
        finalSignoff: markTinaFinalSignoffStale(current.finalSignoff),
      })
    );
  }

  function saveFinalSignoff(finalSignoff: TinaFinalSignoffSnapshot) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        finalSignoff,
      })
    );
  }

  function updateCleanupSuggestion(
    suggestionId: string,
    updater: (current: TinaCleanupSuggestion) => TinaCleanupSuggestion
  ) {
    updateDraft((current) =>
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
        officialFormPacket: markTinaOfficialFormPacketStale(current.officialFormPacket),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
        finalSignoff: markTinaFinalSignoffStale(current.finalSignoff),
      })
    );
  }

  function updateTaxAdjustment(
    adjustmentId: string,
    updater: (current: TinaTaxAdjustment) => TinaTaxAdjustment
  ) {
    updateDraft((current) =>
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
        officialFormPacket: markTinaOfficialFormPacketStale(current.officialFormPacket),
        packageReadiness: markTinaPackageReadinessStale(current.packageReadiness),
        cpaHandoff: markTinaCpaHandoffStale(current.cpaHandoff),
        finalSignoff: markTinaFinalSignoffStale(current.finalSignoff),
      })
    );
  }

  function saveAuthorityWorkItem(workItem: TinaAuthorityWorkItem) {
    updateDraft((current) => stampDraft(applyTinaAuthorityWorkItemToDraft(current, workItem)));
  }

  function updateAuthorityWorkItem(
    ideaId: string,
    updater: (current: TinaAuthorityWorkItem) => TinaAuthorityWorkItem
  ) {
    updateDraft((current) => {
      const existing =
        current.authorityWork.find((item) => item.ideaId === ideaId) ??
        createDefaultTinaAuthorityWorkItem(ideaId);
      return stampDraft(applyTinaAuthorityWorkItemToDraft(current, updater(existing)));
    });
  }

  function updateFinalSignoffCheck(checkId: string, checked: boolean) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        finalSignoff: {
          ...clearFinalSignoffConfirmationState(current.finalSignoff),
          checks: current.finalSignoff.checks.map((check) =>
            check.id === checkId ? { ...check, checked } : check
          ),
        },
      })
    );
  }

  function updateFinalSignoffReviewerName(reviewerName: string) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        finalSignoff: {
          ...clearFinalSignoffConfirmationState(current.finalSignoff),
          reviewerName,
        },
      })
    );
  }

  function updateFinalSignoffReviewerNote(reviewerNote: string) {
    updateDraft((current) =>
      stampDraft({
        ...current,
        finalSignoff: {
          ...clearFinalSignoffConfirmationState(current.finalSignoff),
          reviewerNote,
        },
      })
    );
  }

  function confirmFinalSignoff() {
    updateDraft((current) => {
      if (!canConfirmTinaFinalSignoff(current.finalSignoff)) {
        return current;
      }

      const confirmedAt = new Date().toISOString();
      const packetIdentity = buildTinaPacketIdentity(current);

      return stampDraft({
        ...current,
        finalSignoff: {
          ...current.finalSignoff,
          reviewPacketId: packetIdentity.packetId,
          reviewPacketVersion: packetIdentity.packetVersion,
          reviewPacketFingerprint: packetIdentity.fingerprint,
          confirmedAt,
          confirmedPacketId: packetIdentity.packetId,
          confirmedPacketVersion: packetIdentity.packetVersion,
          confirmedPacketFingerprint: packetIdentity.fingerprint,
        },
      });
    });
  }

  function clearFinalSignoffConfirmation() {
    updateDraft((current) =>
      stampDraft({
        ...current,
        finalSignoff: {
          ...clearFinalSignoffConfirmationState(current.finalSignoff),
        },
      })
    );
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
    replaceDraft(stampDraft(createDefaultTinaWorkspaceDraft()));
  }

  return {
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
  };
}
