import { buildTinaChecklist } from "@/tina/lib/checklist";
import { recommendTinaFilingLane } from "@/tina/lib/filing-lane";
import type {
  TinaCpaHandoffArtifact,
  TinaCpaHandoffArtifactStatus,
  TinaCpaHandoffSnapshot,
  TinaPackageReadinessItem,
  TinaWorkspaceDraft,
} from "@/tina/types";

function createEmptySnapshot(): TinaCpaHandoffSnapshot {
  return {
    lastRunAt: null,
    status: "idle",
    summary: "Tina has not built the CPA handoff packet yet.",
    nextStep:
      "Build the package check first, then let Tina lay out what belongs in the review packet.",
    artifacts: [],
  };
}

export function createDefaultTinaCpaHandoff(): TinaCpaHandoffSnapshot {
  return createEmptySnapshot();
}

export function markTinaCpaHandoffStale(
  snapshot: TinaCpaHandoffSnapshot
): TinaCpaHandoffSnapshot {
  if (snapshot.status === "idle" || snapshot.status === "stale") return snapshot;

  return {
    ...snapshot,
    status: "stale",
    summary:
      "Your draft, package check, or review notes changed, so Tina should rebuild the CPA handoff packet.",
    nextStep:
      "Build the CPA handoff packet again so Tina does not lean on old review notes or packet sections.",
  };
}

function uniqueIds(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatMoney(value: number | null): string {
  if (value === null) return "No clear dollar total yet";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function buildArtifact(args: {
  id: string;
  title: string;
  status: TinaCpaHandoffArtifactStatus;
  summary: string;
  includes: string[];
  relatedFieldIds?: string[];
  relatedNoteIds?: string[];
  relatedReadinessItemIds?: string[];
  sourceDocumentIds?: string[];
}): TinaCpaHandoffArtifact {
  return {
    id: args.id,
    title: args.title,
    status: args.status,
    summary: args.summary,
    includes: args.includes,
    relatedFieldIds: args.relatedFieldIds ?? [],
    relatedNoteIds: args.relatedNoteIds ?? [],
    relatedReadinessItemIds: args.relatedReadinessItemIds ?? [],
    sourceDocumentIds: args.sourceDocumentIds ?? [],
  };
}

function isFieldOrNoteItem(item: TinaPackageReadinessItem): boolean {
  return item.relatedFieldIds.length > 0 || item.relatedNoteIds.length > 0;
}

export function buildTinaCpaHandoff(draft: TinaWorkspaceDraft): TinaCpaHandoffSnapshot {
  const now = new Date().toISOString();
  const lane = recommendTinaFilingLane(draft.profile, draft.sourceFacts);
  const checklist = buildTinaChecklist(draft, lane);

  if (draft.reviewerFinal.status !== "complete") {
    return {
      ...createDefaultTinaCpaHandoff(),
      lastRunAt: now,
      status: draft.reviewerFinal.status === "stale" ? "stale" : "idle",
      summary:
        "Tina needs the return-facing review layer before she can lay out a CPA handoff packet.",
      nextStep: "Build the return-facing review layer first.",
    };
  }

  if (draft.scheduleCDraft.status !== "complete") {
    return {
      ...createDefaultTinaCpaHandoff(),
      lastRunAt: now,
      status: draft.scheduleCDraft.status === "stale" ? "stale" : "idle",
      summary:
        "Tina needs the first Schedule C draft before she can lay out a CPA handoff packet.",
      nextStep: "Build the Schedule C draft first.",
    };
  }

  if (draft.packageReadiness.status !== "complete") {
    return {
      ...createDefaultTinaCpaHandoff(),
      lastRunAt: now,
      status: draft.packageReadiness.status === "stale" ? "stale" : "idle",
      summary:
        "Tina needs the filing-package check before she can say which review packet pieces are ready.",
      nextStep: "Run the package check first.",
    };
  }

  const blockingReadinessItems = draft.packageReadiness.items.filter(
    (item) => item.severity === "blocking"
  );
  const attentionReadinessItems = draft.packageReadiness.items.filter(
    (item) => item.severity === "needs_attention"
  );
  const fieldOrNoteBlockingItems = blockingReadinessItems.filter(isFieldOrNoteItem);
  const fieldOrNoteAttentionItems = attentionReadinessItems.filter(isFieldOrNoteItem);
  const requiredChecklistItems = checklist.filter(
    (item) => item.priority === "required" && item.status === "needed"
  );
  const authorityBlockedAdjustments = draft.taxAdjustments.adjustments.filter(
    (adjustment) => adjustment.status === "needs_authority"
  );
  const reviewAdjustments = draft.taxAdjustments.adjustments.filter(
    (adjustment) => adjustment.status === "ready_for_review"
  );
  const unresolvedAuthorityWork = draft.authorityWork.filter(
    (item) =>
      item.status === "not_started" ||
      item.status === "researching" ||
      item.status === "ready_for_reviewer"
  );
  const citationCount = draft.authorityWork.reduce(
    (total, item) => total + item.citations.length,
    0
  );
  const stressTestCount = draft.authorityWork.filter((item) => item.lastChallengeRunAt).length;
  const cautionStressTestCount = draft.authorityWork.filter(
    (item) => item.challengeVerdict === "needs_care"
  ).length;
  const failedStressTestCount = draft.authorityWork.filter(
    (item) => item.challengeVerdict === "likely_fails"
  ).length;
  const booksDocumentIds = draft.documents
    .filter((document) => document.requestId === "quickbooks")
    .map((document) => document.id);
  const booksWaitingCount =
    draft.booksImport.status === "complete"
      ? draft.booksImport.documents.filter((document) => document.status === "waiting").length
      : 0;
  const booksAttentionCount =
    draft.booksImport.status === "complete"
      ? draft.booksImport.documents.filter((document) => document.status === "needs_attention").length
      : 0;

  const allDocumentIds = draft.documents.map((document) => document.id);
  const unreadDocumentCount = draft.documents.filter((document) => {
    const reading = draft.documentReadings.find((item) => item.documentId === document.id);
    return !reading || reading.status !== "complete";
  }).length;
  const reviewerFinalDocumentIds = uniqueIds(
    draft.reviewerFinal.lines.flatMap((line) => line.sourceDocumentIds)
  );
  const scheduleCDocumentIds = uniqueIds([
    ...draft.scheduleCDraft.fields.flatMap((field) => field.sourceDocumentIds),
    ...draft.scheduleCDraft.notes.flatMap((note) => note.sourceDocumentIds),
  ]);
  const officialFormDocumentIds = uniqueIds(
    draft.officialFormPacket.forms.flatMap((form) => form.sourceDocumentIds)
  );
  const readinessDocumentIds = uniqueIds(
    draft.packageReadiness.items.flatMap((item) => item.sourceDocumentIds)
  );

  const coverNoteStatus: TinaCpaHandoffArtifactStatus =
    draft.packageReadiness.level === "blocked"
      ? "blocked"
      : draft.packageReadiness.level === "needs_review"
        ? "waiting"
        : "ready";

  const sourceIndexStatus: TinaCpaHandoffArtifactStatus =
    draft.documents.length === 0 || requiredChecklistItems.length > 0 || unreadDocumentCount > 0
      ? "waiting"
      : "ready";

  const booksLaneStatus: TinaCpaHandoffArtifactStatus =
    booksDocumentIds.length === 0
      ? "waiting"
      : draft.booksImport.status !== "complete"
        ? "waiting"
        : booksAttentionCount > 0
          ? "blocked"
          : booksWaitingCount > 0
            ? "waiting"
            : "ready";

  const workpaperTraceStatus: TinaCpaHandoffArtifactStatus =
    draft.reviewerFinal.lines.length > 0 &&
    (draft.scheduleCDraft.fields.length > 0 || draft.scheduleCDraft.notes.length > 0)
      ? "ready"
      : "waiting";

  const authorityStatus: TinaCpaHandoffArtifactStatus =
    authorityBlockedAdjustments.length > 0
      ? "blocked"
      : reviewAdjustments.length > 0 || unresolvedAuthorityWork.length > 0
        ? "waiting"
        : "ready";

  const scheduleDraftStatus: TinaCpaHandoffArtifactStatus =
    draft.scheduleCDraft.fields.length === 0
      ? "waiting"
      : fieldOrNoteBlockingItems.length > 0
        ? "blocked"
        : fieldOrNoteAttentionItems.length > 0
          ? "waiting"
          : "ready";

  const officialFormBlocked = draft.officialFormPacket.forms.some((form) => form.status === "blocked");
  const officialFormWaiting = draft.officialFormPacket.forms.some(
    (form) => form.status === "needs_review"
  );
  const officialFormLineCount = draft.officialFormPacket.forms.reduce(
    (total, form) => total + form.lines.length,
    0
  );
  const officialFormStatus: TinaCpaHandoffArtifactStatus =
    draft.officialFormPacket.status !== "complete" || draft.officialFormPacket.forms.length === 0
      ? "waiting"
      : officialFormBlocked
        ? "blocked"
        : officialFormWaiting
          ? "waiting"
          : "ready";

  const openItemsStatus: TinaCpaHandoffArtifactStatus =
    blockingReadinessItems.length > 0
      ? "blocked"
      : attentionReadinessItems.length > 0
        ? "waiting"
        : "ready";

  const artifacts: TinaCpaHandoffArtifact[] = [
    buildArtifact({
      id: "cpa-cover-note",
      title: "CPA cover note",
      status: coverNoteStatus,
      summary:
        coverNoteStatus === "ready"
          ? "Tina can frame the packet for a reviewer in plain language."
          : coverNoteStatus === "waiting"
            ? "Tina can draft the cover note, but a few review items still belong at the top."
            : "Tina can explain the packet, but she still has blockers a CPA should see first.",
      includes: [
        `Business: ${draft.profile.businessName || "Still needed"}`,
        `Tax year: ${draft.profile.taxYear || "Still needed"}`,
        `Lane: ${lane.title}`,
        `Package check: ${draft.packageReadiness.level.replace(/_/g, " ")}`,
      ],
      relatedReadinessItemIds: draft.packageReadiness.items.map((item) => item.id),
      sourceDocumentIds: readinessDocumentIds,
    }),
    buildArtifact({
      id: "source-paper-index",
      title: "Source paper index",
      status: sourceIndexStatus,
      summary:
        sourceIndexStatus === "ready"
          ? "Tina has enough saved papers to hand a reviewer a clean starting stack."
          : "Tina still wants more papers before this source list feels complete.",
      includes: [
        formatCount(draft.documents.length, "saved paper"),
        draft.priorReturnDocumentId
          ? "Prior-year return is attached"
          : "Prior-year return is not attached yet",
        `${draft.documentReadings.filter((reading) => reading.status === "complete").length} paper read${draft.documentReadings.filter((reading) => reading.status === "complete").length === 1 ? "" : "s"} complete`,
        unreadDocumentCount > 0
          ? `${formatCount(unreadDocumentCount, "paper")} still unread`
          : "Saved papers have Tina reads",
        requiredChecklistItems.length > 0
          ? `${formatCount(requiredChecklistItems.length, "required ask")} still open`
          : "Required paper asks are covered",
      ],
      sourceDocumentIds: allDocumentIds,
    }),
    buildArtifact({
      id: "books-lane-summary",
      title: "Books lane summary",
      status: booksLaneStatus,
      summary:
        booksLaneStatus === "ready"
          ? "Tina has a reviewer-usable first bookkeeping picture."
          : booksLaneStatus === "blocked"
            ? "Tina has a bookkeeping picture, but at least one books file still looks too fuzzy to trust."
            : "Tina still needs more bookkeeping work before this lane feels reviewer-ready.",
      includes: [
        draft.booksConnection.summary,
        draft.booksImport.summary,
        draft.booksImport.coverageStart || draft.booksImport.coverageEnd
          ? `Coverage: ${draft.booksImport.coverageStart ?? "?"} through ${draft.booksImport.coverageEnd ?? "?"}`
          : "Coverage: Tina still needs a clearer date range",
        `Money in: ${formatMoney(draft.booksImport.moneyInTotal)}`,
        `Money out: ${formatMoney(draft.booksImport.moneyOutTotal)}`,
        draft.booksImport.clueLabels.length > 0
          ? `Clues: ${draft.booksImport.clueLabels.join(", ")}`
          : "Clues: no extra bookkeeping clue chips yet",
        booksWaitingCount > 0
          ? `${formatCount(booksWaitingCount, "books file")} still waiting on a first read`
          : "No books files are waiting on a first read",
        booksAttentionCount > 0
          ? `${formatCount(booksAttentionCount, "books file")} still need a cleaner export`
          : "No books files are flagged as fuzzy right now",
      ],
      sourceDocumentIds: booksDocumentIds,
    }),
    buildArtifact({
      id: "workpaper-trace",
      title: "Workpaper trace",
      status: workpaperTraceStatus,
      summary:
        workpaperTraceStatus === "ready"
          ? "Tina can show how the return-facing lines trace back to saved papers."
          : "Tina still needs return-facing lines before the workpaper trace is useful.",
      includes: [
        formatCount(draft.reviewerFinal.lines.length, "review line"),
        formatCount(draft.scheduleCDraft.fields.length, "Schedule C field"),
        formatCount(draft.scheduleCDraft.notes.length, "review note"),
      ],
      relatedFieldIds: draft.scheduleCDraft.fields.map((field) => field.id),
      relatedNoteIds: draft.scheduleCDraft.notes.map((note) => note.id),
      sourceDocumentIds: reviewerFinalDocumentIds,
    }),
    buildArtifact({
      id: "authority-and-risk",
      title: "Authority and risk summary",
      status: authorityStatus,
      summary:
        authorityStatus === "ready"
          ? "Tina does not see authority blockers in the current packet."
          : authorityStatus === "waiting"
            ? "Tina still has authority notes or review calls that should travel with the packet."
            : "Tina still has tax moves that need proof before a reviewer should trust them.",
      includes: [
        formatCount(draft.authorityWork.length, "authority work item"),
        formatCount(citationCount, "citation"),
        stressTestCount > 0
          ? formatCount(stressTestCount, "stress test")
          : "No saved stress tests yet",
        cautionStressTestCount > 0
          ? formatCount(cautionStressTestCount, "stress test that survived with caution")
          : "No caution verdicts saved",
        failedStressTestCount > 0
          ? formatCount(failedStressTestCount, "stress test that likely failed")
          : "No failed stress tests saved",
        formatCount(authorityBlockedAdjustments.length, "authority blocker"),
        formatCount(reviewAdjustments.length, "tax move waiting on review"),
      ],
      relatedReadinessItemIds: draft.packageReadiness.items
        .filter((item) => item.id.startsWith("adjustment-"))
        .map((item) => item.id),
      sourceDocumentIds: uniqueIds(
        draft.taxAdjustments.adjustments.flatMap((adjustment) => adjustment.sourceDocumentIds)
      ),
    }),
    buildArtifact({
      id: "schedule-c-draft",
      title: "Schedule C draft",
      status: scheduleDraftStatus,
      summary:
        scheduleDraftStatus === "ready"
          ? "Tina has a first supported Schedule C draft ready for CPA review."
          : scheduleDraftStatus === "waiting"
            ? "Tina drafted part of Schedule C, but some boxes or notes still need review."
            : "Tina should not hand off the Schedule C draft until its blocking boxes or notes are cleared.",
      includes: [
        formatCount(draft.scheduleCDraft.fields.length, "draft field"),
        formatCount(draft.scheduleCDraft.notes.length, "draft note"),
        formatCount(fieldOrNoteBlockingItems.length, "blocking field or note"),
        formatCount(fieldOrNoteAttentionItems.length, "field or note needing review"),
      ],
      relatedFieldIds: draft.scheduleCDraft.fields.map((field) => field.id),
      relatedNoteIds: draft.scheduleCDraft.notes.map((note) => note.id),
      relatedReadinessItemIds: uniqueIds([
        ...fieldOrNoteBlockingItems.map((item) => item.id),
        ...fieldOrNoteAttentionItems.map((item) => item.id),
      ]),
      sourceDocumentIds: scheduleCDocumentIds,
    }),
    buildArtifact({
      id: "official-form-packet",
      title: "Federal business form packet",
      status: officialFormStatus,
      summary:
        officialFormStatus === "ready"
          ? "Tina has a year-specific federal business form packet ready to travel with the review bundle."
          : officialFormStatus === "waiting"
            ? "Tina can see the federal business form path, but it still needs a fresh build or review before a CPA should rely on it."
            : "Tina should not treat the federal business form packet like stable IRS-facing paperwork yet because it still has blocked form lines or missing companion forms.",
      includes: [
        formatCount(draft.officialFormPacket.forms.length, "form"),
        formatCount(officialFormLineCount, "mapped line"),
        draft.officialFormPacket.lastRunAt
          ? `Last built ${new Date(draft.officialFormPacket.lastRunAt).toISOString().slice(0, 10)}`
          : "Not built yet",
      ],
      sourceDocumentIds: officialFormDocumentIds,
    }),
    buildArtifact({
      id: "open-items-list",
      title: "Open items list",
      status: openItemsStatus,
      summary:
        openItemsStatus === "ready"
          ? "Tina does not see open blockers in the current packet."
          : openItemsStatus === "waiting"
            ? "Tina can hand over the packet, but the reviewer should see the open review list."
            : "Tina still has blocking items that belong at the front of the packet.",
      includes: [
        formatCount(blockingReadinessItems.length, "blocking item"),
        formatCount(attentionReadinessItems.length, "review item"),
      ],
      relatedReadinessItemIds: draft.packageReadiness.items.map((item) => item.id),
      sourceDocumentIds: readinessDocumentIds,
    }),
  ];

  const readyCount = artifacts.filter((artifact) => artifact.status === "ready").length;
  const waitingCount = artifacts.filter((artifact) => artifact.status === "waiting").length;
  const blockedCount = artifacts.filter((artifact) => artifact.status === "blocked").length;

  let summary = `Tina prepared ${formatCount(artifacts.length, "packet section")}. ${formatCount(
    readyCount,
    "section"
  )} ready, ${formatCount(waitingCount, "section")} waiting, ${formatCount(
    blockedCount,
    "section"
  )} blocked.`;

  if (blockedCount === 0 && waitingCount === 0) {
    summary =
      "Tina prepared a full first CPA handoff packet. Nothing in the packet is still marked waiting or blocked.";
  }

  let nextStep =
    "Read through the packet once, then hand it to a CPA reviewer with the source papers attached.";
  if (blockedCount > 0) {
    nextStep =
      "Start with the blocked packet sections first. Tina should not hand this packet to a CPA yet.";
  } else if (waitingCount > 0) {
    nextStep =
      "Clear the waiting packet sections next so Tina can hand over a cleaner first review packet.";
  }

  return {
    lastRunAt: now,
    status: "complete",
    summary,
    nextStep,
    artifacts,
  };
}
