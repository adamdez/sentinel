import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTwilioCredentials, isTwilioError } from "@/lib/twilio";

/**
 * POST /api/twilio/setup
 *
 * Auto-creates Twilio resources needed for browser VoIP:
 * 1. API Key (for AccessToken signing)
 * 2. TwiML Application (for outbound browser calls)
 *
 * Returns the SIDs/secrets to set as Vercel env vars.
 * Only needs to be run ONCE.
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  if (!siteUrl) {
    return NextResponse.json({
      error: "NEXT_PUBLIC_SITE_URL not set — required for TwiML App webhook URLs",
    }, { status: 500 });
  }

  const results: {
    apiKeySid?: string;
    apiKeySecret?: string;
    twimlAppSid?: string;
    errors: string[];
    instructions: string[];
  } = { errors: [], instructions: [] };

  // ── 1. Create API Key ──────────────────────────────────────────────
  try {
    const keyRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Keys.json`,
      {
        method: "POST",
        headers: {
          Authorization: twilioAuth,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ FriendlyName: "Sentinel VoIP Key" }).toString(),
      },
    );

    const keyData = await keyRes.json();

    if (!keyRes.ok) {
      results.errors.push(`API Key creation failed: ${keyData.message ?? keyRes.status}`);
    } else {
      results.apiKeySid = keyData.sid;
      results.apiKeySecret = keyData.secret;
      console.log("[TwilioSetup] Created API Key:", keyData.sid);
    }
  } catch (err) {
    results.errors.push(`API Key creation error: ${err instanceof Error ? err.message : "unknown"}`);
  }

  // ── 2. Create TwiML Application ────────────────────────────────────
  try {
    const appRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Applications.json`,
      {
        method: "POST",
        headers: {
          Authorization: twilioAuth,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          FriendlyName: "Sentinel Browser Dialer",
          VoiceUrl: `${siteUrl}/api/twilio/voice/browser`,
          VoiceMethod: "POST",
          StatusCallback: `${siteUrl}/api/twilio/voice/status`,
          StatusCallbackMethod: "POST",
        }).toString(),
      },
    );

    const appData = await appRes.json();

    if (!appRes.ok) {
      results.errors.push(`TwiML App creation failed: ${appData.message ?? appRes.status}`);
    } else {
      results.twimlAppSid = appData.sid;
      console.log("[TwilioSetup] Created TwiML App:", appData.sid);
    }
  } catch (err) {
    results.errors.push(`TwiML App creation error: ${err instanceof Error ? err.message : "unknown"}`);
  }

  // ── 3. Build instructions ──────────────────────────────────────────
  if (results.apiKeySid && results.apiKeySecret && results.twimlAppSid) {
    results.instructions = [
      "Add these environment variables to Vercel (Settings → Environment Variables):",
      `  TWILIO_API_KEY_SID=${results.apiKeySid}`,
      `  TWILIO_API_KEY_SECRET=${results.apiKeySecret}`,
      `  TWILIO_TWIML_APP_SID=${results.twimlAppSid}`,
      `  TWILIO_PHONE_NUMBER=+15099921136`,
      "",
      "⚠️  SAVE the API Key Secret now — it cannot be retrieved again!",
      "After adding env vars, trigger a redeploy on Vercel.",
    ];
  }

  return NextResponse.json({
    success: results.errors.length === 0,
    ...results,
  });
}
