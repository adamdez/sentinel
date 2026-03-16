import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { insertValidatedRecommendations } from "@/lib/ads/recommendations";

export const dynamic = "force-dynamic";

/**
 * POST /api/ads/chat-recommend
 * Accepts recommendations created by the chat AI and validates + inserts them.
 * Body: { recommendations: Array }
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  const { data: { user }, error: authErr } = await sb.auth.getUser(token ?? "");
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  if (!Array.isArray(body.recommendations) || body.recommendations.length === 0) {
    return NextResponse.json({ error: "recommendations array required" }, { status: 400 });
  }

  try {
    const result = await insertValidatedRecommendations(sb, body.recommendations);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
