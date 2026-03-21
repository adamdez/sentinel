/**
 * Vapi SMS Helpers
 *
 * Sends SMS confirmations during Vapi voice calls (callback confirmations,
 * transfer-failed notifications). Uses Twilio directly — same credentials
 * as the dialer.
 *
 * BOUNDARY: Fire-and-forget delivery only. Never blocks the Vapi webhook.
 * Never writes to CRM tables. Never contains business logic.
 */

const TIMEOUT_MS = 8_000;

interface CallbackSMSParams {
  to: string;
  callerName: string | null;
  preferredTime: string | null;
  reason: string | null;
}

/**
 * Send a callback confirmation SMS to the caller after Vapi books a callback.
 * Blueprint PR-9: "send confirmation SMS via Twilio when callback is booked."
 */
export async function sendCallbackConfirmationSMS(
  params: CallbackSMSParams,
): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.warn("[vapi-sms] Twilio not configured — skipping callback SMS");
    return;
  }

  const greeting = params.callerName ? `Hi ${params.callerName}, t` : "T";
  const timeNote = params.preferredTime
    ? ` We'll aim to reach you ${params.preferredTime}.`
    : " We'll get back to you within a couple hours.";

  const body = `${greeting}hanks for calling Dominion Home Deals.${timeNote} If you need anything in the meantime, just reply to this text. - Dominion Home Deals`;

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: params.to,
        From: fromNumber,
        Body: body,
      }).toString(),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[vapi-sms] Twilio returned ${res.status}: ${errBody.slice(0, 200)}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[vapi-sms] Failed to send callback SMS:", msg);
  }
}

/**
 * Send a transfer-failed notification SMS — lets the caller know
 * someone will call them back even though the transfer didn't go through.
 */
export async function sendTransferFailedSMS(
  to: string,
  operatorName: string,
): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return;
  }

  const body = `Hey, this is Dominion Home Deals. We tried to connect you with ${operatorName} but they weren't available. They'll call you back shortly. Reply to this text if you need anything.`;

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: fromNumber,
        Body: body,
      }).toString(),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[vapi-sms] Transfer-failed SMS error ${res.status}: ${errBody.slice(0, 200)}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[vapi-sms] Transfer-failed SMS failed:", msg);
  }
}
