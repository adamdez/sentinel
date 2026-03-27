import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * POST /api/voice/vapi/disconnect-phone
 *
 * Removes the Twilio inbound number from Vapi (if imported) and resets
 * the Twilio phone number's Voice webhook to /api/twilio/inbound.
 *
 * This fixes the scenario where connect-phone was used to import the
 * main Dominion number into Vapi, causing Vapi to intercept all inbound
 * calls instead of Twilio's inbound cascade (Logan → Adam → Jeff).
 *
 * Safe to run multiple times — idempotent.
 */
export async function POST(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const vapiKey = process.env.VAPI_API_KEY;
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const results: {
    vapiPhoneRemoved: boolean;
    vapiPhoneId: string | null;
    vapiPreviousWebhook: string | null;
    twilioWebhookSet: boolean;
    twilioPhoneSid: string | null;
    twilioNewWebhook: string | null;
    errors: string[];
  } = {
    vapiPhoneRemoved: false,
    vapiPhoneId: null,
    vapiPreviousWebhook: null,
    twilioWebhookSet: false,
    twilioPhoneSid: null,
    twilioNewWebhook: null,
    errors: [],
  };

  // ── Step 1: Remove Twilio number from Vapi ──────────────────────────
  if (vapiKey && twilioPhone) {
    try {
      // List all phone numbers in Vapi
      const listRes = await fetch("https://api.vapi.ai/phone-number", {
        headers: { Authorization: `Bearer ${vapiKey}` },
      });

      if (!listRes.ok) {
        results.errors.push(`Vapi list phones failed: ${listRes.status}`);
      } else {
        const phones = await listRes.json();
        const normalizedTarget = twilioPhone.replace(/\D/g, "").slice(-10);

        // Find any Vapi phone number matching the Twilio inbound number
        const match = Array.isArray(phones)
          ? phones.find((p: Record<string, unknown>) => {
              const num = String(p.number ?? "").replace(/\D/g, "").slice(-10);
              return num === normalizedTarget;
            })
          : null;

        if (match) {
          results.vapiPhoneId = match.id as string;
          results.vapiPreviousWebhook = (match.serverUrl as string) ?? null;

          // Delete the phone number from Vapi
          const deleteRes = await fetch(`https://api.vapi.ai/phone-number/${match.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${vapiKey}` },
          });

          if (deleteRes.ok || deleteRes.status === 204) {
            results.vapiPhoneRemoved = true;
            console.log(`[disconnect-phone] Removed Twilio number ${twilioPhone} from Vapi (id: ${match.id})`);
          } else {
            const errText = await deleteRes.text();
            results.errors.push(`Vapi delete failed (${deleteRes.status}): ${errText}`);
          }
        } else {
          // Phone not found in Vapi — already clean
          results.vapiPhoneRemoved = true;
          console.log(`[disconnect-phone] Twilio number ${twilioPhone} not found in Vapi — already clean`);
        }
      }
    } catch (err) {
      results.errors.push(`Vapi error: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    results.errors.push("Missing VAPI_API_KEY or TWILIO_PHONE_NUMBER");
  }

  // ── Step 2: Reset Twilio phone webhook to /api/twilio/inbound ────────
  if (twilioSid && twilioAuth && twilioPhone && siteUrl) {
    const twilioAuthHeader = "Basic " + Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64");
    const targetWebhook = `${siteUrl}/api/twilio/inbound`;

    try {
      // List incoming phone numbers to find the SID
      const listRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(twilioPhone)}`,
        { headers: { Authorization: twilioAuthHeader } },
      );

      if (!listRes.ok) {
        results.errors.push(`Twilio list numbers failed: ${listRes.status}`);
      } else {
        const listData = await listRes.json();
        const phoneRecord = listData.incoming_phone_numbers?.[0];

        if (!phoneRecord) {
          results.errors.push(`Twilio number ${twilioPhone} not found in account`);
        } else {
          results.twilioPhoneSid = phoneRecord.sid;

          // Update the Voice URL to our inbound handler
          const updateRes = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers/${phoneRecord.sid}.json`,
            {
              method: "POST",
              headers: {
                Authorization: twilioAuthHeader,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                VoiceUrl: targetWebhook,
                VoiceMethod: "POST",
              }).toString(),
            },
          );

          if (updateRes.ok) {
            results.twilioWebhookSet = true;
            results.twilioNewWebhook = targetWebhook;
            console.log(`[disconnect-phone] Twilio webhook set to ${targetWebhook}`);
          } else {
            const errText = await updateRes.text();
            results.errors.push(`Twilio webhook update failed (${updateRes.status}): ${errText}`);
          }
        }
      }
    } catch (err) {
      results.errors.push(`Twilio error: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    if (!twilioSid || !twilioAuth) results.errors.push("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
    if (!siteUrl) results.errors.push("Missing NEXT_PUBLIC_SITE_URL");
  }

  const success = results.vapiPhoneRemoved && results.twilioWebhookSet && results.errors.length === 0;

  return NextResponse.json({
    success,
    ...results,
    message: success
      ? `Twilio number removed from Vapi and webhook set to ${results.twilioNewWebhook}. Inbound calls now route through Twilio cascade.`
      : `Partial fix — check errors: ${results.errors.join("; ")}`,
  });
}

/**
 * GET /api/voice/vapi/disconnect-phone
 * Diagnostic — check current state of Vapi phone numbers and Twilio webhook.
 */
export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const vapiKey = process.env.VAPI_API_KEY;
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  const diagnostic: Record<string, unknown> = {};

  // Check Vapi phone numbers
  if (vapiKey) {
    try {
      const res = await fetch("https://api.vapi.ai/phone-number", {
        headers: { Authorization: `Bearer ${vapiKey}` },
      });
      if (res.ok) {
        const phones = await res.json();
        const normalizedTarget = (twilioPhone ?? "").replace(/\D/g, "").slice(-10);
        const imported = Array.isArray(phones)
          ? phones.find((p: Record<string, unknown>) =>
              String(p.number ?? "").replace(/\D/g, "").slice(-10) === normalizedTarget
            )
          : null;
        diagnostic.vapiPhoneNumbers = Array.isArray(phones) ? phones.length : 0;
        diagnostic.twilioNumberInVapi = !!imported;
        diagnostic.vapiImportedPhone = imported ?? null;
      }
    } catch {
      diagnostic.vapiError = "Failed to query Vapi";
    }
  }

  // Check Twilio webhook
  if (twilioSid && twilioAuth && twilioPhone) {
    const twilioAuthHeader = "Basic " + Buffer.from(`${twilioSid}:${twilioAuth}`).toString("base64");
    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(twilioPhone)}`,
        { headers: { Authorization: twilioAuthHeader } },
      );
      if (res.ok) {
        const data = await res.json();
        const phone = data.incoming_phone_numbers?.[0];
        if (phone) {
          diagnostic.twilioPhoneSid = phone.sid;
          diagnostic.twilioVoiceUrl = phone.voice_url;
          diagnostic.twilioVoiceMethod = phone.voice_method;
          diagnostic.twilioCorrectWebhook = phone.voice_url?.includes("/api/twilio/inbound");
        }
      }
    } catch {
      diagnostic.twilioError = "Failed to query Twilio";
    }
  }

  return NextResponse.json(diagnostic);
}
