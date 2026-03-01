import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * PATCH /api/properties/update
 *
 * Updates property + lead record fields from the Master Client File editor.
 * Body: { property_id, lead_id?, fields: { address?, city?, state?, zip?,
 *         owner_name?, apn?, property_type?, notes? } }
 *
 * Writes to `properties` table, and if lead_id provided, updates
 * lead notes as well. Returns the updated property record.
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { property_id, lead_id, fields } = body;

    if (!property_id || !fields || typeof fields !== "object") {
      return NextResponse.json(
        { error: "property_id and fields object are required" },
        { status: 400 },
      );
    }

    const sb = createServerClient();

    const allowed = [
      "address", "city", "state", "zip", "owner_name", "apn",
      "property_type", "notes", "county",
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propUpdate: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in fields && fields[key] !== undefined) {
        propUpdate[key] = fields[key];
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: propErr } = await (sb.from("properties") as any)
      .update(propUpdate)
      .eq("id", property_id)
      .select("*")
      .single();

    if (propErr) {
      console.error("[PropertyUpdate] Property update failed:", propErr);
      return NextResponse.json(
        { error: "Failed to update property", detail: propErr.message },
        { status: 500 },
      );
    }

    if (lead_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leadUpdate: Record<string, any> = { updated_at: new Date().toISOString() };
      if ("notes" in fields) leadUpdate.notes = fields.notes;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("leads") as any).update(leadUpdate).eq("id", lead_id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("event_log") as any).insert({
        entity_type: "lead",
        entity_id: lead_id,
        action: "PROPERTY_EDITED",
        details: {
          property_id,
          fields_changed: Object.keys(propUpdate).filter((k) => k !== "updated_at"),
        },
      });
    }

    console.log("[PropertyUpdate] Updated property", property_id, "fields:", Object.keys(propUpdate).filter((k) => k !== "updated_at"));

    return NextResponse.json({
      success: true,
      property: updated,
    });
  } catch (err) {
    console.error("[PropertyUpdate] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
