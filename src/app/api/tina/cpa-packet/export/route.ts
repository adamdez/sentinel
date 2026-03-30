import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { buildTinaCpaPacketExport } from "@/tina/lib/cpa-packet-export";
import { revalidateTinaCompletedDerivedWorkspace } from "@/tina/lib/reconcile-workspace";
import { loadTinaStoredPacketVersion, persistTinaPacketVersion } from "@/tina/lib/server-packet-store";
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

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Missing export payload" }, { status: 400 });
  }

  const packetFingerprint =
    typeof (body as { packetFingerprint?: unknown }).packetFingerprint === "string"
      ? (body as { packetFingerprint?: string }).packetFingerprint?.trim() ?? ""
      : "";

  let draft;
  let savedPacket = null;

  if (packetFingerprint) {
    savedPacket = await loadTinaStoredPacketVersion(sb, user.id, packetFingerprint);
    if (!savedPacket) {
      return NextResponse.json({ error: "Saved Tina packet not found." }, { status: 404 });
    }
    draft = savedPacket.draft;
  } else {
    if (!("draft" in body)) {
      return NextResponse.json({ error: "Missing draft payload" }, { status: 400 });
    }

    draft = revalidateTinaCompletedDerivedWorkspace(
      parseTinaWorkspaceDraft(JSON.stringify((body as { draft: unknown }).draft))
    );
  }
  if (draft.cpaHandoff.status !== "complete" || draft.cpaHandoff.artifacts.length === 0) {
    return NextResponse.json(
      { error: "CPA handoff packet must be built before export." },
      { status: 409 }
    );
  }

  try {
    const exportPacket = savedPacket
      ? savedPacket
      : (await persistTinaPacketVersion(sb, user.id, draft, "cpa_packet_export")).packet;
    const exportFile = buildTinaCpaPacketExport(exportPacket.draft, {
      packetReview: exportPacket.review,
    });

    return NextResponse.json(exportFile);
  } catch {
    return NextResponse.json({ error: "Failed to save Tina packet version" }, { status: 500 });
  }
}
