export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import { runSkipTraceForQueuedLeads } from "@/lib/dial-queue";

export async function POST(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = createDialerClient();

  try {
    const summary = await runSkipTraceForQueuedLeads({ sb, userId: user.id });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb.from("dialer_events") as any)
      .insert({
        event_type: "queue.skip_trace",
        user_id: user.id,
        metadata: summary,
      })
      .then(({ error: eventError }: { error: { message?: string | null } | null }) => {
        if (eventError) {
          console.error("[dial-queue] skip trace event log failed:", eventError.message ?? eventError);
        }
      })
      .catch((eventError: unknown) => {
        console.error("[dial-queue] skip trace event log failed:", eventError);
      });

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("[dial-queue] bulk skip trace failed:", error);
    return NextResponse.json({ error: "Failed to skip trace queued leads" }, { status: 500 });
  }
}
