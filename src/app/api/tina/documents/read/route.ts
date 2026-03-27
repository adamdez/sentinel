import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import {
  isTinaDocumentOwnedByUser,
  TINA_DOCUMENT_BUCKET,
} from "@/tina/lib/document-vault";
import { readTinaDocument } from "@/tina/lib/document-reading";
import type { TinaStoredDocument } from "@/tina/types";

function parseDocument(body: unknown): TinaStoredDocument | null {
  if (typeof body !== "object" || body === null || !("document" in body)) return null;
  const raw = (body as { document?: unknown }).document;
  if (typeof raw !== "object" || raw === null) return null;

  const document = raw as Partial<TinaStoredDocument>;
  if (
    typeof document.id !== "string" ||
    typeof document.name !== "string" ||
    typeof document.size !== "number" ||
    typeof document.mimeType !== "string" ||
    typeof document.storagePath !== "string" ||
    typeof document.uploadedAt !== "string"
  ) {
    return null;
  }

  return {
    id: document.id,
    name: document.name,
    size: document.size,
    mimeType: document.mimeType,
    storagePath: document.storagePath,
    category: document.category === "prior_return" ? "prior_return" : "supporting_document",
    requestId: typeof document.requestId === "string" ? document.requestId : null,
    requestLabel: typeof document.requestLabel === "string" ? document.requestLabel : null,
    uploadedAt: document.uploadedAt,
  };
}

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

  const document = parseDocument(body);
  if (!document || !isTinaDocumentOwnedByUser(document.storagePath, user.id)) {
    return NextResponse.json({ error: "Invalid document payload" }, { status: 400 });
  }

  const { data, error } = await sb.storage.from(TINA_DOCUMENT_BUCKET).download(document.storagePath);
  if (error || !data) {
    return NextResponse.json({ error: "Tina could not load that paper yet" }, { status: 500 });
  }

  const buffer = await data.arrayBuffer();
  const file = new File([buffer], document.name, { type: document.mimeType });
  const reading = await readTinaDocument(document, file);

  return NextResponse.json({ reading });
}
