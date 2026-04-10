import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { syncLeadPhoneOutcome } from "@/lib/lead-phone-outcome";

/**
 * PATCH /api/leads/[id]/phones/[phoneId]
 *
 * Update a phone's status (mark dead, reactivate, or DNC) and/or promote it
 * to the lead's primary callback number.
 * When the primary phone is marked dead, auto-promotes the next active phone
 * and syncs properties.owner_phone as a legacy compatibility mirror.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; phoneId: string }> }
) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: leadId, phoneId } = await params;
    const body = await req.json();

    const { status, dead_reason, mark_primary } = body as {
      status?: "dead" | "active" | "dnc";
      dead_reason?: "wrong_number" | "disconnected" | "fax" | "spam";
      mark_primary?: boolean;
    };

    if (!mark_primary && (!status || !["dead", "active", "dnc"].includes(status))) {
      return NextResponse.json({ error: "status must be 'dead', 'active', or 'dnc'" }, { status: 400 });
    }

    // Fetch the phone record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawPhone, error: fetchErr } = await (sb.from("lead_phones") as any)
      .select("*")
      .eq("id", phoneId)
      .eq("lead_id", leadId)
      .single();

    if (fetchErr || !rawPhone) {
      return NextResponse.json({ error: "Phone not found for this lead" }, { status: 404 });
    }

    const phoneRecord = rawPhone as Record<string, unknown>;
    const effectiveStatus = status ?? (phoneRecord.status as "dead" | "active" | "dnc" | undefined);

    if (mark_primary && effectiveStatus !== "active") {
      return NextResponse.json({ error: "Only active phones can be promoted to primary" }, { status: 400 });
    }

    let outcomeResult = null;
    if (mark_primary) {
      outcomeResult = await syncLeadPhoneOutcome({
        sb,
        leadId,
        userId: user.id,
        disposition: "follow_up",
        phoneId,
      });
    } else if (status === "dead" || status === "dnc") {
      outcomeResult = await syncLeadPhoneOutcome({
        sb,
        leadId,
        userId: user.id,
        disposition: status === "dnc" ? "do_not_call" : dead_reason,
        phoneId,
      });
    } else {
      const updateFields: Record<string, unknown> = {
        status: "active",
        dead_reason: null,
        dead_marked_by: null,
        dead_marked_at: null,
        updated_at: new Date().toISOString(),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (sb.from("lead_phones") as any)
        .update(updateFields)
        .eq("id", phoneId);

      if (updateErr) {
        console.error("[PATCH phones] update error:", updateErr);
        return NextResponse.json({ error: "Failed to update phone" }, { status: 500 });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: activeCount } = await (sb.from("lead_phones") as any)
        .select("id", { count: "exact", head: true })
        .eq("lead_id", leadId)
        .eq("status", "active");

      outcomeResult = {
        newPrimaryPhone: null,
        allPhonesDead: (activeCount ?? 0) === 0,
      };
    }

    return NextResponse.json({
      success: true,
      phone_id: phoneId,
      new_primary_phone: outcomeResult?.newPrimaryPhone ?? null,
      all_phones_dead: outcomeResult?.allPhonesDead ?? null,
      mark_primary: mark_primary === true,
      phone_outcome_applied: Boolean(outcomeResult),
    });
  } catch (err) {
    console.error("[PATCH phones] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
