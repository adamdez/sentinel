import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import { buildTinaScheduleCPdfExport } from "@/tina/lib/schedule-c-pdf";
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

  if (typeof body !== "object" || body === null || !("draft" in body)) {
    return NextResponse.json({ error: "Missing draft payload" }, { status: 400 });
  }

  const draft = parseTinaWorkspaceDraft(JSON.stringify((body as { draft: unknown }).draft));
  const exportFile = buildTinaScheduleCPdfExport(draft);
  const pdfBuffer = Buffer.from(exportFile.bytes);

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": exportFile.mimeType,
      "Content-Disposition": `attachment; filename="${exportFile.fileName}"`,
      "X-Tina-Summary": exportFile.snapshot.summary,
    },
  });
}
