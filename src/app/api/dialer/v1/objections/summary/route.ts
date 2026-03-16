/**
 * GET /api/dialer/v1/objections/summary
 *
 * Returns aggregated objection tag counts for the review surface.
 *
 * Query params:
 *   days=N   lookback window in days (default: 30, max: 90)
 *
 * Response:
 *   {
 *     period_days:  number,
 *     total_tagged: number,     // distinct leads with any objection tag in window
 *     by_tag: Array<{
 *       tag:          string,
 *       label:        string,
 *       total:        number,   // all instances (open + resolved) in window
 *       open:         number,   // currently unresolved
 *       resolved:     number,
 *     }>,
 *     recent: Array<ObjectionTagRow>,  // last 10 tags for review surface
 *   }
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { OBJECTION_TAG_LABELS, type ObjectionTag } from "@/lib/dialer/types";
import type { ObjectionTagRow } from "@/app/api/dialer/v1/leads/[lead_id]/objections/route";

export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url  = new URL(req.url);
  const days = Math.min(90, parseInt(url.searchParams.get("days") ?? "30", 10) || 30);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const sb    = createDialerClient();

  // Fetch all tags in the window
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (sb.from("lead_objection_tags") as any)
    .select("id, lead_id, call_log_id, tag, note, status, tagged_by, created_at, resolved_by, resolved_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[objections/summary] query failed:", error.message);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const allRows = (rows as ObjectionTagRow[]) ?? [];

  // Aggregate by tag
  const byTagMap: Record<string, { total: number; open: number; resolved: number }> = {};
  const uniqueLeads = new Set<string>();

  for (const row of allRows) {
    uniqueLeads.add(row.lead_id);
    if (!byTagMap[row.tag]) {
      byTagMap[row.tag] = { total: 0, open: 0, resolved: 0 };
    }
    byTagMap[row.tag].total++;
    if (row.status === "open")     byTagMap[row.tag].open++;
    if (row.status === "resolved") byTagMap[row.tag].resolved++;
  }

  const byTag = Object.entries(byTagMap)
    .map(([tag, counts]) => ({
      tag,
      label: OBJECTION_TAG_LABELS[tag as ObjectionTag] ?? tag,
      ...counts,
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    period_days:  days,
    total_tagged: uniqueLeads.size,
    by_tag:       byTag,
    recent:       allRows.slice(0, 10),
  });
}
