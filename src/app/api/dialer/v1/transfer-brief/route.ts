/**
 * GET /api/dialer/v1/transfer-brief?phone=+15095907091
 *
 * When an inbound call arrives (possibly a warm transfer from Jeff),
 * the browser overlay fetches this endpoint to check for a recent
 * transfer brief. Returns Jeff's structured notes + full client file
 * context so the operator can take the call confidently.
 *
 * Lookup strategy:
 * 1. Try matching voice_session by from_number (original caller).
 * 2. If no match and phone is Vapi's number, fall back to the most
 *    recent transferred session (Vapi transfer where From is Vapi's number).
 *
 * Returns enhanced brief with: lead, property, recent calls, open tasks,
 * Jeff's extracted_facts, and deep link to client file.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";

export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const phone = req.nextUrl.searchParams.get("phone");
  if (!phone) {
    return NextResponse.json({ error: "phone parameter required" }, { status: 400 });
  }

  // Normalize phone — strip everything except digits, ensure + prefix
  const digits = phone.replace(/\D/g, "");
  const phoneFmt = digits.startsWith("1") && digits.length === 11
    ? `+${digits}`
    : digits.length === 10
      ? `+1${digits}`
      : `+${digits}`;

  const sb = createDialerClient();
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  // ── 1. Try exact match by from_number ─────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let { data: session, error } = await (sb.from("voice_sessions") as any)
    .select("id, from_number, lead_id, transfer_reason, transfer_brief, caller_type, extracted_facts, summary, created_at")
    .eq("status", "transferred")
    .eq("from_number", phoneFmt)
    .gte("created_at", twoMinAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── 2. Fallback: If phone is the Vapi number, look for any recent transfer ──
  // When Vapi forwards a call, the From on the new leg is Vapi's number,
  // not the original caller. So the phone-based lookup above misses it.
  if (!session && !error) {
    const vapiNumber = process.env.VAPI_PHONE_NUMBER ?? "";
    const vapiDigits = vapiNumber.replace(/\D/g, "");
    const phoneDigits = phoneFmt.replace(/\D/g, "");

    const isVapiNumber = vapiDigits.length >= 10 && phoneDigits.length >= 10
      && phoneDigits.slice(-10) === vapiDigits.slice(-10);

    if (isVapiNumber) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fallback = await (sb.from("voice_sessions") as any)
        .select("id, from_number, lead_id, transfer_reason, transfer_brief, caller_type, extracted_facts, summary, created_at")
        .eq("status", "transferred")
        .gte("created_at", twoMinAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!fallback.error && fallback.data) {
        session = fallback.data;
      }
    }
  }

  if (error) {
    console.error("[transfer-brief] Query error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!session) {
    return NextResponse.json({ brief: null });
  }

  // ── Extract discovery slots from extracted_facts ──────────────────────
  const facts = session.extracted_facts ?? [];
  const discoverySlots: Record<string, string> = {};
  const jeffNotes: string[] = [];
  if (Array.isArray(facts)) {
    for (const fact of facts) {
      if (fact?.slot && fact?.value) {
        discoverySlots[fact.slot] = fact.value;
      }
      if (fact?.text && typeof fact.text === "string") {
        jeffNotes.push(fact.text);
      }
    }
  }

  // ── Enrich with full client file context ──────────────────────────────
  const leadId = session.lead_id;
  let lead: Record<string, unknown> | null = null;
  let property: Record<string, unknown> | null = null;
  let recentCalls: Array<Record<string, unknown>> = [];
  let openTasks: Array<Record<string, unknown>> = [];
  let leadUrl: string | null = null;
  let jeffInteraction: Record<string, unknown> | null = null;

  if (leadId) {
    leadUrl = `/leads/${leadId}`;

    // Fetch lead record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leadRow } = await (sb.from("leads") as any)
      .select("first_name, last_name, phone, email, property_address, stage, source, tags, property_id")
      .eq("id", leadId)
      .single();

    if (leadRow) {
      lead = {
        name: [leadRow.first_name, leadRow.last_name].filter(Boolean).join(" ") || null,
        phone: leadRow.phone ?? session.from_number,
        email: leadRow.email ?? null,
        address: leadRow.property_address ?? null,
        stage: leadRow.stage ?? null,
        source: leadRow.source ?? null,
        tags: leadRow.tags ?? [],
      };

      // Fetch property if linked
      if (leadRow.property_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: prop } = await (sb.from("properties") as any)
          .select("address, city, state, county, property_type")
          .eq("id", leadRow.property_id)
          .single();

        if (prop) {
          property = {
            address: prop.address ?? null,
            city: prop.city ?? null,
            county: prop.county ?? null,
            propertyType: prop.property_type ?? null,
          };
        }
      }
    }

    // Fetch recent calls (last 3)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: calls } = await (sb.from("calls_log") as any)
      .select("created_at, direction, disposition, ai_summary")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (calls) {
      recentCalls = calls.map((c: Record<string, unknown>) => ({
        date: c.created_at,
        direction: c.direction ?? "unknown",
        disposition: c.disposition ?? null,
        summary: typeof c.ai_summary === "string" ? c.ai_summary.slice(0, 200) : null,
      }));
    }

    // Fetch open tasks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tasks } = await (sb.from("tasks") as any)
      .select("title, due_at, status")
      .eq("lead_id", leadId)
      .in("status", ["pending", "in_progress"])
      .order("due_at", { ascending: true })
      .limit(5);

    if (tasks) {
      openTasks = tasks.map((t: Record<string, unknown>) => ({
        title: t.title,
        dueDate: t.due_at ?? null,
        status: t.status,
      }));
    }
  }

  // Pull the linked Jeff interaction when present so later callback review
  // sees the same handoff object the Jeff page and client file use.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: interaction } = await (sb.from("jeff_interactions") as any)
    .select("id, interaction_type, status, summary, callback_requested, callback_due_at, callback_timing_text, transfer_outcome, task_id")
    .eq("voice_session_id", session.id)
    .maybeSingle();

  if (interaction) {
    jeffInteraction = {
      id: interaction.id,
      interactionType: interaction.interaction_type,
      status: interaction.status,
      summary: interaction.summary ?? null,
      callbackRequested: Boolean(interaction.callback_requested),
      callbackDueAt: interaction.callback_due_at ?? null,
      callbackTimingText: interaction.callback_timing_text ?? null,
      transferOutcome: interaction.transfer_outcome ?? null,
      taskId: interaction.task_id ?? null,
    };
  }

  return NextResponse.json({
    brief: {
      voiceSessionId: session.id,
      fromNumber: session.from_number,
      leadId: session.lead_id,
      leadUrl,
      lead,
      property,
      recentCalls,
      openTasks,
      transferReason: session.transfer_reason,
      callerType: session.caller_type,
      transferBrief: session.transfer_brief,
      jeffInteraction,
      discoverySlots,
      jeffNotes,
      summary: session.summary,
      createdAt: session.created_at,
    },
  });
}
