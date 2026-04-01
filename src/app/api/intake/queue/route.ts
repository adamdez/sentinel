import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

async function getAuthenticatedUser(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(authHeader);

  return { sb, user };
}

/**
 * GET /api/intake/queue
 *
 * Returns paginated list of pending intake leads with filtering/sorting.
 *
 * Query parameters:
 * - status: pending_review | claimed | rejected | duplicate (default: pending_review)
 * - source_category: Filter by provider name (e.g., "Lead House")
 * - limit: Number of records per page (default: 50)
 * - offset: Pagination offset (default: 0)
 * - sort_by: received_at | owner_name | owner_phone (default: received_at DESC)
 * - from: ISO date string for date range start
 * - to: ISO date string for date range end
 *
 * Returns: { success: true, leads: [...], total: number, metrics: {...} }
 */
export async function GET(req: NextRequest) {
  try {
    const { sb, user } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse query parameters
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status") || "pending_review";
    const sourceCategory = searchParams.get("source_category");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const sortBy = searchParams.get("sort_by") || "received_at";
    const fromDate = searchParams.get("from");
    const toDate = searchParams.get("to");

    // Build the query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (sb.from("intake_leads") as any)
      .select("*", { count: "exact" })
      .eq("status", status)
      .order(sortBy.split(" ")[0], { ascending: sortBy.includes("ASC") });

    // Apply source_category filter if provided
    if (sourceCategory) {
      query = query.eq("source_category", sourceCategory);
    }

    // Apply date range filters
    if (fromDate) {
      query = query.gte("received_at", fromDate);
    }
    if (toDate) {
      query = query.lte("received_at", toDate);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    // Execute query
    const { data: leads, error, count } = await query;

    if (error) {
      console.error("[Intake Queue] Query error:", error);
      return NextResponse.json(
        { error: "Failed to fetch intake leads" },
        { status: 500 }
      );
    }

    // Calculate metrics
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: metricsData } = await (sb.from("intake_leads") as any)
      .select("status, created_at");

    const metrics = {
      total_pending: 0,
      claimed_today: 0,
      rejected_count: 0,
      duplicate_count: 0,
    };

    if (metricsData) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const record of metricsData) {
        if (record.status === "pending_review") metrics.total_pending++;
        if (record.status === "rejected") metrics.rejected_count++;
        if (record.status === "duplicate") metrics.duplicate_count++;
        if (
          record.status === "claimed" &&
          new Date(record.created_at) >= today
        ) {
          metrics.claimed_today++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      leads: leads || [],
      total: count || 0,
      metrics,
      pagination: {
        limit,
        offset,
        total: count || 0,
      },
    });
  } catch (error) {
    console.error("[Intake Queue] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to fetch intake queue" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/intake/queue
 *
 * Updates editable intake lead fields before claim.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { sb, user } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const intakeLeadId = typeof body?.intake_lead_id === "string" ? body.intake_lead_id : "";

    if (!intakeLeadId) {
      return NextResponse.json({ error: "Missing intake_lead_id" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLead, error: existingError } = await (sb.from("intake_leads") as any)
      .select("id, status")
      .eq("id", intakeLeadId)
      .single();

    if (existingError || !existingLead) {
      return NextResponse.json({ error: "Intake lead not found" }, { status: 404 });
    }

    if (existingLead.status === "claimed") {
      return NextResponse.json(
        { error: "Claimed intake leads can no longer be edited here" },
        { status: 409 },
      );
    }

    const updates = {
      owner_name: typeof body?.owner_name === "string" ? body.owner_name.trim() || null : undefined,
      owner_phone: typeof body?.owner_phone === "string" ? body.owner_phone.trim() || null : undefined,
      owner_email: typeof body?.owner_email === "string" ? body.owner_email.trim() || null : undefined,
      property_address: typeof body?.property_address === "string" ? body.property_address.trim() || null : undefined,
      property_city: typeof body?.property_city === "string" ? body.property_city.trim() || null : undefined,
      property_state: typeof body?.property_state === "string" ? body.property_state.trim().toUpperCase() || null : undefined,
      property_zip: typeof body?.property_zip === "string" ? body.property_zip.trim() || null : undefined,
      county: typeof body?.county === "string" ? body.county.trim() || null : undefined,
      apn: typeof body?.apn === "string" ? body.apn.trim() || null : undefined,
      review_notes: typeof body?.review_notes === "string" ? body.review_notes.trim() || null : undefined,
    };

    const sanitizedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(sanitizedUpdates).length === 0) {
      return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedLead, error: updateError } = await (sb.from("intake_leads") as any)
      .update(sanitizedUpdates)
      .eq("id", intakeLeadId)
      .select("*")
      .single();

    if (updateError || !updatedLead) {
      console.error("[Intake Queue] Failed to update intake lead:", updateError);
      return NextResponse.json({ error: "Failed to update intake lead" }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: user.id,
      action: "intake.updated",
      entity_type: "intake_lead",
      entity_id: intakeLeadId,
      details: { updated_fields: Object.keys(sanitizedUpdates) },
    }).catch(() => {});

    return NextResponse.json({ success: true, lead: updatedLead });
  } catch (error) {
    console.error("[Intake Queue] Failed to update intake lead:", error);
    return NextResponse.json({ error: "Failed to update intake lead" }, { status: 500 });
  }
}

/**
 * DELETE /api/intake/queue
 *
 * Permanently deletes an unclaimed intake lead from the queue.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { sb, user } = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const intakeLeadId = typeof body?.intake_lead_id === "string" ? body.intake_lead_id : "";

    if (!intakeLeadId) {
      return NextResponse.json({ error: "Missing intake_lead_id" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingLead, error: existingError } = await (sb.from("intake_leads") as any)
      .select("id, status")
      .eq("id", intakeLeadId)
      .single();

    if (existingError || !existingLead) {
      return NextResponse.json({ error: "Intake lead not found" }, { status: 404 });
    }

    if (existingLead.status === "claimed") {
      return NextResponse.json(
        { error: "Claimed intake leads cannot be deleted from intake queue" },
        { status: 409 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (sb.from("intake_leads") as any)
      .delete()
      .eq("id", intakeLeadId);

    if (deleteError) {
      console.error("[Intake Queue] Failed to delete intake lead:", deleteError);
      return NextResponse.json({ error: "Failed to delete intake lead" }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("event_log") as any).insert({
      user_id: user.id,
      action: "intake.deleted",
      entity_type: "intake_lead",
      entity_id: intakeLeadId,
      details: {},
    }).catch(() => {});

    return NextResponse.json({ success: true, intake_lead_id: intakeLeadId });
  } catch (error) {
    console.error("[Intake Queue] Failed to delete intake lead:", error);
    return NextResponse.json({ error: "Failed to delete intake lead" }, { status: 500 });
  }
}
