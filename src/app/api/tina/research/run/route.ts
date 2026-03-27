import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import {
  buildTinaAuthorityWorkItems,
  mergeTinaAuthorityResearchRun,
} from "@/tina/lib/authority-work";
import { buildTinaResearchDossiers } from "@/tina/lib/research-dossiers";
import { runTinaAuthorityResearch } from "@/tina/lib/research-runner";
import { parseTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

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
    !("draft" in body) ||
    !("ideaId" in body) ||
    typeof (body as { ideaId?: unknown }).ideaId !== "string"
  ) {
    return NextResponse.json({ error: "Missing draft or idea id" }, { status: 400 });
  }

  const draft = parseTinaWorkspaceDraft(JSON.stringify((body as { draft: unknown }).draft));
  const ideaId = (body as { ideaId: string }).ideaId;

  const dossier = buildTinaResearchDossiers(draft).find((item) => item.id === ideaId);
  const workItem = buildTinaAuthorityWorkItems(draft).find((item) => item.ideaId === ideaId);

  if (!dossier || !workItem) {
    return NextResponse.json({ error: "Research idea not found" }, { status: 404 });
  }

  try {
    const result = await runTinaAuthorityResearch({
      draft,
      dossier,
      workItem,
    });
    const nextWorkItem = mergeTinaAuthorityResearchRun(workItem, result);

    return NextResponse.json({ workItem: nextWorkItem });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Tina could not finish the authority research run.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
