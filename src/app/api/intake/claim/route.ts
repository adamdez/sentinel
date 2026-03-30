import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

async function markIntakeLeadClaimed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  intakeLeadId: string,
  userId: string,
  sourceCategory: string | null,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {
    status: "claimed",
    claimed_by: userId,
    claimed_at: new Date().toISOString(),
  };

  if (sourceCategory) {
    update.source_category = sourceCategory;
  }

  return (sb.from("intake_leads") as any)
    .update(update)
    .eq("id", intakeLeadId);
}

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
    const user = await requireAuth(req, sb);
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

    // Recover gracefully if a prior claim already created the CRM lead but the
    // intake row stayed stale or the operator retried from an older tab.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLead } = await (sb.from("leads") as any)
      .select("id, source_category")
      .eq("intake_lead_id", intake_lead_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingLead?.id) {
      const recoveredSourceCategory =
        existingLead.source_category || intakeLead.source_category || null;

      const { error: syncError } = await markIntakeLeadClaimed(
        sb,
        intake_lead_id,
        user.id,
        recoveredSourceCategory,
      );
      if (syncError) {
        console.error("[Intake Claim] Existing lead sync failed:", syncError);
      }

      return NextResponse.json({
        success: true,
        lead_id: existingLead.id,
        source_category: recoveredSourceCategory,
        intake_lead_id,
        recovered_existing_lead: true,
      });
    }

    if (!["pending_review", "claimed"].includes(intakeLead.status)) {
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
    // Accept incomplete property data — address/city/state/zip are optional
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property, error: propertyError } = await (sb.from("properties") as any)
      .upsert(
        {
          apn: apn || "TBD",
          county: county || "Unknown",
          address: property_address || "Address TBD",
          city: property_city || "",
          state: property_state || "WA",
          zip: property_zip || "",
          owner_name: owner_name || intakeLead.owner_name || "Unknown",
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

    // Step 2: Create or update contact record (optional if phone provided)
    let contact = null;
    if (owner_phone) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nameParts = (owner_name || "Unknown").split(" ");
      const firstName = nameParts[0] || "Unknown";
      const lastName = nameParts.slice(1).join(" ") || "Contact";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: contactData, error: contactError } = await (sb.from("contacts") as any)
        .upsert(
          {
            phone: owner_phone,
            first_name: firstName,
            last_name: lastName,
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

      if (contactError) {
        console.error("[Intake Claim] Contact creation failed:", contactError);
        // Don't fail — contact is optional
      }
      contact = contactData;
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
      if ((leadError as { code?: string } | null)?.code === "23505") {
        // Another request won the race after our earlier existence check.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: racedLead } = await (sb.from("leads") as any)
          .select("id, source_category")
          .eq("intake_lead_id", intake_lead_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (racedLead?.id) {
          const recoveredSourceCategory =
            racedLead.source_category || intakeLead.source_category || sourceCategory;
          const { error: syncError } = await markIntakeLeadClaimed(
            sb,
            intake_lead_id,
            user.id,
            recoveredSourceCategory,
          );
          if (syncError) {
            console.error("[Intake Claim] Race recovery sync failed:", syncError);
          }

          return NextResponse.json({
            success: true,
            lead_id: racedLead.id,
            source_category: recoveredSourceCategory,
            intake_lead_id,
            recovered_existing_lead: true,
          });
        }
      }

      console.error("[Intake Claim] Lead creation failed:", leadError);
      return NextResponse.json(
        { error: "Failed to create lead record" },
        { status: 500 }
      );
    }

    // Step 4: Update intake_lead status to claimed
    const { error: updateError } = await markIntakeLeadClaimed(
      sb,
      intake_lead_id,
      user.id,
      sourceCategory,
    );

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
