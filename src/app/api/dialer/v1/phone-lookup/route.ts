/**
 * GET /api/dialer/v1/phone-lookup?phone={number}
 *
 * Looks up a phone number against all phone-bearing tables in Sentinel.
 * Used by the dialer workspace to auto-populate context when a call connects.
 *
 * Now backed by the unified phone lookup function — single source of truth.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { unifiedPhoneLookup } from "@/lib/dialer/phone-lookup";

export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone || phone.replace(/\D/g, "").length < 7) {
    return NextResponse.json({ error: "phone parameter required (7+ digits)" }, { status: 400 });
  }

  const sb = createDialerClient();
  const result = await unifiedPhoneLookup(phone, sb);

  // Also fetch unlinked sessions for this number (original behavior)
  const digits = phone.replace(/\D/g, "").slice(-10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessions } = await (sb.from("call_sessions") as any)
    .select("id, phone_dialed, started_at, status, duration_sec, ai_summary")
    .is("lead_id", null)
    .ilike("phone_dialed", `%${digits}`)
    .order("started_at", { ascending: false })
    .limit(3);

  return NextResponse.json({
    // Unified lookup result
    match: {
      leadId: result.leadId,
      matchSource: result.matchSource,
      matchConfidence: result.matchConfidence,
      ownerName: result.ownerName,
      propertyAddress: result.propertyAddress,
      contactId: result.contactId,
      propertyId: result.propertyId,
      intakeLeadId: result.intakeLeadId,
      recentCallCount: result.recentCallCount,
      lastCallDate: result.lastCallDate,
    },
    // Legacy shape for backwards compatibility
    leads: result.leadId
      ? [{
          id: result.leadId,
          ownerName: result.ownerName,
          status: null,
          address: result.propertyAddress,
          phone,
        }]
      : [],
    unlinkedSessions: (sessions ?? []).map((s: Record<string, unknown>) => ({
      id: s.id,
      phoneDialed: s.phone_dialed,
      startedAt: s.started_at,
      status: s.status,
      durationSec: s.duration_sec,
      summary: s.ai_summary,
    })),
  });
}
