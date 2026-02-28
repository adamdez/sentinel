import { NextRequest, NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userId: string | undefined = body?.user_id;

    if (!userId) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 },
      );
    }

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        {
          error: "Google OAuth not configured",
          detail: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars",
        },
        { status: 503 },
      );
    }

    const url = buildAuthUrl(userId);
    return NextResponse.json({ url });
  } catch (err: unknown) {
    console.error("[gmail/connect] Error:", err);
    return NextResponse.json(
      {
        error: "Failed to generate OAuth URL",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
