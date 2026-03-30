import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * DELETE /api/intake/[id]
 *
 * Removes an intake queue item. If the lead was already claimed, the linked CRM
 * lead is preserved because `leads.intake_lead_id` uses `ON DELETE SET NULL`.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: intakeLead, error: fetchError } = await (sb.from("intake_leads") as any)
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!intakeLead) {
      return NextResponse.json({ error: "Intake lead not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (sb.from("intake_leads") as any)
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      intake_lead_id: id,
      deleted_status: intakeLead.status,
    });
  } catch (error) {
    console.error("[API/intake/id] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
