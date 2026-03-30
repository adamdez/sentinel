import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import {
  loadTinaWorkspaceState,
  saveTinaWorkspaceState,
} from "@/tina/lib/server-packet-store";
import { loadTinaIrsAuthorityWatchStatus } from "@/tina/lib/irs-authority-watch";
import { parseTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { draft, packetVersions } = await loadTinaWorkspaceState(sb, user.id);
    return NextResponse.json({
      draft,
      packetVersions,
      irsAuthorityWatchStatus: loadTinaIrsAuthorityWatchStatus(),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load Tina workspace" }, { status: 500 });
  }
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

  const draft = parseTinaWorkspaceDraft(JSON.stringify((body as { draft: unknown }).draft));

  try {
    const saved = await saveTinaWorkspaceState(sb, user.id, draft);
    return NextResponse.json({
      ...saved,
      irsAuthorityWatchStatus: loadTinaIrsAuthorityWatchStatus(),
    });
  } catch {
    return NextResponse.json({ error: "Failed to save Tina workspace" }, { status: 500 });
  }
}
