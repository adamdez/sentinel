/**
 * GET /api/gmail/status?user_id=xxx
 *
 * Returns the Gmail connection status for a user.
 * Optionally returns team connection status for admin users.
 *
 * Charter v3.0 §4: Service role for DB reads.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("user_id");
    if (!userId) {
      return NextResponse.json({ error: "user_id query param is required" }, { status: 400 });
    }

    const sb = createServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile, error: profileErr } = await (sb.from("user_profiles") as any)
      .select("preferences, role")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const prefs = profile.preferences as Record<string, unknown>;
    const gmail = prefs?.gmail as {
      connected?: boolean;
      email?: string;
      connected_at?: string;
    } | undefined;

    const result: Record<string, unknown> = {
      connected: gmail?.connected === true,
      email: gmail?.email ?? null,
      connected_at: gmail?.connected_at ?? null,
    };

    // Admin sees team connections
    if (profile.role === "admin") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: team } = await (sb.from("user_profiles") as any)
        .select("id, full_name, email, preferences")
        .eq("is_active", true);

      if (team) {
        result.team = team.map((member: { id: string; full_name: string; email: string; preferences: Record<string, unknown> }) => {
          const gm = member.preferences?.gmail as { connected?: boolean; email?: string; connected_at?: string } | undefined;
          return {
            id: member.id,
            name: member.full_name,
            email: member.email,
            gmail_connected: gm?.connected === true,
            gmail_email: gm?.email ?? null,
            connected_at: gm?.connected_at ?? null,
          };
        });
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[API/gmail/status] Error:", err);
    return NextResponse.json(
      { error: "Status check failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
