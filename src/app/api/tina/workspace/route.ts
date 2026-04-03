import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { createDefaultTinaWorkspaceDraft, parseTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
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
    return NextResponse.json({ error: "Failed to load Tina workspace" }, { status: 500 });
  }

  const preferences = (data?.preferences as Record<string, unknown> | null) ?? {};
  const rawDraft = preferences[TINA_PREFERENCES_KEY];
  const draft = refreshTinaWorkflowState(
    parseTinaWorkspaceDraft(rawDraft ? JSON.stringify(rawDraft) : null)
  );

  return NextResponse.json({ draft });
}

export async function PATCH(req: NextRequest) {
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

  if (typeof body !== "object" || body === null || !("draft" in body)) {
    return NextResponse.json({ error: "Missing draft payload" }, { status: 400 });
  }

  const draft = refreshTinaWorkflowState(
    parseTinaWorkspaceDraft(JSON.stringify((body as { draft: unknown }).draft))
  );
  const safeDraft = refreshTinaWorkflowState({
    ...createDefaultTinaWorkspaceDraft(),
    ...draft,
    savedAt: draft.savedAt ?? new Date().toISOString(),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing, error: readError } = await (sb.from("user_profiles") as any)
    .select("preferences")
    .eq("id", user.id)
    .single();

  if (readError) {
    return NextResponse.json({ error: "Failed to load profile preferences" }, { status: 500 });
  }

  const preferences = (existing?.preferences as Record<string, unknown> | null) ?? {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (sb.from("user_profiles") as any)
    .update({
      preferences: {
        ...preferences,
        [TINA_PREFERENCES_KEY]: safeDraft,
      },
    })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to save Tina workspace" }, { status: 500 });
  }

  return NextResponse.json({ draft: safeDraft });
}
