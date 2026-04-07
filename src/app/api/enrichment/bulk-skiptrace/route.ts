/**
 * POST /api/enrichment/bulk-skiptrace
 *
 * Triggers a bulk skip-trace run via Inngest.
 * Accepts optional leadIds array — if omitted, runs all leads.
 * Supports dryRun mode to preview what would be traced.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { inngest } from "@/inngest/client";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await getAuthenticatedUser(req, sb);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { leadIds, force, dryRun, limit } = body as {
    leadIds?: string[];
    force?: boolean;
    dryRun?: boolean;
    limit?: number;
  };

  const runId = randomUUID().slice(0, 8);

  await inngest.send({
    name: "intel/bulk-skiptrace.requested",
    data: {
      runId,
      leadIds: leadIds ?? undefined,
      force: force ?? false,
      dryRun: dryRun ?? false,
      limit: limit ?? undefined,
      initiatedBy: user.id,
    },
  });

  return NextResponse.json({
    ok: true,
    runId,
    message: dryRun
      ? `Dry run queued (${runId}). Check Inngest dashboard for results.`
      : `Bulk skip-trace queued (${runId}). ${leadIds ? leadIds.length + " leads" : "all leads"}. Check Inngest dashboard for progress.`,
  });
}
