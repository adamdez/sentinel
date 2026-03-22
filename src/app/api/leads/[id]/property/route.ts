import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/leads/[id]/property
 *
 * Returns the property record linked to this lead.
 * Used by the dossier empty state to show property context
 * before a full research run has been triggered.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (sb.from("leads") as any)
      .select("property_id")
      .eq("id", id)
      .single();

    if (!lead?.property_id) {
      return NextResponse.json({ property: null });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property } = await (sb.from("properties") as any)
      .select("address, city, state, zip, county, estimated_value, equity_percent, year_built, property_type")
      .eq("id", lead.property_id)
      .single();

    return NextResponse.json({ property: property ?? null });
  } catch (err) {
    console.error("[API/leads/id/property] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
