import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/twilio/sms/setup
 * Diagnostic — check current SMS webhook config on Twilio for the main number.
 *
 * POST /api/twilio/sms/setup
 * Fix — set the SMS webhook URL to /api/twilio/sms on the main number.
 */

async function getTwilioPhoneConfig() {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioSid || !twilioAuth || !twilioPhone) {
    return { error: "Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER" };
  }

  const twilioAuthHeader = "Basic " + Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64");

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(twilioPhone)}`,
    { headers: { Authorization: twilioAuthHeader } },
  );

  if (!res.ok) {
    return { error: `Twilio API error: ${res.status}` };
  }

  const data = await res.json();
  const phone = data.incoming_phone_numbers?.[0];

  if (!phone) {
    return { error: `Phone ${twilioPhone} not found in Twilio account` };
  }

  return {
    phone,
    twilioSid,
    twilioAuth,
    twilioAuthHeader,
  };
}

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await getTwilioPhoneConfig();
  if ("error" in config) {
    return NextResponse.json(config, { status: 500 });
  }

  const { phone } = config;

  return NextResponse.json({
    phoneNumber: phone.phone_number,
    phoneSid: phone.sid,
    voiceUrl: phone.voice_url,
    voiceMethod: phone.voice_method,
    smsUrl: phone.sms_url,
    smsMethod: phone.sms_method,
    smsFallbackUrl: phone.sms_fallback_url,
    statusCallback: phone.status_callback,
    smsWebhookCorrect: !!phone.sms_url?.includes("/api/twilio/sms"),
    voiceWebhookCorrect: !!phone.voice_url?.includes("/api/twilio/inbound"),
  });
}

export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (!siteUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_SITE_URL not set" }, { status: 500 });
  }

  const config = await getTwilioPhoneConfig();
  if ("error" in config) {
    return NextResponse.json(config, { status: 500 });
  }

  const { phone, twilioSid, twilioAuthHeader } = config;
  const targetSmsUrl = `${siteUrl}/api/twilio/sms`;
  const targetSmsStatusUrl = `${siteUrl}/api/twilio/sms/status`;

  // Update SMS webhook
  const updateRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers/${phone.sid}.json`,
    {
      method: "POST",
      headers: {
        Authorization: twilioAuthHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        SmsUrl: targetSmsUrl,
        SmsMethod: "POST",
      }).toString(),
    },
  );

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    return NextResponse.json(
      { error: `Twilio update failed: ${updateRes.status}`, details: errText },
      { status: 500 },
    );
  }

  const updated = await updateRes.json();

  console.log(`[sms/setup] SMS webhook set to ${targetSmsUrl} for ${phone.phone_number}`);

  return NextResponse.json({
    success: true,
    phoneNumber: updated.phone_number,
    phoneSid: updated.sid,
    previousSmsUrl: phone.sms_url,
    newSmsUrl: updated.sms_url,
    newSmsMethod: updated.sms_method,
    targetSmsStatusUrl,
    message: `SMS webhook updated from "${phone.sms_url || "(not set)"}" to "${targetSmsUrl}"`,
  });
}
