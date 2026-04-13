import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getVoiceControlConfig, VOICE_CONTROL_BUCKET } from "@/lib/voice-control";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const sb = createServerClient();
  const config = await getVoiceControlConfig(sb);
  const asset = config.useUploadedGreeting ? config.uploadedGreeting : null;

  if (!asset?.storagePath) {
    return NextResponse.json({ error: "No uploaded voicemail greeting" }, { status: 404 });
  }

  const { data, error } = await sb.storage.from(VOICE_CONTROL_BUCKET).download(asset.storagePath);
  if (error || !data) {
    return NextResponse.json({ error: "Could not load voicemail greeting" }, { status: 404 });
  }

  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType || "audio/mpeg",
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="${asset.fileName}"`,
    },
  });
}
