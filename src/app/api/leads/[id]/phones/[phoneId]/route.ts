import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

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

    // Update the phone record
    const updateFields: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (status) {
      updateFields.status = status;
      if (status === "dead" || status === "dnc") {
        updateFields.dead_reason = dead_reason || null;
        updateFields.dead_marked_by = user.id;
        updateFields.dead_marked_at = new Date().toISOString();
      } else if (status === "active") {
        updateFields.dead_reason = null;
        updateFields.dead_marked_by = null;
        updateFields.dead_marked_at = null;
      }
    }

    const effectiveStatus = status ?? (phoneRecord.status as "dead" | "active" | "dnc" | undefined);
    if (mark_primary && effectiveStatus !== "active") {
      return NextResponse.json({ error: "Only active phones can be promoted to primary" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (sb.from("lead_phones") as any)
      .update(updateFields)
      .eq("id", phoneId);

    if (updateErr) {
      console.error("[PATCH phones] update error:", updateErr);
      return NextResponse.json({ error: "Failed to update phone" }, { status: 500 });
    }

    // If this was the primary phone and we're marking it dead/dnc, auto-promote next active
    let newPrimaryPhone: string | undefined;
    if (mark_primary) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("lead_phones") as any).update({ is_primary: false }).eq("lead_id", leadId).neq("id", phoneId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("lead_phones") as any).update({ is_primary: true }).eq("id", phoneId);
      newPrimaryPhone = String(phoneRecord.phone ?? "");

      // Sync properties.owner_phone for legacy callers that still expect a primary mirror.
      if (phoneRecord.property_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("properties") as any)
          .update({ owner_phone: phoneRecord.phone })
          .eq("id", phoneRecord.property_id);
      }
    } else if (phoneRecord.is_primary && status && status !== "active") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: nextActive } = await (sb.from("lead_phones") as any)
        .select("id, phone")
        .eq("lead_id", leadId)
        .eq("status", "active")
        .neq("id", phoneId)
        .order("position", { ascending: true })
        .limit(1)
        .single();

      if (nextActive) {
        const next = nextActive as { id: string; phone: string };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("lead_phones") as any).update({ is_primary: false }).eq("id", phoneId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("lead_phones") as any).update({ is_primary: true }).eq("id", next.id);
        newPrimaryPhone = next.phone;

        // Sync properties.owner_phone for legacy callers that still expect a primary mirror.
        if (phoneRecord.property_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("properties") as any)
            .update({ owner_phone: next.phone })
            .eq("id", phoneRecord.property_id);
        }
      } else {
        // No active phones left — clear the legacy primary-phone mirror.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("lead_phones") as any).update({ is_primary: false }).eq("id", phoneId);
        if (phoneRecord.property_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("properties") as any)
            .update({ owner_phone: null })
            .eq("id", phoneRecord.property_id);
        }
      }
    }

    // Check if ALL phones are now dead
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: activeCount } = await (sb.from("lead_phones") as any)
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId)
      .eq("status", "active");

    const allPhonesDead = (activeCount ?? 0) === 0;

    // If DNC, also add to dnc_list
    if (status === "dnc") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("dnc_list") as any).upsert(
        {
          phone: phoneRecord.phone,
          reason: dead_reason || "marked_dnc",
          source: "operator",
          added_by: user.id,
          added_at: new Date().toISOString(),
        },
        { onConflict: "phone" }
      );
    }

    // Audit log
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: user.id,
      action: mark_primary ? "phone.primary_promoted" : `phone.${status}`,
      entity_type: "lead_phone",
      entity_id: phoneId,
      details: {
        lead_id: leadId,
        phone: phoneRecord.phone,
        previous_status: phoneRecord.status,
        new_status: effectiveStatus,
        dead_reason: dead_reason || null,
        was_primary: phoneRecord.is_primary,
        marked_primary: mark_primary === true,
        new_primary: newPrimaryPhone || null,
        all_phones_dead: allPhonesDead,
      },
    });

    return NextResponse.json({
      success: true,
      phone_id: phoneId,
      new_primary_phone: newPrimaryPhone,
      all_phones_dead: allPhonesDead,
      mark_primary: mark_primary === true,
    });
  } catch (err) {
    console.error("[PATCH phones] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
