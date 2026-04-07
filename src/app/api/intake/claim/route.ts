import { NextRequest, NextResponse } from "next/server";
import { resolveMarketCity } from "@/lib/inbound-intake";
import { createServerClient } from "@/lib/supabase";
import { runClaimEnrichment } from "@/lib/intake-claim-enrichment";

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

    // Validate required fields (only intake_lead_id and provider_id)
    // Accept incomplete data — operators can fill in missing info later
    if (!intake_lead_id || !provider_id) {
      return NextResponse.json(
        { error: "Missing required fields: intake_lead_id, provider_id" },
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
    const resolvedOwnerName = owner_name || intakeLead.owner_name || "Unknown";
    const resolvedPhoneDigits = String(owner_phone || intakeLead.owner_phone || "").replace(/\D/g, "").slice(-10);
    const resolvedOwnerPhone = resolvedPhoneDigits.length === 10 ? resolvedPhoneDigits : null;
    const resolvedOwnerEmail =
      typeof intakeLead.owner_email === "string" && intakeLead.owner_email.trim().length > 0
        ? intakeLead.owner_email.trim().toLowerCase()
        : null;
    const resolvedAddress = property_address || intakeLead.property_address || "Address TBD";
    const resolvedState = property_state || intakeLead.property_state || "WA";
    const resolvedZip = property_zip || intakeLead.property_zip || "";
    const resolvedCounty = county || intakeLead.county || "Unknown";
    const resolvedCity = resolveMarketCity(
      property_city || intakeLead.property_city || null,
      resolvedZip,
    ).city;

    // Step 1: Create or update property record (upsert via APN + county)
    // Accept incomplete property data — address/city/state/zip are optional
    // Generate a unique APN when missing to prevent collisions between
    // different intake leads that both lack an APN in the same county.
    const safeApn = apn || `INTAKE-${intake_lead_id.slice(0, 12)}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property, error: propertyError } = await (sb.from("properties") as any)
      .upsert(
        {
          apn: safeApn,
          county: resolvedCounty,
          address: resolvedAddress,
          city: resolvedCity || "",
          state: resolvedState,
          zip: resolvedZip,
          owner_name: resolvedOwnerName,
          owner_phone: resolvedOwnerPhone,
          owner_email: resolvedOwnerEmail,
          owner_flags: {},
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

    // Step 2: Create or find contact record (optional if phone provided)
    let contact = null;
    if (resolvedOwnerPhone) {
      const nameParts = resolvedOwnerName.split(" ");
      const firstName = nameParts[0] || "Unknown";
      const lastName = nameParts.slice(1).join(" ") || "Contact";
      const contactEmail = resolvedOwnerEmail;

      // First try to find existing contact by phone
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (sb.from("contacts") as any)
        .select("*")
        .eq("phone", resolvedOwnerPhone)
        .limit(1)
        .maybeSingle();

      if (existing) {
        contact = existing;
        // Backfill email if the existing contact doesn't have one
        if (!existing.email && contactEmail) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from("contacts") as any)
            .update({ email: contactEmail })
            .eq("id", existing.id);
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newContact, error: contactError } = await (sb.from("contacts") as any)
          .insert({
            phone: resolvedOwnerPhone,
            first_name: firstName,
            last_name: lastName,
            email: contactEmail,
            contact_type: "owner",
            source: sourceCategory,
          })
          .select()
          .single();

        if (contactError) {
          console.error("[Intake Claim] Contact creation failed:", contactError);
          // Don't fail — contact is optional
        }
        contact = newContact;
      }
    }

    // Step 3: Create lead record with special intake markers
    // Status = "lead" so it appears in the Lead Queue (not "prospect" which is invisible)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead, error: leadError } = await (sb.from("leads") as any)
      .insert({
        property_id: property.id,
        contact_id: contact?.id || null,
        status: "lead",
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

    if (resolvedOwnerPhone) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("lead_phones") as any)
          .insert({
            lead_id: lead.id,
            property_id: property.id,
            phone: `+1${resolvedOwnerPhone}`,
            label: "primary",
            source: `special_intake:${sourceCategory.toLowerCase().replace(/\s+/g, "_")}`,
            status: "active",
            is_primary: true,
            position: 0,
          });
      } catch (error) {
        console.error("[Intake Claim] lead_phones seed failed:", error);
      }
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

    try {
      await runClaimEnrichment({
        sb: sb as never,
        propertyId: property.id,
        leadId: lead.id,
      });
    } catch (error) {
      console.error("[Intake Claim] Claim enrichment failed:", error);
    }

    // Step 5: Log the claim event
    try {
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
        });
    } catch {
      // Non-fatal audit write.
    }

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
