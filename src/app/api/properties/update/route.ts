import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

async function requireAuthenticatedUser(req: NextRequest, sb: ReturnType<typeof createServerClient>) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

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
    const user = await requireAuthenticatedUser(req, sb);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowed = [
      "address", "city", "state", "zip", "owner_name", "apn",
      "property_type", "notes", "county",
      "bedrooms", "bathrooms", "sqft", "year_built", "lot_size",
      "owner_phone", "owner_email",
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propUpdate: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (key in fields && fields[key] !== undefined) {
        propUpdate[key] = fields[key];
      }
    }

    if ("owner_flags" in fields && fields.owner_flags !== undefined) {
      if (!fields.owner_flags || typeof fields.owner_flags !== "object") {
        return NextResponse.json({ error: "owner_flags must be an object" }, { status: 400 });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: currentProperty } = await (sb.from("properties") as any)
        .select("owner_flags")
        .eq("id", property_id)
        .single();
      propUpdate.owner_flags = {
        ...(currentProperty?.owner_flags ?? {}),
        ...(fields.owner_flags as Record<string, unknown>),
      };
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

      const changedFields = Object.keys(propUpdate).filter((k) => k !== "updated_at");
      const ownerFlagsPatch = ("owner_flags" in fields && typeof fields.owner_flags === "object" && fields.owner_flags)
        ? (fields.owner_flags as Record<string, unknown>)
        : {};
      const isArvUpdate = "comp_arv" in ownerFlagsPatch || "comp_arv_updated_at" in ownerFlagsPatch;
      const isOfferPrepUpdate =
        "offer_prep_snapshot" in ownerFlagsPatch
        || "offer_prep_arv_used" in ownerFlagsPatch
        || "offer_prep_rehab_estimate" in ownerFlagsPatch
        || "offer_prep_mao_low" in ownerFlagsPatch
        || "offer_prep_mao_high" in ownerFlagsPatch
        || "offer_prep_confidence" in ownerFlagsPatch
        || "offer_prep_sheet_url" in ownerFlagsPatch
        || "offer_prep_updated_at" in ownerFlagsPatch;
      const isContactUpdate = (
        "owner_phone" in propUpdate
        || "owner_email" in propUpdate
        || "manual_phones" in ownerFlagsPatch
        || "manual_emails" in ownerFlagsPatch
        || "mailing_address" in ownerFlagsPatch
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("event_log") as any).insert({
        entity_type: "lead",
        entity_id: lead_id,
        action: isArvUpdate
          ? "PROPERTY_ARV_UPDATED"
          : isOfferPrepUpdate
            ? "PROPERTY_OFFER_PREP_UPDATED"
            : isContactUpdate
              ? "PROPERTY_CONTACT_UPDATED"
              : "PROPERTY_EDITED",
        user_id: user.id,
        details: {
          property_id,
          fields_changed: changedFields,
          update_type: isArvUpdate
            ? "arv"
            : isOfferPrepUpdate
              ? "offer_prep"
              : isContactUpdate
                ? "contact"
                : "details",
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
