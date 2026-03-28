import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTwilioCredentials, isTwilioError } from "@/lib/twilio";

/**
 * POST /api/twilio/setup-inbound
 *
 * Configures the Dominion Twilio phone number's Voice webhook
 * to point to /api/twilio/inbound. This is the missing link
 * that enables inbound calls to flow through the cascade:
 *   Browser (Logan 20s) → Browser (Adam 20s) → Jeff/Vapi AI
 *
 * Also configures the fallback URL and status callback.
 * Only needs to be run ONCE (or after changing deployment URL).
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(bearerToken);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creds = getTwilioCredentials();
  if (isTwilioError(creds)) {
    return NextResponse.json({ error: creds.error, hint: creds.hint }, { status: 500 });
  }

  const { sid: accountSid, authHeader: twilioAuth } = creds;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER?.trim();

  if (!phoneNumber) {
    return NextResponse.json({
      error: "TWILIO_PHONE_NUMBER not set",
      hint: "Set the Dominion inbound number in env vars.",
    }, { status: 500 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  if (!siteUrl) {
    return NextResponse.json({
      error: "NEXT_PUBLIC_SITE_URL not set — required for webhook URLs",
    }, { status: 500 });
  }

  // ── 1. Look up the phone number SID ─────────────────────────────────────
  let phoneSid: string | null = null;

  try {
    const encoded = encodeURIComponent(phoneNumber);
    const listRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encoded}`,
      {
        headers: { Authorization: twilioAuth },
      },
    );

    const listData = await listRes.json();

    if (!listRes.ok) {
      return NextResponse.json({
        error: `Twilio lookup failed: ${listData.message ?? listRes.status}`,
      }, { status: 500 });
    }

    if (listData.incoming_phone_numbers?.length > 0) {
      phoneSid = listData.incoming_phone_numbers[0].sid;
    }
  } catch (err) {
    return NextResponse.json({
      error: `Failed to look up phone number: ${err instanceof Error ? err.message : "unknown"}`,
    }, { status: 500 });
  }

  if (!phoneSid) {
    return NextResponse.json({
      error: `Phone number ${phoneNumber} not found on this Twilio account`,
      hint: "Verify TWILIO_PHONE_NUMBER matches a number in your Twilio console.",
    }, { status: 404 });
  }

  // ── 2. Configure Voice webhook URLs ─────────────────────────────────────
  const voiceUrl = `${siteUrl}/api/twilio/inbound`;
  const fallbackUrl = `${siteUrl}/api/twilio/inbound-fallback`;
  const statusUrl = `${siteUrl}/api/twilio/voice/status`;

  try {
    const updateRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${phoneSid}.json`,
      {
        method: "POST",
        headers: {
          Authorization: twilioAuth,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          VoiceUrl: voiceUrl,
          VoiceMethod: "POST",
          VoiceFallbackUrl: fallbackUrl,
          VoiceFallbackMethod: "POST",
          StatusCallback: statusUrl,
          StatusCallbackMethod: "POST",
        }).toString(),
      },
    );

    const updateData = await updateRes.json();

    if (!updateRes.ok) {
      return NextResponse.json({
        error: `Failed to configure webhook: ${updateData.message ?? updateRes.status}`,
        phoneSid,
      }, { status: 500 });
    }

    console.log("[setup-inbound] Configured inbound webhook:", {
      phoneSid,
      phoneNumber,
      voiceUrl,
      fallbackUrl,
      statusUrl,
    });

    return NextResponse.json({
      success: true,
      phoneSid,
      phoneNumber,
      configured: {
        voiceUrl,
        fallbackUrl,
        statusUrl,
      },
      message: `Inbound calls to ${phoneNumber} will now route through Sentinel: Logan browser → Adam browser → Jeff AI`,
    });
  } catch (err) {
    return NextResponse.json({
      error: `Webhook configuration failed: ${err instanceof Error ? err.message : "unknown"}`,
      phoneSid,
    }, { status: 500 });
  }
}
