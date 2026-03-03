import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient();

    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    const {
      data: { user },
    } = await sb.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { subject, body, category } = (await req.json()) as {
      subject?: string;
      body?: string;
      category?: string;
    };

    if (!body) {
      return NextResponse.json(
        { error: "body is required" },
        { status: 400 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertErr } = await (sb.from("event_log") as any).insert({
      user_id: user.id,
      action: "UPGRADE_REQUEST_SENT",
      entity_type: "system",
      entity_id: user.id,
      details: {
        subject: subject || "Sentinel Upgrade Request",
        category: category || "General",
        body,
        submitted_at: new Date().toISOString(),
      },
    });

    if (insertErr) {
      console.error("[upgrade-request] Insert failed:", insertErr);
      return NextResponse.json(
        { error: "Failed to log request" },
        { status: 500 },
      );
    }

    console.log(
      `[upgrade-request] Logged by ${user.email}: ${category} — ${(subject || "").slice(0, 80)}`,
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[upgrade-request] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
