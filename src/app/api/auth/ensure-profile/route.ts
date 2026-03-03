import { NextRequest, NextResponse } from "next/server";
import { createServerClient, getOrCreateProfile } from "@/lib/supabase";

/**
 * POST /api/auth/ensure-profile
 *
 * Guarantees the authenticated user has a user_profiles row.
 * Called by AuthSyncProvider on every login / session restore so that
 * downstream features (dialer, settings, etc.) always find a row.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const bearerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(bearerToken);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOrCreateProfile(user.id, {
    email: user.email,
    name: user.user_metadata?.full_name ?? user.email,
  });

  if (!profile) {
    return NextResponse.json({ error: "Failed to ensure profile" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    personal_cell: profile.personal_cell ?? null,
  });
}
