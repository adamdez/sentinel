import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { refreshAccessToken, fetchInbox } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sb = createServerClient();
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user } } = await sb.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user.id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile, error: profileErr } = await (
      sb.from("user_profiles") as any
    )
      .select("preferences")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const prefs = profile.preferences as Record<string, unknown> | null;
    const gmail = prefs?.gmail as
      | { connected?: boolean; encrypted_refresh_token?: string }
      | undefined;

    if (!gmail?.connected || !gmail.encrypted_refresh_token) {
      return NextResponse.json(
        { error: "Gmail not connected" },
        { status: 403 },
      );
    }

    const accessToken = await refreshAccessToken(
      gmail.encrypted_refresh_token,
    );
    const messages = await fetchInbox(accessToken, 10);

    return NextResponse.json({ messages });
  } catch (err: unknown) {
    console.error("[gmail/inbox] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
