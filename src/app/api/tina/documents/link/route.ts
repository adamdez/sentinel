import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import {
  isTinaDocumentOwnedByUser,
  TINA_DOCUMENT_BUCKET,
} from "@/tina/lib/document-vault";

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storagePath = req.nextUrl.searchParams.get("storagePath");
  if (!storagePath || !isTinaDocumentOwnedByUser(storagePath, user.id)) {
    return NextResponse.json({ error: "Invalid document path" }, { status: 400 });
  }

  const { data, error } = await sb.storage
    .from(TINA_DOCUMENT_BUCKET)
    .createSignedUrl(storagePath, 60 * 5);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Tina could not open that paper yet" }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}
