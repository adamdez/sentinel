import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/leads/[id]/distress-events
 *
 * Returns active distress events for the property linked to this lead.
 * Used by the dossier empty state to surface distress signals
 * before a full research run has been triggered.
 *
 * Query params:
 *   limit = number (default 5, max 10)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? "5"), 10);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (sb.from("leads") as any)
      .select("property_id")
      .eq("id", id)
      .single();

    if (!lead?.property_id) {
      return NextResponse.json({ events: [] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: events } = await (sb.from("distress_events") as any)
      .select("id, event_type, severity, status, event_date")
      .eq("property_id", lead.property_id)
      .order("severity", { ascending: false })
      .limit(limit);

    return NextResponse.json({ events: events ?? [] });
  } catch (err) {
    console.error("[API/leads/id/distress-events] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
