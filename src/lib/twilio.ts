/**
 * Shared Twilio credential helpers for dialer API routes.
 *
 * Handles env-var trimming, SID format validation, and Basic-auth header
 * construction so that every route behaves consistently.
 */

export interface TwilioCredentials {
  sid: string;
  token: string;
  from: string;
  authHeader: string;
}

export interface TwilioCredentialError {
  error: string;
  hint: string;
}

/**
 * Read, trim, and validate TWILIO_* env vars.
 * Returns either a valid credential bundle or a structured error.
 */
export function getTwilioCredentials(): TwilioCredentials | TwilioCredentialError {
  const rawSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const rawToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const rawFrom = process.env.TWILIO_PHONE_NUMBER ?? "";

  const sid = rawSid.trim();
  const token = rawToken.trim();
  const from = rawFrom.trim();

  if (!sid || !token) {
    return {
      error: "Twilio credentials not configured",
      hint: "Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your environment variables.",
    };
  }

  if (sid.startsWith("SK")) {
    return {
      error: "Twilio Account SID is invalid — an API Key SID was provided instead",
      hint: "TWILIO_ACCOUNT_SID must start with 'AC'. You may have pasted an API Key SID (starts with 'SK') by mistake.",
    };
  }

  if (!sid.startsWith("AC") || sid.length !== 34) {
    return {
      error: "Twilio Account SID is malformed",
      hint: `TWILIO_ACCOUNT_SID must start with 'AC' and be 34 characters long. Current value starts with '${sid.slice(0, 4)}…' (${sid.length} chars).`,
    };
  }

  if (token.length < 20) {
    return {
      error: "Twilio Auth Token appears too short",
      hint: "TWILIO_AUTH_TOKEN should be a 32-character hex string from your Twilio console.",
    };
  }

  const authHeader = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");

  return { sid, token, from, authHeader };
}

/**
 * Type-guard: returns true if the result is a credential error.
 */
export function isTwilioError(
  result: TwilioCredentials | TwilioCredentialError,
): result is TwilioCredentialError {
  return "error" in result && !("sid" in result);
}

/**
 * Map raw Twilio REST API error messages to user-friendly strings.
 */
export function friendlyTwilioError(twilioMessage: string): string {
  const lower = twilioMessage.toLowerCase();

  if (lower.includes("authenticate") || lower.includes("invalid username") || lower.includes("invalid credentials")) {
    return "Twilio authentication failed — please verify Account SID and Auth Token in Vercel env vars";
  }
  if (lower.includes("is not a valid phone number") || lower.includes("invalid 'to'")) {
    return "Invalid destination phone number";
  }
  if (lower.includes("unverified") || lower.includes("not a verified")) {
    return "Phone number not verified in Twilio trial account — upgrade or verify the number";
  }
  if (lower.includes("queue") || lower.includes("rate")) {
    return "Twilio rate limit reached — try again in a moment";
  }

  return `Twilio error: ${twilioMessage}`;
}
