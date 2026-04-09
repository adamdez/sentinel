/**
 * Vapi Server-Side Function Handlers
 *
 * These functions are called by Vapi during a live call when the AI assistant
 * decides to use a tool. They query the Sentinel CRM and return results
 * that Vapi reads back to the caller.
 *
 * Write path: These functions are READ-ONLY against leads/properties.
 * The only WRITE is creating callback tasks (which is the dialer write path:
 * voice session → task creation → operator reviews).
 *
 * PR-9 additions:
 * - Seller memory injection on lookup_lead (call history, decision maker, promises)
 * - SMS confirmation on callback booking
 * - Transfer returns Vapi forwardingPhoneNumber format for actual call transfer
 * - Fallback: if transfer target unavailable, auto-book callback + SMS
 */

import { createServerClient } from "@/lib/supabase";
import type {
  LeadLookupParams,
  BookCallbackParams,
  TransferCallParams,
  VapiFunctionResult,
} from "./types";
import { sendCallbackConfirmationSMS, sendDirectSMS } from "./vapi-sms";
import { upsertLeadCallTask } from "@/lib/task-lead-sync";

// ── lookup_lead ─────────────────────────────────────────────────────────────

export async function handleLookupLead(
  params: LeadLookupParams,
): Promise<VapiFunctionResult> {
  const sb = createServerClient();
  const phone = params.phone_number;

  if (!phone) {
    return { result: JSON.stringify({ found: false, message: "No phone number provided." }) };
  }

  const normalized = phone.replace(/\D/g, "");

  // Look up lead by phone via contacts table (leads has no phone column)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contacts } = await (sb.from("contacts") as any)
    .select("id, first_name, last_name, phone, leads!contact_id(id, status, next_action, source, notes, property_id, decision_maker_note, decision_maker_confirmed)")
    .or(`phone.eq.${phone},phone.eq.+${normalized},phone.eq.${normalized}`)
    .limit(1);

  if (!contacts || contacts.length === 0 || !contacts[0].leads?.length) {
    return {
      result: JSON.stringify({
        found: false,
        message: "This caller is not in our system. They may be a new lead.",
      }),
    };
  }

  const contact = contacts[0];
  const lead = { ...contact.leads[0], first_name: contact.first_name, last_name: contact.last_name, phone: contact.phone };

  // Get property info if linked
  let propertyInfo = null;
  if (lead.property_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prop } = await (sb.from("properties") as any)
      .select("address, city, state, zip, owner_name")
      .eq("id", lead.property_id)
      .single();
    propertyInfo = prop;
  }

  // Get recent calls (seller memory — last 3 calls with notes/summaries)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recentCalls } = await (sb.from("calls_log") as any)
    .select("disposition, duration_sec, created_at, notes, ai_summary")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(3);

  // Decision-maker context from lead record
  const dmNote = lead.decision_maker_note ?? null;
  const dmConfirmed = lead.decision_maker_confirmed ?? false;

  // Most recent post-call structure (promises, objections, deal temp)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pcs } = await (sb.from("post_call_structures") as any)
    .select("promises_made, objection, next_task_suggestion, callback_timing_hint, deal_temperature")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Previous voice sessions (AI calls with this person)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: priorVoiceSessions } = await (sb.from("voice_sessions") as any)
    .select("summary, caller_type, created_at, duration_seconds")
    .eq("lead_id", lead.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(2);

  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";

  // Build seller memory block for the AI to use in conversation
  const sellerMemory: Record<string, unknown> = {};
  if (dmNote) {
    sellerMemory.decisionMaker = { note: dmNote, confirmed: dmConfirmed };
  }
  if (pcs) {
    sellerMemory.lastCallInsights = {
      promisesMade: pcs.promises_made ?? null,
      objection: pcs.objection ?? null,
      nextAction: pcs.next_task_suggestion ?? null,
      callbackTiming: pcs.callback_timing_hint ?? null,
      dealTemperature: pcs.deal_temperature ?? null,
    };
  }
  if (priorVoiceSessions && priorVoiceSessions.length > 0) {
    sellerMemory.priorAICalls = priorVoiceSessions.map((s: Record<string, unknown>) => ({
      date: s.created_at,
      summary: typeof s.summary === "string" ? s.summary.slice(0, 200) : null,
      callerType: s.caller_type,
    }));
  }

  return {
    result: JSON.stringify({
      found: true,
      lead: {
        name,
        status: lead.status,
        nextAction: lead.next_action,
        source: lead.source,
        notes: lead.notes ? lead.notes.slice(0, 200) : null,
      },
      property: propertyInfo
        ? {
            address: propertyInfo.address,
            city: propertyInfo.city,
            state: propertyInfo.state,
            ownerName: propertyInfo.owner_name,
          }
        : null,
      recentCalls: (recentCalls ?? []).map((c: Record<string, unknown>) => ({
        disposition: c.disposition,
        date: c.created_at,
        notes: typeof c.notes === "string" ? c.notes.slice(0, 100) : null,
        aiSummary: typeof c.ai_summary === "string" ? c.ai_summary.slice(0, 150) : null,
      })),
      sellerMemory: Object.keys(sellerMemory).length > 0 ? sellerMemory : null,
      context: `This is ${name}, a ${lead.status} lead${propertyInfo ? ` with property at ${propertyInfo.address}` : ""}. ${lead.next_action ? `Next action: ${lead.next_action}.` : ""}${pcs?.deal_temperature ? ` Deal temperature: ${pcs.deal_temperature}.` : ""}${pcs?.objection ? ` Last objection: ${pcs.objection}.` : ""}${dmNote ? ` Decision maker: ${dmNote}.` : ""}`,
    }),
  };
}

// ── book_callback ───────────────────────────────────────────────────────────

export async function handleBookCallback(
  params: BookCallbackParams,
  voiceSessionId: string,
): Promise<VapiFunctionResult> {
  const sb = createServerClient();

  // Try to find lead by phone via contacts table (leads has no phone column)
  let leadId: string | null = null;
  if (params.phone_number) {
    const normalized = params.phone_number.replace(/\D/g, "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: contacts } = await (sb.from("contacts") as any)
      .select("id, leads!contact_id(id)")
      .or(`phone.eq.${params.phone_number},phone.eq.+${normalized},phone.eq.${normalized}`)
      .limit(1);
    if (contacts && contacts.length > 0) {
      const linkedLeads = contacts[0].leads;
      if (Array.isArray(linkedLeads) && linkedLeads.length > 0) {
        leadId = linkedLeads[0].id;
      }
    }
  }

  // Create callback task
  const callerName = params.caller_name || "Unknown caller";
  const title = leadId
    ? `📞 AI callback — ${callerName} (${params.phone_number})`
    : `📞 AI callback — ${callerName} (${params.phone_number}) — NEW LEAD`;

  const notes = [
    `Callback requested during AI-handled inbound call.`,
    params.reason ? `Reason: ${params.reason}` : null,
    params.preferred_time ? `Preferred time: ${params.preferred_time}` : null,
    `Voice session: ${voiceSessionId}`,
  ]
    .filter(Boolean)
    .join("\n");

  const loganUserId = process.env.LOGAN_USER_ID ?? "0737e969-2908-4bd6-90bd-7a4380456811";
  const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const reason = params.reason ? `: ${params.reason}` : "";
  let taskId: string | null = null;

  if (leadId) {
    try {
      taskId = await upsertLeadCallTask({
        sb,
        leadId,
        assignedTo: loganUserId,
        title: `Callback${reason}`,
        dueAt,
        taskType: "callback",
        notes,
        sourceType: "lead_follow_up",
        sourceKey: `lead:${leadId}:primary_call`,
      });
    } catch (error) {
      console.error("[vapi-functions] Failed to upsert callback task:", error);
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: task, error } = await (sb.from("tasks") as any)
      .insert({
        title,
        lead_id: leadId,
        assigned_to: loganUserId,
        due_at: dueAt,
        status: "pending",
        priority: 2,
        task_type: "other",
        notes,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[vapi-functions] Failed to create callback task:", error.message);
      return {
        result: JSON.stringify({
          success: false,
          message: "I've noted the callback request. Someone will call you back soon.",
        }),
      };
    }

    taskId = task?.id ?? null;
  }

  if (leadId && !taskId) {
    return {
      result: JSON.stringify({
        success: false,
        message: "I've noted the callback request. Someone will call you back soon.",
      }),
    };
  }

  // Update voice session to note callback was requested
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("voice_sessions") as any)
    .update({
      callback_requested: true,
      callback_time: params.preferred_time ?? null,
      caller_type: "seller",
    })
    .eq("id", voiceSessionId);

  // Send SMS confirmation to the caller (fire-and-forget)
  if (params.phone_number) {
    sendCallbackConfirmationSMS({
      to: params.phone_number,
      callerName: params.caller_name ?? null,
      preferredTime: params.preferred_time ?? null,
      reason: params.reason ?? null,
    }).catch((err) =>
      console.error("[vapi-functions] SMS confirmation failed:", err),
    );
  }

  return {
    result: JSON.stringify({
      success: true,
      message: `I've scheduled a callback for ${callerName}. ${params.preferred_time ? `We'll aim for ${params.preferred_time}.` : "Someone will call you back within a couple hours."} We'll also send you a text to confirm. Is there anything else I can help with?`,
      taskId,
    }),
  };
}

// ── transfer_to_operator ────────────────────────────────────────────────────

/**
 * Transfer result that includes Vapi's expected `forwardingPhoneNumber`
 * at the top level so Vapi actually initiates the phone transfer.
 * Also includes the function result message for the AI to read.
 */
export interface TransferResult extends VapiFunctionResult {
  forwardingPhoneNumber?: string;
}

export async function handleTransferToOperator(
  params: TransferCallParams,
  voiceSessionId: string,
): Promise<TransferResult> {
  // Transfer now routes through the Twilio inbound cascade:
  //   Logan browser (20s) → Adam browser (20s) → missed handler (books callback)
  // Vapi forwards to the main Dominion Twilio number, which detects
  // the Vapi transfer and uses the cascade chain.
  const target = params.transfer_to ?? "logan";
  const targetName = target === "adam" ? "Adam" : "Logan";

  // The forwarding number is the main Dominion Twilio number.
  // The inbound handler detects From=VAPI_PHONE_NUMBER and uses the
  // transfer cascade instead of the regular inbound chain.
  const cascadeNumber = process.env.TWILIO_PHONE_NUMBER;
  const sb = createServerClient();

  if (!cascadeNumber) {
    console.warn("[vapi-functions] No TWILIO_PHONE_NUMBER configured, falling back to callback");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: session } = await (sb.from("voice_sessions") as any)
      .select("from_number")
      .eq("id", voiceSessionId)
      .single();

    const callerPhone = session?.from_number ?? null;

    if (callerPhone) {
      await handleBookCallback(
        {
          phone_number: callerPhone,
          reason: `Transfer to ${targetName} failed (no number). Original reason: ${params.reason}`,
        },
        voiceSessionId,
      );
    }

    return {
      result: JSON.stringify({
        success: false,
        action: "book_callback",
        message: `${targetName} isn't available right now. I've scheduled a callback — someone will reach out to you soon.`,
      }),
    };
  }

  // Build a structured transfer brief from the conversation so far.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessionData } = await (sb.from("voice_sessions") as any)
    .select("extracted_facts, from_number, lead_id")
    .eq("id", voiceSessionId)
    .single();

  const callerName = params.caller_name ?? "Caller";
  const fromNumber = sessionData?.from_number ?? null;
  const leadId = sessionData?.lead_id ?? null;

  const transferBrief = {
    transfer_to: targetName,
    reason: params.reason,
    caller_type: params.caller_type,
    from_number: fromNumber,
    lead_id: leadId,
    timestamp: new Date().toISOString(),
  };

  // Update voice session with transfer info + brief
  // Store cascadeNumber as transferred_to so the inbound handler can verify
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("voice_sessions") as any)
    .update({
      status: "transferred",
      transferred_to: cascadeNumber,
      transfer_reason: params.reason,
      caller_type: params.caller_type,
      transfer_brief: transferBrief,
    })
    .eq("id", voiceSessionId);

  // ── Pre-transfer SMS notifications (fire-and-forget) ──────────────────
  // Send SMS to Logan and Adam BEFORE the call rings their browsers.
  const loganCell = process.env.TWILIO_FORWARD_TO_CELL;
  const adamCell = process.env.ADAM_CELL;
  const address = params.reason ?? "property inquiry";

  if (loganCell) {
    sendDirectSMS(
      loganCell,
      `Jeff transferring: ${callerName} (${fromNumber ?? "unknown"}) re: ${address}. Check dialer now.`,
    ).catch(() => {/* fire-and-forget */});
  }
  if (adamCell) {
    sendDirectSMS(
      adamCell,
      `Backup: Jeff transferring to Logan — ${callerName} (${fromNumber ?? "unknown"}) re: ${address}. You're next if he misses.`,
    ).catch(() => {/* fire-and-forget */});
  }

  console.log("[vapi-functions] Transfer cascade initiated:", {
    target: targetName,
    cascadeNumber,
    voiceSessionId: voiceSessionId.slice(0, 8),
    reason: params.reason,
  });

  return {
    forwardingPhoneNumber: cascadeNumber,
    result: JSON.stringify({
      success: true,
      transferTo: targetName,
      message: `Connecting you with ${targetName} now. One moment please.`,
      whisper: `Incoming transfer from AI receptionist. ${params.caller_type} caller. ${params.reason}`,
    }),
  };
}

// ── end_call ────────────────────────────────────────────────────────────────

export async function handleEndCall(
  params: { reason: string },
  voiceSessionId: string,
): Promise<VapiFunctionResult> {
  const sb = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("voice_sessions") as any)
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
    })
    .eq("id", voiceSessionId);

  return {
    result: JSON.stringify({
      success: true,
      message: "Thanks for calling Dominion Home Deals. Have a great day!",
    }),
  };
}
