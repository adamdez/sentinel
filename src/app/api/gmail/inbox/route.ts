import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { refreshAccessToken, fetchInbox } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
      {
        error: "Inbox fetch failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
