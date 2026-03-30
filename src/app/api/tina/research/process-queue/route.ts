import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import {
  getTinaAuthorityBackgroundPollDelayMs,
  isTinaAuthorityBackgroundJobActive,
  startTinaAuthorityBackgroundJob,
} from "@/tina/lib/authority-background-jobs";
import { processTinaAuthorityQueueTask } from "@/tina/lib/authority-queue";
import {
  buildTinaAuthorityBackgroundQueueState,
  buildTinaAuthorityWorkItems,
  startTinaAuthorityChallengeRun,
  startTinaAuthorityResearchRun,
} from "@/tina/lib/authority-work";
import { applyTinaAuthorityWorkItemToDraft } from "@/tina/lib/authority-work-draft";
import { buildTinaResearchDossiers } from "@/tina/lib/research-dossiers";
import {
  loadTinaWorkspaceState,
  saveTinaWorkspaceState,
} from "@/tina/lib/server-packet-store";

const TINA_AUTHORITY_RUNNING_RECOVERY_GRACE_MS = 45 * 60_000;

function getAuthorityRunJobId(args: {
  kind: "research" | "challenge";
  workItem:
    | ReturnType<typeof buildTinaAuthorityWorkItems>[number]
    | Parameters<typeof applyTinaAuthorityWorkItemToDraft>[1];
}): string | null {
  return args.kind === "research" ? args.workItem.researchRun.jobId : args.workItem.challengeRun.jobId;
}

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  const backgroundPollDelayMs = getTinaAuthorityBackgroundPollDelayMs();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workspaceState = await loadTinaWorkspaceState(sb, user.id);
    const draft = workspaceState.draft;
    const authorityWorkItems = buildTinaAuthorityWorkItems(draft);
    const queueState = buildTinaAuthorityBackgroundQueueState(authorityWorkItems);
    const nextTask = queueState.nextTask;

    if (!nextTask) {
      return NextResponse.json({
        processed: false,
        task: null,
        workItem: null,
        moreWorkRemaining: queueState.hasPendingWork,
        nextPollDelayMs: queueState.nextPollDelayMs,
      });
    }

    const dossier = buildTinaResearchDossiers(draft).find((item) => item.id === nextTask.ideaId);
    if (!dossier) {
      return NextResponse.json({ error: "Research idea not found" }, { status: 404 });
    }

    if (
      isTinaAuthorityBackgroundJobActive({
        userId: user.id,
        kind: nextTask.kind,
        ideaId: nextTask.ideaId,
      })
    ) {
      return NextResponse.json({
        processed: false,
        task: {
          kind: nextTask.kind,
          ideaId: nextTask.ideaId,
        },
        workItem: nextTask.workItem,
        moreWorkRemaining: queueState.hasPendingWork,
        nextPollDelayMs: backgroundPollDelayMs,
        taskStatus: 102,
      });
    }

    const currentRunState =
      nextTask.kind === "research" ? nextTask.workItem.researchRun : nextTask.workItem.challengeRun;
    const currentRunStartedAtMs = currentRunState.startedAt ? Date.parse(currentRunState.startedAt) : Number.NaN;
    const shouldAdoptRecentRunningTask =
      currentRunState.status === "running" &&
      Number.isFinite(currentRunStartedAtMs) &&
      Date.now() - currentRunStartedAtMs < TINA_AUTHORITY_RUNNING_RECOVERY_GRACE_MS;

    if (shouldAdoptRecentRunningTask) {
      return NextResponse.json({
        processed: false,
        task: {
          kind: nextTask.kind,
          ideaId: nextTask.ideaId,
        },
        workItem: nextTask.workItem,
        moreWorkRemaining: queueState.hasPendingWork,
        nextPollDelayMs: backgroundPollDelayMs,
        taskStatus: 102,
      });
    }

    const runningWorkItem =
      nextTask.kind === "research"
        ? startTinaAuthorityResearchRun(nextTask.workItem)
        : startTinaAuthorityChallengeRun(nextTask.workItem);
    const runningWorkItemView = {
      ...nextTask.workItem,
      ...runningWorkItem,
    };

    await saveTinaWorkspaceState(
      sb,
      user.id,
      applyTinaAuthorityWorkItemToDraft(draft, runningWorkItem)
    );

    startTinaAuthorityBackgroundJob({
      userId: user.id,
      kind: nextTask.kind,
      ideaId: nextTask.ideaId,
      run: async () => {
        const processedTask = await processTinaAuthorityQueueTask({
          kind: nextTask.kind,
          draft,
          dossier,
          currentWorkItem: runningWorkItem,
          workItemView: runningWorkItemView,
        });

        const persistClient = createServerClient();
        const latestWorkspace = await loadTinaWorkspaceState(persistClient, user.id);
        const latestWorkItem = buildTinaAuthorityWorkItems(latestWorkspace.draft).find(
          (item) => item.ideaId === nextTask.ideaId
        );

        if (
          !latestWorkItem ||
          getAuthorityRunJobId({ kind: nextTask.kind, workItem: latestWorkItem }) !==
            getAuthorityRunJobId({ kind: nextTask.kind, workItem: runningWorkItem })
        ) {
          return;
        }

        await saveTinaWorkspaceState(
          persistClient,
          user.id,
          applyTinaAuthorityWorkItemToDraft(latestWorkspace.draft, processedTask.workItem)
        );
      },
    });

    const savedAuthorityWorkItems = buildTinaAuthorityWorkItems(
      applyTinaAuthorityWorkItemToDraft(draft, runningWorkItem)
    );
    const nextQueueState = buildTinaAuthorityBackgroundQueueState(savedAuthorityWorkItems);

    return NextResponse.json({
      processed: false,
      task: {
        kind: nextTask.kind,
        ideaId: nextTask.ideaId,
      },
      workItem: runningWorkItem,
      moreWorkRemaining: nextQueueState.hasPendingWork,
      nextPollDelayMs: backgroundPollDelayMs,
      taskStatus: 202,
    });
  } catch (error) {
    console.error("[tina-research-process-queue] failed", error);
    return NextResponse.json(
      { error: "Tina could not process the next deeper research task." },
      { status: 500 }
    );
  }
}
