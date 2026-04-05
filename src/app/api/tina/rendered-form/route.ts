import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { buildTinaOfficialFormRenderPlan } from "@/tina/lib/official-form-render-plan";
import { renderTinaOfficialFormArtifact } from "@/tina/lib/official-form-render-server";
import type { TinaOfficialFederalFormId } from "@/tina/types";
import { parseTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import { refreshTinaWorkflowState } from "@/tina/lib/workflow-state";

const TINA_PREFERENCES_KEY = "tina_workspace_v1";

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formId = req.nextUrl.searchParams.get("formId") as TinaOfficialFederalFormId | null;
  if (!formId) {
    return NextResponse.json({ error: "Missing formId" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("user_profiles") as any)
    .select("preferences")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to load Tina rendered form" }, { status: 500 });
  }

  const preferences = (data?.preferences as Record<string, unknown> | null) ?? {};
  const rawDraft = preferences[TINA_PREFERENCES_KEY];
  const draft = refreshTinaWorkflowState(
    parseTinaWorkspaceDraft(rawDraft ? JSON.stringify(rawDraft) : null)
  );
  const renderPlan = buildTinaOfficialFormRenderPlan(draft);
  const plannedArtifact = renderPlan.find((artifact) => artifact.formId === formId) ?? null;

  if (!plannedArtifact || !plannedArtifact.downloadPath || plannedArtifact.status === "blocked") {
    return NextResponse.json(
      { error: "Tina does not currently have a render-ready artifact for that form." },
      { status: 409 }
    );
  }

  const renderedArtifact = await renderTinaOfficialFormArtifact(draft, formId);
  if (!renderedArtifact) {
    return NextResponse.json(
      { error: "Tina could not render that form from the current draft." },
      { status: 500 }
    );
  }

  return new NextResponse(Buffer.from(renderedArtifact.bytes), {
    status: 200,
    headers: {
      "Content-Type": renderedArtifact.mimeType,
      "Content-Disposition": `inline; filename="${renderedArtifact.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Tina-Render-Mode": renderedArtifact.renderMode,
      "X-Tina-Rendered-Sha256": renderedArtifact.sha256,
    },
  });
}
