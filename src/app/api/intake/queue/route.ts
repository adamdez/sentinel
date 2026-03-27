import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

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
    const sb = createServerClient();

    // Verify user is authenticated
    const authHeader = req.headers.get("authorization")?.replace("Bearer ", "");
    const { data: { user } } = await sb.auth.getUser(authHeader);
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
