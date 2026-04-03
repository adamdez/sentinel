import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { buildTinaBooksReconstruction } from "@/tina/lib/books-reconstruction";
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
    return NextResponse.json(
      { error: "Failed to load Tina books reconstruction" },
      { status: 500 }
    );
  }

  const preferences = (data?.preferences as Record<string, unknown> | null) ?? {};
  const rawDraft = preferences[TINA_PREFERENCES_KEY];
  const draft = refreshTinaWorkflowState(
    parseTinaWorkspaceDraft(rawDraft ? JSON.stringify(rawDraft) : null)
  );

  return NextResponse.json({
    booksReconstruction: buildTinaBooksReconstruction(draft),
  });
}
