import {
  type TinaAuthorityBackgroundTaskKind,
  type TinaAuthorityWorkItemView,
  failTinaAuthorityChallengeRun,
  failTinaAuthorityResearchRun,
  mergeTinaAuthorityChallengeRun,
  mergeTinaAuthorityResearchRun,
} from "@/tina/lib/authority-work";
import { runTinaAuthorityChallenge } from "@/tina/lib/research-challenger";
import { type TinaResearchDossier } from "@/tina/lib/research-dossiers";
import { runTinaAuthorityResearch } from "@/tina/lib/research-runner";
import type { TinaAuthorityWorkItem, TinaWorkspaceDraft } from "@/tina/types";

export interface TinaProcessedAuthorityQueueTask {
  workItem: TinaAuthorityWorkItem;
  responseStatus: number;
}

type TinaResearchRunner = typeof runTinaAuthorityResearch;
type TinaChallengeRunner = typeof runTinaAuthorityChallenge;

export function parseTinaAuthorityRetryAfterMs(message: string): number {
  const retryMatch = message.match(/try again in ([0-9.]+)s/i);
  if (!retryMatch) return 15_000;

  const seconds = Number.parseFloat(retryMatch[1] ?? "");
  if (!Number.isFinite(seconds) || seconds <= 0) return 15_000;
  return Math.ceil(seconds * 1000);
}

function deriveAuthorityErrorStatus(error: unknown, message: string): number {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = error.status;
    if (typeof status === "number") {
      return status;
    }
  }

  return /rate limit/i.test(message) ? 429 : 500;
}

async function finishTinaAuthorityResearchTask(args: {
  draft: TinaWorkspaceDraft;
  dossier: TinaResearchDossier;
  currentWorkItem: TinaAuthorityWorkItem;
  workItemView: TinaAuthorityWorkItemView;
  runResearch: TinaResearchRunner;
}): Promise<TinaProcessedAuthorityQueueTask> {
  try {
    const result = await args.runResearch({
      draft: args.draft,
      dossier: args.dossier,
      workItem: args.workItemView,
    });

    return {
      workItem: mergeTinaAuthorityResearchRun(args.currentWorkItem, result),
      responseStatus: 200,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tina could not finish the authority research run.";
    const status = deriveAuthorityErrorStatus(error, message);
    const retryAt =
      status === 429 ? new Date(Date.now() + parseTinaAuthorityRetryAfterMs(message)).toISOString() : null;

    return {
      workItem: failTinaAuthorityResearchRun(args.currentWorkItem, {
        error: message,
        retryAt,
      }),
      responseStatus: status,
    };
  }
}

async function finishTinaAuthorityChallengeTask(args: {
  draft: TinaWorkspaceDraft;
  dossier: TinaResearchDossier;
  currentWorkItem: TinaAuthorityWorkItem;
  workItemView: TinaAuthorityWorkItemView;
  runChallenge: TinaChallengeRunner;
}): Promise<TinaProcessedAuthorityQueueTask> {
  try {
    const result = await args.runChallenge({
      draft: args.draft,
      dossier: args.dossier,
      workItem: args.workItemView,
    });

    return {
      workItem: mergeTinaAuthorityChallengeRun(args.currentWorkItem, result),
      responseStatus: 200,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tina could not finish the challenge run.";
    const status = deriveAuthorityErrorStatus(error, message);
    const retryAt =
      status === 429 ? new Date(Date.now() + parseTinaAuthorityRetryAfterMs(message)).toISOString() : null;

    return {
      workItem: failTinaAuthorityChallengeRun(args.currentWorkItem, {
        error: message,
        retryAt,
      }),
      responseStatus: status,
    };
  }
}

export async function processTinaAuthorityQueueTask(args: {
  kind: TinaAuthorityBackgroundTaskKind;
  draft: TinaWorkspaceDraft;
  dossier: TinaResearchDossier;
  currentWorkItem: TinaAuthorityWorkItem;
  workItemView: TinaAuthorityWorkItemView;
  runResearch?: TinaResearchRunner;
  runChallenge?: TinaChallengeRunner;
}): Promise<TinaProcessedAuthorityQueueTask> {
  if (args.kind === "research") {
    return finishTinaAuthorityResearchTask({
      draft: args.draft,
      dossier: args.dossier,
      currentWorkItem: args.currentWorkItem,
      workItemView: args.workItemView,
      runResearch: args.runResearch ?? runTinaAuthorityResearch,
    });
  }

  return finishTinaAuthorityChallengeTask({
    draft: args.draft,
    dossier: args.dossier,
    currentWorkItem: args.currentWorkItem,
    workItemView: args.workItemView,
    runChallenge: args.runChallenge ?? runTinaAuthorityChallenge,
  });
}
