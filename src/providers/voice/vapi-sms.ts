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

import { createServerClient } from "@/lib/supabase";

const TIMEOUT_MS = 8_000;

interface CallbackSMSParams {
  to: string;
  callerName: string | null;
  preferredTime: string | null;
  reason: string | null;
  leadId?: string | null;
}

interface SellerFacingSMSLogParams {
  to: string;
  body: string;
  twilioData: Record<string, unknown>;
  leadId?: string | null;
}

async function logSellerFacingSMS(params: SellerFacingSMSLogParams): Promise<void> {
  try {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("sms_messages") as any).insert({
      phone: params.to,
      direction: "outbound",
      body: params.body,
      twilio_sid: params.twilioData.sid ?? null,
      twilio_status: params.twilioData.status ?? "sent",
      lead_id: params.leadId ?? null,
      user_id: "00000000-0000-0000-0000-000000000000",
    });
  } catch (logErr) {
    console.error("[vapi-sms] Failed to log seller-facing SMS to sms_messages:", logErr);
  }
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

    // C2: Log seller-facing SMS to sms_messages for thread visibility
    const twilioData = await res.json().catch(() => ({}));
    await logSellerFacingSMS({
      to: params.to,
      body,
      twilioData,
      leadId: params.leadId ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[vapi-sms] Failed to send callback SMS:", msg);
  }
}

/**
 * Send a transfer-failed notification SMS — lets the caller know
 * someone will call them back even though the transfer didn't go through.
 */
/**
 * Send a direct SMS to a specific phone number (operator notification).
 * Used for pre-transfer alerts to Logan/Adam.
 * Fire-and-forget — never throws.
 */
export async function sendDirectSMS(
  to: string,
  message: string,
): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber || !to) return;

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
      body: new URLSearchParams({ To: to, From: fromNumber, Body: message }).toString(),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[vapi-sms] Direct SMS error ${res.status}: ${errBody.slice(0, 200)}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[vapi-sms] Direct SMS failed:", msg);
  }
}

export async function sendTransferFailedSMS(
  to: string,
  operatorName: string,
  leadId?: string | null,
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

    // C2: Log seller-facing SMS to sms_messages for thread visibility
    const twilioData = await res.json().catch(() => ({}));
    await logSellerFacingSMS({
      to,
      body,
      twilioData,
      leadId: leadId ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[vapi-sms] Transfer-failed SMS failed:", msg);
  }
}

export async function sendMissedInboundSMS(params: {
  to: string;
  callerName?: string | null;
  leadId?: string | null;
}): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber || !params.to) {
    return;
  }

  const greeting = params.callerName?.trim()
    ? `Hi ${params.callerName.trim()},`
    : "Hi there,";
  const body = `${greeting} we missed your call at Dominion Home Deals. We'll call you back as soon as we can. If you'd rather text, just reply here with the best time to reach you.`;

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
      console.error(`[vapi-sms] Missed-inbound SMS error ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const twilioData = await res.json().catch(() => ({}));
    await logSellerFacingSMS({
      to: params.to,
      body,
      twilioData,
      leadId: params.leadId ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[vapi-sms] Missed-inbound SMS failed:", msg);
  }
}
