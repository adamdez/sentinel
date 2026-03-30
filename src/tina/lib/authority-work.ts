import { buildTinaAuthorityTrails } from "@/tina/lib/authority-trails";
import { buildTinaResearchDossiers } from "@/tina/lib/research-dossiers";
import { sanitizeTinaAiText, sanitizeTinaAiTextList } from "@/tina/lib/ai-text-normalization";
import type {
  TinaAuthorityBackgroundRun,
  TinaAuthorityCitation,
  TinaAuthorityChallengeVerdict,
  TinaAuthorityDisclosureDecision,
  TinaAuthorityReviewerDecision,
  TinaAuthorityWorkItem,
  TinaAuthorityWorkStatus,
  TinaWorkspaceDraft,
} from "@/tina/types";

export interface TinaAuthorityWorkItemView extends TinaAuthorityWorkItem {
  title: string;
  summary: string;
  nextStep: string;
  memoFocus: string;
  reviewerQuestion: string;
  authorityTargets: string[];
  documentIds: string[];
  factIds: string[];
}

export interface TinaAuthorityResearchRunResult {
  memo: string;
  citations: TinaAuthorityCitation[];
  missingAuthority: string[];
  status: TinaAuthorityWorkStatus;
  reviewerDecision: TinaAuthorityReviewerDecision;
  disclosureDecision: TinaAuthorityDisclosureDecision;
  lastAiRunAt: string;
}

export interface TinaAuthorityChallengeRunResult {
  challengeVerdict: TinaAuthorityChallengeVerdict;
  challengeMemo: string;
  challengeWarnings: string[];
  challengeQuestions: string[];
  citations: TinaAuthorityCitation[];
  missingAuthority: string[];
  status: TinaAuthorityWorkStatus;
  reviewerDecision: TinaAuthorityReviewerDecision;
  disclosureDecision: TinaAuthorityDisclosureDecision;
  lastChallengeRunAt: string;
}

type TinaAuthorityRunKey = "researchRun" | "challengeRun";
export type TinaAuthorityBackgroundTaskKind = "research" | "challenge";

export interface TinaAuthorityBackgroundProgressSnapshot {
  trackedTaskCount: number;
  completedTaskCount: number;
  remainingTaskCount: number;
  progressPercent: number;
  estimatedRemainingMs: number | null;
}

export interface TinaAuthorityBackgroundQueueTask {
  kind: TinaAuthorityBackgroundTaskKind;
  ideaId: string;
  workItem: TinaAuthorityWorkItemView;
  delayMs: number;
}

export interface TinaAuthorityBackgroundQueueState {
  nextTask: TinaAuthorityBackgroundQueueTask | null;
  hasPendingWork: boolean;
  nextPollDelayMs: number | null;
}

function normalizeTinaAuthorityCitation(citation: TinaAuthorityCitation): TinaAuthorityCitation {
  return {
    ...citation,
    title: sanitizeTinaAiText(citation.title),
    note: sanitizeTinaAiText(citation.note),
    url: citation.url.trim(),
  };
}

function normalizeTinaAuthorityBackgroundRun(
  run: TinaAuthorityBackgroundRun
): TinaAuthorityBackgroundRun {
  return {
    ...run,
    error: run.error ? sanitizeTinaAiText(run.error) : null,
  };
}

function normalizeTinaAuthorityWorkItemContent(
  workItem: TinaAuthorityWorkItem
): TinaAuthorityWorkItem {
  const normalizedStatus =
    workItem.reviewerDecision === "do_not_use" ? "rejected" : workItem.status;

  return {
    ...workItem,
    status: normalizedStatus,
    memo: sanitizeTinaAiText(workItem.memo),
    challengeMemo: sanitizeTinaAiText(workItem.challengeMemo),
    reviewerNotes: sanitizeTinaAiText(workItem.reviewerNotes),
    missingAuthority: sanitizeTinaAiTextList(workItem.missingAuthority),
    challengeWarnings: sanitizeTinaAiTextList(workItem.challengeWarnings),
    challengeQuestions: sanitizeTinaAiTextList(workItem.challengeQuestions),
    citations: workItem.citations.map(normalizeTinaAuthorityCitation),
    researchRun: normalizeTinaAuthorityBackgroundRun(workItem.researchRun),
    challengeRun: normalizeTinaAuthorityBackgroundRun(workItem.challengeRun),
  };
}

function createRandomId(prefix: string): string {
  const generated =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${generated}`;
}

function defaultStatusFromTrail(
  reviewerState: "not_ready" | "review_needed" | "can_consider" | "do_not_use"
): TinaAuthorityWorkStatus {
  switch (reviewerState) {
    case "can_consider":
    case "review_needed":
      return "ready_for_reviewer";
    case "do_not_use":
      return "rejected";
    default:
      return "not_started";
  }
}

function defaultDisclosureDecisionFromTrail(
  disclosureFlag: "not_needed_yet" | "review_if_supported" | "likely_needed" | "not_applicable"
): TinaAuthorityDisclosureDecision {
  switch (disclosureFlag) {
    case "review_if_supported":
    case "likely_needed":
      return "needs_review";
    case "not_applicable":
      return "not_needed";
    default:
      return "unknown";
  }
}

function defaultReviewerDecisionFromStatus(
  status: TinaAuthorityWorkStatus
): TinaAuthorityReviewerDecision {
  if (status === "rejected") return "do_not_use";
  return "pending";
}

export function createDefaultTinaAuthorityCitation(): TinaAuthorityCitation {
  return {
    id: createRandomId("authority-citation"),
    title: "",
    url: "",
    sourceClass: "primary_authority",
    effect: "supports",
    note: "",
  };
}

export function createDefaultTinaAuthorityBackgroundRun(): TinaAuthorityBackgroundRun {
  return {
    status: "idle",
    jobId: null,
    queuedAt: null,
    startedAt: null,
    finishedAt: null,
    retryAt: null,
    error: null,
  };
}

export function createDefaultTinaAuthorityWorkItem(
  ideaId: string,
  options?: {
    status?: TinaAuthorityWorkStatus;
    disclosureDecision?: TinaAuthorityDisclosureDecision;
    reviewerDecision?: TinaAuthorityReviewerDecision;
  }
): TinaAuthorityWorkItem {
  const status = options?.status ?? "not_started";
  return {
    ideaId,
    status,
    reviewerDecision: options?.reviewerDecision ?? defaultReviewerDecisionFromStatus(status),
    disclosureDecision: options?.disclosureDecision ?? "unknown",
    challengeVerdict: "not_run",
    memo: "",
    challengeMemo: "",
    reviewerNotes: "",
    missingAuthority: [],
    challengeWarnings: [],
    challengeQuestions: [],
    citations: [],
    researchRun: createDefaultTinaAuthorityBackgroundRun(),
    challengeRun: createDefaultTinaAuthorityBackgroundRun(),
    lastAiRunAt: null,
    lastChallengeRunAt: null,
    updatedAt: null,
  };
}

function queueAuthorityRun(
  current: TinaAuthorityWorkItem,
  key: TinaAuthorityRunKey
): TinaAuthorityWorkItem {
  const now = new Date().toISOString();
  const existingRun = current[key];
  const nextStatus =
    current.status === "not_started" && key === "researchRun" ? "researching" : current.status;

  return stampWorkItem({
    ...current,
    status: nextStatus,
    [key]: {
      ...existingRun,
      status: "queued",
      jobId: createRandomId(key === "researchRun" ? "authority-research" : "authority-challenge"),
      queuedAt: now,
      startedAt: null,
      finishedAt: null,
      retryAt: null,
      error: null,
    },
  });
}

function startAuthorityRun(
  current: TinaAuthorityWorkItem,
  key: TinaAuthorityRunKey
): TinaAuthorityWorkItem {
  const now = new Date().toISOString();
  const existingRun = current[key];

  return stampWorkItem({
    ...current,
    status: current.status === "not_started" ? "researching" : current.status,
    [key]: {
      ...existingRun,
      status: "running",
      jobId:
        existingRun.jobId ??
        createRandomId(key === "researchRun" ? "authority-research" : "authority-challenge"),
      queuedAt: existingRun.queuedAt ?? now,
      startedAt: now,
      finishedAt: null,
      retryAt: null,
      error: null,
    },
  });
}

function failAuthorityRun(
  current: TinaAuthorityWorkItem,
  key: TinaAuthorityRunKey,
  input: {
    error: string;
    retryAt?: string | null;
  }
): TinaAuthorityWorkItem {
  const now = new Date().toISOString();
  const existingRun = current[key];

  return stampWorkItem({
    ...current,
    status:
      current.status === "not_started" && key === "researchRun" ? "researching" : current.status,
    [key]: {
      ...existingRun,
      status: input.retryAt ? "rate_limited" : "failed",
      jobId:
        existingRun.jobId ??
        createRandomId(key === "researchRun" ? "authority-research" : "authority-challenge"),
      queuedAt: existingRun.queuedAt ?? now,
      startedAt: existingRun.startedAt ?? now,
      finishedAt: now,
      retryAt: input.retryAt ?? null,
      error: input.error,
    },
  });
}

function completeAuthorityRun(
  run: TinaAuthorityBackgroundRun,
  finishedAt: string
): TinaAuthorityBackgroundRun {
  return {
    ...run,
    status: "succeeded",
    queuedAt: run.queuedAt ?? finishedAt,
    startedAt: run.startedAt ?? run.queuedAt ?? finishedAt,
    finishedAt,
    retryAt: null,
    error: null,
  };
}

export function queueTinaAuthorityResearchRun(
  current: TinaAuthorityWorkItem
): TinaAuthorityWorkItem {
  return queueAuthorityRun(current, "researchRun");
}

export function queueTinaAuthorityChallengeRun(
  current: TinaAuthorityWorkItem
): TinaAuthorityWorkItem {
  return queueAuthorityRun(current, "challengeRun");
}

export function startTinaAuthorityResearchRun(
  current: TinaAuthorityWorkItem
): TinaAuthorityWorkItem {
  return startAuthorityRun(current, "researchRun");
}

export function startTinaAuthorityChallengeRun(
  current: TinaAuthorityWorkItem
): TinaAuthorityWorkItem {
  return startAuthorityRun(current, "challengeRun");
}

export function failTinaAuthorityResearchRun(
  current: TinaAuthorityWorkItem,
  input: {
    error: string;
    retryAt?: string | null;
  }
): TinaAuthorityWorkItem {
  return failAuthorityRun(current, "researchRun", input);
}

export function failTinaAuthorityChallengeRun(
  current: TinaAuthorityWorkItem,
  input: {
    error: string;
    retryAt?: string | null;
  }
): TinaAuthorityWorkItem {
  const failed = failAuthorityRun(current, "challengeRun", input);
  const hasCompletedChallengeResult =
    current.lastChallengeRunAt !== null || current.challengeVerdict !== "not_run";

  if (input.retryAt || hasCompletedChallengeResult) {
    return failed;
  }

  return stampWorkItem({
    ...failed,
    challengeVerdict: "did_not_finish",
    challengeMemo: input.error,
  });
}

export function isTinaAuthorityBackgroundRunActive(run: TinaAuthorityBackgroundRun): boolean {
  return run.status === "queued" || run.status === "running" || run.status === "rate_limited";
}

function isTinaAuthorityBackgroundRunComplete(run: TinaAuthorityBackgroundRun): boolean {
  return run.status === "succeeded" || run.status === "failed";
}

function getTinaAuthorityBackgroundRunDurationMs(
  run: TinaAuthorityBackgroundRun
): number | null {
  if (!run.startedAt || !run.finishedAt) return null;

  const durationMs = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
  return Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null;
}

function getDefaultTinaAuthorityRunDurationMs(
  kind: TinaAuthorityBackgroundTaskKind
): number {
  return kind === "research" ? 6 * 60_000 : 12 * 60_000;
}

function estimateTinaAuthorityBackgroundTaskRemainingMs(
  run: TinaAuthorityBackgroundRun,
  kind: TinaAuthorityBackgroundTaskKind,
  averageDurationMs: number | null,
  now: number
): number {
  if (run.status === "idle" || isTinaAuthorityBackgroundRunComplete(run)) return 0;

  const estimatedDurationMs = averageDurationMs ?? getDefaultTinaAuthorityRunDurationMs(kind);
  const rateLimitDelayMs =
    run.status === "rate_limited" && run.retryAt
      ? Math.max(Date.parse(run.retryAt) - now, 0)
      : 0;

  if (!run.startedAt || run.status === "queued") {
    return estimatedDurationMs + rateLimitDelayMs;
  }

  const elapsedMs = Math.max(now - Date.parse(run.startedAt), 0);
  const floorMs = Math.max(Math.round(estimatedDurationMs * 0.15), 60_000);

  return rateLimitDelayMs + Math.max(estimatedDurationMs - elapsedMs, floorMs);
}

export function buildTinaAuthorityBackgroundProgress(
  authorityWork: TinaAuthorityWorkItem[],
  now = Date.now()
): TinaAuthorityBackgroundProgressSnapshot {
  const tasks = authorityWork
    .flatMap((item) => [
      { kind: "research" as const, run: item.researchRun },
      { kind: "challenge" as const, run: item.challengeRun },
    ])
    .filter((task) => task.run.status !== "idle");

  if (tasks.length === 0) {
    return {
      trackedTaskCount: 0,
      completedTaskCount: 0,
      remainingTaskCount: 0,
      progressPercent: 0,
      estimatedRemainingMs: null,
    };
  }

  const completedDurations = {
    research: tasks
      .filter((task) => task.kind === "research")
      .map((task) => getTinaAuthorityBackgroundRunDurationMs(task.run))
      .filter((value): value is number => value !== null),
    challenge: tasks
      .filter((task) => task.kind === "challenge")
      .map((task) => getTinaAuthorityBackgroundRunDurationMs(task.run))
      .filter((value): value is number => value !== null),
  };

  const averageDurationMs = {
    research:
      completedDurations.research.length > 0
        ? completedDurations.research.reduce((sum, value) => sum + value, 0) /
          completedDurations.research.length
        : null,
    challenge:
      completedDurations.challenge.length > 0
        ? completedDurations.challenge.reduce((sum, value) => sum + value, 0) /
          completedDurations.challenge.length
        : null,
  };

  const completedTaskCount = tasks.filter((task) =>
    isTinaAuthorityBackgroundRunComplete(task.run)
  ).length;
  const remainingTaskCount = tasks.length - completedTaskCount;
  const estimatedRemainingMs =
    remainingTaskCount > 0
      ? tasks.reduce((sum, task) => {
          return (
            sum +
            estimateTinaAuthorityBackgroundTaskRemainingMs(
              task.run,
              task.kind,
              averageDurationMs[task.kind],
              now
            )
          );
        }, 0)
      : 0;

  return {
    trackedTaskCount: tasks.length,
    completedTaskCount,
    remainingTaskCount,
    progressPercent: Math.round((completedTaskCount / tasks.length) * 100),
    estimatedRemainingMs,
  };
}

export function shouldProcessTinaAuthorityBackgroundRun(
  run: TinaAuthorityBackgroundRun,
  options?: {
    now?: number;
    staleAfterMs?: number;
  }
): boolean {
  const now = options?.now ?? Date.now();
  const staleAfterMs = options?.staleAfterMs ?? 60_000;

  if (run.status === "queued") return true;

  if (run.status === "rate_limited") {
    if (!run.retryAt) return true;
    return Date.parse(run.retryAt) <= now;
  }

  if (run.status === "running") {
    if (!run.startedAt) return true;
    return now - Date.parse(run.startedAt) >= staleAfterMs;
  }

  return false;
}

export function getTinaAuthorityBackgroundRunDelayMs(
  run: TinaAuthorityBackgroundRun,
  now = Date.now()
): number {
  if (run.status !== "rate_limited" || !run.retryAt) return 0;
  return Math.max(Date.parse(run.retryAt) - now, 0);
}

export function getTinaAuthorityBackgroundRunNextProcessDelayMs(
  run: TinaAuthorityBackgroundRun,
  options?: {
    now?: number;
    staleAfterMs?: number;
  }
): number | null {
  const now = options?.now ?? Date.now();
  const staleAfterMs = options?.staleAfterMs ?? 60_000;

  if (run.status === "queued") return 0;

  if (run.status === "rate_limited") {
    if (!run.retryAt) return 0;
    const retryAtMs = Date.parse(run.retryAt);
    return Number.isFinite(retryAtMs) ? Math.max(retryAtMs - now, 0) : 0;
  }

  if (run.status === "running") {
    if (!run.startedAt) return 0;
    const startedAtMs = Date.parse(run.startedAt);
    if (!Number.isFinite(startedAtMs)) return 0;
    return Math.max(staleAfterMs - (now - startedAtMs), 0);
  }

  return null;
}

export function buildTinaAuthorityBackgroundQueueState(
  authorityWork: TinaAuthorityWorkItemView[],
  options?: {
    now?: number;
    staleAfterMs?: number;
  }
): TinaAuthorityBackgroundQueueState {
  const now = options?.now ?? Date.now();
  const staleAfterMs = options?.staleAfterMs ?? 60_000;
  const toQueueTask = <K extends TinaAuthorityBackgroundTaskKind>(
    kind: K,
    workItem: TinaAuthorityWorkItemView,
    delayMs: number | null
  ): (TinaAuthorityBackgroundQueueTask & { kind: K }) | null => {
    if (delayMs === null) return null;
    return {
      kind,
      ideaId: workItem.ideaId,
      workItem,
      delayMs,
    };
  };

  const researchTasks = authorityWork
    .map((item) =>
      toQueueTask("research", item, getTinaAuthorityBackgroundRunNextProcessDelayMs(item.researchRun, {
        now,
        staleAfterMs,
      }))
    )
    .filter((task): task is TinaAuthorityBackgroundQueueTask & { kind: "research" } => task !== null);

  const nextResearchTask = researchTasks.find((task) => task.delayMs === 0) ?? null;
  if (nextResearchTask) {
    return {
      nextTask: nextResearchTask,
      hasPendingWork: true,
      nextPollDelayMs: 0,
    };
  }

  if (researchTasks.length > 0) {
    return {
      nextTask: null,
      hasPendingWork: true,
      nextPollDelayMs: Math.min(...researchTasks.map((task) => task.delayMs)),
    };
  }

  const challengeTasks = authorityWork
    .map((item) =>
      toQueueTask("challenge", item, getTinaAuthorityBackgroundRunNextProcessDelayMs(item.challengeRun, {
        now,
        staleAfterMs,
      }))
    )
    .filter((task): task is TinaAuthorityBackgroundQueueTask & { kind: "challenge" } => task !== null);

  const nextChallengeTask = challengeTasks.find((task) => task.delayMs === 0) ?? null;
  if (nextChallengeTask) {
    return {
      nextTask: nextChallengeTask,
      hasPendingWork: true,
      nextPollDelayMs: 0,
    };
  }

  if (challengeTasks.length > 0) {
    return {
      nextTask: null,
      hasPendingWork: true,
      nextPollDelayMs: Math.min(...challengeTasks.map((task) => task.delayMs)),
    };
  }

  return {
    nextTask: null,
    hasPendingWork: false,
    nextPollDelayMs: null,
  };
}

function citationKey(citation: TinaAuthorityCitation): string {
  const urlKey = citation.url.trim().toLowerCase();
  return urlKey || citation.title.trim().toLowerCase();
}

function mergeCitations(
  existing: TinaAuthorityCitation[],
  incoming: TinaAuthorityCitation[]
): TinaAuthorityCitation[] {
  const merged = new Map<string, TinaAuthorityCitation>();

  existing.map(normalizeTinaAuthorityCitation).forEach((citation) => {
    merged.set(citationKey(citation), citation);
  });

  incoming.map(normalizeTinaAuthorityCitation).forEach((citation) => {
    const key = citationKey(citation);
    const current = merged.get(key);

    if (!current) {
      merged.set(key, citation);
      return;
    }

    merged.set(key, {
      ...current,
      title: current.title || citation.title,
      url: current.url || citation.url,
      sourceClass: current.sourceClass || citation.sourceClass,
      effect: current.effect || citation.effect,
      note: current.note || citation.note,
    });
  });

  return Array.from(merged.values());
}

function stampWorkItem(workItem: TinaAuthorityWorkItem): TinaAuthorityWorkItem {
  const normalized = normalizeTinaAuthorityWorkItemContent(workItem);
  return {
    ...normalized,
    updatedAt: new Date().toISOString(),
  };
}

export function upsertTinaAuthorityWorkItem(
  authorityWork: TinaAuthorityWorkItem[],
  workItem: TinaAuthorityWorkItem
): TinaAuthorityWorkItem[] {
  const withoutExisting = authorityWork.filter((item) => item.ideaId !== workItem.ideaId);
  return [stampWorkItem(workItem), ...withoutExisting];
}

export function mergeTinaAuthorityResearchRun(
  current: TinaAuthorityWorkItem,
  result: TinaAuthorityResearchRunResult
): TinaAuthorityWorkItem {
  const normalizedCurrent = normalizeTinaAuthorityWorkItemContent(current);
  return stampWorkItem({
    ...normalizedCurrent,
    status: result.status,
    reviewerDecision:
      normalizedCurrent.reviewerDecision === "use_it" ||
      normalizedCurrent.reviewerDecision === "do_not_use"
        ? normalizedCurrent.reviewerDecision
        : result.reviewerDecision,
    disclosureDecision: result.disclosureDecision,
    memo: result.memo,
    missingAuthority: result.missingAuthority,
    citations: mergeCitations(normalizedCurrent.citations, result.citations),
    researchRun: completeAuthorityRun(normalizedCurrent.researchRun, result.lastAiRunAt),
    lastAiRunAt: result.lastAiRunAt,
  });
}

export function mergeTinaAuthorityChallengeRun(
  current: TinaAuthorityWorkItem,
  result: TinaAuthorityChallengeRunResult
): TinaAuthorityWorkItem {
  const normalizedCurrent = normalizeTinaAuthorityWorkItemContent(current);
  return stampWorkItem({
    ...normalizedCurrent,
    status:
      normalizedCurrent.status === "reviewed" && result.status !== "rejected"
        ? normalizedCurrent.status
        : result.status,
    reviewerDecision:
      normalizedCurrent.reviewerDecision === "use_it" ||
      normalizedCurrent.reviewerDecision === "do_not_use"
        ? normalizedCurrent.reviewerDecision
        : result.reviewerDecision,
    disclosureDecision:
      normalizedCurrent.disclosureDecision === "required" &&
      result.disclosureDecision !== "required"
        ? normalizedCurrent.disclosureDecision
        : result.disclosureDecision,
    challengeVerdict: result.challengeVerdict,
    challengeMemo: result.challengeMemo,
    challengeWarnings: result.challengeWarnings,
    challengeQuestions: result.challengeQuestions,
    missingAuthority: sanitizeTinaAiTextList([
      ...normalizedCurrent.missingAuthority,
      ...result.missingAuthority,
    ]),
    citations: mergeCitations(normalizedCurrent.citations, result.citations),
    challengeRun: completeAuthorityRun(normalizedCurrent.challengeRun, result.lastChallengeRunAt),
    lastChallengeRunAt: result.lastChallengeRunAt,
  });
}

export function buildTinaAuthorityWorkItems(
  draft: TinaWorkspaceDraft
): TinaAuthorityWorkItemView[] {
  const dossiers = buildTinaResearchDossiers(draft);
  const trails = buildTinaAuthorityTrails(draft);
  const trailMap = new Map(trails.map((trail) => [trail.id, trail]));
  const existingMap = new Map(draft.authorityWork.map((item) => [item.ideaId, item]));

  return dossiers.map((dossier) => {
    const trail = trailMap.get(dossier.id);
    const existing = existingMap.get(dossier.id);
    const defaultStatus = defaultStatusFromTrail(trail?.reviewerState ?? "not_ready");
    const defaultDisclosureDecision = defaultDisclosureDecisionFromTrail(
      trail?.disclosureFlag ?? "not_needed_yet"
    );
    const base = existing
      ? normalizeTinaAuthorityWorkItemContent(existing)
      : createDefaultTinaAuthorityWorkItem(dossier.id, {
          status: defaultStatus,
          disclosureDecision: defaultDisclosureDecision,
          reviewerDecision: defaultReviewerDecisionFromStatus(defaultStatus),
        });

    const normalizedStatus =
      base.status === "not_started" &&
      (
        base.memo.trim().length > 0 ||
        base.challengeMemo.trim().length > 0 ||
        base.citations.length > 0 ||
        base.reviewerNotes.trim().length > 0 ||
        base.missingAuthority.length > 0 ||
        base.challengeWarnings.length > 0 ||
        base.challengeQuestions.length > 0 ||
        base.researchRun.status !== "idle" ||
        base.challengeRun.status !== "idle"
      )
        ? "researching"
        : base.status;

    return {
      ...base,
      status: normalizedStatus,
      title: dossier.title,
      summary: dossier.summary,
      nextStep: dossier.nextStep,
      memoFocus: trail?.memoFocus ?? dossier.summary,
      reviewerQuestion: trail?.reviewerQuestion ?? "What still needs proof here?",
      authorityTargets: trail?.authorityTargets ?? [],
      documentIds: dossier.documentIds,
      factIds: dossier.factIds,
    };
  });
}
