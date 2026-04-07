import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * PATCH /api/settings/personal-cell
 *
 * Upserts the authenticated user's personal_cell in user_profiles.
 * Uses service role to bypass RLS. Creates the profile row if it
 * doesn't exist yet (handles users who signed up before the
 * auto-create trigger was applied).
 *
 * Body: { personalCell: string | null }
 */
export async function PATCH(req: NextRequest) {
  const sb = createServerClient();
  const bearerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(bearerToken);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { personalCell?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cleaned = (body.personalCell ?? "").replace(/[^\d+]/g, "") || null;

  // Try update first — this is the happy path when the row already exists.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updated, error: updateErr } = await (sb.from("user_profiles") as any)
    .update({ personal_cell: cleaned, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select("id, personal_cell")
    .maybeSingle();

  if (updateErr) {
    console.error("[Settings] personal_cell update failed:", updateErr);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  if (updated) {
    return NextResponse.json({ ok: true, personal_cell: updated.personal_cell ?? cleaned });
  }

  // Row doesn't exist — create it with required fields.
  const email = user.email ?? `${user.id}@sentinel.local`;
  const role = "agent";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insertErr } = await (sb.from("user_profiles") as any)
    .insert({
      id: user.id,
      full_name: user.user_metadata?.full_name ?? email,
      email,
      role,
      personal_cell: cleaned,
      is_active: true,
      preferences: {},
    })
    .select("id, personal_cell")
    .single();

  if (insertErr) {
    console.error("[Settings] personal_cell insert failed:", insertErr);
    return NextResponse.json({ error: "Failed to create profile — check database permissions" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, personal_cell: inserted?.personal_cell ?? cleaned });
}
