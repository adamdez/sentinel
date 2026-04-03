import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { buildTinaOperationalStatus } from "@/tina/lib/operational-status";
import { buildTinaStartPathAssessment } from "@/tina/lib/start-path";
import { parseTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import { refreshTinaWorkflowState } from "@/tina/lib/workflow-state";

const TINA_PREFERENCES_KEY = "tina_workspace_v1";

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("user_profiles") as any)
    .select("preferences")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to load Tina status" }, { status: 500 });
  }

  const preferences = (data?.preferences as Record<string, unknown> | null) ?? {};
  const rawDraft = preferences[TINA_PREFERENCES_KEY];
  const draft = refreshTinaWorkflowState(
    parseTinaWorkspaceDraft(rawDraft ? JSON.stringify(rawDraft) : null)
  );
  const operationalStatus = buildTinaOperationalStatus(draft);
  const startPath = buildTinaStartPathAssessment(draft);

  return NextResponse.json({
    product: "Tina",
    status: operationalStatus.maturity,
    packageState: operationalStatus.packageState,
    summary: operationalStatus.summary,
    nextStep: operationalStatus.nextStep,
    truths: operationalStatus.truths,
    blockers: operationalStatus.blockers,
    supportedLane: "schedule_c_single_member_llc",
    startPath,
    guide: "src/tina/docs/threads/tina-the-tax-machina.md",
  });
}
