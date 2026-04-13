import { NextRequest, NextResponse, after } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { didInboundDialLegAnswer } from "@/lib/twilio-inbound-classification";
import { upsertJeffInteraction } from "@/lib/jeff-interactions";
import {
  parseInboundOperatorStep,
  resolveInboundRoutePlan,
} from "@/lib/twilio-inbound-routing";
import {
  getBusinessHoursStatus,
  getVoiceControlConfig,
  VOICE_CONTROL_AUDIO_ROUTE,
  VOICE_CONTROL_FALLBACK_TTS_VOICE,
  type VoiceControlConfig,
} from "@/lib/voice-control";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

const INBOUND_TRANSCRIPTION_STREAM_NAME = "sentinel-inbound-live-notes";
/**
 * POST /api/twilio/inbound
 *
 * Twilio webhook for INBOUND calls to the Dominion phone number.
 *
 * Flow:
 *   1. Ring Logan's browser (Twilio Client) for 20 seconds.
 *   2. If no answer, ring Adam's browser for 20 seconds.
 *   3. If no answer, send the caller to voicemail.
 *
 * NO cell phones. All calls handled in-browser or by voicemail fallback.
 *
 * Environment variables used:
 *   LOGAN_BROWSER_IDENTITY  — Logan's Twilio Client identity (email)
 *   ADAM_BROWSER_IDENTITY   — Adam's Twilio Client identity (email)
 *   TWILIO_PHONE_NUMBER     — The Dominion Twilio number (caller ID)
 *   VAPI_PHONE_NUMBER       — Legacy Jeff/Vapi number (still used only for transfer detection)
 *   NEXT_PUBLIC_SITE_URL    — Base URL for callback action URLs
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSiteUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (env) return env;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function buildVoicemailFallbackTwiml(input: {
  siteUrl: string;
  callLogId: string | null;
  leadName?: string | null;
  transferReason?: string | null;
  openingMessage?: string | null;
  prefixLines?: string[];
  voiceControl?: VoiceControlConfig;
}): string {
  const recordingAction = input.callLogId
    ? `${input.siteUrl}/api/twilio/voice/recording?callLogId=${encodeURIComponent(input.callLogId)}`
    : `${input.siteUrl}/api/twilio/voice/recording`;
  const leadLabel = input.leadName?.trim() ? ` for ${input.leadName.trim()}` : "";
  const transferLabel = input.transferReason?.trim() ? ` regarding ${input.transferReason.trim()}` : "";
  const voiceControl = input.voiceControl;
  const openingMessage = input.openingMessage?.trim()
    || voiceControl?.voicemailGreeting
    || "We missed your call. Please leave your name, number, and a short message after the tone, and we will call you back as soon as possible.";
  const noVoicemailMessage = voiceControl?.noVoicemailMessage?.trim()
    || "We did not receive a voicemail. Goodbye.";
  const ttsVoice = voiceControl?.ttsVoice?.trim() || VOICE_CONTROL_FALLBACK_TTS_VOICE;
  const uploadedGreetingUrl = voiceControl?.useUploadedGreeting && voiceControl.uploadedGreeting
    ? `${input.siteUrl}${VOICE_CONTROL_AUDIO_ROUTE}`
    : null;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    ...(input.prefixLines ?? []),
    ...(uploadedGreetingUrl
      ? [`  <Play>${uploadedGreetingUrl}</Play>`]
      : [`  <Say voice="${ttsVoice}">${openingMessage}</Say>`]),
    `  <Record maxLength="120" playBeep="true" trim="trim-silence" action="${recordingAction}" method="POST" />`,
    `  <Say voice="${ttsVoice}">${noVoicemailMessage}${leadLabel}${transferLabel}</Say>`,
    "</Response>",
  ].join("\n");
}

// Replicate nextBusinessMorningPacific locally to avoid importing publish-manager
function nextBusinessMorningPacific(): Date {
  const TZ = "America/Los_Angeles";
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? "0", 10);
  const year = get("year"); const month = get("month") - 1; const day = get("day");
  const pad = (n: number) => String(n).padStart(2, "0");
  const candidate = new Date(`${year}-${pad(month + 1)}-${pad(day)}T09:00:00-08:00`);
  let target = candidate <= now ? new Date(candidate.getTime() + 86_400_000) : candidate;
  const dow = target.getDay();
  if (dow === 0) target = new Date(target.getTime() + 86_400_000);
  if (dow === 6) target = new Date(target.getTime() + 2 * 86_400_000);
  return target;
}

async function getLeadOwnerContext(
  sb: ReturnType<typeof createServerClient>,
  leadId: string,
): Promise<{ assignedTo: string | null; ownerName: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lead } = await (sb.from("leads") as any)
    .select("assigned_to, property_id")
    .eq("id", leadId)
    .maybeSingle();

  let ownerName: string | null = null;
  if (lead?.property_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: property } = await (sb.from("properties") as any)
      .select("owner_name")
      .eq("id", lead.property_id)
      .maybeSingle();
    ownerName = property?.owner_name ?? null;
  }

  return {
    assignedTo: lead?.assigned_to ?? null,
    ownerName,
  };
}

async function resolveMissedCallContext(
  sb: ReturnType<typeof createServerClient>,
  phone: string,
  leadIdHint?: string | null,
): Promise<{
  leadId: string | null;
  leadName: string;
  assignedTo: string | null;
  intakeLeadId: string | null;
  propertyAddress: string | null;
  ownerName: string | null;
}> {
  const defaultLeadName = "Unknown caller";
  const { unifiedPhoneLookup } = await import("@/lib/dialer/phone-lookup");

  const phoneContext = phone
    ? await unifiedPhoneLookup(phone, sb)
    : null;

  let leadId = leadIdHint ?? phoneContext?.leadId ?? null;
  let leadName = phoneContext?.ownerName ?? defaultLeadName;
  let assignedTo: string | null = null;
  let ownerName = phoneContext?.ownerName ?? null;
  let propertyAddress = phoneContext?.propertyAddress ?? null;
  const intakeLeadId = phoneContext?.intakeLeadId ?? null;

  if (leadId) {
    const leadOwnerContext = await getLeadOwnerContext(sb, leadId);
    assignedTo = leadOwnerContext.assignedTo ?? assignedTo;
    leadName = leadOwnerContext.ownerName ?? leadName;
    ownerName = leadOwnerContext.ownerName ?? ownerName;
  }

  return {
    leadId,
    leadName,
    assignedTo,
    intakeLeadId,
    propertyAddress,
    ownerName,
  };
}

// ── Inbound TwiML response ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const siteUrl = buildSiteUrl(req);
  const voiceControl = await getVoiceControlConfig();

  // ── type=chain_step: Browser → Browser → Jeff call chain ─────────────────
  if (type === "chain_step") {
    const step = url.searchParams.get("step") ?? "";
    const isTransfer = url.searchParams.get("transfer") === "1";
    const transferVsid = url.searchParams.get("vsid") ?? "";
    const originalFrom = url.searchParams.get("originalFrom") ?? "";
    const originalTo = url.searchParams.get("originalTo") ?? "";
    const routePlan = resolveInboundRoutePlan({
      toNumber: originalTo,
      primaryStepOverride: parseInboundOperatorStep(url.searchParams.get("primary")),
    });
    const currentStep = parseInboundOperatorStep(step) ?? routePlan.primaryStep;
    const chainCallLogId = url.searchParams.get("callLogId");
    const formData = await req.formData();
    const dialStatus = formData.get("DialCallStatus")?.toString() ?? "";
    const fromNumber = formData.get("From")?.toString() ?? "";
    const callSid = formData.get("CallSid")?.toString() ?? "";

    const twilioNumber = process.env.TWILIO_PHONE_NUMBER ?? "";

    console.log(`[inbound] chain_step=${step} dialStatus=${dialStatus} from=${fromNumber} sid=${callSid}${isTransfer ? " (vapi-transfer)" : ""}`);

    const dialDuration = formData.get("DialCallDuration")?.toString() ?? null;

    // Only treat the browser leg as answered when Twilio shows a real connected duration.
    if (didInboundDialLegAnswer(dialStatus, dialDuration)) {
      after(async () => {
        try {
          await handleAnsweredInbound({
            fromNumber,
            callSid,
            dialDuration,
            answeredUserId: currentStep === routePlan.secondaryStep
              ? routePlan.secondaryUserId
              : routePlan.primaryUserId,
          });
        } catch (err) {
          console.error("[inbound] after() handleAnsweredInbound failed:", err);
        }
      });
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Caller hung up while ringing — skip remaining chain steps, go straight to missed handler.
    // Without this, "canceled" falls through and tries the next Dial which also fails,
    // wasting time and risking the missed notification never firing.
    if (dialStatus === "canceled") {
      const missedFrom = isTransfer ? (originalFrom || fromNumber) : (originalFrom || fromNumber);
      console.log(`[inbound] Caller hung up (canceled) during ${step} — firing missed handler immediately`);

      after(async () => {
        try {
          if (isTransfer) {
            await handleMissedTransfer({ originalFrom: missedFrom, callSid, voiceSessionId: transferVsid, siteUrl });
          } else {
            await handleMissedInbound({
              fromNumber: missedFrom,
              callSid,
              siteUrl,
              fallbackUserId: routePlan.primaryUserId,
              routeMeta: {
                dialedToNumber: originalTo || null,
                routePrimary: routePlan.primaryStep,
                routeSecondary: routePlan.secondaryStep,
                routeReason: "browser_chain_canceled",
                callEndReason: "caller_canceled",
              },
            });
          }
        } catch (err) {
          console.error("[inbound] after() canceled handler failed:", err);
        }
      });

      return new NextResponse(
        buildVoicemailFallbackTwiml({
          siteUrl,
          callLogId: chainCallLogId,
          transferReason: isTransfer ? "your earlier conversation with our team" : null,
          voiceControl,
        }),
        { headers: { "Content-Type": "text/xml" } },
      );
    }

    // Nobody answered — move to next step
    // Carry sessionId/callLogId through the chain for Deepgram stream
    const chainSessionId = url.searchParams.get("sessionId") ?? "";
    const transcriptionUrl = process.env.TRANSCRIPTION_WS_URL;
    const hasDeepgram = !!process.env.DEEPGRAM_API_KEY;
    const stopInboundStreamLines = transcriptionUrl && hasDeepgram && chainSessionId
      ? [
          "  <Stop>",
          `    <Stream name="${INBOUND_TRANSCRIPTION_STREAM_NAME}" />`,
          "  </Stop>",
        ]
      : [];
    const safeChainCallLogId = chainCallLogId ?? "";
    const chainParams2 = chainSessionId
      ? `&amp;sessionId=${chainSessionId}&amp;callLogId=${encodeURIComponent(safeChainCallLogId)}`
      : "";
    const routeParams = [
      `&amp;primary=${routePlan.primaryStep}`,
      originalTo ? `&amp;originalTo=${encodeURIComponent(originalTo)}` : "",
    ].join("");
    // Carry transfer flag through the chain so subsequent steps know not to loop back to Vapi
    const transferParams = isTransfer ? `&amp;transfer=1&amp;vsid=${encodeURIComponent(transferVsid)}&amp;originalFrom=${encodeURIComponent(originalFrom)}` : "";

    let nextTwiml: string;

    // For non-transfer chains, originalFrom carries the actual caller's phone number
    // so Adam's browser (and Jeff) see the real caller, not the Twilio number.
    // For transfer chains, originalFrom is already set from the transfer detection.
    const callerIdForBrowser = originalFrom || twilioNumber;
    const originalFromParam = originalFrom ? `&amp;originalFrom=${encodeURIComponent(originalFrom)}` : "";

    if (currentStep === routePlan.primaryStep && routePlan.secondaryIdentity) {
      // Logan's browser didn't answer → try Adam's browser for 20 seconds
      console.log(`[inbound] Logan browser missed → trying Adam browser${isTransfer ? " (transfer cascade)" : ""}`);
      nextTwiml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<Response>",
        `  <Dial callerId="${callerIdForBrowser}" timeout="20" action="${siteUrl}/api/twilio/inbound?type=chain_step&amp;step=${routePlan.secondaryStep}${originalFromParam}${chainParams2}${routeParams}${transferParams}" method="POST">`,
        `    <Client>${routePlan.secondaryIdentity}</Client>`,
        "  </Dial>",
        "</Response>",
      ].join("\n");
    } else {
      // No more fallbacks — play message, log missed call
      // For Vapi transfers: both Logan and Adam missed → book callback
      const missedFrom = isTransfer ? (originalFrom || fromNumber) : fromNumber;
      console.log(`[inbound] All chain steps exhausted — missed call from ${missedFrom}${isTransfer ? " (transfer cascade exhausted)" : ""}`);

      after(async () => {
        try {
          if (isTransfer) {
            await handleMissedTransfer({ originalFrom: missedFrom, callSid, voiceSessionId: transferVsid, siteUrl });
          } else {
            await handleMissedInbound({
              fromNumber: missedFrom,
              callSid,
              siteUrl,
              fallbackUserId: routePlan.primaryUserId,
              routeMeta: {
                dialedToNumber: originalTo || null,
                routePrimary: routePlan.primaryStep,
                routeSecondary: routePlan.secondaryStep,
                routeReason: "browser_chain_exhausted",
                callEndReason: "no_answer",
              },
            });
          }
        } catch (err) {
          console.error("[inbound] after() missed handler failed:", err);
        }
      });

      nextTwiml = buildVoicemailFallbackTwiml({
        siteUrl,
        callLogId: safeChainCallLogId || null,
        transferReason: isTransfer ? "your earlier conversation with our team" : null,
        prefixLines: stopInboundStreamLines,
        voiceControl,
      });
    }

    return new NextResponse(nextTwiml, {
      headers: { "Content-Type": "text/xml" },
    });
  }

  // ── type=call_status: status callback for the inbound leg ────────────────
  if (type === "call_status") {
    const formData = await req.formData();
    const callStatus = formData.get("CallStatus")?.toString() ?? "";
    const fromNumber = formData.get("From")?.toString() ?? "";
    const callSid    = formData.get("CallSid")?.toString()  ?? "";
    const dialStatus = formData.get("DialCallStatus")?.toString() ?? "";
    const callLogId = url.searchParams.get("callLogId");
    const routePlan = resolveInboundRoutePlan({
      toNumber: url.searchParams.get("originalTo"),
      primaryStepOverride: parseInboundOperatorStep(url.searchParams.get("primary")),
    });
    // DialCallDuration is present when the Dial action fires after the leg ends
    const dialDuration = formData.get("DialCallDuration")?.toString() ?? null;

    // Determine if the operator answered (dial leg reached in-progress / completed with duration)
    // Twilio Dial action fires with DialCallStatus=completed when the forwarded call ends.
    // We treat a completed dial with any duration as "was answered".
    const wasAnswered = didInboundDialLegAnswer(dialStatus, dialDuration);

    // Determine if this is a missed call:
    // - call_status=no-answer on the initial inbound leg means caller hung up before we answered
    // - dial_complete with dialStatus=no-answer|busy|failed means we tried to forward but failed
    // - dialStatus=canceled means the caller hung up while the B-leg was still ringing
    const isMissed =
      callStatus === "no-answer" ||
      callStatus === "busy"      ||
      callStatus === "canceled"  ||
      dialStatus === "no-answer" ||
      dialStatus === "busy"      ||
      dialStatus === "failed"    ||
      dialStatus === "canceled"  ||
      (dialStatus === "completed" && !wasAnswered);

    const vapiRoute = url.searchParams.get("vapiRoute");

    after(async () => {
      try {
        if (wasAnswered && vapiRoute === "operator_missed") {
          await handleMissedInbound({
            fromNumber,
            callSid,
            siteUrl,
            fallbackUserId: routePlan.primaryUserId,
            routeMeta: {
              dialedToNumber: url.searchParams.get("originalTo"),
              routePrimary: routePlan.primaryStep,
              routeSecondary: routePlan.secondaryStep,
              routeReason: "answered_by_jeff_after_browser_miss",
              callEndReason: "answered_by_jeff",
            },
            sendSellerSms: false,
          });
        } else if (wasAnswered) {
          await handleAnsweredInbound({
            fromNumber,
            callSid,
            dialDuration,
            answeredUserId: routePlan.primaryUserId,
          });
        } else if (isMissed) {
          await handleMissedInbound({
            fromNumber,
            callSid,
            siteUrl,
            fallbackUserId: routePlan.primaryUserId,
            routeMeta: {
              dialedToNumber: url.searchParams.get("originalTo"),
              routePrimary: routePlan.primaryStep,
              routeSecondary: routePlan.secondaryStep,
              routeReason: vapiRoute === "after_hours" ? "after_hours_missed" : "call_status_missed",
              callEndReason: dialStatus || callStatus || "no_answer",
            },
          });
        }
      } catch (err) {
        console.error("[inbound] after() call_status handler failed:", err);
      }
    });

    if (isMissed) {
      return new NextResponse(
        buildVoicemailFallbackTwiml({ siteUrl, callLogId, voiceControl }),
        { status: 200, headers: { "Content-Type": "text/xml" } },
      );
    }

    return new NextResponse("", { status: 204 });
  }

  // ── Initial inbound webhook: return TwiML with call chain ──────────────────
  // Chain: Logan browser (20s) → Adam browser (20s) → voicemail fallback
  // No cell phones. All calls ring in the Sentinel dialer browser UI.
  //
  // TRANSFER CASCADE: When a legacy Jeff/Vapi transfer comes back here, From will
  // be the Vapi phone number. We detect this and use a modified chain that
  // skips the fallback step (would loop). Instead: Logan → Adam → missed.
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER ?? "";

  // Parse inbound caller info
  const formData = await req.formData();
  const fromNumber = formData.get("From")?.toString() ?? "";
  const callSid = formData.get("CallSid")?.toString() ?? "";
  const toNumber = formData.get("To")?.toString() ?? "";
  const routePlan = resolveInboundRoutePlan({ toNumber });

  // ── Detect Vapi transfer ──────────────────────────────────────────────
  const vapiNumber = (process.env.VAPI_PHONE_NUMBER ?? "").trim();
  const fromDigits = fromNumber.replace(/\D/g, "");
  const vapiDigits = vapiNumber.replace(/\D/g, "");
  const isVapiTransfer = fromDigits.length >= 10 && vapiDigits.length >= 10
    && fromDigits.slice(-10) === vapiDigits.slice(-10);

  if (isVapiTransfer) {
    // This is a warm transfer from Jeff (Vapi AI).
    // Look up the recent transferred voice_session to get original caller info.
    // Use a 2-second timeout — if Supabase is slow, fall back to Twilio number as callerId.
    // The call still rings the browser either way; we just lose the original caller display.
    let transferSession: { id: string; from_number: string; lead_id: string | null; transfer_brief: unknown } | null = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const sbTransfer = createServerClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sbTransfer.from("voice_sessions") as any)
        .select("id, from_number, lead_id, transfer_brief")
        .eq("status", "transferred")
        .gte("created_at", twoMinAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .abortSignal(controller.signal)
        .maybeSingle();
      clearTimeout(timer);
      transferSession = data;
    } catch (err) {
      console.warn("[inbound] Vapi transfer lookup timed out or failed — using fallback callerId:", err);
    }

    const originalFrom = transferSession?.from_number ?? fromNumber;
    const vsid = transferSession?.id ?? "";
    const transferRoutePlan = resolveInboundRoutePlan({ primaryStepOverride: "logan" });

    console.log("[inbound] Vapi transfer detected:", {
      originalCaller: originalFrom ? `***${originalFrom.slice(-4)}` : "unknown",
      voiceSessionId: vsid ? vsid.slice(0, 8) : "none",
      callSid,
    });

    // After hours: Jeff shouldn't be transferring, but if the AI hallucinates
    // a transfer anyway, skip the ring cascade — nobody is at their desk.
    // Go straight to missed-transfer handler (books callback + SMS alerts).
    const transferHours = getBusinessHoursStatus(voiceControl.businessHours);
    if (!transferHours.isOpen) {
      console.log(`[inbound] After-hours Vapi transfer — skipping ring cascade, booking callback`);
      after(async () => {
        try {
          await handleMissedTransfer({ originalFrom, callSid, voiceSessionId: vsid, siteUrl });
        } catch (err) {
          console.error("[inbound] after() after-hours transfer handler failed:", err);
        }
      });
      const afterHoursTwiml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<Response>",
        `  <Say voice="Polly.Joanna">Our team is away right now. We have your information and will call you back ${transferHours.nextOpenTime}. Thank you for calling Dominion Home Deals.</Say>`,
        "</Response>",
      ].join("\n");
      return new NextResponse(afterHoursTwiml, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Transfer cascade TwiML: Logan (20s) → Adam (20s) → missed handler
    // No Vapi fallback step — Jeff is the one transferring, so looping back would be infinite.
    // callerId = originalFrom so Logan's browser shows the actual caller's number
    // (enables phone lookup, client file auto-pull, and live coaching context)
    const transferTwiml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      `  <Dial callerId="${originalFrom || twilioNumber}" timeout="20" action="${siteUrl}/api/twilio/inbound?type=chain_step&amp;step=logan&amp;transfer=1&amp;vsid=${encodeURIComponent(vsid)}&amp;originalFrom=${encodeURIComponent(originalFrom)}&amp;primary=${transferRoutePlan.primaryStep}" method="POST">`,
      `    <Client>${transferRoutePlan.primaryIdentity}</Client>`,
      "  </Dial>",
      "</Response>",
    ].join("\n");

    return new NextResponse(transferTwiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  // ── Pre-generate UUIDs so TwiML can reference them without waiting for DB ──
  // This is the critical fix: TwiML is returned INSTANTLY, DB work happens in after().
  // Supabase/Postgres accept client-supplied UUIDs for id columns.
  const sessionId = crypto.randomUUID();
  const callLogId = crypto.randomUUID();

  // Build <Stream> for Deepgram transcription (same pattern as outbound)
  const transcriptionUrl = process.env.TRANSCRIPTION_WS_URL;
  const hasDeepgram = !!process.env.DEEPGRAM_API_KEY;
  const streamLines = transcriptionUrl && hasDeepgram
    ? [
        "  <Start>",
        `    <Stream name="${INBOUND_TRANSCRIPTION_STREAM_NAME}" url="${transcriptionUrl}" track="both_tracks">`,
        `      <Parameter name="callLogId" value="${callLogId}" />`,
        `      <Parameter name="sessionId" value="${sessionId}" />`,
        `      <Parameter name="userId" value="${routePlan.primaryUserId}" />`,
        "    </Stream>",
        "  </Start>",
      ]
    : [];

  // After-hours: skip browser ring cascade and send directly to voicemail.
  // During hours: Ring Logan's browser (20s) → chain continues to Adam → voicemail.
  const hours = getBusinessHoursStatus(voiceControl.businessHours);
  const chainParams = [
    `&amp;sessionId=${sessionId}`,
    `&amp;callLogId=${callLogId}`,
    `&amp;primary=${routePlan.primaryStep}`,
    toNumber ? `&amp;originalTo=${encodeURIComponent(toNumber)}` : "",
  ].join("");

  let twiml: string;

  if (!hours.isOpen) {
    console.log(`[inbound] After-hours (next open: ${hours.nextOpenTime}) — directing caller to voicemail`);
    after(async () => {
      try {
        await handleMissedInbound({
          fromNumber,
          callSid,
          siteUrl,
          fallbackUserId: routePlan.primaryUserId,
          routeMeta: {
            dialedToNumber: toNumber || null,
            routePrimary: routePlan.primaryStep,
            routeSecondary: routePlan.secondaryStep,
            routeReason: "after_hours_voicemail",
            callEndReason: "after_hours",
          },
        });
      } catch (err) {
        console.error("[inbound] after() after-hours voicemail handler failed:", err);
      }
    });
    twiml = buildVoicemailFallbackTwiml({
      siteUrl,
      callLogId,
      openingMessage: `Our team is away right now. Please leave your name, number, and a short message after the tone, and we will call you back ${hours.nextOpenTime}.`,
      voiceControl,
    });
  } else {
    // During hours — ring Logan's browser first
    // callerId = fromNumber so Logan's browser shows the actual caller's phone number
    // (enables phone lookup, client file auto-pull, and live coaching context)
    // Thread originalFrom through chain steps so Adam's browser also sees the real caller
    const originalFromParam = fromNumber ? `&amp;originalFrom=${encodeURIComponent(fromNumber)}` : "";
    twiml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<Response>",
      ...streamLines,
      `  <Dial callerId="${fromNumber || twilioNumber}" timeout="20" action="${siteUrl}/api/twilio/inbound?type=chain_step&amp;step=${routePlan.primaryStep}${originalFromParam}${chainParams}" method="POST">`,
      `    <Client>${routePlan.primaryIdentity}</Client>`,
      "  </Dial>",
      "</Response>",
    ].join("\n");
  }

  console.log("[inbound] TwiML returned in <50ms, DB work deferred to after():", {
    from: fromNumber ? `***${fromNumber.slice(-4)}` : "none",
    to: toNumber ? `***${toNumber.slice(-4)}` : "none",
    primary: routePlan.primaryStep,
    sessionId: sessionId.slice(0, 8),
    callLogId: callLogId.slice(0, 8),
  });

  // ── Schedule ALL database work to run AFTER the TwiML response is sent ──
  // This ensures the call ALWAYS rings the browser, even if Supabase is down.
  after(async () => {
    try {
      const sbAfter = createServerClient();

      // 1. Match caller to an existing lead via unified phone lookup (all phone tables)
      let matchedLeadId: string | null = null;
      if (fromNumber) {
        const { unifiedPhoneLookup } = await import("@/lib/dialer/phone-lookup");
        const match = await unifiedPhoneLookup(fromNumber, sbAfter);
        matchedLeadId = match.leadId;
      }

      // 2. Create call_session with the pre-generated UUID
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: sessErr } = await (sbAfter.from("call_sessions") as any)
        .insert({
          id: sessionId,
          lead_id: matchedLeadId,
          user_id: routePlan.primaryUserId,
          twilio_sid: callSid,
          phone_dialed: fromNumber || "unknown",
          status: "ringing",
        });
      if (sessErr) console.error("[inbound] after() call_sessions insert failed:", sessErr.message);

      // 3. Create calls_log with the pre-generated UUID
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: clErr } = await (sbAfter.from("calls_log") as any)
        .insert({
          id: callLogId,
          lead_id: matchedLeadId,
          user_id: routePlan.primaryUserId,
          phone_dialed: fromNumber || null,
          twilio_sid: callSid,
          disposition: "in_progress",
          direction: "inbound",
          dialer_session_id: sessionId,
        });
      if (clErr) console.error("[inbound] after() calls_log insert failed:", clErr.message);

      // 4. If truly unknown caller, create a draft contact so they're findable next time
      if (!matchedLeadId && fromNumber) {
        try {
          const { upsertContact } = await import("@/lib/upsert-contact");
          await upsertContact(sbAfter, {
            phone: fromNumber,
            first_name: "Unknown",
            last_name: "Caller",
            source: "inbound_unknown",
            contact_type: "unknown_inbound",
          });
          console.log("[inbound] Draft contact created for unknown caller:", fromNumber.slice(-4));
        } catch (contactErr) {
          // Non-fatal — don't let contact creation failure break call logging
          console.error("[inbound] Draft contact creation failed:", contactErr);
        }
      }

      console.log("[inbound] after() DB work complete:", {
        sessionId: sessionId.slice(0, 8),
        callLogId: callLogId.slice(0, 8),
        matchedLead: matchedLeadId?.slice(0, 8) ?? "none",
      });
    } catch (err) {
      console.error("[inbound] after() DB work failed:", err);
    }
  });

  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

type InboundOperatorStep = "logan" | "adam";

interface MissedInboundRouteMeta {
  dialedToNumber?: string | null;
  routePrimary?: InboundOperatorStep | null;
  routeSecondary?: InboundOperatorStep | null;
  routeReason?: string | null;
  callEndReason?: string | null;
}

async function upsertMissedCallsLog(input: {
  sb: ReturnType<typeof createServerClient>;
  callSid: string;
  fromNumber: string;
  leadId: string | null;
  fallbackUserId: string | null;
}): Promise<{ callLogId: string | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: updatedRows, error: updateErr } = await (input.sb.from("calls_log") as any)
    .update({
      disposition: "missed",
      lead_id: input.leadId,
    })
    .eq("twilio_sid", input.callSid)
    .eq("direction", "inbound")
    .in("disposition", ["in_progress", "initiating", "ringing_prospect", "completed"])
    .select("id")
    .limit(1);

  if (updateErr) {
    console.error("[inbound] calls_log missed update failed:", updateErr.message);
  }

  const updatedId = Array.isArray(updatedRows) && updatedRows.length > 0
    ? (updatedRows[0]?.id as string | null) ?? null
    : null;

  if (updatedId) {
    return { callLogId: updatedId };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insertedRows, error: insertErr } = await (input.sb.from("calls_log") as any)
    .insert({
      lead_id: input.leadId,
      user_id: input.fallbackUserId,
      phone_dialed: input.fromNumber || null,
      twilio_sid: input.callSid,
      disposition: "missed",
      direction: "inbound",
    })
    .select("id")
    .limit(1);

  if (insertErr) {
    console.error("[inbound] calls_log missed backfill insert failed:", insertErr.message);
    return { callLogId: null };
  }

  const insertedId = Array.isArray(insertedRows) && insertedRows.length > 0
    ? (insertedRows[0]?.id as string | null) ?? null
    : null;

  return { callLogId: insertedId };
}

async function hasRecentSellerFacingRecoverySMS(
  sb: ReturnType<typeof createServerClient>,
  to: string,
  sinceIso: string,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (sb.from("sms_messages") as any)
    .select("body, created_at")
    .eq("direction", "outbound")
    .eq("phone", to)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[inbound] recent seller SMS lookup failed:", error.message);
    return false;
  }

  const rows = (data ?? []) as Array<{ body?: string | null }>;
  return rows.some((row) => {
    const body = (row.body ?? "").toLowerCase();
    return body.includes("thanks for calling dominion home deals")
      || body.includes("we tried to connect you")
      || body.includes("we missed your call at dominion home deals");
  });
}

// ── handleMissedInbound ───────────────────────────────────────────────────────
// Core missed-call recovery logic.
// 1. Look up lead by phone number (best effort — won't always match).
// 2. Create a high-priority callback task on the matched lead (or unlinked if no match).
// 3. Write an inbound.missed dialer_event with full context.

async function persistJeffAnsweredPlaceholder(input: {
  leadId: string | null;
  callLogId: string | null;
  taskId: string | null;
  taskAssignee: string | null;
  fromNumber: string;
  leadName: string;
  ownerName: string | null;
  propertyAddress: string | null;
  routeMeta?: MissedInboundRouteMeta;
  callSid: string;
}) {
  const routeReason = input.routeMeta?.routeReason ?? null;
  const callEndReason = input.routeMeta?.callEndReason ?? null;
  const jeffAnswered =
    routeReason === "answered_by_jeff_after_browser_miss" ||
    callEndReason === "answered_by_jeff";

  if (!jeffAnswered) return;

  const placeholderVoiceSessionId = input.callLogId ?? input.taskId;
  if (!placeholderVoiceSessionId) return;

  try {
    await upsertJeffInteraction({
      voiceSessionId: placeholderVoiceSessionId,
      leadId: input.leadId,
      callsLogId: input.callLogId,
      direction: "inbound",
      callerPhone: input.fromNumber || null,
      callerName: input.ownerName ?? input.leadName ?? null,
      propertyAddress: input.propertyAddress,
      interactionType: "follow_up_needed",
      status: "needs_review",
      summary: "Jeff answered this inbound call, but the conversation notes did not persist. Review the Jeff inbound pipeline for this call.",
      callbackRequested: false,
      callbackDueAt: null,
      callbackTimingText: null,
      transferOutcome: "jeff_answered_notes_missing",
      assignedTo: input.taskAssignee,
      metadata: {
        placeholder: true,
        persistence_missing: true,
        route_reason: routeReason,
        call_end_reason: callEndReason,
        call_sid: input.callSid,
      },
    });
  } catch (error) {
    console.error("[inbound] Jeff placeholder persistence failed:", error);
  }
}

async function handleMissedInbound({
  fromNumber,
  callSid,
  siteUrl: _siteUrl,
  fallbackUserId,
  routeMeta,
  sendSellerSms = true,
}: {
  fromNumber: string;
  callSid: string;
  siteUrl: string;
  fallbackUserId?: string | null;
  routeMeta?: MissedInboundRouteMeta;
  sendSellerSms?: boolean;
}) {
  const sb = createServerClient();
  const now = new Date();

  // ── 1. Match lead by phone via unified lookup (all phone tables) ──────────
  const {
    leadId,
    leadName,
    assignedTo,
    intakeLeadId,
    propertyAddress,
    ownerName,
  } = await resolveMissedCallContext(sb, fromNumber);

  // ── 2. Create urgent callback task ────────────────────────────────────────
  const dueAt = nextBusinessMorningPacific();
  // Missed inbounds get priority 3 (higher urgency than regular follow-up)
  const taskTitle = leadId
    ? `⚡ Missed inbound — call back ${leadName} (${fromNumber})`
    : `⚡ Missed inbound — unknown caller ${fromNumber}`;

  let taskId: string | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const defaultFallbackUserId = process.env.LOGAN_USER_ID ?? "0737e969-2908-4bd6-90bd-7a4380456811";
  const taskAssignee = assignedTo ?? fallbackUserId ?? defaultFallbackUserId;
  const { data: taskRow, error: taskErr } = await (sb.from("tasks") as any)
    .insert({
      title: taskTitle,
      lead_id: leadId,
      assigned_to: taskAssignee,
      due_at: dueAt.toISOString(),
      status: "pending",
      priority: 3,
      notes: `Inbound call missed at ${now.toISOString()}. Caller: ${fromNumber}. Twilio SID: ${callSid}.`,
    })
    .select("id")
    .single();

  if (taskErr) {
    console.error("[inbound] Task creation failed:", taskErr.message);
  } else {
    taskId = taskRow?.id ?? null;
  }

  const { callLogId } = await upsertMissedCallsLog({
    sb,
    callSid,
    fromNumber,
    leadId,
    fallbackUserId: taskAssignee,
  });
  await persistJeffAnsweredPlaceholder({
    leadId,
    callLogId,
    taskId,
    taskAssignee,
    fromNumber,
    leadName,
    ownerName,
    propertyAddress,
    routeMeta,
    callSid,
  });

  // ── 3. Write inbound.missed dialer_event ──────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: eventErr } = await (sb.from("dialer_events") as any)
    .insert({
      event_type: "inbound.missed",
      user_id: taskAssignee,
      lead_id: leadId,
      session_id: null,
      task_id: taskId,
      metadata: {
        from_number: fromNumber,
        call_sid: callSid,
        lead_matched: !!leadId,
        task_due_at: dueAt.toISOString(),
        missed_at: now.toISOString(),
        dialed_to_number: routeMeta?.dialedToNumber ?? null,
        route_primary: routeMeta?.routePrimary ?? null,
        route_secondary: routeMeta?.routeSecondary ?? null,
        route_reason: routeMeta?.routeReason ?? null,
        call_end_reason: routeMeta?.callEndReason ?? null,
        intake_lead_id: intakeLeadId,
        property_address: propertyAddress,
        owner_name: ownerName,
        calls_log_id: callLogId,
      },
    });

  if (eventErr) {
    console.error("[inbound] dialer_events write failed:", eventErr.message);
  }

  // ── Update calls_log disposition from in_progress → missed ─────────────
  // ── 4. SMS both operators — missed inbound call ───────────────────────────
  try {
    const { sendDirectSMS } = await import("@/providers/voice/vapi-sms");
    const loganCell = process.env.TWILIO_FORWARD_TO_CELL;
    const adamCell = process.env.ADAM_CELL;
    const time = now.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
    const msg = `MISSED CALL: ${leadName} (${fromNumber}) at ${time}. Call back ASAP!`;

    if (loganCell) sendDirectSMS(loganCell, msg).catch(() => {});
    if (adamCell) sendDirectSMS(adamCell, msg).catch(() => {});
    console.log("[inbound] Missed call SMS sent to operators");
  } catch (smsErr) {
    console.error("[inbound] Missed call SMS failed:", smsErr);
  }

  if (sendSellerSms && fromNumber) {
    try {
      const recentWindowStart = new Date(now.getTime() - 20 * 60_000).toISOString();
      const alreadyMessaged = await hasRecentSellerFacingRecoverySMS(sb, fromNumber, recentWindowStart);
      if (!alreadyMessaged) {
        const { sendMissedInboundSMS } = await import("@/providers/voice/vapi-sms");
        await sendMissedInboundSMS({
          to: fromNumber,
          callerName: ownerName ?? null,
          leadId,
        });
      }
    } catch (smsErr) {
      console.error("[inbound] Seller missed-call SMS failed:", smsErr);
    }
  }

  console.log("[inbound] Missed inbound handled:", {
    fromNumber: fromNumber ? `***${fromNumber.slice(-4)}` : "none",
    taskAssignee: taskAssignee ? `${taskAssignee.slice(0, 8)}...` : "none",
    leadId: leadId ? `${leadId.slice(0, 8)}…` : "no match",
    taskId: taskId ? `${taskId.slice(0, 8)}…` : "failed",
  });
}

// ── handleAnsweredInbound ─────────────────────────────────────────────────────
// Fired when the operator actually answered the forwarded call.
// 1. Look up lead by phone (best effort).
// 2. Write an inbound.answered dialer_event — this surfaces on the live page.

async function handleAnsweredInbound({
  fromNumber,
  callSid,
  dialDuration,
  answeredUserId,
}: {
  fromNumber: string;
  callSid: string;
  dialDuration: string | null;
  answeredUserId?: string | null;
}) {
  const sb = createServerClient();
  const now = new Date();

  // Match lead by phone via unified lookup (all phone tables)
  let leadId: string | null = null;
  if (fromNumber) {
    const { unifiedPhoneLookup } = await import("@/lib/dialer/phone-lookup");
    const match = await unifiedPhoneLookup(fromNumber, sb);
    leadId = match.leadId;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: eventErr } = await (sb.from("dialer_events") as any)
    .insert({
      event_type: "inbound.answered",
      user_id: answeredUserId ?? (process.env.LOGAN_USER_ID ?? "0737e969-2908-4bd6-90bd-7a4380456811"),
      lead_id: leadId,
      session_id: null,
      task_id: null,
      metadata: {
        from_number: fromNumber,
        call_sid: callSid,
        dial_duration_sec: dialDuration ? parseInt(dialDuration) : null,
        lead_matched: !!leadId,
        answered_at: now.toISOString(),
      },
    });

  if (eventErr) {
    console.error("[inbound] inbound.answered event write failed:", eventErr.message);
  }

  // ── Update calls_log disposition from in_progress → completed ──────────
  const durationSec = dialDuration ? parseInt(dialDuration) : 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: logErr } = await (sb.from("calls_log") as any)
    .update({
      disposition: "completed",
      duration_sec: durationSec,
      lead_id: leadId,
    })
    .eq("twilio_sid", callSid)
    .eq("direction", "inbound")
    .in("disposition", ["in_progress", "initiating", "ringing_prospect"]);

  if (logErr) {
    console.error("[inbound] calls_log answered update failed:", logErr.message);
  }

  console.log("[inbound] Answered inbound recorded:", {
    fromNumber: fromNumber ? `***${fromNumber.slice(-4)}` : "none",
    leadId: leadId ? `${leadId.slice(0, 8)}…` : "no match",
    durationSec: dialDuration,
  });
}

// ── handleMissedTransfer ──────────────────────────────────────────────────
// Fired when a Vapi transfer cascade exhausts all steps (Logan + Adam both missed).
// Creates a priority callback task, sends SMS to both operators, updates voice_session.

async function handleMissedTransfer({
  originalFrom,
  callSid,
  voiceSessionId,
  siteUrl: _siteUrl,
}: {
  originalFrom: string;
  callSid: string;
  voiceSessionId: string;
  siteUrl: string;
}) {
  const sb = createServerClient();
  const now = new Date();

  // ── 1. Look up the voice session for transfer context ─────────────────
  let leadId: string | null = null;
  let leadName = "Unknown caller";
  let assignedTo: string | null = null;
  let transferReason = "Warm transfer from Jeff";

  if (voiceSessionId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: session } = await (sb.from("voice_sessions") as any)
      .select("lead_id, transfer_brief, transfer_reason")
      .eq("id", voiceSessionId)
      .single();

    if (session) {
      leadId = session.lead_id;
      transferReason = session.transfer_reason ?? transferReason;
      const brief = session.transfer_brief as Record<string, unknown> | null;
      if (brief?.caller_name) leadName = String(brief.caller_name);
      if (leadId) {
        const leadOwnerContext = await getLeadOwnerContext(sb, leadId);
        assignedTo = leadOwnerContext.assignedTo ?? assignedTo;
        leadName = leadOwnerContext.ownerName ?? leadName;
      }
    }

    // Update voice_session status to transfer_missed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("voice_sessions") as any)
      .update({ status: "transfer_missed" })
      .eq("id", voiceSessionId);
  }

  // If we don't have a lead from the session, try unified phone lookup
  if (!leadId && originalFrom) {
    const context = await resolveMissedCallContext(sb, originalFrom);
    leadId = context.leadId;
    assignedTo = context.assignedTo ?? assignedTo;
    if (leadName === "Unknown caller" && context.leadName) {
      leadName = context.leadName;
    }
  }

  // ── 2. Create urgent callback task ──────────────────────────────────────
  const dueAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes — urgent transfer callback
  const taskTitle = `⚡ Missed transfer — call back ${leadName} (${originalFrom}) ASAP`;

  const fallbackUserId = process.env.LOGAN_USER_ID ?? "0737e969-2908-4bd6-90bd-7a4380456811";
  const taskAssignee = assignedTo ?? fallbackUserId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: taskRow, error: taskErr } = await (sb.from("tasks") as any)
    .insert({
      title: taskTitle,
      lead_id: leadId,
      assigned_to: taskAssignee,
      due_at: dueAt.toISOString(),
      status: "pending",
      priority: 4, // Higher than regular missed calls
      notes: [
        `Transfer cascade missed at ${now.toISOString()}.`,
        `Caller: ${originalFrom}. Reason: ${transferReason}.`,
        `Voice session: ${voiceSessionId || "unknown"}. Twilio SID: ${callSid}.`,
        `Both Logan and Adam were unavailable.`,
      ].join("\n"),
    })
    .select("id")
    .single();

  if (taskErr) {
    console.error("[inbound] Missed transfer task creation failed:", taskErr.message);
  }

  // ── 3. Write dialer_event ───────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("dialer_events") as any)
    .insert({
      event_type: "transfer.missed",
      user_id: taskAssignee,
      lead_id: leadId,
      session_id: voiceSessionId || null,
      task_id: taskRow?.id ?? null,
      metadata: {
        from_number: originalFrom,
        call_sid: callSid,
        voice_session_id: voiceSessionId,
        transfer_reason: transferReason,
        missed_at: now.toISOString(),
      },
    });

  // ── 4. SMS both operators — call back ASAP ──────────────────────────────
  const { sendDirectSMS } = await import("@/providers/voice/vapi-sms");

  const loganCell = process.env.TWILIO_FORWARD_TO_CELL;
  const adamCell = process.env.ADAM_CELL;
  const urgentMsg = `MISSED TRANSFER: ${leadName} (${originalFrom}) — ${transferReason}. Both missed. Call back ASAP!`;

  if (loganCell) sendDirectSMS(loganCell, urgentMsg).catch(() => {});
  if (adamCell) sendDirectSMS(adamCell, urgentMsg).catch(() => {});

  console.log("[inbound] Missed transfer handled:", {
    originalFrom: originalFrom ? `***${originalFrom.slice(-4)}` : "none",
    taskAssignee: taskAssignee ? `${taskAssignee.slice(0, 8)}...` : "none",
    leadId: leadId ? `${leadId.slice(0, 8)}…` : "no match",
    taskId: taskRow?.id ? `${taskRow.id.slice(0, 8)}…` : "failed",
    voiceSessionId: voiceSessionId ? voiceSessionId.slice(0, 8) : "none",
  });
}
