import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { loadTinaIrsAuthorityWatchStatus } from "@/tina/lib/irs-authority-watch";
import { getTinaOfficialFormPacketExportReadiness } from "@/tina/lib/official-form-coverage";
import { reconcileTinaDerivedWorkspace } from "@/tina/lib/reconcile-workspace";
import { renderTinaOfficialFormPdf } from "@/tina/lib/official-form-pdf-render";
import { loadTinaStoredPacketVersion, persistTinaPacketVersion } from "@/tina/lib/server-packet-store";
import { parseTinaWorkspaceDraft } from "@/tina/lib/workspace-draft";

export const runtime = "nodejs";

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

    draft = reconcileTinaDerivedWorkspace(
      parseTinaWorkspaceDraft(JSON.stringify((body as { draft: unknown }).draft))
    );
  }
  const exportReadiness = getTinaOfficialFormPacketExportReadiness(draft, {
    irsAuthorityWatchStatus: loadTinaIrsAuthorityWatchStatus(),
  });

  if (!exportReadiness.ready) {
    return NextResponse.json(
      {
        error:
          exportReadiness.reason ??
          "Federal business form packet is not export-ready yet. Tina only exports it when every required in-scope IRS business form is covered.",
      },
      { status: 409 }
    );
  }

  try {
    const exportDraft = savedPacket
      ? savedPacket.draft
      : (
          await persistTinaPacketVersion(sb, user.id, draft, "official_form_pdf_export")
        ).packet.draft;
    const pdfFile = await renderTinaOfficialFormPdf(exportDraft);
    const pdfBody = new Uint8Array(pdfFile.bytes);

    return new NextResponse(pdfBody, {
      headers: {
        "Content-Type": pdfFile.mimeType,
        "Content-Disposition": `attachment; filename="${pdfFile.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Tina could not render the PDF packet right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
