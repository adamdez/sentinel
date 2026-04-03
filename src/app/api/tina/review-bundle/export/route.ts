import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { buildTinaReviewBundle } from "@/tina/lib/review-bundle";
import { parseTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";
import { refreshTinaWorkflowState } from "@/tina/lib/workflow-state";

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

  if (typeof body !== "object" || body === null || !("draft" in body)) {
    return NextResponse.json({ error: "Missing draft payload" }, { status: 400 });
  }

  const payload = body as { draft: unknown; snapshotId?: string };
  const draft = refreshTinaWorkflowState(parseTinaWorkspaceDraft(JSON.stringify(payload.draft)));
  const bundle = buildTinaReviewBundle(draft, payload.snapshotId);

  return NextResponse.json(bundle);
}
