import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * POST /api/twilio/voice/status
 *
 * Handles TWO types of Twilio callbacks:
 *
 * 1. type=call_status — StatusCallback for the initial call TO the agent.
 *    Form fields: CallSid, CallStatus, CallDuration, etc.
 *    Statuses: queued → initiated → ringing → in-progress → completed
 *    Also: busy, no-answer, canceled, failed
 *
 * 2. type=dial_complete — <Dial> action callback after the PROSPECT leg ends.
 *    Form fields: DialCallSid, DialCallStatus, DialCallDuration, etc.
 *    Statuses: completed, busy, no-answer, canceled, failed
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const callLogId = url.searchParams.get("callLogId");
  const type = url.searchParams.get("type");
  const sessionId = url.searchParams.get("sessionId"); // PR2: dialer session to sync

  const formData = await req.formData();
  const sb = createServerClient();

  // ── Type 1: Agent-leg status callbacks (from StatusCallbackEvent) ──
  if (type === "call_status") {
    const callStatus = formData.get("CallStatus")?.toString() ?? "";
    const callSid = formData.get("CallSid")?.toString() ?? "";

    console.log("[Twilio Status] Agent leg:", {
      callLogId: callLogId?.slice(0, 8),
      callStatus,
      callSid: callSid.slice(0, 10),
    });

    if (callLogId) {
      // Map Twilio CallStatus to our disposition
      let disposition: string | null = null;
      const updatePayload: Record<string, unknown> = {};

      switch (callStatus) {
        case "initiated":
          disposition = "initiated";
          break;
        case "ringing":
          disposition = "ringing_agent";
          break;
        case "in-progress":
          disposition = "agent_connected";
          break;
        case "completed":
          // Agent hung up or call ended — only update if not already dispositioned
          updatePayload.ended_at = new Date().toISOString();
          updatePayload.duration_sec = parseInt(formData.get("CallDuration")?.toString() ?? "0") || 0;
          break;
        case "busy":
          disposition = "agent_busy";
          updatePayload.ended_at = new Date().toISOString();
          break;
        case "no-answer":
          disposition = "agent_no_answer";
          updatePayload.ended_at = new Date().toISOString();
          break;
        case "canceled":
          disposition = "canceled";
          updatePayload.ended_at = new Date().toISOString();
          break;
        case "failed":
          disposition = "failed";
          updatePayload.ended_at = new Date().toISOString();
          break;
      }

      if (disposition) {
        updatePayload.disposition = disposition;
      }

      if (Object.keys(updatePayload).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("calls_log") as any)
          .update(updatePayload)
          .eq("id", callLogId);
      }
    }

    // Log to event_log for debugging
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sb.from("event_log") as any).insert({
      user_id: SYSTEM_USER_ID,
      action: `twilio.call_status.${callStatus}`,
      entity_type: "call",
      entity_id: callLogId ?? "unknown",
      details: {
        call_sid: callSid,
        call_status: callStatus,
        duration: formData.get("CallDuration")?.toString() ?? "0",
      },
    });

    // PR2: sync dialer session state (fire-and-forget, non-blocking)
    if (sessionId) {
      const dialerSyncBase = process.env.NEXT_PUBLIC_SITE_URL
        ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
      if (dialerSyncBase) {
        fetch(`${dialerSyncBase}/api/dialer/v1/twilio/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal": "1" },
          body: JSON.stringify({
            sessionId,
            type: "call_status",
            callStatus,
            callDuration: formData.get("CallDuration")?.toString(),
          }),
        }).catch((err: unknown) => {
          console.error("[Twilio Status] Dialer session sync failed (non-fatal):", err);
        });
      }
    }

    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { "Content-Type": "text/xml" } },
    );
  }

  // ── Type 2: Dial action callback (prospect leg completed) ──────────
  if (type === "dial_complete") {
    const dialStatus = formData.get("DialCallStatus")?.toString() ?? "";
    const callDuration = formData.get("DialCallDuration")?.toString() ?? "0";

    console.log("[Twilio Status] Prospect leg:", {
      callLogId: callLogId?.slice(0, 8),
      dialStatus,
      duration: callDuration,
    });

    // Only overwrite disposition if the agent hasn't already set a final
    // one from the UI (e.g. "voicemail", "interested", "appointment").
    const MACHINE_DISPOSITIONS = new Set([
      "initiating", "initiated", "ringing_agent", "agent_connected",
      "in_progress", "ringing",
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let currentDispo: string | null = null;
    if (callLogId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: row } = await (sb.from("calls_log") as any)
        .select("disposition")
        .eq("id", callLogId)
        .single();
      currentDispo = row?.disposition ?? null;
    }
    const agentAlreadySet = currentDispo !== null && !MACHINE_DISPOSITIONS.has(currentDispo);

    if (dialStatus !== "completed") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("event_log") as any).insert({
        user_id: SYSTEM_USER_ID,
        action: "twilio.prospect_no_answer",
        entity_type: "call",
        entity_id: callLogId ?? "unknown",
        details: { dial_status: dialStatus, duration: callDuration },
      });

      if (callLogId && !agentAlreadySet) {
        const dispo = dialStatus === "busy" ? "busy" : "no_answer";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb.from("calls_log") as any)
          .update({ disposition: dispo })
          .eq("id", callLogId);
      }

      const twiml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<Response>",
        `  <Say voice="Polly.Joanna">The prospect did not answer. Status: ${dialStatus || "unknown"}. Goodbye.</Say>`,
        "</Response>",
      ].join("\n");

      return new NextResponse(twiml, {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Prospect answered and the call completed normally
    if (callLogId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatePayload: Record<string, unknown> = {
        transfer_completed: true,
        duration_sec: parseInt(callDuration) || 0,
      };
      if (!agentAlreadySet) {
        updatePayload.disposition = "completed";
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("calls_log") as any)
        .update(updatePayload)
        .eq("id", callLogId);
    }

    // PR2: sync dialer session state (fire-and-forget, non-blocking)
    if (sessionId) {
      const dialerSyncBase = process.env.NEXT_PUBLIC_SITE_URL
        ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
      if (dialerSyncBase) {
        fetch(`${dialerSyncBase}/api/dialer/v1/twilio/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal": "1" },
          body: JSON.stringify({
            sessionId,
            type: "dial_complete",
            callStatus: dialStatus,
            callDuration,
          }),
        }).catch((err: unknown) => {
          console.error("[Twilio Status] Dialer dial_complete sync failed (non-fatal):", err);
        });
      }
    }

    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { "Content-Type": "text/xml" } },
    );
  }

  // ── Fallback: unknown type ─────────────────────────────────────────
  console.warn("[Twilio Status] Unknown callback type:", type, Object.fromEntries(formData));
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { "Content-Type": "text/xml" } },
  );
}

// Support GET as fallback
export async function GET(req: NextRequest) {
  return POST(req);
}
