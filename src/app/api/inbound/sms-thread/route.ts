import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTwilioCredentials, isTwilioError } from "@/lib/twilio";

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
 * The customer can reply directly — replies hit /api/twilio/sms (inbound webhook)
 * and appear in Sentinel's SMS tile as part of the same thread.
 *
 * Body: {
 *   firstName: string,
 *   phone: string,
 *   message?: string,     // optional customer message (displayed in thread)
 *   address?: string,     // optional property address for context
 *   city?: string,
 *   state?: string,
 *   source?: string,      // e.g. "website_text_form"
 * }
 */
export async function POST(req: NextRequest) {
  // ── Auth: shared intake secret ──────────────────────────────────
  const intakeSecret = process.env.INBOUND_INTAKE_SECRET;
  const providedSecret = req.headers.get("x-intake-secret");

  if (!intakeSecret || !providedSecret || providedSecret !== intakeSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────
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

  // Normalize to E.164
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

  // ── Twilio credentials ──────────────────────────────────────────
  const creds = getTwilioCredentials();
  if (isTwilioError(creds)) {
    console.error("[sms-thread] Twilio creds missing:", creds);
    return NextResponse.json({ error: "SMS service unavailable" }, { status: 503 });
  }

  const sb = createServerClient();

  // ── Step 1: If customer included a message, log it as inbound ──
  if (customerMessage) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("sms_messages") as any).insert({
      phone: e164,
      direction: "inbound",
      body: customerMessage.slice(0, 2000),
      twilio_sid: `web_${Date.now()}`, // synthetic SID for web-originated messages
      lead_id: null, // will be matched below
      user_id: null,
    });
  }

  // ── Step 2: Auto-match to existing lead ─────────────────────────
  let matchedLeadId: string | null = null;
  const phone10 = digits.slice(-10);

  if (phone10.length === 10) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: props } = await (sb.from("properties") as any)
      .select("id")
      .ilike("owner_phone", `%${phone10}`)
      .limit(5);

    if (props?.length) {
      const propIds = props.map((p: { id: string }) => p.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leads } = await (sb.from("leads") as any)
        .select("id")
        .in("property_id", propIds)
        .limit(1);

      if (leads?.[0]) {
        matchedLeadId = leads[0].id;
      }
    }
  }

  // ── Step 3: Build and send welcome SMS to customer ──────────────
  const name = firstName || "there";
  const locationContext = address
    ? ` about ${address}${city ? `, ${city}` : ""}${state ? ` ${state}` : ""}`
    : "";

  const welcomeBody =
    `Hi ${name}, this is Logan with Dominion Homes. ` +
    `Thanks for reaching out${locationContext}! ` +
    `I'd love to learn more about your situation. ` +
    `Feel free to reply here or I can give you a call — whichever you prefer.`;

  // Send from the main Dominion number so replies route to /api/twilio/sms
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

  // ── Step 4: Log outbound welcome to sms_messages ────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertErr } = await (sb.from("sms_messages") as any).insert({
    phone: e164,
    direction: "outbound",
    body: welcomeBody.slice(0, 2000),
    twilio_sid: twilioData.sid ?? null,
    twilio_status: twilioData.status ?? "queued",
    lead_id: matchedLeadId,
    user_id: null, // system-generated, not user-initiated
  });

  if (insertErr) {
    console.error("[sms-thread] DB insert failed (SMS was sent):", insertErr);
  }

  // ── Step 5: Update inbound message with matched lead if found ───
  if (customerMessage && matchedLeadId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("sms_messages") as any)
      .update({ lead_id: matchedLeadId })
      .eq("phone", e164)
      .eq("direction", "inbound")
      .is("lead_id", null);
  }

  // ── Step 6: Audit log ──────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("event_log") as any).insert({
    user_id: SYSTEM_USER_ID,
    action: "inbound.sms_thread_created",
    entity_type: "sms_thread",
    entity_id: twilioData.sid ?? `sms_${Date.now()}`,
    details: {
      customer_phone: `***${phone10.slice(-4)}`,
      customer_name: firstName || null,
      address: address || null,
      source,
      matched_lead_id: matchedLeadId,
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
