import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTwilioCredentials, isTwilioError } from "@/lib/twilio";

/**
 * POST /api/dialer/test
 *
 * Comprehensive Twilio diagnostics — validates credentials, phone numbers,
 * webhook reachability, and account status. Returns detailed results so the
 * user can pinpoint exactly what's broken.
 *
 * Body: { userId }
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = user.id;

  const checks: {
    name: string;
    status: "pass" | "fail" | "warn";
    message: string;
    detail?: string;
  }[] = [];

  // ── 1. Twilio credentials ─────────────────────────────────────────
  const creds = getTwilioCredentials();
  if (isTwilioError(creds)) {
    checks.push({
      name: "Twilio Credentials",
      status: "fail",
      message: creds.error,
      detail: creds.hint,
    });
    return NextResponse.json({ checks, overall: "fail" });
  }

  checks.push({
    name: "Twilio Credentials",
    status: "pass",
    message: `Account SID: ${creds.sid.slice(0, 6)}…${creds.sid.slice(-4)}`,
  });

  // ── 2. Twilio phone number (From) ─────────────────────────────────
  if (!creds.from) {
    checks.push({
      name: "Twilio Phone Number",
      status: "fail",
      message: "TWILIO_PHONE_NUMBER env var is not set",
      detail: "Set TWILIO_PHONE_NUMBER to your purchased Twilio number in E.164 format (+1XXXXXXXXXX).",
    });
  } else {
    checks.push({
      name: "Twilio Phone Number",
      status: "pass",
      message: `From: ${creds.from}`,
    });
  }

  // ── 3. Agent's personal cell (optional for VoIP) ──────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (sb.from("user_profiles") as any)
    .select("personal_cell, twilio_phone_number, full_name")
    .eq("id", userId)
    .single();

  const agentCell = (profile?.personal_cell as string) ?? "";
  const agentTwilio = (profile?.twilio_phone_number as string) ?? "";

  if (!agentCell) {
    checks.push({
      name: "Personal Cell",
      status: "pass",
      message: "Not set — not needed for browser VoIP",
      detail: "Browser VoIP connects calls directly in your browser. Personal cell is only required for the legacy cell-bridge mode.",
    });
  } else {
    const digits = agentCell.replace(/\D/g, "");
    if (digits.length < 10) {
      checks.push({
        name: "Personal Cell",
        status: "warn",
        message: `"${agentCell}" is too short — must be at least 10 digits`,
        detail: "Not required for VoIP, but if you want cell-bridge fallback, enter a valid number.",
      });
    } else {
      const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
      checks.push({
        name: "Personal Cell",
        status: "pass",
        message: `Your cell: ${e164}`,
      });
    }
  }

  // ── 4. Webhook URL ─────────────────────────────────────────────────
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  if (!siteUrl) {
    checks.push({
      name: "Webhook URL",
      status: "fail",
      message: "NEXT_PUBLIC_SITE_URL is not set and VERCEL_URL is not available",
      detail: "Set NEXT_PUBLIC_SITE_URL to your public deployment URL (e.g. https://sentinel.vercel.app) in Vercel environment variables.",
    });
  } else if (siteUrl.includes("localhost")) {
    checks.push({
      name: "Webhook URL",
      status: "fail",
      message: `Webhook URL points to localhost: ${siteUrl}`,
      detail: "Twilio cannot reach localhost. Set NEXT_PUBLIC_SITE_URL to your public deployment URL (https://...) in Vercel environment variables.",
    });
  } else if (siteUrl.startsWith("http://")) {
    checks.push({
      name: "Webhook URL",
      status: "warn",
      message: `Webhook URL uses HTTP (not HTTPS): ${siteUrl}`,
      detail: "Twilio requires HTTPS for webhooks in production. Change NEXT_PUBLIC_SITE_URL to use https://.",
    });
  } else {
    checks.push({
      name: "Webhook URL",
      status: "pass",
      message: `Webhooks: ${siteUrl}/api/twilio/voice`,
    });
  }

  // ── 5. Twilio account verification (API call) ─────────────────────
  try {
    const accountUrl = `https://api.twilio.com/2010-04-01/Accounts/${creds.sid}.json`;
    const res = await fetch(accountUrl, {
      headers: { Authorization: creds.authHeader },
    });
    const data = await res.json();

    if (!res.ok) {
      checks.push({
        name: "Twilio Account",
        status: "fail",
        message: `Account lookup failed: HTTP ${res.status}`,
        detail: data.message ?? "Check that TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are correct.",
      });
    } else {
      const accountStatus = data.status; // "active", "suspended", "closed"
      const accountType = data.type; // "Trial" or "Full"

      if (accountStatus !== "active") {
        checks.push({
          name: "Twilio Account",
          status: "fail",
          message: `Account status: ${accountStatus}`,
          detail: "Your Twilio account is not active. Check your Twilio console.",
        });
      } else {
        checks.push({
          name: "Twilio Account",
          status: accountType === "Trial" ? "warn" : "pass",
          message: `Account: ${data.friendly_name} (${accountType}) — ${accountStatus}`,
          detail: accountType === "Trial"
            ? "Trial accounts can only call VERIFIED phone numbers. Upgrade your account or verify the agent's cell in Twilio console → Verified Caller IDs."
            : undefined,
        });
      }
    }
  } catch (err) {
    checks.push({
      name: "Twilio Account",
      status: "fail",
      message: `Network error reaching Twilio API: ${err instanceof Error ? err.message : "unknown"}`,
    });
  }

  // ── 6. Verify the From number belongs to this account ──────────────
  const fromNumber = agentTwilio || creds.from;
  if (fromNumber) {
    try {
      const numbersUrl = `https://api.twilio.com/2010-04-01/Accounts/${creds.sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(fromNumber)}`;
      const res = await fetch(numbersUrl, {
        headers: { Authorization: creds.authHeader },
      });
      const data = await res.json();

      if (!res.ok) {
        checks.push({
          name: "From Number Ownership",
          status: "warn",
          message: `Could not verify ownership of ${fromNumber}`,
          detail: data.message ?? "API lookup failed.",
        });
      } else if (data.incoming_phone_numbers?.length === 0) {
        checks.push({
          name: "From Number Ownership",
          status: "fail",
          message: `${fromNumber} is NOT owned by this Twilio account`,
          detail: "The From number must be a number purchased in your Twilio console. Buy a number or update TWILIO_PHONE_NUMBER.",
        });
      } else {
        const num = data.incoming_phone_numbers[0];
        const voiceCapable = num.capabilities?.voice;
        if (!voiceCapable) {
          checks.push({
            name: "From Number Ownership",
            status: "fail",
            message: `${fromNumber} is owned but NOT voice-capable`,
            detail: "This number cannot make voice calls. Purchase a voice-enabled number in your Twilio console.",
          });
        } else {
          checks.push({
            name: "From Number Ownership",
            status: "pass",
            message: `${fromNumber} — owned, voice-capable ✓`,
          });
        }
      }
    } catch (err) {
      checks.push({
        name: "From Number Ownership",
        status: "warn",
        message: `Could not verify From number: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }
  }

  // ── 7. Test calling capability (Lookup API) ────────────────────────
  if (agentCell) {
    const digits = agentCell.replace(/\D/g, "");
    const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
    try {
      const lookupUrl = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`;
      const res = await fetch(lookupUrl, {
        headers: { Authorization: creds.authHeader },
      });
      const data = await res.json();

      if (!res.ok) {
        checks.push({
          name: "Agent Cell Lookup",
          status: "warn",
          message: `Could not look up ${e164}: ${data.message ?? `HTTP ${res.status}`}`,
          detail: "Lookup API may not be enabled. This doesn't prevent calls but means we can't verify the number.",
        });
      } else {
        const lineType = data.line_type_intelligence?.type ?? "unknown";
        checks.push({
          name: "Agent Cell Lookup",
          status: "pass",
          message: `${e164} is valid (type: ${lineType})`,
        });
      }
    } catch {
      checks.push({
        name: "Agent Cell Lookup",
        status: "warn",
        message: "Lookup API not reachable — non-blocking",
      });
    }
  }

  // ── 8. VoIP Configuration ──────────────────────────────────────────
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;

  if (!twimlAppSid) {
    checks.push({
      name: "VoIP Configuration",
      status: "fail",
      message: "TWILIO_TWIML_APP_SID not set — browser VoIP won't work",
      detail: "Run POST /api/twilio/setup to auto-create a TwiML App, then add the returned TWILIO_TWIML_APP_SID to your Vercel env vars.",
    });
  } else if (!apiKeySid) {
    checks.push({
      name: "VoIP Configuration",
      status: "warn",
      message: `TwiML App: ${twimlAppSid.slice(0, 6)}…${twimlAppSid.slice(-4)} — using Account SID as signing key (recommended: set TWILIO_API_KEY_SID)`,
      detail: "Run POST /api/twilio/setup to create a dedicated API Key for better security.",
    });
  } else {
    checks.push({
      name: "VoIP Configuration",
      status: "pass",
      message: `TwiML App: ${twimlAppSid.slice(0, 6)}…${twimlAppSid.slice(-4)} | API Key: ${apiKeySid.slice(0, 6)}…${apiKeySid.slice(-4)}`,
    });
  }

  // ── 9. Live Transcription (STT) ──────────────────────────────────
  const transcriptionUrl = process.env.TRANSCRIPTION_WS_URL;
  if (!transcriptionUrl) {
    checks.push({
      name: "Live Transcription (STT)",
      status: "warn",
      message: "TRANSCRIPTION_WS_URL not set — live notes will be empty during calls",
      detail: "Set TRANSCRIPTION_WS_URL to your WebSocket transcription server (e.g. wss://your-stt-server.fly.dev/media-stream). Deepgram or similar. The dialer's live notes panel requires this to populate during calls.",
    });
  } else if (!transcriptionUrl.startsWith("wss://") && !transcriptionUrl.startsWith("ws://")) {
    checks.push({
      name: "Live Transcription (STT)",
      status: "warn",
      message: `TRANSCRIPTION_WS_URL doesn't look like a WebSocket URL: ${transcriptionUrl.slice(0, 40)}…`,
      detail: "Expected format: wss://your-stt-server.example.com/media-stream",
    });
  } else {
    checks.push({
      name: "Live Transcription (STT)",
      status: "pass",
      message: `STT: ${transcriptionUrl.slice(0, 50)}${transcriptionUrl.length > 50 ? "…" : ""}`,
    });
  }

  // ── 10. OpenAI API Key ─────────────────────────────────────────────
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    checks.push({
      name: "OpenAI API Key",
      status: "warn",
      message: "OPENAI_API_KEY not set — AI pre-call briefs and post-call drafts will fail",
      detail: "Set OPENAI_API_KEY in Vercel environment variables for AI-powered features.",
    });
  } else {
    checks.push({
      name: "OpenAI API Key",
      status: "pass",
      message: `Key: ${openaiKey.slice(0, 7)}…${openaiKey.slice(-4)}`,
    });
  }

  // ── Overall status ─────────────────────────────────────────────────
  const hasFail = checks.some((c) => c.status === "fail");
  const hasWarn = checks.some((c) => c.status === "warn");
  const overall = hasFail ? "fail" : hasWarn ? "warn" : "pass";

  return NextResponse.json({ checks, overall });
}
