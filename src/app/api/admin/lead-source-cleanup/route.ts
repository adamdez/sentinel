import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-access";
import {
  collectLeadSourceCleanupSnapshot,
  executeLeadSourceCleanup,
  type LeadSourceCleanupFilter,
} from "@/lib/lead-source-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_FILTER: LeadSourceCleanupFilter = {
  statuses: ["staging", "prospect"],
  sources: ["craigslist", "EliteSeed_Top10_20260301"],
};

function normalizeFilter(body: Record<string, unknown>): LeadSourceCleanupFilter {
  const statuses = Array.isArray(body.statuses)
    ? body.statuses.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : DEFAULT_FILTER.statuses;
  const sources = Array.isArray(body.sources)
    ? body.sources.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : DEFAULT_FILTER.sources;

  return {
    statuses: statuses.length > 0 ? statuses : DEFAULT_FILTER.statuses,
    sources: sources.length > 0 ? sources : DEFAULT_FILTER.sources,
  };
}

export async function POST(req: NextRequest) {
  const access = await requireAdminAccess(req);
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized - admin only" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "execute" ? "execute" : "dry_run";
  const filter = normalizeFilter(body as Record<string, unknown>);

  if (mode === "dry_run") {
    const snapshot = await collectLeadSourceCleanupSnapshot(access.sb, filter);
    return NextResponse.json({
      ok: true,
      mode,
      filter,
      summary: snapshot.summary,
    });
  }

  const result = await executeLeadSourceCleanup(access.sb, filter, access.user?.id ?? null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (access.sb.from("event_log") as any).insert({
    user_id: access.user?.id ?? "00000000-0000-0000-0000-000000000000",
    action: "admin.lead_source_cleanup.execute",
    entity_type: "lead_cleanup",
    entity_id: result.snapshotId,
    details: {
      filter,
      summary: result.summary,
      deletedLeadIds: result.deletedLeadIds,
      skippedLeadIds: result.skippedLeadIds,
      deletedProperties: result.deletedProperties,
      executed_via: access.via,
    },
  });

  return NextResponse.json({
    ok: true,
    mode,
    cleanupRunId: result.snapshotId,
    filter,
    summary: result.summary,
    deletedLeadIds: result.deletedLeadIds,
    skippedLeadIds: result.skippedLeadIds,
    deletedProperties: result.deletedProperties,
  });
}
