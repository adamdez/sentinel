import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { buildTinaCpaPacketExport } from "@/tina/lib/cpa-packet-export";
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
  const snapshot =
    typeof payload.snapshotId === "string"
      ? draft.packageSnapshots.find((item) => item.id === payload.snapshotId) ?? null
      : null;
  const exportFile = snapshot
    ? {
        fileName: snapshot.exportFileName,
        mimeType: "text/markdown; charset=utf-8",
        contents: snapshot.exportContents,
      }
    : buildTinaCpaPacketExport(draft);

  return NextResponse.json(exportFile);
}
