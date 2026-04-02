import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTwilioCredentials, isTwilioError } from "@/lib/twilio";
import { backfillSmsLeadForPhone, resolveSmsLead } from "@/lib/sms/lead-resolution";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * POST /api/inbound/sms-thread
 *
 * Called by the dominionhomedeals website "Text Us" form.
 * 1. Validates intake secret
 * 2. Sends a welcome SMS TO the customer FROM the Dominion number
 * 3. Logs the outbound message to sms_messages (creates the thread)
 * 4. Auto-matches to an existing lead if phone is known
 *
 * The customer can reply directly - replies hit /api/twilio/sms (inbound webhook)
 * and appear in Sentinel's SMS tile as part of the same thread.
 *
 * Body: {
 *   firstName: string,
 *   phone: string,
 *   message?: string,
 *   address?: string,
 *   city?: string,
 *   state?: string,
 *   source?: string,
 * }
 */
export async function POST(req: NextRequest) {
  const intakeSecret = process.env.INBOUND_INTAKE_SECRET;
  const providedSecret = req.headers.get("x-intake-secret");

  if (!intakeSecret || !providedSecret || providedSecret !== intakeSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const firstName = (body.firstName ?? "").trim();
  const rawPhone = (body.phone ?? "").trim();
  const customerMessage = (body.message ?? "").trim();
  const address = (body.address ?? "").trim();
  const city = (body.city ?? "").trim();
  const state = (body.state ?? "").trim();
  const source = (body.source ?? "website_text_form").trim();

  if (!rawPhone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length < 10) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  const e164 =
    digits.length === 10
      ? `+1${digits}`
      : digits.startsWith("1") && digits.length === 11
        ? `+${digits}`
        : `+${digits}`;

  const creds = getTwilioCredentials();
  if (isTwilioError(creds)) {
    console.error("[sms-thread] Twilio creds missing:", creds);
    return NextResponse.json({ error: "SMS service unavailable" }, { status: 503 });
  }

  const sb = createServerClient();
  const resolution = await resolveSmsLead(sb, e164);
  const matchedLeadId = resolution.leadId;
  const matchedAssignedTo = resolution.assignedTo;

  if (customerMessage) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("sms_messages") as any).insert({
      phone: e164,
      direction: "inbound",
      body: customerMessage.slice(0, 2000),
      twilio_sid: `web_${Date.now()}`,
      lead_id: matchedLeadId,
      user_id: matchedAssignedTo,
    });
  }

  const name = firstName || "there";
  const locationContext = address
    ? ` about ${address}${city ? `, ${city}` : ""}${state ? ` ${state}` : ""}`
    : "";

  const welcomeBody =
    `Hi ${name}, this is Logan with Dominion Homes. ` +
    `Thanks for reaching out${locationContext}! ` +
    `I'd love to learn more about your situation. ` +
    `Feel free to reply here or I can give you a call - whichever you prefer.`;

  const fromNumber = process.env.TWILIO_PHONE_NUMBER ?? creds.from;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sentinel.dominionhomedeals.com";
  const statusCallbackUrl = `${siteUrl}/api/twilio/sms/status`;

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Messages.json`;
  const params = new URLSearchParams({
    To: e164,
    From: fromNumber,
    Body: welcomeBody,
    StatusCallback: statusCallbackUrl,
  });

  const twilioRes = await fetch(twilioUrl, {
    method: "POST",
    headers: {
      Authorization: creds.authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const twilioData = await twilioRes.json();

  if (!twilioRes.ok) {
    console.error("[sms-thread] Twilio send failed:", twilioData);
    return NextResponse.json(
      { error: "Failed to send SMS", details: twilioData.message ?? "Unknown error" },
      { status: 502 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertErr } = await (sb.from("sms_messages") as any).insert({
    phone: e164,
    direction: "outbound",
    body: welcomeBody.slice(0, 2000),
    twilio_sid: twilioData.sid ?? null,
    twilio_status: twilioData.status ?? "queued",
    lead_id: matchedLeadId,
    user_id: matchedAssignedTo,
  });

  if (insertErr) {
    console.error("[sms-thread] DB insert failed (SMS was sent):", insertErr);
  }

  if (matchedLeadId) {
    await backfillSmsLeadForPhone(sb, e164, matchedLeadId, matchedAssignedTo);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "inbound.sms_thread_created",
    entity_type: "sms_thread",
    entity_id: twilioData.sid ?? `sms_${Date.now()}`,
    details: {
      customer_phone: `***${digits.slice(-4)}`,
      customer_name: firstName || null,
      address: address || null,
      source,
      matched_lead_id: matchedLeadId,
      match_source: resolution.matchSource,
      welcome_sms_sid: twilioData.sid,
      had_customer_message: !!customerMessage,
      timestamp: new Date().toISOString(),
    },
  });

  console.log(
    `[sms-thread] Thread created: ${e164.slice(-4)} | lead: ${matchedLeadId ?? "none"} | sid: ${twilioData.sid}`,
  );

  return NextResponse.json({
    success: true,
    threadCreated: true,
    smsSid: twilioData.sid,
    matchedLeadId,
  });
}
