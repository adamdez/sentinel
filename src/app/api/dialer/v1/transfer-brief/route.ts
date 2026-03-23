/**
 * GET /api/dialer/v1/transfer-brief?phone=+15095907091
 *
 * When an inbound call arrives (possibly a warm transfer from Jeff),
 * the browser overlay fetches this endpoint to check for a recent
 * transfer brief. Returns Jeff's structured notes so Logan can
 * read them before answering.
 *
 * Looks for voice_sessions with:
 * - status = "transferred"
 * - from_number matches the caller's phone
 * - created in the last 2 minutes (active transfer window)
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) {
    return NextResponse.json({ error: "phone parameter required" }, { status: 400 });
  }

  // Normalize phone — strip everything except digits, ensure + prefix
  const digits = phone.replace(/\D/g, "");
  const phoneFmt = digits.startsWith("1") && digits.length === 11
    ? `+${digits}`
    : digits.length === 10
      ? `+1${digits}`
      : `+${digits}`;

  const sb = createDialerClient();
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  // Find the most recent transferred voice session from this caller
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session, error } = await (sb.from("voice_sessions") as any)
    .select("id, from_number, lead_id, transfer_reason, transfer_brief, caller_type, extracted_facts, summary, created_at")
    .eq("status", "transferred")
    .eq("from_number", phoneFmt)
    .gte("created_at", twoMinAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[transfer-brief] Query error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!session) {
    // No recent transfer — this is a regular inbound call, not a Jeff transfer
    return NextResponse.json({ brief: null });
  }

  // Extract discovery map slots from extracted_facts if available
  const facts = session.extracted_facts ?? [];
  const discoverySlots: Record<string, string> = {};
  if (Array.isArray(facts)) {
    for (const fact of facts) {
      if (fact?.slot && fact?.value) {
        discoverySlots[fact.slot] = fact.value;
      }
    }
  }

  return NextResponse.json({
    brief: {
      voiceSessionId: session.id,
      fromNumber: session.from_number,
      leadId: session.lead_id,
      transferReason: session.transfer_reason,
      callerType: session.caller_type,
      transferBrief: session.transfer_brief,
      summary: session.summary,
      discoverySlots,
      createdAt: session.created_at,
    },
  });
}
