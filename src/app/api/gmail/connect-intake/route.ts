import { NextRequest, NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/gmail/connect-intake
 *
 * Starts OAuth flow for the PPL intake Gmail account (leads@dominionhomedeals.com).
 * Stores credentials separately from personal Gmail under preferences.intake_gmail.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId: string | undefined = body?.user_id;

    if (!userId) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        { error: "Google OAuth not configured" },
        { status: 503 },
      );
    }

    const url = buildAuthUrl(userId, "intake");
    return NextResponse.json({ url });
  } catch (err: unknown) {
    console.error("[gmail/connect-intake] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
