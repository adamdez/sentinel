/**
 * POST /api/dialer/v1/twilio/status  — internal only
 *
 * Mirrors Twilio call status into the dialer session state machine.
 * Called fire-and-forget by /api/twilio/voice/status after it writes to calls_log.
 * Never called directly by Twilio — protected by x-internal header.
 *
 * BOUNDARY RULES:
 *   - Requires x-internal: "1" header — rejects all other callers
 *   - Calls updateSession() only — zero direct DB table access
 *   - Never reads or writes calls_log
 *   - Always returns 200 — the fire-and-forget caller must never be blocked
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient } from "@/lib/dialer/db";
import { updateSession } from "@/lib/dialer/session-manager";
import type { CallSessionStatus, UpdateSessionInput } from "@/lib/dialer/types";

const OK = NextResponse.json({ ok: true });

/**
 * Maps a Twilio callStatus string to a dialer CallSessionStatus.
 * Returns null to skip the transition (not an error — expected for queued, initiated, etc.).
 */
function mapTwilioStatus(
  type: string,
  callStatus: string,
): CallSessionStatus | null {
  if (type === "call_status") {
    // VoIP path: <Number> statusCallback fires for the prospect leg.
    // Cell-bridge: fires for the agent leg — "in-progress" means agent answered,
    // not that the prospect connected. We skip it here; dial_complete owns that.
    switch (callStatus) {
      case "ringing":     return "ringing";
      case "in-progress": return "connected";
      case "completed":   return "ended";
      case "no-answer":
      case "busy":
      case "failed":
      case "canceled":    return "failed";
      default:            return null; // "initiated", "queued" — no useful transition
    }
  }

  if (type === "dial_complete") {
    // Fires after the <Dial> action resolves (both VoIP and cell-bridge).
    // This is authoritative for the prospect-leg outcome.
    switch (callStatus) {
      case "completed":   return "ended";
      case "no-answer":
      case "busy":
      case "failed":
      case "canceled":    return "failed";
      default:            return null;
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-internal") !== "1") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    sessionId?: string;
    type?: string;
    callStatus?: string;
    callDuration?: string;
  };

  try {
    body = await req.json();
  } catch {
    console.error("[Dialer/v1/twilio-status] Malformed body — skipping");
    return OK;
  }

  const { sessionId, type, callStatus, callDuration } = body;

  if (!sessionId) {
    return NextResponse.json({ ok: true, skipped: "no sessionId" });
  }
  if (!type || !callStatus) {
    return NextResponse.json({ ok: true, skipped: "missing type or callStatus" });
  }

  const targetStatus = mapTwilioStatus(type, callStatus);
  if (!targetStatus) {
    return NextResponse.json({ ok: true, skipped: `unmapped: ${type}/${callStatus}` });
  }

  const update: UpdateSessionInput = { status: targetStatus };

  if (targetStatus === "ended" || targetStatus === "failed") {
    update.ended_at = new Date().toISOString();
  }
  if (targetStatus === "ended" && callDuration) {
    const secs = parseInt(callDuration, 10);
    if (!Number.isNaN(secs) && secs >= 0) {
      update.duration_sec = secs;
    }
  }

  const sb = createDialerClient();

  // Fetch the session owner so we can pass userId to updateSession().
  // This is a system-initiated update — no user token is available here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await (sb.from("call_sessions") as any)
    .select("user_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!row?.user_id) {
    // Session not found — log and swallow (race condition or test session)
    console.warn("[Dialer/v1/twilio-status] Session not found:", sessionId.slice(0, 8));
    return NextResponse.json({ ok: true, skipped: "session not found" });
  }

  const result = await updateSession(sb, sessionId, row.user_id as string, update);

  if (result.error) {
    // Invalid transitions are expected under race conditions:
    // e.g. agent already moved session to "ended" before the webhook fires.
    // Log at warn level only — this is not an application error.
    console.warn(
      "[Dialer/v1/twilio-status] updateSession skipped:",
      result.code,
      result.error,
      `session=${sessionId.slice(0, 8)} target=${targetStatus}`,
    );
  }

  return OK;
}
