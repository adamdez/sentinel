import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/audit
 *
 * Returns recent audit log entries from event_log. Supports pagination.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  try {
    const sb = createServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error, count } = await (sb.from("event_log") as any)
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[Audit] Query failed:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json({
      entries: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[Audit] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/audit
 *
 * Inserts audit log entries (append-only).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, action, entity_type, entity_id, details } = body;

    if (!action || !entity_type || !entity_id) {
      return NextResponse.json(
        { error: "action, entity_type, and entity_id are required" },
        { status: 400 }
      );
    }

    const sb = createServerClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from("event_log") as any).insert({
      user_id: user_id || "00000000-0000-0000-0000-000000000000",
      action,
      entity_type,
      entity_id,
      details: details ?? {},
    });

    if (error) {
      console.error("[Audit] Insert failed:", error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Audit] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
