import type { TinaAuthorityBackgroundTaskKind } from "@/tina/lib/authority-work";

const TINA_AUTHORITY_BACKGROUND_POLL_DELAY_MS = 5_000;

interface TinaAuthorityBackgroundJobEntry {
  key: string;
  promise: Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __tinaAuthorityBackgroundJobs: Map<string, TinaAuthorityBackgroundJobEntry> | undefined;
}

function getTinaAuthorityBackgroundJobMap(): Map<string, TinaAuthorityBackgroundJobEntry> {
  if (!globalThis.__tinaAuthorityBackgroundJobs) {
    globalThis.__tinaAuthorityBackgroundJobs = new Map<string, TinaAuthorityBackgroundJobEntry>();
  }

  return globalThis.__tinaAuthorityBackgroundJobs;
}

function buildTinaAuthorityBackgroundJobKey(args: {
  userId: string;
  kind: TinaAuthorityBackgroundTaskKind;
  ideaId: string;
}): string {
  return `${args.userId}:${args.kind}:${args.ideaId}`;
}

export function getTinaAuthorityBackgroundPollDelayMs(): number {
  return TINA_AUTHORITY_BACKGROUND_POLL_DELAY_MS;
}

export function isTinaAuthorityBackgroundJobActive(args: {
  userId: string;
  kind: TinaAuthorityBackgroundTaskKind;
  ideaId: string;
}): boolean {
  return getTinaAuthorityBackgroundJobMap().has(buildTinaAuthorityBackgroundJobKey(args));
}

export function startTinaAuthorityBackgroundJob(args: {
  userId: string;
  kind: TinaAuthorityBackgroundTaskKind;
  ideaId: string;
  run: () => Promise<void>;
}): boolean {
  const key = buildTinaAuthorityBackgroundJobKey(args);
  const jobs = getTinaAuthorityBackgroundJobMap();

  if (jobs.has(key)) {
    return false;
  }

  const promise = Promise.resolve()
    .then(args.run)
    .catch((error) => {
      console.error("[tina-authority-background-job] failed", {
        userId: args.userId,
        kind: args.kind,
        ideaId: args.ideaId,
        error,
      });
    })
    .finally(() => {
      jobs.delete(key);
    });

  jobs.set(key, {
    key,
    promise,
  });
  return true;
}

export async function waitForTinaAuthorityBackgroundJobsForTesting(): Promise<void> {
  const jobs = Array.from(getTinaAuthorityBackgroundJobMap().values()).map((entry) => entry.promise);
  await Promise.allSettled(jobs);
}
