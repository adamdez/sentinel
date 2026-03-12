import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * PATCH /api/dispo/[id] — update dispo_prep JSONB on a deal
 *
 * Merges provided fields into existing dispo_prep, auto-sets updated_at.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    // Fetch existing dispo_prep
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: deal, error: fetchErr } = await (sb.from("deals") as any)
      .select("dispo_prep")
      .eq("id", id)
      .single();

    if (fetchErr || !deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Merge new fields into existing prep
    const existingPrep = deal.dispo_prep || {};
    const merged = {
      ...existingPrep,
      ...body,
      updated_at: new Date().toISOString(),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("deals") as any)
      .update({ dispo_prep: merged, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, dispo_prep")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ deal: data });
  } catch (err) {
    console.error("[API/dispo/id] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
