import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * POST /api/voice/vapi/connect-phone
 *
 * Programmatically imports the Twilio phone number into Vapi
 * and assigns it to the Sentinel assistant.
 *
 * This replaces the manual Vapi dashboard step.
 * Requires: VAPI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const vapiKey = process.env.VAPI_API_KEY;
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!vapiKey) return NextResponse.json({ error: "VAPI_API_KEY not set" }, { status: 500 });
  if (!twilioSid || !twilioAuth || !twilioPhone) {
    return NextResponse.json({ error: "Twilio credentials not set" }, { status: 500 });
  }

  try {
    // Step 1: Import Twilio number into Vapi
    const importRes = await fetch("https://api.vapi.ai/phone-number", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${vapiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "twilio",
        number: twilioPhone,
        twilioAccountSid: twilioSid,
        twilioAuthToken: twilioAuth,
      }),
    });

    if (!importRes.ok) {
      const err = await importRes.text();
      // If already imported, try to get existing
      if (err.includes("already") || importRes.status === 409) {
        // Phone already imported — proceed to assign
      } else {
        return NextResponse.json({ error: `Failed to import phone: ${err}` }, { status: 500 });
      }
    }

    const phoneData = importRes.ok ? await importRes.json() : null;
    const phoneId = phoneData?.id;

    // Step 2: Create or get assistant
    let assistantId = process.env.VAPI_ASSISTANT_ID;

    if (!assistantId) {
      // Create assistant via setup endpoint
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
      const setupRes = await fetch(`${siteUrl}/api/voice/vapi/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (setupRes.ok) {
        const setupData = await setupRes.json();
        assistantId = setupData.assistantId;
      }
    }

    // Step 3: Assign phone number to assistant (if we have both IDs)
    if (phoneId && assistantId) {
      await fetch(`https://api.vapi.ai/phone-number/${phoneId}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${vapiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assistantId,
          serverUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/api/voice/vapi/webhook`,
        }),
      });
    }

    return NextResponse.json({
      success: true,
      phoneId,
      assistantId,
      phoneNumber: twilioPhone,
      message: "Phone number imported and assigned to Vapi assistant",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/voice/vapi/connect-phone
 * Check current Vapi phone number status.
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const vapiKey = process.env.VAPI_API_KEY;
  if (!vapiKey) return NextResponse.json({ configured: false, reason: "VAPI_API_KEY not set" });

  try {
    const res = await fetch("https://api.vapi.ai/phone-number", {
      headers: { "Authorization": `Bearer ${vapiKey}` },
    });

    if (!res.ok) return NextResponse.json({ configured: false, reason: "Failed to query Vapi" });

    const phones = await res.json();
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
    const match = Array.isArray(phones)
      ? phones.find((p: Record<string, unknown>) => p.number === twilioPhone)
      : null;

    return NextResponse.json({
      configured: !!match,
      phoneNumbers: Array.isArray(phones) ? phones.length : 0,
      sentinelPhone: match ?? null,
      assistantId: match?.assistantId ?? process.env.VAPI_ASSISTANT_ID ?? null,
    });
  } catch {
    return NextResponse.json({ configured: false, reason: "Vapi API error" });
  }
}
