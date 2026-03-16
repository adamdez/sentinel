/**
 * GET /api/leads/[id]/contradiction-flags
 *
 * Returns all contradiction flags for a lead, ordered by severity then date.
 *
 * Query params:
 *   status — filter by status: "unreviewed" | "real" | "false_positive" | "resolved" | "all" (default "all")
 *
 * BOUNDARY: reads lead_contradiction_flags only.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

type RouteContext = { params: Promise<{ id: string }> };

export interface ContradictionFlagRow {
  id:           string;
  check_type:   string;
  severity:     string;
  description:  string;
  evidence_a:   { source: string; label: string; value: string } | null;
  evidence_b:   { source: string; label: string; value: string } | null;
  fact_id:      string | null;
  artifact_id:  string | null;
  status:       string;
  review_note:  string | null;
  reviewed_by:  string | null;
  reviewed_at:  string | null;
  created_at:   string;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const sb = createServerClient();
  const { data: { user } } = await sb.auth.getUser(
    req.headers.get("authorization")?.replace("Bearer ", "") ?? ""
  );
  if (!user) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: leadId } = await params;
  const statusFilter = req.nextUrl.searchParams.get("status") ?? "all";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as any;
  let query = sbAny
    .from("lead_contradiction_flags")
    .select("id, check_type, severity, description, evidence_a, evidence_b, fact_id, artifact_id, status, review_note, reviewed_by, reviewed_at, created_at")
    .eq("lead_id", leadId);

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  // Sort: flag severity first, then warn, then by date
  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sort in-app: flag > warn, then unreviewed first
  const severityOrder = (s: string) => s === "flag" ? 0 : 1;
  const statusOrder   = (s: string) => s === "unreviewed" ? 0 : 1;

  const sorted = (data ?? []).sort((a: ContradictionFlagRow, b: ContradictionFlagRow) => {
    const sevDiff = severityOrder(a.severity) - severityOrder(b.severity);
    if (sevDiff !== 0) return sevDiff;
    const stDiff = statusOrder(a.status) - statusOrder(b.status);
    if (stDiff !== 0) return stDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return NextResponse.json({ flags: sorted });
}
