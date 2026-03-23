import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/twilio/inbound
 *
 * Twilio webhook for INBOUND calls to the Dominion phone number.
 *
 * Flow:
 *   1. Ring Logan's browser (Twilio Client) for 20 seconds.
 *   2. If no answer, ring Adam's browser for 20 seconds.
 *   3. If no answer, forward to Jeff (Vapi AI receptionist).
 *   4. Jeff either warm-transfers back to browser with notes, or takes a message.
 *
 * NO cell phones. All calls handled in-browser or by AI.
 *
 * Environment variables used:
 *   LOGAN_BROWSER_IDENTITY  — Logan's Twilio Client identity (email)
 *   ADAM_BROWSER_IDENTITY   — Adam's Twilio Client identity (email)
 *   TWILIO_PHONE_NUMBER     — The Dominion Twilio number (caller ID)
 *   VAPI_PHONE_NUMBER       — Jeff's Vapi number (AI fallback)
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

  // ── type=chain_step: Browser → Browser → Jeff call chain ─────────────────
  if (type === "chain_step") {
    const step = url.searchParams.get("step") ?? "";
    const formData = await req.formData();
    const dialStatus = formData.get("DialCallStatus")?.toString() ?? "";
    const fromNumber = formData.get("From")?.toString() ?? "";
    const callSid = formData.get("CallSid")?.toString() ?? "";

    const adamIdentity = process.env.ADAM_BROWSER_IDENTITY ?? "adam@dominionhomedeals.com";
    const vapiNumber = process.env.VAPI_PHONE_NUMBER ?? "";
    const twilioNumber = process.env.TWILIO_PHONE_NUMBER ?? "";

    // If someone answered in their browser, log it and we're done
    if (dialStatus === "completed" || dialStatus === "in-progress") {
      await handleAnsweredInbound({ fromNumber, callSid, dialDuration: formData.get("DialCallDuration")?.toString() ?? null });
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Nobody answered — move to next step
    let nextTwiml: string;

    if (step === "logan" && adamIdentity) {
      // Logan's browser didn't answer → try Adam's browser for 20 seconds
      console.log("[inbound] Logan browser missed → trying Adam browser");
      nextTwiml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<Response>",
        `  <Dial callerId="${twilioNumber}" timeout="20" action="${siteUrl}/api/twilio/inbound?type=chain_step&amp;step=adam" method="POST">`,
        `    <Client>${adamIdentity}</Client>`,
        "  </Dial>",
        "</Response>",
      ].join("\n");
    } else if ((step === "adam" || (step === "logan" && !adamIdentity)) && vapiNumber) {
      // Adam's browser didn't answer → forward to Jeff (Vapi AI)
      console.log(`[inbound] ${step} browser missed → forwarding to Jeff (Vapi)`);
      nextTwiml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<Response>",
        `  <Dial callerId="${twilioNumber}" timeout="30" action="${siteUrl}/api/twilio/inbound?type=call_status" method="POST">`,
        `    <Number>${vapiNumber}</Number>`,
        "  </Dial>",
        "</Response>",
      ].join("\n");
    } else {
      // No more fallbacks — play message, log missed call
      console.log(`[inbound] All chain steps exhausted — missed call from ${fromNumber}`);
      await handleMissedInbound({ fromNumber, callSid, siteUrl });
      nextTwiml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<Response>",
        '  <Say voice="Polly.Joanna">We missed your call. We will call you back shortly. Thank you for calling Dominion Home Deals.</Say>',
        "</Response>",
      ].join("\n");
    }

    return new NextResponse(nextTwiml, {
      headers: { "Content-Type": "text/xml" },
    });
  }

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

  // ── Initial inbound webhook: return TwiML with call chain ──────────────────
  // Chain: Logan browser (20s) → Adam browser (20s) → Jeff/Vapi AI (always answers)
  // No cell phones. All calls ring in the Sentinel dialer browser UI.
  const loganIdentity = process.env.LOGAN_BROWSER_IDENTITY ?? "logan@dominionhomedeals.com";
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER ?? "";

  // Parse inbound caller info
  const formData = await req.formData();
  const fromNumber = formData.get("From")?.toString() ?? "";
  const callSid = formData.get("CallSid")?.toString() ?? "";

  // Create a call session + calls_log entry upfront so transcription and closeout work
  const sb = createServerClient();
  let sessionId: string | null = null;
  let callLogId: string | null = null;

  // Try to match caller to an existing lead
  let matchedLeadId: string | null = null;
  if (fromNumber) {
    const normalized = fromNumber.replace(/\D/g, "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (sb.from("leads") as any)
      .select("id")
      .or(`owner_phone.eq.${fromNumber},owner_phone.eq.+${normalized},owner_phone.eq.${normalized},owner_phone.eq.+1${normalized.slice(-10)}`)
      .limit(1);
    if (leads && leads.length > 0) matchedLeadId = leads[0].id;
  }

  // Default user for inbound calls — Logan is primary acquisitions
  const loganUserId = process.env.LOGAN_USER_ID ?? "0737e969-2908-4bd6-90bd-7a4380456811";

  try {
    // Create call_session (columns: id, lead_id, user_id, twilio_sid, phone_dialed, status, started_at, ended_at, duration_sec, updated_at, context_snapshot, ai_summary, disposition, created_at)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sess, error: sessErr } = await (sb.from("call_sessions") as any)
      .insert({
        lead_id: matchedLeadId,
        user_id: loganUserId,
        twilio_sid: callSid,
        phone_dialed: fromNumber || "unknown",
        status: "ringing",
      })
      .select("id")
      .single();
    if (sessErr) console.error("[inbound] call_sessions insert failed:", sessErr.message);
    sessionId = sess?.id ?? null;

    // Create calls_log entry so disposition works
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cl, error: clErr } = await (sb.from("calls_log") as any)
      .insert({
        lead_id: matchedLeadId,
        user_id: loganUserId,
        phone_dialed: fromNumber || null,
        twilio_sid: callSid,
        disposition: "in_progress",
        direction: "inbound",
        dialer_session_id: sessionId,
      })
      .select("id")
      .single();
    if (clErr) console.error("[inbound] calls_log insert failed:", clErr.message);
    callLogId = cl?.id ?? null;
  } catch (err) {
    console.error("[inbound] Session/call log creation failed:", err);
  }

  console.log("[inbound] Inbound call setup:", {
    from: fromNumber ? `***${fromNumber.slice(-4)}` : "none",
    sessionId: sessionId?.slice(0, 8),
    callLogId: callLogId?.slice(0, 8),
    matchedLead: matchedLeadId?.slice(0, 8) ?? "none",
  });

  // Build <Stream> for Deepgram transcription (same pattern as outbound)
  const transcriptionUrl = process.env.TRANSCRIPTION_WS_URL;
  const hasDeepgram = !!process.env.DEEPGRAM_API_KEY;
  const streamLines = transcriptionUrl && hasDeepgram && sessionId
    ? [
        "  <Start>",
        `    <Stream url="${transcriptionUrl}" track="both_tracks">`,
        ...(callLogId ? [`      <Parameter name="callLogId" value="${callLogId}" />`] : []),
        `      <Parameter name="sessionId" value="${sessionId}" />`,
        "    </Stream>",
        "  </Start>",
      ]
    : [];

  // Step 1: Ring Logan's browser for 20 seconds
  // Pass sessionId and callLogId as query params so the browser can pick them up
  const chainParams = sessionId ? `&amp;sessionId=${sessionId}&amp;callLogId=${callLogId ?? ""}` : "";
  const twiml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    ...streamLines,
    `  <Dial callerId="${twilioNumber}" timeout="20" action="${siteUrl}/api/twilio/inbound?type=chain_step&amp;step=logan${chainParams}" method="POST">`,
    `    <Client>${loganIdentity}</Client>`,
    "  </Dial>",
    "</Response>",
  ].join("\n");

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
    const { data: contacts } = await (sb.from("contacts") as any)
      .select("id, first_name, last_name, phone, leads(id)")
      .or(
        `phone.eq.${fromNumber},phone.eq.+${normalized},phone.eq.${normalized}`
      )
      .limit(1);

    if (contacts && contacts.length > 0) {
      const contact = contacts[0];
      leadId = contact.leads?.[0]?.id ?? null;
      leadName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Lead";
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

  // Attempt to match lead by phone via contacts table
  let leadId: string | null = null;
  if (fromNumber) {
    const normalized = fromNumber.replace(/\D/g, "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contacts } = await (sb.from("contacts") as any)
      .select("id, leads(id)")
      .or(`phone.eq.${fromNumber},phone.eq.+${normalized},phone.eq.${normalized}`)
      .limit(1);
    if (contacts && contacts.length > 0) leadId = contacts[0].leads?.[0]?.id ?? null;
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
