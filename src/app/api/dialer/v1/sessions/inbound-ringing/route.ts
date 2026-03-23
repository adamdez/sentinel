/**
 * GET /api/dialer/v1/sessions/inbound-ringing
 *
 * Returns the most recent "ringing" call session regardless of user.
 * Used by the browser dialer to find the session created by the inbound
 * webhook — which may belong to a different user than the one answering.
 *
 * Only returns sessions created in the last 2 minutes to avoid stale matches.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createDialerClient();
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("call_sessions") as any)
    .select("id, lead_id, phone_dialed, status, twilio_sid, started_at")
    .eq("status", "ringing")
    .gte("created_at", twoMinAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[inbound-ringing] Query failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session: data ?? null });
}
