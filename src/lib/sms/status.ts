import { getTwilioCredentials, isTwilioError } from "@/lib/twilio";

type SupabaseLike = {
  from: (table: string) => any;
};

type SmsMessageLike = {
  id: string;
  direction: string | null;
  twilio_sid: string | null;
  twilio_status: string | null;
  created_at: string | null;
};

const STALE_RECONCILE_AFTER_MS = 30_000;
const RECONCILABLE_STATUSES = new Set(["accepted", "queued", "sending", "sent", "scheduled"]);

function isOutboundMessage(message: SmsMessageLike): boolean {
  return (message.direction ?? "").toLowerCase() === "outbound";
}

function shouldReconcileMessage(message: SmsMessageLike, now = Date.now()): boolean {
  if (!isOutboundMessage(message)) return false;
  if (!message.twilio_sid) return false;
  const status = (message.twilio_status ?? "").toLowerCase();
  if (!RECONCILABLE_STATUSES.has(status)) return false;
  const createdAt = message.created_at ? new Date(message.created_at).getTime() : Number.NaN;
  if (Number.isNaN(createdAt)) return true;
  return now - createdAt >= STALE_RECONCILE_AFTER_MS;
}

export async function fetchTwilioMessageStatus(messageSid: string): Promise<string | null> {
  const creds = getTwilioCredentials();
  if (isTwilioError(creds)) {
    console.warn("[sms/status] Twilio credentials unavailable for status reconcile:", creds.error);
    return null;
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/Messages/${messageSid}.json`,
      {
        headers: {
          Authorization: creds.authHeader,
        },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      console.warn("[sms/status] Twilio status lookup failed:", res.status, messageSid);
      return null;
    }

    const data = await res.json() as { status?: unknown };
    return typeof data.status === "string" && data.status.trim()
      ? data.status.trim().toLowerCase()
      : null;
  } catch (error) {
    console.warn("[sms/status] Twilio status lookup error:", error);
    return null;
  }
}

export async function reconcileSmsStatuses<T extends SmsMessageLike>(
  sb: SupabaseLike,
  messages: T[],
): Promise<Map<string, string>> {
  const updates = new Map<string, string>();
  const candidates = messages.filter((message) => shouldReconcileMessage(message)).slice(0, 25);

  for (const message of candidates) {
    const refreshedStatus = await fetchTwilioMessageStatus(message.twilio_sid as string);
    if (!refreshedStatus) continue;
    if ((message.twilio_status ?? "").toLowerCase() === refreshedStatus) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from("sms_messages") as any)
      .update({ twilio_status: refreshedStatus })
      .eq("id", message.id);

    if (error) {
      console.error("[sms/status] Failed to reconcile sms_messages row:", error);
      continue;
    }

    updates.set(message.id, refreshedStatus);
  }

  return updates;
}
