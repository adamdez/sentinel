import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { processTinaAuthorityQueueTask } from "@/tina/lib/authority-queue";
import {
  buildTinaAuthorityWorkItems,
  queueTinaAuthorityResearchRun,
  shouldProcessTinaAuthorityBackgroundRun,
  startTinaAuthorityResearchRun,
} from "@/tina/lib/authority-work";
import { applyTinaAuthorityWorkItemToDraft } from "@/tina/lib/authority-work-draft";
import { buildTinaResearchDossiers } from "@/tina/lib/research-dossiers";
import { runTinaAuthorityResearch } from "@/tina/lib/research-runner";
import {
  loadTinaWorkspaceState,
  saveTinaWorkspaceState,
} from "@/tina/lib/server-packet-store";

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("ideaId" in body) ||
    typeof (body as { ideaId?: unknown }).ideaId !== "string"
  ) {
    return NextResponse.json({ error: "Missing idea id" }, { status: 400 });
  }

  const action = (body as { action?: unknown }).action === "process" ? "process" : "queue";
  const ideaId = (body as { ideaId: string }).ideaId;
  const workspaceState = await loadTinaWorkspaceState(sb, user.id);
  const draft = workspaceState.draft;

  const dossier = buildTinaResearchDossiers(draft).find((item) => item.id === ideaId);
  const workItem = buildTinaAuthorityWorkItems(draft).find((item) => item.ideaId === ideaId);

  if (!dossier || !workItem) {
    return NextResponse.json({ error: "Research idea not found" }, { status: 404 });
  }

  if (action === "queue") {
    const queuedWorkItem =
      workItem.researchRun.status === "queued" || workItem.researchRun.status === "running"
        ? workItem
        : queueTinaAuthorityResearchRun(workItem);
    const saved = await saveTinaWorkspaceState(
      sb,
      user.id,
      applyTinaAuthorityWorkItemToDraft(draft, queuedWorkItem)
    );
    const savedWorkItem = buildTinaAuthorityWorkItems(saved.draft).find((item) => item.ideaId === ideaId);

    return NextResponse.json({ workItem: savedWorkItem ?? queuedWorkItem }, { status: 202 });
  }

  if (!shouldProcessTinaAuthorityBackgroundRun(workItem.researchRun)) {
    return NextResponse.json({ workItem });
  }

  const runningWorkItem = startTinaAuthorityResearchRun(workItem);
  const runningWorkItemView = {
    ...workItem,
    ...runningWorkItem,
  };
  await saveTinaWorkspaceState(
    sb,
    user.id,
    applyTinaAuthorityWorkItemToDraft(draft, runningWorkItem)
  );

  const processedTask = await processTinaAuthorityQueueTask({
    kind: "research",
    draft,
    dossier,
    currentWorkItem: runningWorkItem,
    workItemView: runningWorkItemView,
    runResearch: runTinaAuthorityResearch,
  });
  const persistClient = createServerClient();
  const latestWorkspace = await loadTinaWorkspaceState(persistClient, user.id);
  const saved = await saveTinaWorkspaceState(
    persistClient,
    user.id,
    applyTinaAuthorityWorkItemToDraft(latestWorkspace.draft, processedTask.workItem)
  );
  const savedWorkItem = buildTinaAuthorityWorkItems(saved.draft).find((item) => item.ideaId === ideaId);
  return NextResponse.json({ workItem: savedWorkItem ?? processedTask.workItem });
}
