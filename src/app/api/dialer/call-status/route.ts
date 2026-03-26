import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTwilioCredentials, isTwilioError } from "@/lib/twilio";

/**
 * GET /api/dialer/call-status?callLogId=<id>&callSid=<twilio_sid>
 *
 * Returns the real-time status of a call by checking both:
 *   1. Our calls_log record (updated by status callbacks)
 *   2. Twilio's REST API for the actual call status (if we have a SID)
 *
 * This lets the frontend know if the call actually connected,
 * is ringing, failed, etc. — rather than just assuming success.
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let callLogId = req.nextUrl.searchParams.get("callLogId");
  const callSid = req.nextUrl.searchParams.get("callSid");
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  const result: {
    dbStatus?: string;
    twilioStatus?: string;
    twilioError?: string;
    duration?: number;
    endedAt?: string;
    callLogId?: string;
  } = {};

  // 0. If only sessionId provided, look up the callLogId from it
  if (!callLogId && sessionId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: logRow } = await (sb.from("calls_log") as any)
      .select("id, disposition, duration_sec, ended_at, twilio_sid")
      .eq("dialer_session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (logRow) {
      callLogId = logRow.id;
      result.callLogId = logRow.id;
      result.dbStatus = logRow.disposition;
      result.duration = logRow.duration_sec;
      result.endedAt = logRow.ended_at;

      // Also fetch Twilio status if we have a SID
      if (logRow.twilio_sid && !callSid) {
        const creds = getTwilioCredentials();
        if (!isTwilioError(creds)) {
          try {
            const res = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Calls/${logRow.twilio_sid}.json`,
              { headers: { Authorization: creds.authHeader } },
            );
            if (res.ok) {
              const data = await res.json();
              result.twilioStatus = data.status;
            }
          } catch { /* non-blocking */ }
        }
      }
    }
  }

  // 1. Check our database
  if (callLogId && !result.dbStatus) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: callLog } = await (sb.from("calls_log") as any)
      .select("disposition, duration_sec, ended_at, twilio_sid")
      .eq("id", callLogId)
      .single();

    if (callLog) {
      result.dbStatus = callLog.disposition;
      result.duration = callLog.duration_sec;
      result.endedAt = callLog.ended_at;

      // Use the SID from the DB if not provided in query
      if (!callSid && callLog.twilio_sid) {
        const sid = callLog.twilio_sid;
        // Fetch from Twilio
        const creds = getTwilioCredentials();
        if (!isTwilioError(creds)) {
          try {
            const res = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Calls/${sid}.json`,
              { headers: { Authorization: creds.authHeader } },
            );
            if (res.ok) {
              const data = await res.json();
              result.twilioStatus = data.status;
            }
          } catch {
            // Non-blocking — the DB status is usually enough
          }
        }
      }
    }
  }

  // 2. Check Twilio directly if we have a SID
  if (callSid) {
    const creds = getTwilioCredentials();
    if (!isTwilioError(creds)) {
      try {
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Calls/${callSid}.json`,
          { headers: { Authorization: creds.authHeader } },
        );
        if (res.ok) {
          const data = await res.json();
          result.twilioStatus = data.status;
          // If Twilio shows failed but DB doesn't, there's a problem
          if (data.status === "failed" || data.status === "canceled" || data.status === "busy" || data.status === "no-answer") {
            result.twilioError = `Call ${data.status}: ${data.error_message ?? "no details"}`;
          }
        }
      } catch {
        // Non-blocking
      }
    }
  }

  return NextResponse.json(result);
}
