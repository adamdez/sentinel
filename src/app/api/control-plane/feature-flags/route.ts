import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/control-plane/feature-flags
 *
 * List all feature flags. Used by the agent runner and admin UI.
 *
 * PATCH /api/control-plane/feature-flags
 *
 * Update a flag. Body: { flag_key, enabled?, mode?, metadata? }
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("feature_flags") as any)
    .select("*")
    .order("flag_key", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { flag_key, enabled, mode, metadata } = body;

  if (!flag_key) {
    return NextResponse.json({ error: "flag_key is required" }, { status: 422 });
  }

  const updates: Record<string, unknown> = {
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  if (typeof enabled === "boolean") updates.enabled = enabled;
  if (mode) updates.mode = mode;
  if (metadata) updates.metadata = metadata;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("feature_flags") as any)
    .update(updates)
    .eq("flag_key", flag_key)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: `Flag '${flag_key}' not found` }, { status: 404 });
  }

  return NextResponse.json({ data });
}
