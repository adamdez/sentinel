export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getDialerUser } from "@/lib/dialer/db";
import { processAutoCycleOutcome } from "@/lib/dialer/auto-cycle-outcome";
import type { PublishDisposition } from "@/lib/dialer/types";

export async function POST(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { leadId?: string; disposition?: PublishDisposition; phoneNumber?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.leadId || !body.disposition) {
    return NextResponse.json({ error: "leadId and disposition are required" }, { status: 400 });
  }

  try {
    const result = await processAutoCycleOutcome({
      leadId: body.leadId,
      disposition: body.disposition,
      phoneNumber: body.phoneNumber,
      source: "operator",
      userId: user.id,
    });

    return NextResponse.json({
      ok: result.ok,
      lead_id: body.leadId,
      disposition: body.disposition,
      skipped: result.skipped,
      reason: result.reason,
      cycle_status: result.cycleStatus,
      next_due_at: result.nextDueAt,
      next_phone_id: result.nextPhoneId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auto-cycle outcome] processing failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
