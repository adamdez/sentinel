import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface GmailPrefs {
  connected?: boolean;
  email?: string;
  connected_at?: string;
}

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("user_id");

    if (!userId) {
      return NextResponse.json(
        { error: "user_id query param is required" },
        { status: 400 },
      );
    }

    const sb = createServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile, error: profileErr } = await (
      sb.from("user_profiles") as any
    )
      .select("preferences, role")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const prefs = profile.preferences as Record<string, unknown> | null;
    const gmail = (prefs?.gmail ?? null) as GmailPrefs | null;

    const result: Record<string, unknown> = {
      connected: gmail?.connected === true,
      email: gmail?.email ?? null,
      connected_at: gmail?.connected_at ?? null,
    };

    if (profile.role === "admin") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: team } = await (sb.from("user_profiles") as any)
        .select("id, full_name, email, preferences")
        .eq("is_active", true);

      if (team) {
        result.team = (
          team as {
            id: string;
            full_name: string;
            email: string;
            preferences: Record<string, unknown> | null;
          }[]
        ).map((member) => {
          const gm = (member.preferences?.gmail ?? null) as GmailPrefs | null;
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
  } catch (err: unknown) {
    console.error("[gmail/status] Error:", err);
    return NextResponse.json(
      {
        error: "Status check failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
