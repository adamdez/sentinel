import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { DEFAULT_ADS_SYSTEM_PROMPT } from "@/lib/ads/ads-system-prompt";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/system-prompt
 * Returns the current system prompt (from DB or default).
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("ads_system_prompts") as any)
    .select("*")
    .eq("prompt_key", "default")
    .single();

  if (error || !data) {
    return NextResponse.json({
      prompt_text: DEFAULT_ADS_SYSTEM_PROMPT,
      version: 0,
      source: "default",
    });
  }

  return NextResponse.json({
    prompt_text: data.prompt_text,
    version: data.version,
    updated_at: data.updated_at,
    source: data.prompt_text === "SEED" ? "default" : "database",
    // If it's still the seed placeholder, return the real default
    ...(data.prompt_text === "SEED" ? { prompt_text: DEFAULT_ADS_SYSTEM_PROMPT } : {}),
  });
}

/**
 * PUT /api/ads/system-prompt
 * Updates the system prompt in the database.
 * Body: { prompt_text: string }
 */
export async function PUT(req: NextRequest) {
  const sb = createServerClient();
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { prompt_text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.prompt_text || typeof body.prompt_text !== "string" || body.prompt_text.trim().length < 100) {
    return NextResponse.json({ error: "prompt_text is required (min 100 chars)" }, { status: 400 });
  }

  // Upsert: update existing or insert new
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (sb.from("ads_system_prompts") as any)
    .select("id, version")
    .eq("prompt_key", "default")
    .single();

  if (existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("ads_system_prompts") as any)
      .update({
        prompt_text: body.prompt_text.trim(),
        version: (existing.version ?? 0) + 1,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("prompt_key", "default")
      .select("*")
      .single();

    if (error) {
      console.error("[SystemPrompt] Update error:", error);
      return NextResponse.json({ error: "Failed to update prompt" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, version: data.version, updated_at: data.updated_at });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("ads_system_prompts") as any)
      .insert({
        prompt_key: "default",
        prompt_text: body.prompt_text.trim(),
        version: 1,
        updated_by: user.id,
      })
      .select("*")
      .single();

    if (error) {
      console.error("[SystemPrompt] Insert error:", error);
      return NextResponse.json({ error: "Failed to save prompt" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, version: data.version, updated_at: data.updated_at });
  }
}
