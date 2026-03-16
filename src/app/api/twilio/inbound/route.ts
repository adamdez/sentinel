import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/twilio/inbound
 *
 * Twilio webhook for INBOUND calls to the Dominion phone number.
 * Configure this URL in Twilio as the "A call comes in" webhook for your
 * purchased number (Voice → Webhook → POST).
 *
 * Flow:
 *   1. Attempt to forward to Logan's personal cell (TWILIO_FORWARD_TO_CELL env var).
 *   2. If no forward number configured, play a brief message and hang up.
 *   3. The <Dial> action URL (status callback) fires when the leg completes.
 *      If dial result is no-answer / busy / failed → create missed-call task
 *      + write inbound.missed dialer_event.
 *
 * StatusCallback (POST /api/twilio/inbound?type=call_status):
 *   Fired by Twilio for the initial inbound leg — used to detect early hang-ups.
 *
 * NOTE: No voice agent, no IVR, no autonomous AI. Just ring-forward → missed signal.
 *
 * Environment variables used:
 *   TWILIO_FORWARD_TO_CELL  — Logan's cell number in E.164, e.g. +15093001234
 *   TWILIO_PHONE_NUMBER     — The Dominion Twilio number (caller ID on forwarded call)
 *   NEXT_PUBLIC_SITE_URL    — Base URL for callback action URLs
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSiteUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (env) return env;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

// Replicate nextBusinessMorningPacific locally to avoid importing publish-manager
function nextBusinessMorningPacific(): Date {
  const TZ = "America/Los_Angeles";
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? "0", 10);
  const year = get("year"); const month = get("month") - 1; const day = get("day");
  const pad = (n: number) => String(n).padStart(2, "0");
  const candidate = new Date(`${year}-${pad(month + 1)}-${pad(day)}T09:00:00-08:00`);
  let target = candidate <= now ? new Date(candidate.getTime() + 86_400_000) : candidate;
  const dow = target.getDay();
  if (dow === 0) target = new Date(target.getTime() + 86_400_000);
  if (dow === 6) target = new Date(target.getTime() + 2 * 86_400_000);
  return target;
}

// ── Inbound TwiML response ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const siteUrl = buildSiteUrl(req);

  // ── type=call_status: status callback for the inbound leg ────────────────
  if (type === "call_status") {
    const formData = await req.formData();
    const callStatus = formData.get("CallStatus")?.toString() ?? "";
    const fromNumber = formData.get("From")?.toString() ?? "";
    const callSid    = formData.get("CallSid")?.toString()  ?? "";
    const dialStatus = formData.get("DialCallStatus")?.toString() ?? "";
    // DialCallDuration is present when the Dial action fires after the leg ends
    const dialDuration = formData.get("DialCallDuration")?.toString() ?? null;

    // Determine if the operator answered (dial leg reached in-progress / completed with duration)
    // Twilio Dial action fires with DialCallStatus=completed when the forwarded call ends.
    // We treat a completed dial with any duration as "was answered".
    const wasAnswered =
      dialStatus === "in-progress" ||
      (dialStatus === "completed" && dialDuration !== null && parseInt(dialDuration) > 0);

    // Determine if this is a missed call:
    // - call_status=no-answer on the initial inbound leg means caller hung up before we answered
    // - dial_complete with dialStatus=no-answer|busy|failed means we tried to forward but failed
    const isMissed =
      callStatus === "no-answer" ||
      callStatus === "busy"      ||
      dialStatus === "no-answer" ||
      dialStatus === "busy"      ||
      dialStatus === "failed"    ||
      (dialStatus === "completed" && !wasAnswered);

    if (wasAnswered) {
      await handleAnsweredInbound({ fromNumber, callSid, dialDuration });
    } else if (isMissed) {
      await handleMissedInbound({ fromNumber, callSid, siteUrl });
    }

    return new NextResponse("", { status: 204 });
  }

  // ── Initial inbound webhook: return TwiML to ring-forward ─────────────────
  const forwardTo = process.env.TWILIO_FORWARD_TO_CELL ?? "";
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER ?? "";
  const actionUrl = `${siteUrl}/api/twilio/inbound?type=call_status`;

  let twiml: string;

  if (forwardTo) {
    twiml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      `  <Dial callerId="${twilioNumber}" timeout="20" action="${actionUrl}" method="POST">`,
      `    <Number>${forwardTo}</Number>`,
      "  </Dial>",
      // If Dial action fires (no-answer/timeout), play brief message and status callback handles the rest
      '  <Say voice="Polly.Joanna">We missed your call. We will call you back shortly.</Say>',
      "</Response>",
    ].join("\n");
  } else {
    // No forward number configured — play message, status callback still fires
    twiml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      '  <Say voice="Polly.Joanna">Thank you for calling Dominion Home Deals. We are unavailable right now but will call you back shortly.</Say>',
      "</Response>",
    ].join("\n");

    // Fire missed-call handling immediately since we're not attempting a forward
    try {
      const formData = await req.formData();
      const fromNumber = formData.get("From")?.toString() ?? "";
      const callSid    = formData.get("CallSid")?.toString()  ?? "";
      if (fromNumber) await handleMissedInbound({ fromNumber, callSid, siteUrl });
    } catch {
      // non-fatal
    }
  }

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

// ── handleMissedInbound ───────────────────────────────────────────────────────
// Core missed-call recovery logic.
// 1. Look up lead by phone number (best effort — won't always match).
// 2. Create a high-priority callback task on the matched lead (or unlinked if no match).
// 3. Write an inbound.missed dialer_event with full context.

async function handleMissedInbound({
  fromNumber,
  callSid,
  siteUrl: _siteUrl,
}: {
  fromNumber: string;
  callSid: string;
  siteUrl: string;
}) {
  const sb = createServerClient();
  const now = new Date();

  // ── 1. Attempt to match lead by phone ─────────────────────────────────────
  let leadId: string | null = null;
  let leadName = "Unknown caller";

  if (fromNumber) {
    // Normalize: strip spaces/dashes for comparison
    const normalized = fromNumber.replace(/\D/g, "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (sb.from("leads") as any)
      .select("id, first_name, last_name, phone")
      .or(
        `phone.eq.${fromNumber},phone.eq.+${normalized},phone.eq.${normalized}`
      )
      .limit(1);

    if (leads && leads.length > 0) {
      leadId = leads[0].id;
      leadName = [leads[0].first_name, leads[0].last_name].filter(Boolean).join(" ") || "Lead";
    }
  }

  // ── 2. Create urgent callback task ────────────────────────────────────────
  const dueAt = nextBusinessMorningPacific();
  // Missed inbounds get priority 3 (higher urgency than regular follow-up)
  const taskTitle = leadId
    ? `⚡ Missed inbound — call back ${leadName} (${fromNumber})`
    : `⚡ Missed inbound — unknown caller ${fromNumber}`;

  let taskId: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: taskRow, error: taskErr } = await (sb.from("tasks") as any)
    .insert({
      title: taskTitle,
      lead_id: leadId,
      due_at: dueAt.toISOString(),
      status: "pending",
      priority: 3,
      notes: `Inbound call missed at ${now.toISOString()}. Caller: ${fromNumber}. Twilio SID: ${callSid}.`,
    })
    .select("id")
    .single();

  if (taskErr) {
    console.error("[inbound] Task creation failed:", taskErr.message);
  } else {
    taskId = taskRow?.id ?? null;
  }

  // ── 3. Write inbound.missed dialer_event ──────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: eventErr } = await (sb.from("dialer_events") as any)
    .insert({
      event_type: "inbound.missed",
      lead_id: leadId,
      session_id: null,
      task_id: taskId,
      metadata: {
        from_number: fromNumber,
        call_sid: callSid,
        lead_matched: !!leadId,
        task_due_at: dueAt.toISOString(),
        missed_at: now.toISOString(),
      },
    });

  if (eventErr) {
    console.error("[inbound] dialer_events write failed:", eventErr.message);
  }

  console.log("[inbound] Missed inbound handled:", {
    fromNumber: fromNumber ? `***${fromNumber.slice(-4)}` : "none",
    leadId: leadId ? `${leadId.slice(0, 8)}…` : "no match",
    taskId: taskId ? `${taskId.slice(0, 8)}…` : "failed",
  });
}

// ── handleAnsweredInbound ─────────────────────────────────────────────────────
// Fired when the operator actually answered the forwarded call.
// 1. Look up lead by phone (best effort).
// 2. Write an inbound.answered dialer_event — this surfaces on the live page.

async function handleAnsweredInbound({
  fromNumber,
  callSid,
  dialDuration,
}: {
  fromNumber: string;
  callSid: string;
  dialDuration: string | null;
}) {
  const sb = createServerClient();
  const now = new Date();

  // Attempt to match lead by phone
  let leadId: string | null = null;
  if (fromNumber) {
    const normalized = fromNumber.replace(/\D/g, "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (sb.from("leads") as any)
      .select("id")
      .or(`phone.eq.${fromNumber},phone.eq.+${normalized},phone.eq.${normalized}`)
      .limit(1);
    if (leads && leads.length > 0) leadId = leads[0].id;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: eventErr } = await (sb.from("dialer_events") as any)
    .insert({
      event_type: "inbound.answered",
      lead_id: leadId,
      session_id: null,
      task_id: null,
      metadata: {
        from_number: fromNumber,
        call_sid: callSid,
        dial_duration_sec: dialDuration ? parseInt(dialDuration) : null,
        lead_matched: !!leadId,
        answered_at: now.toISOString(),
      },
    });

  if (eventErr) {
    console.error("[inbound] inbound.answered event write failed:", eventErr.message);
  }

  console.log("[inbound] Answered inbound recorded:", {
    fromNumber: fromNumber ? `***${fromNumber.slice(-4)}` : "none",
    leadId: leadId ? `${leadId.slice(0, 8)}…` : "no match",
    durationSec: dialDuration,
  });
}
