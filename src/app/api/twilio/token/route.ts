import { NextResponse } from "next/server";
import twilio from "twilio";
import { createServerClient } from "@/lib/supabase";

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

/**
 * GET /api/twilio/token
 *
 * Generates a Twilio AccessToken with VoiceGrant for browser-based VoIP.
 * Token is valid for 1 hour. The browser SDK calls this on init and
 * again ~3 min before expiry (tokenWillExpire event).
 *
 * Returns: { token: string, callerId: string, identity: string }
 */
export async function GET(req: Request) {
  const sb = createServerClient();
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
  } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Required env vars
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

  if (!accountSid) {
    return NextResponse.json(
      { error: "TWILIO_ACCOUNT_SID not configured" },
      { status: 500 },
    );
  }
  if (!twimlAppSid) {
    return NextResponse.json(
      { error: "TWILIO_TWIML_APP_SID not configured — run VoIP Setup first" },
      { status: 500 },
    );
  }

  // Use API Key if available, otherwise fall back to Account SID + Auth Token
  const apiKeySid = process.env.TWILIO_API_KEY_SID || accountSid;
  const apiKeySecret =
    process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_AUTH_TOKEN || "";

  if (!apiKeySecret) {
    return NextResponse.json(
      { error: "No signing secret available (TWILIO_API_KEY_SECRET or TWILIO_AUTH_TOKEN)" },
      { status: 500 },
    );
  }

  // Lookup user's Twilio phone number for outbound caller ID
  const { getTwilioPhoneNumber } = await import("@/lib/get-twilio-number");
  const callerId = await getTwilioPhoneNumber(user.id);

  const identity = user.email || user.id;

  try {
    const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
      identity,
      ttl: 3600, // 1 hour
    });

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true,
    });
    token.addGrant(voiceGrant);

    console.log(
      `[TwilioToken] Generated token for ${identity}, callerId=${callerId}`,
    );

    return NextResponse.json({
      token: token.toJwt(),
      callerId,
      identity,
    });
  } catch (err) {
    console.error("[TwilioToken] Error generating token:", err);
    return NextResponse.json(
      { error: "Failed to generate token — check Twilio credentials" },
      { status: 500 },
    );
  }
}
