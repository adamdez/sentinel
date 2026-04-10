import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";

const RELATED_CONTACT_BUCKET = "related-contact-evidence";
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

type RelatedContactAttachment = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  kind: "image" | "file";
  created_at: string;
};

type RelatedContact = {
  id: string;
  attachments?: RelatedContactAttachment[];
};

type RouteContext = {
  params: Promise<{ propertyId: string }>;
};

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

function normalizeAttachments(value: unknown): RelatedContactAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== "string"
      || typeof record.name !== "string"
      || typeof record.mime_type !== "string"
      || typeof record.size_bytes !== "number"
      || typeof record.storage_path !== "string"
      || (record.kind !== "image" && record.kind !== "file")
      || typeof record.created_at !== "string"
    ) {
      return [];
    }

    return [{
      id: record.id,
      name: record.name,
      mime_type: record.mime_type,
      size_bytes: record.size_bytes,
      storage_path: record.storage_path,
      kind: record.kind,
      created_at: record.created_at,
    }];
  });
}

function normalizeRelatedContacts(value: unknown): RelatedContact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string") return [];
    return [{
      id: record.id,
      attachments: normalizeAttachments(record.attachments),
    }];
  });
}

async function ensureBucket(sb: ReturnType<typeof createServerClient>) {
  const { data: buckets, error: listError } = await sb.storage.listBuckets();
  if (!listError && buckets?.some((bucket) => bucket.name === RELATED_CONTACT_BUCKET)) return;

  await sb.storage.createBucket(RELATED_CONTACT_BUCKET, {
    public: false,
    fileSizeLimit: MAX_ATTACHMENT_BYTES,
  });
}

async function loadContacts(sb: ReturnType<typeof createServerClient>, propertyId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("properties") as any)
    .select("owner_flags")
    .eq("id", propertyId)
    .maybeSingle();

  if (error) {
    return { contacts: [] as RelatedContact[], error: error.message ?? "Failed to load property" };
  }

  const ownerFlags =
    data?.owner_flags && typeof data.owner_flags === "object" && !Array.isArray(data.owner_flags)
      ? data.owner_flags as Record<string, unknown>
      : {};

  return {
    contacts: normalizeRelatedContacts(ownerFlags.related_contacts),
    error: null,
  };
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { propertyId } = await params;
  const loaded = await loadContacts(sb, propertyId);
  if (loaded.error) {
    return NextResponse.json({ error: loaded.error }, { status: 500 });
  }

  const signedAttachments: Array<{ contact_id: string; attachment_id: string; signed_url: string }> = [];
  for (const contact of loaded.contacts) {
    for (const attachment of contact.attachments ?? []) {
      const { data, error } = await sb.storage
        .from(RELATED_CONTACT_BUCKET)
        .createSignedUrl(attachment.storage_path, 60 * 60);
      if (error || !data?.signedUrl) continue;
      signedAttachments.push({
        contact_id: contact.id,
        attachment_id: attachment.id,
        signed_url: data.signedUrl,
      });
    }
  }

  return NextResponse.json({ attachments: signedAttachments });
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { propertyId } = await params;
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const contactId = formData.get("contactId");
  const file = formData.get("file");
  if (typeof contactId !== "string" || !contactId.trim()) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: "File is too large" }, { status: 400 });
  }

  await ensureBucket(sb);

  const attachmentId = randomUUID();
  const safeName = sanitizeFileName(file.name);
  const storagePath = `${user.id}/${propertyId}/${contactId}/${attachmentId}-${safeName}`;
  const bytes = await file.arrayBuffer();
  const mimeType = file.type || "application/octet-stream";
  const kind: "image" | "file" = mimeType.startsWith("image/") ? "image" : "file";
  const createdAt = new Date().toISOString();

  const { error: uploadError } = await sb.storage
    .from(RELATED_CONTACT_BUCKET)
    .upload(storagePath, Buffer.from(bytes), {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: "Could not upload attachment" }, { status: 500 });
  }

  const { data: signed, error: signedError } = await sb.storage
    .from(RELATED_CONTACT_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  const attachment = {
    id: attachmentId,
    name: file.name,
    mime_type: mimeType,
    size_bytes: file.size,
    storage_path: storagePath,
    kind,
    created_at: createdAt,
    signed_url: signedError ? null : signed?.signedUrl ?? null,
  };

  return NextResponse.json({ attachment });
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { propertyId } = await params;
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

  if (!storagePath) {
    return NextResponse.json({ error: "storagePath is required" }, { status: 400 });
  }

  if (!storagePath.startsWith(`${user.id}/${propertyId}/`)) {
    return NextResponse.json({ error: "Invalid attachment path" }, { status: 400 });
  }

  const { error } = await sb.storage.from(RELATED_CONTACT_BUCKET).remove([storagePath]);
  if (error) {
    return NextResponse.json({ error: "Could not remove attachment" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
