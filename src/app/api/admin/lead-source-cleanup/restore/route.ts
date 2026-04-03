import { NextRequest, NextResponse } from "next/server";

import { requireAdminAccess } from "@/lib/admin-access";
import { restoreLeadSourceCleanup } from "@/lib/lead-source-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const access = await requireAdminAccess(req);
  if (!access.ok) {
    return NextResponse.json({ error: "Unauthorized - admin only" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const cleanupRunId = typeof body.cleanupRunId === "string" && body.cleanupRunId.trim().length > 0
    ? body.cleanupRunId.trim()
    : "";

  if (!cleanupRunId) {
    return NextResponse.json({ error: "cleanupRunId is required" }, { status: 400 });
  }

  const result = await restoreLeadSourceCleanup(access.sb, cleanupRunId, access.user?.id ?? null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (access.sb.from("event_log") as any).insert({
    user_id: access.user?.id ?? "00000000-0000-0000-0000-000000000000",
    action: "admin.lead_source_cleanup.restore",
    entity_type: "lead_cleanup",
    entity_id: cleanupRunId,
    details: {
      ...result,
      restored_via: access.via,
    },
  });

  return NextResponse.json({
    ok: true,
    ...result,
  });
}
