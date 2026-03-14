import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { DEFAULT_ADS_SYSTEM_PROMPT } from "@/lib/ads/ads-system-prompt";
import { DEFAULT_ADVERSARIAL_PROMPT } from "@/lib/ads/adversarial-review";

export const dynamic = "force-dynamic";

const DEFAULTS: Record<string, string> = {
  default: DEFAULT_ADS_SYSTEM_PROMPT,
  adversarial: DEFAULT_ADVERSARIAL_PROMPT,
};

/**
 * GET /api/ads/system-prompt?key=default|adversarial
 * Returns one or both prompts.
 * - No key param → returns both prompts
 * - key=default → primary Opus prompt
 * - key=adversarial → GPT adversarial prompt
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = req.nextUrl.searchParams.get("key");

  if (key && (key === "default" || key === "adversarial")) {
    // Single prompt
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("ads_system_prompts") as any)
      .select("*")
      .eq("prompt_key", key)
      .single();

    const fallback = DEFAULTS[key] ?? "";
    const promptText = (!error && data?.prompt_text && data.prompt_text !== "SEED")
      ? data.prompt_text
      : fallback;

    return NextResponse.json({
      prompt_key: key,
      prompt_text: promptText,
      version: data?.version ?? 0,
      updated_at: data?.updated_at ?? null,
      source: (!error && data?.prompt_text && data.prompt_text !== "SEED") ? "database" : "default",
    });
  }

  // Return both prompts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (sb.from("ads_system_prompts") as any)
    .select("*")
    .in("prompt_key", ["default", "adversarial"]);

  const result: Record<string, { prompt_text: string; version: number; updated_at: string | null; source: string }> = {};

  for (const key of ["default", "adversarial"] as const) {
    const row = (rows ?? []).find((r: { prompt_key: string }) => r.prompt_key === key);
    const fallback = DEFAULTS[key] ?? "";
    const isReal = row?.prompt_text && row.prompt_text !== "SEED";

    result[key] = {
      prompt_text: isReal ? row.prompt_text : fallback,
      version: row?.version ?? 0,
      updated_at: row?.updated_at ?? null,
      source: isReal ? "database" : "default",
    };
  }

  return NextResponse.json({ prompts: result });
}

/**
 * PUT /api/ads/system-prompt
 * Body: { prompt_key: "default" | "adversarial", prompt_text: string }
 */
export async function PUT(req: NextRequest) {
  const sb = createServerClient();
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { prompt_key?: string; prompt_text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const promptKey = body.prompt_key ?? "default";
  if (promptKey !== "default" && promptKey !== "adversarial") {
    return NextResponse.json({ error: "prompt_key must be 'default' or 'adversarial'" }, { status: 400 });
  }

  if (!body.prompt_text || typeof body.prompt_text !== "string" || body.prompt_text.trim().length < 100) {
    return NextResponse.json({ error: "prompt_text is required (min 100 chars)" }, { status: 400 });
  }

  // Upsert
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (sb.from("ads_system_prompts") as any)
    .select("id, version")
    .eq("prompt_key", promptKey)
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
      .eq("prompt_key", promptKey)
      .select("*")
      .single();

    if (error) {
      console.error("[SystemPrompt] Update error:", error);
      return NextResponse.json({ error: "Failed to update prompt" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, prompt_key: promptKey, version: data.version, updated_at: data.updated_at });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("ads_system_prompts") as any)
      .insert({
        prompt_key: promptKey,
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

    return NextResponse.json({ ok: true, prompt_key: promptKey, version: data.version, updated_at: data.updated_at });
  }
}
