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
 */

import { createServerClient } from "@/lib/supabase";
import type {
  LeadLookupParams,
  BookCallbackParams,
  TransferCallParams,
  VapiFunctionResult,
} from "./types";

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

  // Look up lead by phone
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads } = await (sb.from("leads") as any)
    .select("id, first_name, last_name, phone, status, next_action, source, notes, property_id")
    .or(`phone.eq.${phone},phone.eq.+${normalized},phone.eq.${normalized}`)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!leads || leads.length === 0) {
    return {
      result: JSON.stringify({
        found: false,
        message: "This caller is not in our system. They may be a new lead.",
      }),
    };
  }

  const lead = leads[0];

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

  // Get recent calls
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recentCalls } = await (sb.from("calls_log") as any)
    .select("disposition, duration, created_at, notes")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(3);

  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";

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
      })),
      context: `This is ${name}, a ${lead.status} lead${propertyInfo ? ` with property at ${propertyInfo.address}` : ""}. ${lead.next_action ? `Next action: ${lead.next_action}.` : ""}`,
    }),
  };
}

// ── book_callback ───────────────────────────────────────────────────────────

export async function handleBookCallback(
  params: BookCallbackParams,
  voiceSessionId: string,
): Promise<VapiFunctionResult> {
  const sb = createServerClient();

  // Try to find lead by phone
  let leadId: string | null = null;
  if (params.phone_number) {
    const normalized = params.phone_number.replace(/\D/g, "");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (sb.from("leads") as any)
      .select("id")
      .or(`phone.eq.${params.phone_number},phone.eq.+${normalized},phone.eq.${normalized}`)
      .limit(1);
    if (leads && leads.length > 0) leadId = leads[0].id;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: task, error } = await (sb.from("tasks") as any)
    .insert({
      title,
      lead_id: leadId,
      due_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
      status: "pending",
      priority: leadId ? 3 : 2, // Higher priority for known leads
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

  return {
    result: JSON.stringify({
      success: true,
      message: `I've scheduled a callback for ${callerName}. ${params.preferred_time ? `We'll aim for ${params.preferred_time}.` : "Someone will call you back within a couple hours."} Is there anything else I can help with?`,
      taskId: task.id,
    }),
  };
}

// ── transfer_to_operator ────────────────────────────────────────────────────

export async function handleTransferToOperator(
  params: TransferCallParams,
  voiceSessionId: string,
): Promise<VapiFunctionResult> {
  // Route to the right person — default to Logan
  const target = params.transfer_to ?? "logan";
  const forwardTo = target === "adam"
    ? process.env.ADAM_CELL
    : process.env.TWILIO_FORWARD_TO_CELL;
  const targetName = target === "adam" ? "Adam" : "Logan";

  if (!forwardTo) {
    return {
      result: JSON.stringify({
        success: false,
        action: "book_callback",
        message: `${targetName} isn't available right now. Let me schedule a callback instead.`,
      }),
    };
  }

  const sb = createServerClient();

  // Update voice session with transfer info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb.from("voice_sessions") as any)
    .update({
      status: "transferred",
      transferred_to: forwardTo,
      transfer_reason: params.reason,
      caller_type: params.caller_type,
    })
    .eq("id", voiceSessionId);

  // Vapi handles the actual SIP transfer — we return the destination
  return {
    result: JSON.stringify({
      success: true,
      transferTo: forwardTo,
      message: `Connecting you with ${targetName} now. One moment please.`,
      destination: {
        type: "number",
        number: forwardTo,
        message: `Incoming transfer from AI receptionist. ${params.caller_type} caller. ${params.reason}`,
      },
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
