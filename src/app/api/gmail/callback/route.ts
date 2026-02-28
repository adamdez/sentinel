import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { exchangeCodeForTokens, encryptToken } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (oauthError) {
    console.error("[gmail/callback] OAuth error:", oauthError);
    return NextResponse.redirect(
      `${baseUrl}/gmail?error=${encodeURIComponent(oauthError)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/gmail?error=missing_params`);
  }

  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { uid?: string };
    const uid = parsed.uid;
    if (!uid) throw new Error("No uid in state payload");

    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.refresh_token) {
      console.error("[gmail/callback] No refresh_token — re-auth required");
      return NextResponse.redirect(
        `${baseUrl}/gmail?error=no_refresh_token`,
      );
    }

    const encryptedRefresh = encryptToken(tokens.refresh_token);
    const sb = createServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (sb.from("user_profiles") as any)
      .select("preferences")
      .eq("id", uid)
      .single();

    const existingPrefs =
      (profile?.preferences as Record<string, unknown>) ?? {};

    const updatedPrefs = {
      ...existingPrefs,
      gmail: {
        connected: true,
        email: tokens.email ?? null,
        encrypted_refresh_token: encryptedRefresh,
        connected_at: new Date().toISOString(),
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (sb.from("user_profiles") as any)
      .update({
        preferences: updatedPrefs,
        updated_at: new Date().toISOString(),
      })
      .eq("id", uid);

    if (updateErr) {
      console.error("[gmail/callback] Profile update failed:", updateErr);
      return NextResponse.redirect(
        `${baseUrl}/gmail?error=db_update_failed`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any)
      .insert({
        user_id: uid,
        action: "GMAIL_CONNECTED",
        entity_type: "user_profile",
        entity_id: uid,
        details: { gmail_email: tokens.email ?? "unknown" },
      })
      .then(({ error: auditErr }: { error: unknown }) => {
        if (auditErr) {
          console.error("[gmail/callback] Audit log failed:", auditErr);
        }
      });

    console.log(
      `[gmail/callback] Connected for ${uid} (${tokens.email ?? "?"})`,
    );
    return NextResponse.redirect(`${baseUrl}/gmail?connected=true`);
  } catch (err: unknown) {
    console.error("[gmail/callback] Error:", err);
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(
      `${baseUrl}/gmail?error=${encodeURIComponent(msg)}`,
    );
  }
}
