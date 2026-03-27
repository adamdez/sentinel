import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * POST /api/intake/claim
 *
 * Promotes an intake_lead to a full lead record with:
 * - from_special_intake = true (flags for auto-cycle suppression)
 * - source_category set to the provider name
 * - intake_lead_id linked for traceability
 * - next_action = "review" (requires operator approval before auto-dial)
 *
 * Request body:
 * {
 *   intake_lead_id: string (UUID)
 *   provider_id: string (UUID, from intake_providers table)
 *   owner_name: string (may override intake_lead data)
 *   owner_phone: string
 *   property_address: string
 *   property_city: string
 *   property_state: string
 *   property_zip: string
 *   apn: string
 *   county: string
 *   assign_to?: string (optional user_id to assign lead to)
 *   notes?: string (operator notes)
 * }
 *
 * Returns: { success: true, lead_id: string, source_category: string }
 */
export async function POST(req: NextRequest) {
  try {
    const sb = createServerClient();
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");

    // Verify user is authenticated
    const { data: { user } } = await sb.auth.getUser(authHeader);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      intake_lead_id,
      provider_id,
      owner_name,
      owner_phone,
      property_address,
      property_city,
      property_state,
      property_zip,
      apn,
      county,
      assign_to,
      notes,
    } = body;

    // Validate required fields
    if (!intake_lead_id || !provider_id || !owner_phone || !property_address) {
      return NextResponse.json(
        { error: "Missing required fields: intake_lead_id, provider_id, owner_phone, property_address" },
        { status: 400 }
      );
    }

    // Fetch intake_lead record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: intakeLead, error: intakeError } = await (sb.from("intake_leads") as any)
      .select("*")
      .eq("id", intake_lead_id)
      .single();

    if (intakeError || !intakeLead) {
      return NextResponse.json({ error: "Intake lead not found" }, { status: 404 });
    }

    if (intakeLead.status !== "pending_review") {
      return NextResponse.json(
        { error: `Cannot claim intake lead with status: ${intakeLead.status}` },
        { status: 409 }
      );
    }

    // Fetch provider to get the provider name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: provider, error: providerError } = await (sb.from("intake_providers") as any)
      .select("name")
      .eq("id", provider_id)
      .single();

    if (providerError || !provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const sourceCategory = provider.name;

    // Step 1: Create or update property record (upsert via APN + county)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property, error: propertyError } = await (sb.from("properties") as any)
      .upsert(
        {
          apn: apn || "",
          county: county || "",
          address: property_address,
          city: property_city || "",
          state: property_state || "WA",
          zip: property_zip || "",
          owner_name: owner_name || intakeLead.owner_name || "Unknown",
        },
        {
          onConflict: "apn,county",
        }
      )
      .select()
      .single();

    if (propertyError || !property) {
      console.error("[Intake Claim] Property creation failed:", propertyError);
      return NextResponse.json(
        { error: "Failed to create property record" },
        { status: 500 }
      );
    }

    // Step 2: Create or update contact record (upsert via phone)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contact, error: contactError } = await (sb.from("contacts") as any)
      .upsert(
        {
          phone: owner_phone,
          first_name: (owner_name || "").split(" ")[0] || "Unknown",
          last_name: (owner_name || "").split(" ").slice(1).join(" ") || "",
          email: intakeLead.owner_email || null,
          contact_type: "owner",
          source: sourceCategory,
        },
        {
          onConflict: "phone",
        }
      )
      .select()
      .single();

    if (contactError || !contact) {
      console.error("[Intake Claim] Contact creation failed:", contactError);
      return NextResponse.json(
        { error: "Failed to create contact record" },
        { status: 500 }
      );
    }

    // Step 3: Create lead record with special intake markers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: leadError } = await (sb.from("leads") as any)
      .insert({
        property_id: property.id,
        contact_id: contact.id,
        status: "prospect",
        assigned_to: assign_to || null,
        source: "special_intake",
        source_category: sourceCategory,
        from_special_intake: true,
        intake_lead_id: intake_lead_id,
        next_action: "review",
        next_action_due_at: new Date().toISOString(),
        notes: notes ? `[Claimed] ${notes}` : "[Claimed from intake queue]",
        tags: ["special_intake", sourceCategory.toLowerCase().replace(/\s+/g, "_")],
      })
      .select()
      .single();

    if (leadError || !lead) {
      console.error("[Intake Claim] Lead creation failed:", leadError);
      return NextResponse.json(
        { error: "Failed to create lead record" },
        { status: 500 }
      );
    }

    // Step 4: Update intake_lead status to claimed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (sb.from("intake_leads") as any)
      .update({
        status: "claimed",
        claimed_by: user.id,
        claimed_at: new Date().toISOString(),
        source_category: sourceCategory, // Override with user-selected provider
      })
      .eq("id", intake_lead_id);

    if (updateError) {
      console.error("[Intake Claim] Status update failed:", updateError);
      // Don't fail here - the lead was created successfully
    }

    // Step 5: Log the claim event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("dialer_events") as any)
      .insert({
        event_type: "special_intake.claimed",
        lead_id: lead.id,
        session_id: null,
        user_id: user.id,
        metadata: {
          intake_lead_id,
          provider_id,
          source_category: sourceCategory,
          claimed_by: user.id,
        },
      })
      .catch(() => {}); // Fire and forget

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      source_category: sourceCategory,
      intake_lead_id,
    });
  } catch (error) {
    console.error("[Intake Claim] Failed:", error);
    return NextResponse.json(
      { error: "Failed to claim intake lead" },
      { status: 500 }
    );
  }
}
