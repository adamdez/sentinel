/**
 * Shared SMS sender with context-aware compliance.
 *
 * C1: Single function that both dialer/sms and twilio/sms/send delegate to.
 * Handles: compliance scrub, WA state cold-outbound block, FROM routing,
 * Twilio send, sms_messages logging, and optional calls_log backward compat.
 *
 * Context parameter controls compliance behavior:
 *   - cold_outbound:     Full scrub + WA state block
 *   - reply_to_inbound:  Full scrub, NO WA block (replying is not cold outbound)
 *   - transactional:     No scrub (appointment confirmations, system messages)
 *   - operator_forced:   No scrub (operator explicitly overrode compliance)
 */

import { createServerClient } from "@/lib/supabase";
import { getTwilioCredentials, isTwilioError, friendlyTwilioError } from "@/lib/twilio";
import { scrubLead } from "@/lib/compliance";

// ── Types ─────────────────────────────────────────────────────────────

export type SMSContext =
  | "cold_outbound"
  | "reply_to_inbound"
  | "transactional"
  | "operator_forced";

export interface SendSMSParams {
  /** Destination phone (any format — will be normalized to E.164) */
  to: string;
  /** Message body (truncated to 1,600 chars) */
  body: string;
  /** Controls compliance behavior */
  context: SMSContext;
  /** Lead ID for thread matching + compliance lookups */
  leadId?: string | null;
  /** User ID of sender (for sms_messages attribution) */
  userId?: string | null;
  /** Also write a calls_log row with disposition sms_outbound (backward compat) */
  logToCallsLog?: boolean;
  /** Property ID for calls_log backward compat */
  propertyId?: string | null;
}

export interface SendSMSResult {
  success: boolean;
  messageSid?: string;
  error?: string;
  blocked?: boolean;
  blockedReasons?: string[];
}

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
const MAX_BODY_LENGTH = 1_600;
const messagingServiceSidCache = new Map<string, string | null>();
const SMS_QUIET_HOURS_START = 20;
const SMS_QUIET_HOURS_END = 8;

// ── E.164 normalization ───────────────────────────────────────────────

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

function getPacificHour(now = new Date()): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hour12: false,
  });
  return parseInt(formatter.format(now), 10);
}

export function isSellerFacingSmsQuietHours(now = new Date()): boolean {
  const hour = getPacificHour(now);
  return hour >= SMS_QUIET_HOURS_START || hour < SMS_QUIET_HOURS_END;
}

function resolveMessagingServiceSid(): string | null {
  const value = process.env.TWILIO_SMS_MESSAGING_SERVICE_SID?.trim();
  return value || null;
}

function resolveNotifyMessagingServiceSid(): string | null {
  const value = process.env.TWILIO_NOTIFY_MESSAGING_SERVICE_SID?.trim();
  return value || null;
}

async function serviceContainsFromNumber(
  serviceSid: string,
  fromNumber: string,
  authHeader: string,
): Promise<boolean> {
  const res = await fetch(
    `https://messaging.twilio.com/v1/Services/${serviceSid}/PhoneNumbers?PageSize=100`,
    {
      headers: { Authorization: authHeader },
    },
  );

  if (!res.ok) {
    throw new Error(`Messaging Service lookup failed (${serviceSid}): ${res.status}`);
  }

  const data = await res.json() as { phone_numbers?: Array<{ phone_number?: string | null }> };
  return (data.phone_numbers ?? []).some((entry) => entry.phone_number === fromNumber);
}

async function discoverMessagingServiceSid(
  fromNumber: string,
  authHeader: string,
): Promise<string | null> {
  if (messagingServiceSidCache.has(fromNumber)) {
    return messagingServiceSidCache.get(fromNumber) ?? null;
  }

  const explicitSmsServiceSid = resolveMessagingServiceSid();
  if (explicitSmsServiceSid) {
    messagingServiceSidCache.set(fromNumber, explicitSmsServiceSid);
    return explicitSmsServiceSid;
  }

  const preferredSid = resolveNotifyMessagingServiceSid();
  const checked = new Set<string>();

  try {
    if (preferredSid) {
      checked.add(preferredSid);
      if (await serviceContainsFromNumber(preferredSid, fromNumber, authHeader)) {
        messagingServiceSidCache.set(fromNumber, preferredSid);
        return preferredSid;
      }
    }

    const res = await fetch("https://messaging.twilio.com/v1/Services?PageSize=50", {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) {
      throw new Error(`Messaging Service list failed: ${res.status}`);
    }

    const data = await res.json() as { services?: Array<{ sid?: string | null }> };
    for (const service of data.services ?? []) {
      const sid = service.sid?.trim();
      if (!sid || checked.has(sid)) continue;
      checked.add(sid);
      if (await serviceContainsFromNumber(sid, fromNumber, authHeader)) {
        messagingServiceSidCache.set(fromNumber, sid);
        return sid;
      }
    }
  } catch (err) {
    console.error("[sms/send] Messaging Service discovery failed:", err);
    messagingServiceSidCache.set(fromNumber, preferredSid ?? null);
    return preferredSid ?? null;
  }

  messagingServiceSidCache.set(fromNumber, preferredSid ?? null);
  return preferredSid ?? null;
}

// ── FROM number routing ───────────────────────────────────────────────

async function resolveFromNumber(
  userId: string | null | undefined,
  leadId: string | null | undefined,
  defaultFrom: string,
): Promise<string> {
  const sb = createServerClient();

  try {
    if (userId) {
      // Prefer the sending operator's configured Twilio number.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: senderProfile } = await (sb.from("user_profiles") as any)
        .select("twilio_phone_number")
        .eq("id", userId)
        .maybeSingle();
      if (senderProfile?.twilio_phone_number) {
        return senderProfile.twilio_phone_number;
      }
    }

    if (!leadId) return defaultFrom;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (sb.from("leads") as any)
      .select("assigned_to")
      .eq("id", leadId)
      .maybeSingle();

    if (!lead?.assigned_to) return defaultFrom;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (sb.from("user_profiles") as any)
      .select("twilio_phone_number")
      .eq("id", lead.assigned_to)
      .maybeSingle();

    if (profile?.twilio_phone_number) {
      return profile.twilio_phone_number;
    }
  } catch {
    // Fallback to default on any error
  }

  return defaultFrom;
}

// ── WA state check ────────────────────────────────────────────────────

async function isWashingtonLead(leadId: string): Promise<boolean> {
  try {
    const sb = createServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lead } = await (sb.from("leads") as any)
      .select("property_id")
      .eq("id", leadId)
      .maybeSingle();

    if (!lead?.property_id) return false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prop } = await (sb.from("properties") as any)
      .select("state")
      .eq("id", lead.property_id)
      .maybeSingle();

    return (prop?.state ?? "").toUpperCase() === "WA";
  } catch {
    return false;
  }
}

// ── Main send function ────────────────────────────────────────────────

export async function sendAndLogSMS(params: SendSMSParams): Promise<SendSMSResult> {
  const { to, body, context, leadId, userId, logToCallsLog, propertyId } = params;

  // ── Validate ────────────────────────────────────────────────────────
  if (!to || !body?.trim()) {
    return { success: false, error: "to and body are required" };
  }

  const e164 = toE164(to);
  const truncatedBody = body.slice(0, MAX_BODY_LENGTH);
  const effectiveUserId = userId ?? SYSTEM_USER_ID;

  if (context !== "transactional" && isSellerFacingSmsQuietHours()) {
    return {
      success: false,
      blocked: true,
      blockedReasons: ["sms_quiet_hours"],
      error: "Outbound SMS to sellers is blocked after 8:00 PM Pacific and before 8:00 AM Pacific.",
    };
  }

  // ── Compliance scrub (skip for transactional + operator_forced) ─────
  if (context === "cold_outbound" || context === "reply_to_inbound") {
    try {
      const scrub = await scrubLead(to, effectiveUserId, false);
      if (!scrub.allowed) {
        return {
          success: false,
          blocked: true,
          blockedReasons: scrub.blockedReasons,
          error: `Compliance blocked: ${scrub.blockedReasons.join(", ")}`,
        };
      }
    } catch (err) {
      console.error("[sms/send] Compliance scrub error (proceeding):", err);
    }
  }

  // ── WA state cold-outbound block ────────────────────────────────────
  if (context === "cold_outbound" && leadId) {
    const isWA = await isWashingtonLead(leadId);
    if (isWA) {
      return {
        success: false,
        blocked: true,
        blockedReasons: ["wa_cold_outbound"],
        error: "Washington state cold outbound SMS blocked. WA follow-up is call-only.",
      };
    }
  }

  // ── Twilio credentials ─────────────────────────────────────────────
  const creds = getTwilioCredentials();
  if (isTwilioError(creds)) {
    return { success: false, error: creds.error };
  }

  // ── FROM routing via user_profiles.twilio_phone_number ──────────────
  const fromNumber = await resolveFromNumber(effectiveUserId, leadId, creds.from);

  if (!fromNumber) {
    return { success: false, error: "No Twilio phone number configured" };
  }

  // ── Send via Twilio ─────────────────────────────────────────────────
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sentinel.dominionhomedeals.com";
  const statusCallbackUrl = `${siteUrl}/api/twilio/sms/status`;
  const messagingServiceSid = await discoverMessagingServiceSid(fromNumber, creds.authHeader);

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Messages.json`;
  const twilioParams = new URLSearchParams({
    To: e164,
    Body: truncatedBody,
    StatusCallback: statusCallbackUrl,
  });

  if (messagingServiceSid) {
    twilioParams.set("MessagingServiceSid", messagingServiceSid);
  }
  twilioParams.set("From", fromNumber);

  let twilioData: Record<string, unknown>;
  try {
    const res = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: creds.authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: twilioParams.toString(),
    });

    twilioData = await res.json();

    if (!res.ok) {
      const rawMsg = (twilioData.message as string) ?? "Twilio SMS failed";
      console.error("[sms/send] Twilio error:", twilioData);
      return { success: false, error: friendlyTwilioError(rawMsg) };
    }
  } catch (err) {
    console.error("[sms/send] Twilio fetch error:", err);
    return { success: false, error: "Failed to reach Twilio API" };
  }

  const messageSid = (twilioData.sid as string) ?? null;

  // ── Log to sms_messages (primary record) ────────────────────────────
  const sb = createServerClient();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("sms_messages") as any).insert({
      phone: e164,
      direction: "outbound",
      body: truncatedBody.slice(0, 2000),
      twilio_sid: messageSid,
      twilio_status: (twilioData.status as string) ?? "queued",
      lead_id: leadId ?? null,
      user_id: effectiveUserId,
    });
  } catch (err) {
    console.error("[sms/send] sms_messages insert failed (message was sent):", err);
  }

  // ── Optional: log to calls_log for backward compat ──────────────────
  if (logToCallsLog) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("calls_log") as any).insert({
        lead_id: leadId ?? null,
        property_id: propertyId ?? null,
        user_id: effectiveUserId,
        phone_dialed: e164,
        twilio_sid: messageSid,
        disposition: "sms_outbound",
        notes: truncatedBody.slice(0, 500),
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        duration_sec: 0,
      });
    } catch (err) {
      console.error("[sms/send] calls_log insert failed (non-blocking):", err);
    }
  }

  return { success: true, messageSid: messageSid ?? undefined };
}
