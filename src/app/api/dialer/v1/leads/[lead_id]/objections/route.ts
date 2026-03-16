/**
 * GET /api/dialer/v1/leads/[lead_id]/objections
 *
 * Returns open (and optionally all) objection tags for a lead,
 * ordered by most recent first.
 *
 * Query params:
 *   status=open|resolved|all   default: open
 *   limit=N                     default: 20, max: 50
 *
 * Response:
 *   { objections: ObjectionTagRow[] }
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

type RouteContext = { params: Promise<{ lead_id: string }> };

export interface ObjectionTagRow {
  id:          string;
  lead_id:     string;
  call_log_id: string | null;
  tag:         string;
  note:        string | null;
  status:      "open" | "resolved";
  tagged_by:   string;
  created_at:  string;
  resolved_by: string | null;
  resolved_at: string | null;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lead_id } = await params;
  const url    = new URL(req.url);
  const status = url.searchParams.get("status") ?? "open";
  const limit  = Math.min(50, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20);

  const sb = createDialerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (sb.from("lead_objection_tags") as any)
    .select("id, lead_id, call_log_id, tag, note, status, tagged_by, created_at, resolved_by, resolved_at")
    .eq("lead_id", lead_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status === "open" || status === "resolved") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[objections/lead] query failed:", error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  return NextResponse.json({ objections: (data as ObjectionTagRow[]) ?? [] });
}
