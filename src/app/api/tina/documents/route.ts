import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import {
  isTinaDocumentOwnedByUser,
  normalizeTinaDocumentCategory,
  normalizeTinaRequestId,
  normalizeTinaRequestLabel,
  sanitizeTinaFileName,
  TINA_DOCUMENT_BUCKET,
  TINA_MAX_FILE_BYTES,
} from "@/tina/lib/document-vault";

async function ensureTinaBucket(sb: ReturnType<typeof createServerClient>) {
  const { data: buckets, error: listError } = await sb.storage.listBuckets();
  if (!listError && buckets?.some((bucket) => bucket.name === TINA_DOCUMENT_BUCKET)) return;

  await sb.storage.createBucket(TINA_DOCUMENT_BUCKET, {
    public: false,
    fileSizeLimit: TINA_MAX_FILE_BYTES,
  });
}

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  const category = normalizeTinaDocumentCategory(formData.get("category"));
  const taxYear = (formData.get("taxYear") as string | null) ?? "unknown-year";
  const requestId = normalizeTinaRequestId(formData.get("requestId"));
  const requestLabel = normalizeTinaRequestLabel(formData.get("requestLabel"));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > TINA_MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File is too large for Tina right now" }, { status: 400 });
  }

  await ensureTinaBucket(sb);

  const safeTaxYear = taxYear.replace(/[^0-9-]/g, "").slice(0, 9) || "unknown-year";
  const safeName = sanitizeTinaFileName(file.name);
  const documentId = randomUUID();
  const storagePath = `${user.id}/${safeTaxYear}/${documentId}-${safeName}`;

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await sb.storage
    .from(TINA_DOCUMENT_BUCKET)
    .upload(storagePath, Buffer.from(bytes), {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: "Tina could not save that file yet" }, { status: 500 });
  }

  return NextResponse.json({
    document: {
      id: documentId,
      name: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
      storagePath,
      category,
      requestId,
      requestLabel,
      uploadedAt: new Date().toISOString(),
    },
  });
}

export async function DELETE(req: NextRequest) {
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

  const storagePath =
    typeof body === "object" &&
    body !== null &&
    "storagePath" in body &&
    typeof body.storagePath === "string"
      ? body.storagePath
      : null;

  if (!storagePath || !isTinaDocumentOwnedByUser(storagePath, user.id)) {
    return NextResponse.json({ error: "Invalid document path" }, { status: 400 });
  }

  const { error } = await sb.storage.from(TINA_DOCUMENT_BUCKET).remove([storagePath]);
  if (error) {
    return NextResponse.json({ error: "Tina could not remove that file yet" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
