import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  handleLookupLead,
  handleBookCallback,
  handleTransferToOperator,
  handleEndCall,
} from "@/providers/voice/vapi-functions";
import type { TransferResult } from "@/providers/voice/vapi-functions";
import { buildAssistantConfig, buildOutboundAssistantConfig, isBusinessHours } from "@/providers/voice/vapi-adapter";
import { notifyMissedCall } from "@/lib/notify";
import { sendTransferFailedSMS } from "@/providers/voice/vapi-sms";
import { trackedDelivery } from "@/lib/delivery-tracker";
import type { VapiWebhookPayload } from "@/providers/voice/types";
import { createAgentRun, completeAgentRun } from "@/lib/control-plane";
import { inngest } from "@/inngest/client";
import { processAutoCycleOutcome, mapVapiDispositionToAutoCycle } from "@/lib/dialer/auto-cycle-outcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** System user for automated writes (Vapi has no authenticated operator). */
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

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
  // Validate webhook secret if configured — prevents spoofed call events
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET;
  if (expectedSecret) {
    const incomingSecret = req.headers.get("x-vapi-secret") ?? req.headers.get("x-webhook-secret");
    if (!incomingSecret || incomingSecret !== expectedSecret) {
      console.warn("[Vapi Webhook] Unauthorized request — invalid or missing webhook secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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

      case "transfer-destination-request":
        return handleTransferDestinationRequest(message);

      case "hang":
        return handleHang(message);

      case "speech-update": {
        const sb = createServerClient();
        const vapiCallId = message.call?.id;
        if (vapiCallId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: sess } = await (sb.from("voice_sessions") as any)
            .select("id")
            .eq("vapi_call_id", vapiCallId)
            .single();
          if (sess?.id) {
            await handleSpeechUpdate(message, sb, sess.id);
          }
        }
        return NextResponse.json({ ok: true });
      }

      case "transcript": {
        const sb = createServerClient();
        const vapiCallId = message.call?.id;
        if (vapiCallId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: sess } = await (sb.from("voice_sessions") as any)
            .select("id")
            .eq("vapi_call_id", vapiCallId)
            .single();
          if (sess?.id) {
            await handleTranscriptChunk(message, sb, sess.id);
          }
        }
        return NextResponse.json({ ok: true });
      }

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
  // Build config FIRST — this must always succeed so Vapi never gets an error response.
  // If config building fails, the call will disconnect immediately (the 3-second drop bug).
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const serverUrl = `${siteUrl}/api/voice/vapi/webhook`;

  const isOutbound = message.call?.type === "outboundPhoneCall";
  const config = isOutbound
    ? buildOutboundAssistantConfig(serverUrl)
    : buildAssistantConfig(serverUrl);

  // After-hours: inject message-taking override into inbound prompt
  if (!isOutbound) {
    try {
      const hours = isBusinessHours();
      if (!hours.isOpen) {
        const afterHoursOverride = `

## AFTER-HOURS MODE (ACTIVE NOW)
The office is currently closed. Do NOT attempt to transfer — nobody is at their desk.

Instead:
1. Let the caller know the team is away for the evening (or weekend). Keep it casual: "Hey, looks like the guys are away from the phone right now."
2. Take a message: get their name, phone number, property address if relevant, and what they need.
3. Book a callback for ${hours.nextOpenTime} using book_callback. Tell them: "Someone will give you a call back ${hours.nextOpenTime}."
4. Reassure them their message won't get lost.

Keep it warm and brief — don't run the full discovery flow after hours. Just take the message and get them off the phone feeling good.`;

        const systemMsg = config.model.messages.find((m: { role: string }) => m.role === "system");
        if (systemMsg) {
          systemMsg.content += afterHoursOverride;
        }
      }
    } catch (err) {
      console.error("[vapi/webhook] After-hours check failed (non-blocking):", err instanceof Error ? err.message : String(err));
    }
  }

  // Tracing and session creation — fire-and-forget, NEVER block the config response.
  // If these fail, the call still works — we just lose traceability for this call.
  try {
    const runId = await createAgentRun({
      agentName: isOutbound ? "vapi-outbound" : "vapi-inbound",
      triggerType: "webhook",
      triggerRef: message.call?.id ?? "unknown",
      leadId: undefined,
      model: "claude-sonnet-4-6",
      promptVersion: isOutbound ? "outbound-v1" : "inbound-v1",
      inputs: {
        callId: message.call?.id,
        fromNumber: message.call?.customer?.number ?? null,
      },
    });

    const vapiCallId = message.call?.id;
    if (vapiCallId) {
      resolveVoiceSession(vapiCallId, message.call, runId).catch((err) => {
        console.error("[vapi/webhook] resolveVoiceSession failed:", err instanceof Error ? err.message : String(err));
      });
    }
  } catch (err) {
    // Tracing failure must NEVER prevent the assistant config from being returned.
    // Without the config, Vapi disconnects the call instantly.
    console.error("[vapi/webhook] Agent run / session creation failed (non-blocking):", err instanceof Error ? err.message : String(err));
  }

  // ALWAYS return the assistant config — this is the critical response that keeps the call alive.
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
      const transferResult: TransferResult = await handleTransferToOperator(
        fn.parameters as { reason: string; caller_type: "seller" | "buyer" | "vendor" | "spam" | "unknown"; transfer_to?: "logan" | "adam" },
        sessionId,
      );

      // Vapi expects `forwardingPhoneNumber` at the response top level
      // to actually initiate the PSTN call transfer
      if (transferResult.forwardingPhoneNumber) {
        return NextResponse.json({
          result: transferResult.result,
          forwardingPhoneNumber: transferResult.forwardingPhoneNumber,
        });
      }

      // Transfer not possible (no number configured) — fallback already handled
      return NextResponse.json({ result: transferResult.result });
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
    .select("id, lead_id, caller_type, callback_requested, duration_seconds, direction, from_number, to_number, status, run_id, auto_cycle_lead_id, auto_cycle_phone_id")
    .eq("vapi_call_id", vapiCallId)
    .single();

  if (session) {
    // ── Write canonical calls_log row ───────────────────────────
    // calls_log is the single source of truth for all completed calls.
    // Vapi sessions must write here so CRM queries, KPI dashboards,
    // and follow-up workflows see every call — not just dialer calls.
    const endedReason = message.endedReason ?? null;
    const disposition = mapVapiEndedReasonToDisposition(endedReason, session.status, session.caller_type);
    const summaryText = (message.summary ?? "").trim() || null;
    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: callsLogRow, error: callsLogErr } = await (sb.from("calls_log") as any)
      .insert({
        lead_id:           session.lead_id ?? null,
        user_id:           SYSTEM_USER_ID,
        phone_dialed:      session.direction === "outbound" ? session.to_number : session.from_number ?? null,
        direction:         session.direction ?? "inbound",
        disposition,
        duration_sec:      session.duration_seconds ?? 0,
        notes:             summaryText,
        recording_url:     message.recordingUrl ?? null,
        transcription:     message.transcript ?? null,
        ai_summary:        summaryText,
        called_at:         now,
        started_at:        now,
        source:            "vapi",
        voice_session_id:  session.id,
        metadata: {
          vapi_call_id:        vapiCallId,
          caller_type:         session.caller_type,
          ended_reason:        endedReason,
          callback_requested:  session.callback_requested,
          cost_cents:          message.cost ? Math.round(message.cost * 100) : null,
          from_number:         session.from_number,
          to_number:           session.to_number,
        },
      })
      .select("id")
      .single();

    if (callsLogErr) {
      console.error("[vapi/webhook] calls_log INSERT FAILED — this is the source of truth for calls:", callsLogErr.message);
      return NextResponse.json({ error: "Failed to persist call record" }, { status: 500 });
    }

    const callsLogId = callsLogRow?.id ?? null;

    // ── Write dialer_event ──────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("dialer_events") as any).insert({
      event_type: session.direction === "outbound" ? "outbound.ai_handled" : "inbound.ai_handled",
      lead_id: session.lead_id,
      session_id: null,
      task_id: null,
      metadata: {
        voice_session_id: session.id,
        calls_log_id: callsLogId,
        caller_type: session.caller_type,
        duration_seconds: session.duration_seconds,
        callback_requested: session.callback_requested,
        ended_reason: endedReason,
        vapi_call_id: vapiCallId,
      },
    });

    // ── Auto-cycle bridge ──────────────────────────────────────
    // When Jeff finishes an outbound call that's part of an auto-cycle,
    // route the disposition back so the cycle advances.
    if (session.auto_cycle_lead_id && session.lead_id) {
      const autoCycleDispo = mapVapiDispositionToAutoCycle(disposition, message.durationSeconds);
      const phoneDialed = session.direction === "outbound" ? session.to_number : session.from_number;
      processAutoCycleOutcome({
        leadId: session.lead_id,
        disposition: autoCycleDispo,
        phoneNumber: phoneDialed,
        source: "webhook",
      }).catch((err) => {
        console.error("[vapi/webhook] auto-cycle outcome failed:", err instanceof Error ? err.message : String(err));
      });
    }

    // Dispatch missed-call alert if caller wasn't transferred to Logan
    const wasTransferred = endedReason === "assistant-forwarded-call";
    const isSellerOrUnknown = !session.caller_type || session.caller_type === "seller" || session.caller_type === "unknown";
    if (!wasTransferred && isSellerOrUnknown) {
      const fromNumber = message.call?.customer?.number ?? null;
      trackedDelivery(
        { channel: "sms", eventType: "missed_call", entityType: "call", entityId: session.lead_id ?? undefined },
        () => notifyMissedCall({
          callerPhone: fromNumber ?? "unknown",
          callerName: null,
          callSummary: message.summary ?? null,
          propertyAddress: null,
          leadId: session.lead_id,
          callTimestamp: new Date().toISOString(),
        })
      );
    }

    // Complete the agent run for this session (control plane traceability)
    if (session.run_id) {
      completeAgentRun({
        runId: session.run_id,
        status: "completed",
        outputs: {
          callId: vapiCallId,
          duration: message.durationSeconds,
          summary: message.summary,
        },
      }).catch((err) => {
        console.error("[vapi/webhook] completeAgentRun failed:", err instanceof Error ? err.message : String(err));
      });
    }

    // Trigger post-call AI analysis (durable, retried if fails)
    const sessionId = session.id;
    const leadId = session.lead_id ?? null;
    if (message.transcript && message.transcript.length > 50) {
      await inngest.send({
        name: "voice/post-call-analysis.requested",
        data: {
          voiceSessionId: sessionId,
          leadId: leadId,
          transcript: message.transcript,
          summary: message.summary ?? null,
          callId: vapiCallId,
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}

// ── transfer-destination-request ─────────────────────────────────────────────
// Vapi sends this when the assistant's transferPlan triggers. We return
// the destination phone number based on the voice session's transfer_to field.

async function handleTransferDestinationRequest(
  message: VapiWebhookPayload["message"],
) {
  const vapiCallId = message.call?.id;
  if (!vapiCallId) {
    return NextResponse.json({ error: "No call ID" }, { status: 400 });
  }

  const sb = createServerClient();

  // Look up the voice session to see who the transfer target is
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session } = await (sb.from("voice_sessions") as any)
    .select("transferred_to, transfer_reason, caller_type, from_number")
    .eq("vapi_call_id", vapiCallId)
    .single();

  // Determine destination — prefer session record, fall back to default (Logan)
  let destinationNumber = session?.transferred_to ?? process.env.TWILIO_FORWARD_TO_CELL;

  if (!destinationNumber) {
    // No transfer target available — tell Vapi not to transfer
    // and book a callback instead
    const callerPhone = session?.from_number ?? message.call?.customer?.number;
    if (callerPhone) {
      const sessionId = await resolveVoiceSession(vapiCallId, message.call);
      await handleBookCallback(
        {
          phone_number: callerPhone,
          reason: `Transfer failed — no operator number configured. ${session?.transfer_reason ?? ""}`,
        },
        sessionId,
      );

      // Send transfer-failed SMS to caller
      trackedDelivery(
        { channel: "sms", eventType: "transfer_failed", entityType: "call" },
        () => sendTransferFailedSMS(callerPhone, "our team")
      );
    }

    // Return a Vapi-compatible response that ends the transfer attempt gracefully.
    // Returning an error/400 here causes Vapi to throw a 400 on its side.
    // Instead, we return a valid destination object with a "hangup" type message
    // that tells the AI to inform the caller a callback has been booked.
    return NextResponse.json({
      destination: {
        type: "number",
        number: "", // empty string signals no transfer
        message: "I wasn't able to connect you right now, but I've booked a callback so someone from our team will reach out to you shortly.",
        description: "Transfer unavailable — callback booked",
      },
    });
  }

  // Return Vapi's expected transfer destination format
  return NextResponse.json({
    destination: {
      type: "number",
      number: destinationNumber,
      message: session?.transfer_reason
        ? `Incoming transfer: ${session.caller_type ?? "unknown"} caller. ${session.transfer_reason}`
        : "Incoming transfer from Dominion AI receptionist.",
      description: "Warm transfer to operator",
    },
  });
}

// ── hang ────────────────────────────────────────────────────────────────────
// Vapi sends "hang" when the call disconnects unexpectedly (caller hung up
// during AI handling, network issues, etc.). We use this to catch cases
// where end-of-call-report might not arrive.

async function handleHang(
  message: VapiWebhookPayload["message"],
) {
  const vapiCallId = message.call?.id;
  if (!vapiCallId) return NextResponse.json({ ok: true });

  const sb = createServerClient();

  // Mark session as completed if still in ai_handling
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: session } = await (sb.from("voice_sessions") as any)
    .select("id, status, lead_id, from_number, caller_type")
    .eq("vapi_call_id", vapiCallId)
    .single();

  if (session && session.status === "ai_handling") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("voice_sessions") as any)
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    // Write dialer event for the hang-up
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from("dialer_events") as any).insert({
      event_type: "inbound.ai_hangup",
      lead_id: session.lead_id,
      session_id: null,
      task_id: null,
      metadata: {
        voice_session_id: session.id,
        caller_type: session.caller_type,
        from_number: session.from_number,
        vapi_call_id: vapiCallId,
        reason: "caller_hung_up_during_ai",
      },
    });

    // If it was a seller, send missed-call alert
    const isSellerOrUnknown =
      !session.caller_type ||
      session.caller_type === "seller" ||
      session.caller_type === "unknown";

    if (isSellerOrUnknown && session.from_number) {
      trackedDelivery(
        { channel: "sms", eventType: "missed_call", entityType: "call", entityId: session.lead_id ?? undefined },
        () => notifyMissedCall({
          callerPhone: session.from_number,
          callerName: null,
          callSummary: "Caller hung up during AI conversation",
          propertyAddress: null,
          leadId: session.lead_id,
          callTimestamp: new Date().toISOString(),
        })
      );
    }
  }

  return NextResponse.json({ ok: true });
}

// ── speech-update ────────────────────────────────────────────────────────────

async function handleSpeechUpdate(message: any, sb: any, sessionId: string): Promise<void> {
  if (!sessionId) return;
  // Append speech event to extracted_facts for observability (dialer-domain volatile data)
  const speechEvent = {
    type: "speech_update",
    role: message.role ?? "unknown",
    status: message.status ?? "unknown",
    timestamp: new Date().toISOString(),
  };
  // Use Postgres array append — fetch current facts, append, update
  const { data: session } = await (sb.from("voice_sessions") as any)
    .select("extracted_facts")
    .eq("id", sessionId)
    .single();
  const currentFacts = Array.isArray(session?.extracted_facts) ? session.extracted_facts : [];
  await (sb.from("voice_sessions") as any)
    .update({ extracted_facts: [...currentFacts, speechEvent] })
    .eq("id", sessionId);
}

// ── transcript ────────────────────────────────────────────────────────────────

async function handleTranscriptChunk(message: any, sb: any, sessionId: string): Promise<void> {
  if (!sessionId || !message.transcript) return;
  // Append incremental transcript role+text to extracted_facts for live notes polling
  const chunk = {
    type: "transcript_chunk",
    role: message.role ?? "unknown",
    text: message.transcript,
    timestamp: new Date().toISOString(),
  };
  const { data: session } = await (sb.from("voice_sessions") as any)
    .select("extracted_facts")
    .eq("id", sessionId)
    .single();
  const currentFacts = Array.isArray(session?.extracted_facts) ? session.extracted_facts : [];
  await (sb.from("voice_sessions") as any)
    .update({ extracted_facts: [...currentFacts, chunk] })
    .eq("id", sessionId);
}

// ── Helper: Resolve or create voice session ─────────────────────────────────

async function resolveVoiceSession(
  vapiCallId: string,
  call?: VapiWebhookPayload["message"]["call"],
  runId?: string | null,
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
      run_id: runId ?? null,
    })
    .select("id")
    .single();

  return newSession?.id ?? vapiCallId;
}

// ── Map Vapi endedReason to a calls_log disposition ──────────────────────
// Vapi sends endedReason strings like "assistant-forwarded-call", "customer-ended-call", etc.
// Map these to meaningful disposition values that align with the dialer's disposition vocabulary.

function mapVapiEndedReasonToDisposition(
  endedReason: string | null,
  sessionStatus: string | null,
  callerType: string | null,
): string {
  if (sessionStatus === "transferred") return "transferred";

  switch (endedReason) {
    case "assistant-forwarded-call":
      return "transferred";
    case "customer-ended-call":
      return callerType === "spam" ? "spam" : "completed";
    case "customer-did-not-give-microphone-permission":
      return "no_answer";
    case "customer-did-not-answer":
      return "no_answer";
    case "assistant-ended-call":
      return "ai_ended";
    case "voicemail":
      return "voicemail";
    case "silence-timed-out":
    case "max-duration-reached":
      return "no_answer";
    case "assistant-error":
    case "twilio-failed-to-connect-call":
    case "pipeline-error-openai-llm-failed":
    case "pipeline-error-custom-llm-llm-failed":
      return "error";
    // SIP failures — phone didn't connect at all
    case "call.in-progress.error-sip-outbound-call-failed-to-connect":
      return "sip_failed";
    default:
      // Unknown reasons should still advance the cycle, not silently drop
      return endedReason?.includes("error") ? "error" : "completed";
  }
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
