import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = createServerClient();

    const {
      apn, county, address, city, state, zip,
      owner_name, owner_phone, owner_email,
      estimated_value, equity_percent, property_type,
      bedrooms, bathrooms, sqft, year_built, lot_size,
      distress_tags, notes, source, assign_to,
    } = body;

    if (!address || !county) {
      return NextResponse.json(
        { error: "Address and county are required" },
        { status: 400 }
      );
    }

    const finalApn = apn?.trim() || `MANUAL-${Date.now()}`;
    const finalCounty = county.trim().toLowerCase();

    const toInt = (v: unknown) => { const n = parseInt(String(v), 10); return isNaN(n) ? null : n; };
    const toFloat = (v: unknown) => { const n = parseFloat(String(v)); return isNaN(n) ? null : n; };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property, error: propErr } = await (sb.from("properties") as any)
      .upsert({
        apn: finalApn,
        county: finalCounty,
        address: address.trim(),
        city: city?.trim() || null,
        state: state?.trim().toUpperCase() || null,
        zip: zip?.trim() || null,
        owner_name: owner_name?.trim() || null,
        owner_phone: owner_phone?.trim() || null,
        owner_email: owner_email?.trim() || null,
        estimated_value: toInt(estimated_value),
        equity_percent: toFloat(equity_percent),
        property_type: property_type || null,
        bedrooms: toInt(bedrooms),
        bathrooms: toFloat(bathrooms),
        sqft: toInt(sqft),
        year_built: toInt(year_built),
        lot_size: toFloat(lot_size),
        owner_flags: { manual_entry: true },
        updated_at: new Date().toISOString(),
      }, { onConflict: "apn,county" })
      .select("id")
      .single();

    if (propErr || !property) {
      console.error("[API/prospects] Property upsert failed:", propErr);
      return NextResponse.json(
        { error: "Property save failed", detail: propErr?.message ?? "No data returned" },
        { status: 500 }
      );
    }

    const tags = distress_tags ?? [];
    const baseScore = Math.min(30 + tags.length * 12, 100);
    const eqBonus = toFloat(equity_percent) ?? 0;
    const compositeScore = Math.min(Math.round(baseScore + (eqBonus as number) * 0.2), 100);

    const isAssigned = assign_to && assign_to !== "unassigned";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leadRow: any = {
      property_id: property.id,
      status: isAssigned ? "my_lead" : "prospect",
      priority: compositeScore,
      source: source || "manual",
      tags,
      notes: notes?.trim() || "Manually added prospect",
      promoted_at: new Date().toISOString(),
    };

    if (isAssigned) {
      leadRow.assigned_to = assign_to;
      leadRow.claimed_at = new Date().toISOString();
      leadRow.claim_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: leadErr } = await (sb.from("leads") as any)
      .insert(leadRow)
      .select("id")
      .single();

    if (leadErr || !lead) {
      console.error("[API/prospects] Lead insert failed:", leadErr);
      return NextResponse.json(
        { error: "Lead creation failed", detail: leadErr?.message ?? "No data returned" },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      entity_type: "lead",
      entity_id: lead.id,
      action: "CREATED",
      actor_id: body.actor_id || null,
      details: {
        source: "manual",
        address,
        owner: owner_name,
        score: compositeScore,
        assigned: isAssigned ? assign_to : "unassigned",
      },
    });

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      property_id: property.id,
      score: compositeScore,
      status: leadRow.status,
    });
  } catch (err) {
    console.error("[API/prospects] Unexpected error:", err);
    return NextResponse.json(
      { error: "Server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
