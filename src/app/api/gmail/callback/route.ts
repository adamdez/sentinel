/**
 * GET /api/gmail/callback
 *
 * Handles the OAuth redirect from Google after user grants consent.
 * Exchanges the authorization code for tokens, encrypts the refresh_token,
 * and stores it in user_profiles.preferences.gmail.
 *
 * Charter v3.0 §4: Service role client for DB writes. Compliance sacred.
 * Charter v3.0 §10: Audit trail for every integration event.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { exchangeCodeForTokens, encryptToken } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  if (error) {
    console.error("[API/gmail/callback] OAuth error:", error);
    return NextResponse.redirect(`${baseUrl}/gmail?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/gmail?error=missing_params`);
  }

  try {
    const { uid } = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    if (!uid) throw new Error("No user ID in state");

    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      console.error("[API/gmail/callback] No refresh_token returned — user may need to re-authorize");
      return NextResponse.redirect(`${baseUrl}/gmail?error=no_refresh_token`);
    }

    const encryptedRefresh = encryptToken(tokens.refresh_token);
    const sb = createServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (sb.from("user_profiles") as any)
      .select("preferences")
      .eq("id", uid)
      .single();

    const existingPrefs = (profile?.preferences as Record<string, unknown>) ?? {};
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
      .update({ preferences: updatedPrefs, updated_at: new Date().toISOString() })
      .eq("id", uid);

    if (updateErr) {
      console.error("[API/gmail/callback] Profile update failed:", updateErr);
      return NextResponse.redirect(`${baseUrl}/gmail?error=db_update_failed`);
    }

    // Append-only audit log
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
        if (auditErr) console.error("[API/gmail/callback] Audit log failed (non-fatal):", auditErr);
      });

    console.log(`[API/gmail/callback] Gmail connected for user ${uid} (${tokens.email})`);
    return NextResponse.redirect(`${baseUrl}/gmail?connected=true`);
  } catch (err) {
    console.error("[API/gmail/callback] Error:", err);
    return NextResponse.redirect(
      `${baseUrl}/gmail?error=${encodeURIComponent(err instanceof Error ? err.message : "unknown")}`
    );
  }
}
