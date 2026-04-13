import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";
import {
  DEFAULT_VOICE_CONTROL_CONFIG,
  VOICE_CONTROL_BUCKET,
  VOICE_CONTROL_VERSION,
  VOICE_CONTROL_WORKFLOW,
  normalizeVoiceControlConfig,
  type VoiceControlConfig,
} from "@/lib/voice-control";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
]);

async function requireAdminUser(req: NextRequest, sb: ReturnType<typeof createServerClient>) {
  const user = await requireAuth(req, sb);
  if (!user) return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile, error } = await (sb.from("user_profiles") as any)
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error || profile?.role !== "admin") {
    return { user: null, error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }

  return { user, error: null };
}

async function ensureBucket(sb: ReturnType<typeof createServerClient>) {
  const { data: buckets, error: listError } = await sb.storage.listBuckets();
  if (!listError && buckets?.some((bucket) => bucket.name === VOICE_CONTROL_BUCKET)) return;

  await sb.storage.createBucket(VOICE_CONTROL_BUCKET, {
    public: false,
    fileSizeLimit: MAX_AUDIO_BYTES,
  });
}

async function loadCurrentConfig(sb: ReturnType<typeof createServerClient>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (sb.from("voice_registry") as any)
    .select("rule_config")
    .eq("workflow", VOICE_CONTROL_WORKFLOW)
    .eq("registry_type", "handoff_rule")
    .eq("version", VOICE_CONTROL_VERSION)
    .maybeSingle();

  return normalizeVoiceControlConfig(data?.rule_config);
}

async function saveConfig(
  sb: ReturnType<typeof createServerClient>,
  userId: string,
  config: VoiceControlConfig,
) {
  const payload = {
    workflow: VOICE_CONTROL_WORKFLOW,
    registry_type: "handoff_rule",
    version: VOICE_CONTROL_VERSION,
    status: "active",
    description: "Live Twilio inbound voicemail control surface",
    changelog: "Managed from Admin > Voice Control",
    rule_config: config,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError, data: updated } = await (sb.from("voice_registry") as any)
    .update(payload)
    .eq("workflow", VOICE_CONTROL_WORKFLOW)
    .eq("registry_type", "handoff_rule")
    .eq("version", VOICE_CONTROL_VERSION)
    .select("id")
    .maybeSingle();

  if (!updateError && updated) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError } = await (sb.from("voice_registry") as any)
    .insert({
      ...payload,
      registered_by: userId,
    });

  if (insertError) {
    throw insertError;
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "voicemail-audio";
}

function responseBody(config: VoiceControlConfig) {
  return {
    config,
    audioPreviewUrl: config.uploadedGreeting ? "/api/twilio/voicemail-greeting" : null,
  };
}

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const auth = await requireAdminUser(req, sb);
  if (auth.error) return auth.error;

  const config = await loadCurrentConfig(sb);
  return NextResponse.json(responseBody(config));
}

export async function PATCH(req: NextRequest) {
  const sb = createServerClient();
  const auth = await requireAdminUser(req, sb);
  if (auth.error || !auth.user) return auth.error!;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const current = await loadCurrentConfig(sb);
  const incoming = normalizeVoiceControlConfig({
    ...DEFAULT_VOICE_CONTROL_CONFIG,
    ...current,
    ...(typeof body === "object" && body ? body : {}),
    uploadedGreeting: current.uploadedGreeting,
  });

  await saveConfig(sb, auth.user.id, incoming);
  return NextResponse.json(responseBody(incoming));
}

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const auth = await requireAdminUser(req, sb);
  if (auth.error || !auth.user) return auth.error!;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
  }

  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio file is too large" }, { status: 400 });
  }

  const mimeType = (file.type || "").toLowerCase();
  if (!ALLOWED_AUDIO_TYPES.has(mimeType)) {
    return NextResponse.json({ error: "Unsupported audio format" }, { status: 400 });
  }

  await ensureBucket(sb);
  const current = await loadCurrentConfig(sb);

  const bytes = await file.arrayBuffer();
  const uploadId = randomUUID();
  const safeName = sanitizeFileName(file.name);
  const storagePath = `admin/${uploadId}-${safeName}`;

  const { error: uploadError } = await sb.storage
    .from(VOICE_CONTROL_BUCKET)
    .upload(storagePath, Buffer.from(bytes), {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: "Could not upload audio" }, { status: 500 });
  }

  if (current.uploadedGreeting?.storagePath) {
    await sb.storage.from(VOICE_CONTROL_BUCKET).remove([current.uploadedGreeting.storagePath]);
  }

  const nextConfig: VoiceControlConfig = {
    ...current,
    useUploadedGreeting: true,
    uploadedGreeting: {
      storagePath,
      fileName: file.name,
      mimeType,
      uploadedAt: new Date().toISOString(),
    },
  };

  await saveConfig(sb, auth.user.id, nextConfig);
  return NextResponse.json(responseBody(nextConfig));
}

export async function DELETE(req: NextRequest) {
  const sb = createServerClient();
  const auth = await requireAdminUser(req, sb);
  if (auth.error || !auth.user) return auth.error!;

  const current = await loadCurrentConfig(sb);
  if (current.uploadedGreeting?.storagePath) {
    await sb.storage.from(VOICE_CONTROL_BUCKET).remove([current.uploadedGreeting.storagePath]);
  }

  const nextConfig: VoiceControlConfig = {
    ...current,
    useUploadedGreeting: false,
    uploadedGreeting: null,
  };

  await saveConfig(sb, auth.user.id, nextConfig);
  return NextResponse.json(responseBody(nextConfig));
}
