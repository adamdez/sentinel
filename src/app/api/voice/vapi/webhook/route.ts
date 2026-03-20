import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  handleLookupLead,
  handleBookCallback,
  handleTransferToOperator,
  handleEndCall,
} from "@/providers/voice/vapi-functions";
import { buildAssistantConfig } from "@/providers/voice/vapi-adapter";
import { notifyMissedCall } from "@/lib/notify";
import type { VapiWebhookPayload } from "@/providers/voice/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/voice/vapi/webhook
 *
 * Vapi server webhook — handles all Vapi callback events:
 * - assistant-request: Return assistant config dynamically
 * - function-call: Execute CRM functions mid-call
 * - status-update: Track call state changes
 * - end-of-call-report: Final call summary, transcript, cost
 *
 * Write path: voice_sessions (dialer domain, volatile)
 * → callback tasks go through task creation (operator reviews)
 * → extracted facts stay in voice_sessions.extracted_facts until operator promotes
 */
export async function POST(req: NextRequest) {
  try {
    const payload: VapiWebhookPayload = await req.json();
    const { message } = payload;

    switch (message.type) {
      case "assistant-request":
        return handleAssistantRequest(message);

      case "function-call":
        return handleFunctionCall(message);

      case "status-update":
        return handleStatusUpdate(message);

      case "end-of-call-report":
        return handleEndOfCallReport(message);

      default:
        // Acknowledge unknown events
        return NextResponse.json({ ok: true });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[vapi/webhook] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── assistant-request ───────────────────────────────────────────────────────
// Vapi calls this when a new inbound call arrives to get the assistant config.
// This allows dynamic configuration per call.

async function handleAssistantRequest(message: VapiWebhookPayload["message"]) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const serverUrl = `${siteUrl}/api/voice/vapi/webhook`;

  const config = buildAssistantConfig(serverUrl);

  // Create voice session early — don't wait for first function call
  const vapiCallId = message.call?.id;
  if (vapiCallId) {
    resolveVoiceSession(vapiCallId, message.call).catch(() => {});
  }

  return NextResponse.json({ assistant: config });
}

// ── function-call ───────────────────────────────────────────────────────────
// Vapi calls this when the AI assistant invokes a function mid-call.

async function handleFunctionCall(
  message: VapiWebhookPayload["message"],
) {
  const fn = message.functionCall;
  if (!fn) {
    return NextResponse.json({ result: "No function specified" });
  }

  const vapiCallId = message.call?.id ?? "unknown";

  // Find or create voice session for this call
  const sessionId = await resolveVoiceSession(vapiCallId, message.call);

  switch (fn.name) {
    case "lookup_lead": {
      const result = await handleLookupLead(
        fn.parameters as { phone_number: string },
      );
      return NextResponse.json(result);
    }

    case "book_callback": {
      const result = await handleBookCallback(
        fn.parameters as {
          caller_name?: string;
          phone_number: string;
          preferred_time?: string;
          reason?: string;
        },
        sessionId,
      );
      return NextResponse.json(result);
    }

    case "transfer_to_operator": {
      const result = await handleTransferToOperator(
        fn.parameters as { reason: string; caller_type: "seller" | "buyer" | "vendor" | "spam" | "unknown"; transfer_to?: "logan" | "adam" },
        sessionId,
      );
      return NextResponse.json(result);
    }

    case "end_call": {
      const result = await handleEndCall(
        fn.parameters as { reason: string },
        sessionId,
      );
      return NextResponse.json(result);
    }

    default:
      return NextResponse.json({
        result: JSON.stringify({ error: `Unknown function: ${fn.name}` }),
      });
  }
}

// ── status-update ───────────────────────────────────────────────────────────

async function handleStatusUpdate(
  message: VapiWebhookPayload["message"],
) {
  const vapiCallId = message.call?.id;
  if (!vapiCallId) return NextResponse.json({ ok: true });

  const status = message.status;
  const sb = createServerClient();

  // Map Vapi status to our voice session status
  const statusMap: Record<string, string> = {
    "in-progress": "ai_handling",
    forwarding: "transferred",
    ended: "completed",
  };

  const mappedStatus = statusMap[status ?? ""] ?? null;

  if (mappedStatus) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("voice_sessions") as any)
      .update({
        status: mappedStatus,
        ...(mappedStatus === "completed" ? { ended_at: new Date().toISOString() } : {}),
      })
      .eq("vapi_call_id", vapiCallId);
  }

  return NextResponse.json({ ok: true });
}

// ── end-of-call-report ──────────────────────────────────────────────────────

async function handleEndOfCallReport(
  message: VapiWebhookPayload["message"],
) {
  const vapiCallId = message.call?.id;
  if (!vapiCallId) return NextResponse.json({ ok: true });

  const sb = createServerClient();

  // Extract structured facts from call summary/transcript (fire-and-forget)
  const extractedFacts = extractCallFacts(message.summary, message.transcript);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("voice_sessions") as any)
    .update({
      status: "completed",
      summary: message.summary ?? null,
      transcript: message.transcript ?? null,
      recording_url: message.recordingUrl ?? null,
      duration_seconds: message.durationSeconds ?? null,
      cost_cents: message.cost ? Math.round(message.cost * 100) : null,
      extracted_facts: extractedFacts,
      ended_at: new Date().toISOString(),
    })
    .eq("vapi_call_id", vapiCallId);

  // Write a dialer_event for the completed AI call
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session } = await (sb.from("voice_sessions") as any)
    .select("id, lead_id, caller_type, callback_requested, duration_seconds")
    .eq("vapi_call_id", vapiCallId)
    .single();

  if (session) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("dialer_events") as any).insert({
      event_type: "inbound.ai_handled",
      lead_id: session.lead_id,
      session_id: null,
      task_id: null,
      metadata: {
        voice_session_id: session.id,
        caller_type: session.caller_type,
        duration_seconds: session.duration_seconds,
        callback_requested: session.callback_requested,
        ended_reason: message.endedReason,
        vapi_call_id: vapiCallId,
      },
    });

    // Dispatch missed-call alert if caller wasn't transferred to Logan
    const wasTransferred = message.endedReason === "assistant-forwarded-call";
    const isSellerOrUnknown = !session.caller_type || session.caller_type === "seller" || session.caller_type === "unknown";
    if (!wasTransferred && isSellerOrUnknown) {
      const fromNumber = message.call?.customer?.number ?? null;
      notifyMissedCall({
        callerPhone: fromNumber ?? "unknown",
        callerName: null,
        callSummary: message.summary ?? null,
        propertyAddress: null,
        leadId: session.lead_id,
        callTimestamp: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}

// ── Helper: Resolve or create voice session ─────────────────────────────────

async function resolveVoiceSession(
  vapiCallId: string,
  call?: VapiWebhookPayload["message"]["call"],
): Promise<string> {
  const sb = createServerClient();

  // Check if session exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (sb.from("voice_sessions") as any)
    .select("id")
    .eq("vapi_call_id", vapiCallId)
    .single();

  if (existing) return existing.id;

  // Create new session
  const fromNumber = call?.customer?.number ?? null;
  const toNumber = call?.phoneNumber?.number ?? call?.phoneNumber?.twilioPhoneNumber ?? null;
  const callSid = call?.phoneCallProviderId ?? null;

  // Try to match lead by phone
  let leadId: string | null = null;
  if (fromNumber) {
    const normalized = fromNumber.replace(/\D/g, "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (sb.from("leads") as any)
      .select("id")
      .or(`phone.eq.${fromNumber},phone.eq.+${normalized},phone.eq.${normalized}`)
      .limit(1);
    if (leads && leads.length > 0) leadId = leads[0].id;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newSession } = await (sb.from("voice_sessions") as any)
    .insert({
      vapi_call_id: vapiCallId,
      call_sid: callSid,
      direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
      from_number: fromNumber,
      to_number: toNumber,
      lead_id: leadId,
      status: "ai_handling",
    })
    .select("id")
    .single();

  return newSession?.id ?? vapiCallId;
}

// ── Extract structured facts from call summary/transcript ────────────────

interface ExtractedFact {
  field: string;
  value: string;
  confidence: "low" | "medium" | "high";
}

function extractCallFacts(
  summary?: string | null,
  transcript?: string | null,
): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const text = [summary, transcript].filter(Boolean).join("\n").toLowerCase();
  if (!text) return facts;

  // Property address mentions
  const addressMatch = text.match(
    /(?:property|house|home|place)\s+(?:at|on|is)\s+(\d+\s+[a-z0-9\s]+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|way|blvd|boulevard))/i,
  );
  if (addressMatch) {
    facts.push({ field: "property_address", value: addressMatch[1].trim(), confidence: "medium" });
  }

  // Seller motivation signals
  const motivationKeywords = [
    { pattern: /inherit|inherited|passed away|estate/, value: "inherited_property" },
    { pattern: /foreclos|behind on payments|bank is/, value: "pre_foreclosure" },
    { pattern: /divorc/, value: "divorce" },
    { pattern: /relocat|moving|transferred|new job/, value: "relocation" },
    { pattern: /vacant|empty|no one living/, value: "vacant_property" },
    { pattern: /repair|fix|too much work|can't afford to fix/, value: "deferred_maintenance" },
    { pattern: /tax|owe|lien|back taxes/, value: "tax_issues" },
    { pattern: /tenant|renter|evict|bad tenant/, value: "landlord_distress" },
    { pattern: /probate|court/, value: "probate" },
  ];

  for (const { pattern, value } of motivationKeywords) {
    if (pattern.test(text)) {
      facts.push({ field: "seller_motivation", value, confidence: "medium" });
    }
  }

  // Caller name extraction from transcript
  const nameMatch = text.match(
    /(?:my name is|this is|i'm|i am)\s+([a-z]+(?:\s+[a-z]+)?)/i,
  );
  if (nameMatch && nameMatch[1].length > 2) {
    facts.push({ field: "caller_name", value: nameMatch[1].trim(), confidence: "medium" });
  }

  // Timeline urgency
  if (/asap|right away|this week|urgent|quickly|fast/.test(text)) {
    facts.push({ field: "urgency", value: "high", confidence: "medium" });
  } else if (/no rush|whenever|not in a hurry|thinking about/.test(text)) {
    facts.push({ field: "urgency", value: "low", confidence: "medium" });
  }

  // Callback preference
  const callbackMatch = text.match(
    /call (?:me )?back (?:at |around )?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  );
  if (callbackMatch) {
    facts.push({ field: "preferred_callback_time", value: callbackMatch[1].trim(), confidence: "high" });
  }

  return facts;
}
