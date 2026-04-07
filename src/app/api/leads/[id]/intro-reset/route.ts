import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: leadId } = await params;
    if (!leadId) return NextResponse.json({ error: "Missing lead ID" }, { status: 400 });

    const nowIso = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("leads") as any)
      .update({
        intro_sop_active: true,
        intro_day_count: 0,
        intro_last_call_date: null,
        intro_completed_at: null,
        intro_exit_category: null,
        intro_exit_reason: "manual_reset",
        updated_at: nowIso,
      })
      .eq("id", leadId)
      .select("intro_sop_active, intro_day_count, intro_last_call_date, intro_completed_at, intro_exit_category")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message ?? "Reset failed" }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb.from("event_log") as any)
      .insert({
        user_id: user.id,
        action: "lead.intro_sop_reset",
        entity_type: "lead",
        entity_id: leadId,
        details: { by: "operator" },
      })
      .then(() => {});

    return NextResponse.json({
      ok: true,
      ...data,
      requires_exit_category: false,
    });
  } catch (error) {
    console.error("[API/leads/[id]/intro-reset] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
