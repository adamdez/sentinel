/**
 * POST /api/gmail/connect
 *
 * Initiates Google OAuth flow for Gmail integration.
 * Returns the OAuth consent URL for the client to redirect to.
 *
 * Charter v3.0 §4: All writes through API routes using createServerClient().
 */

import { NextRequest, NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/gmail";

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        { error: "Google OAuth not configured", detail: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET" },
        { status: 503 }
      );
    }

    const url = buildAuthUrl(user_id);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[API/gmail/connect] Error:", err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
