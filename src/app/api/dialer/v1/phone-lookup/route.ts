/**
 * GET /api/dialer/v1/phone-lookup?phone={number}
 *
 * Looks up a phone number against leads and unlinked call sessions.
 * Used by the dialer workspace to auto-populate context when a call connects.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone || phone.replace(/\D/g, "").length < 7) {
    return NextResponse.json({ error: "phone parameter required (7+ digits)" }, { status: 400 });
  }

  const digits = normalizePhone(phone);
  const sb = createDialerClient();

  // Search leads by owner_phone (last 10 digits match)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads } = await (sb.from("leads") as any)
    .select("id, owner_name, status, properties!inner(address, owner_phone)")
    .or(`owner_phone.ilike.%${digits}`, { referencedTable: "properties" })
    .limit(5);

  // Search unlinked sessions by phone_dialed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessions } = await (sb.from("call_sessions") as any)
    .select("id, phone_dialed, started_at, status, duration_sec, ai_summary")
    .is("lead_id", null)
    .ilike("phone_dialed", `%${digits}`)
    .order("started_at", { ascending: false })
    .limit(3);

  return NextResponse.json({
    leads: (leads ?? []).map((l: Record<string, unknown>) => ({
      id: l.id,
      ownerName: l.owner_name,
      status: l.status,
      address: (l.properties as Record<string, unknown>)?.address ?? null,
      phone: (l.properties as Record<string, unknown>)?.owner_phone ?? null,
    })),
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
