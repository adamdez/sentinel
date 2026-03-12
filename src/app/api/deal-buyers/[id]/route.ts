import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

/**
 * PATCH /api/deal-buyers/[id] — update outreach status/details
 *
 * When status changes to "selected", also sets deals.buyer_id to this buyer.
 * When status changes away from "selected", clears deals.buyer_id if it
 * matched this buyer.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    const allowed = [
      "status", "date_contacted", "contact_method", "response",
      "offer_amount", "follow_up_needed", "follow_up_at", "notes",
      "responded_at", "selection_reason",
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in body) update[key] = body[key];
    }

    // Fetch current record to know deal_id and buyer_id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: fetchErr } = await (sb.from("deal_buyers") as any)
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Deal-buyer link not found" }, { status: 404 });
    }

    // ── Write-path hardening: auto-set lifecycle timestamps on status transitions ──
    if ("status" in body) {
      const prevStatus = existing.status;
      const newStatus = body.status;
      const nowIso = update.updated_at;

      // Auto-set date_contacted when buyer moves from pre-contact to contacted status
      const preContactStatuses = new Set(["not_contacted", "queued"]);
      const contactedStatuses = new Set(["sent", "interested", "offered", "follow_up", "selected", "passed"]);
      if (preContactStatuses.has(prevStatus) && contactedStatuses.has(newStatus)) {
        if (!update.date_contacted && !existing.date_contacted) {
          update.date_contacted = nowIso;
        }
      }

      // Auto-set responded_at when buyer moves from outreach to response status
      const outreachStatuses = new Set(["not_contacted", "queued", "sent"]);
      const responseStatuses = new Set(["interested", "offered", "follow_up", "selected"]);
      if (outreachStatuses.has(prevStatus) && responseStatuses.has(newStatus)) {
        if (!update.responded_at && !existing.responded_at) {
          update.responded_at = nowIso;
        }
      }
    }

    // Apply the update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from("deal_buyers") as any)
      .update(update)
      .eq("id", id)
      .select("*, buyer:buyers(*)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Sync deals.buyer_id when status changes to/from "selected"
    if ("status" in body) {
      const prevStatus = existing.status;
      const newStatus = body.status;

      if (newStatus === "selected" && prevStatus !== "selected") {
        // Set this buyer as the deal's selected buyer
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("deals") as any)
          .update({ buyer_id: existing.buyer_id, updated_at: new Date().toISOString() })
          .eq("id", existing.deal_id);

        // Un-select any other buyer on this deal
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("deal_buyers") as any)
          .update({ status: "passed", updated_at: new Date().toISOString() })
          .eq("deal_id", existing.deal_id)
          .neq("id", id)
          .eq("status", "selected");
      } else if (prevStatus === "selected" && newStatus !== "selected") {
        // Clear deals.buyer_id if it was this buyer
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: deal } = await (sb.from("deals") as any)
          .select("buyer_id")
          .eq("id", existing.deal_id)
          .single();

        if (deal?.buyer_id === existing.buyer_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("deals") as any)
            .update({ buyer_id: null, updated_at: new Date().toISOString() })
            .eq("id", existing.deal_id);
        }
      }
    }

    return NextResponse.json({ deal_buyer: data });
  } catch (err) {
    console.error("[API/deal-buyers/id] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/deal-buyers/[id] — unlink a buyer from a deal
 *
 * If this was the selected buyer, clears deals.buyer_id.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // Fetch before delete to check if selected
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: fetchErr } = await (sb.from("deal_buyers") as any)
      .select("deal_id, buyer_id, status")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json({ error: "Deal-buyer link not found" }, { status: 404 });
    }

    // Delete the link
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from("deal_buyers") as any)
      .delete()
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If this was the selected buyer, clear deals.buyer_id
    if (existing.status === "selected") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: deal } = await (sb.from("deals") as any)
        .select("buyer_id")
        .eq("id", existing.deal_id)
        .single();

      if (deal?.buyer_id === existing.buyer_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("deals") as any)
          .update({ buyer_id: null, updated_at: new Date().toISOString() })
          .eq("id", existing.deal_id);
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[API/deal-buyers/id] DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
