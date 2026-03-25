/**
 * POST /api/enrichment/bulk-bricked
 *
 * Triggers a bulk Bricked AI analysis run via Inngest.
 * Accepts optional leadIds array — if omitted, runs all leads without existing analysis.
 * Use force=true to re-analyze leads that already have Bricked data.
 *
 * Auth: Bearer token (founder-only) OR CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { inngest } from "@/inngest/client";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  // ── Auth: accept either user Bearer token or CRON_SECRET ──────────
  const authHeader = req.headers.get("authorization");
  let initiatedBy = "cron";

  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    // CRON_SECRET auth — allowed
  } else {
    // Try user auth
    const sb = createServerClient();
    const user = await requireAuth(req, sb);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const founderIds = (process.env.FOUNDER_USER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!founderIds.includes(user.id)) {
      return NextResponse.json({ error: "Forbidden — founder only" }, { status: 403 });
    }
    initiatedBy = user.id;
  }

  const body = await req.json().catch(() => ({}));
  const { leadIds, force, limit } = body as {
    leadIds?: string[];
    force?: boolean;
    limit?: number;
  };

  const runId = randomUUID().slice(0, 8);

  await inngest.send({
    name: "intel/bulk-bricked.requested",
    data: {
      runId,
      leadIds: leadIds ?? undefined,
      force: force ?? false,
      limit: limit ?? undefined,
      initiatedBy,
    },
  });

  return NextResponse.json({
    ok: true,
    runId,
    message: `Bulk Bricked analysis queued (${runId}). ${leadIds ? leadIds.length + " leads" : "all leads without existing analysis"}. Check Inngest dashboard for progress.`,
  });
}
