export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createDialerClient, getDialerUser } from "@/lib/dialer/db";
import {
  deriveLeadCycleState,
  mapAutoCyclePhoneState,
  type AutoCycleLeadRowLike,
  type AutoCyclePhoneRowLike,
} from "@/lib/dialer/auto-cycle";

export async function GET(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "12", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 12;

  const sb = createDialerClient();
  const now = new Date();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: queuedLeadRows, error: queuedLeadErr } = await (sb.from("leads") as any)
    .select("*, properties(*)")
    .eq("assigned_to", user.id)
    .eq("dial_queue_active", true)
    .in("status", ["prospect", "lead", "active"])
    .order("dial_queue_added_at", { ascending: false })
    .limit(limit * 4);

  if (queuedLeadErr) {
    console.error("[auto-cycle] queued lead query failed:", queuedLeadErr.message);
    return NextResponse.json({ error: "Failed to load Power Dial queue" }, { status: 500 });
  }

  const queuedLeads = ((queuedLeadRows ?? []) as Array<Record<string, unknown>>);
  if (queuedLeads.length === 0) {
    return NextResponse.json({ generated_at: now.toISOString(), items: [] });
  }

  const queuedLeadIds = queuedLeads.map((row) => String(row.id));
  const autoCycleEligibleLeadIds = queuedLeads
    .filter((row) => row.status === "lead" || row.status === "prospect")
    .map((row) => String(row.id));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cycleLeadRows, error: cycleLeadErr } = autoCycleEligibleLeadIds.length > 0
    ? await (sb.from("dialer_auto_cycle_leads") as any)
        .select("*")
        .eq("user_id", user.id)
        .in("lead_id", autoCycleEligibleLeadIds)
        .in("cycle_status", ["ready", "waiting", "paused"])
    : { data: [], error: null };

  if (cycleLeadErr) {
    console.error("[auto-cycle] lead query failed:", cycleLeadErr.message);
    return NextResponse.json({ error: "Failed to load Power Dial cycle state" }, { status: 500 });
  }

  const cycleLeads = (cycleLeadRows ?? []) as AutoCycleLeadRowLike[];
  const cycleLeadIds = cycleLeads.map((row) => row.id);
  const cycleLeadByLeadId = new Map<string, AutoCycleLeadRowLike>(
    cycleLeads.map((row) => [row.lead_id, row]),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: phoneRows, error: phoneErr } = cycleLeadIds.length > 0
    ? await (sb.from("dialer_auto_cycle_phones") as any)
        .select("*")
        .in("cycle_lead_id", cycleLeadIds)
        .order("phone_position", { ascending: true })
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  if (phoneErr) {
    console.error("[auto-cycle] phone query failed:", phoneErr.message);
    return NextResponse.json({ error: "Failed to load Auto Cycle phones" }, { status: 500 });
  }

  const phonesByCycleLead = new Map<string, AutoCyclePhoneRowLike[]>();
  for (const row of (phoneRows ?? []) as AutoCyclePhoneRowLike[]) {
    const bucket = phonesByCycleLead.get(row.cycle_lead_id) ?? [];
    bucket.push(row);
    phonesByCycleLead.set(row.cycle_lead_id, bucket);
  }

  const queueOrderByLeadId = new Map<string, number>(
    queuedLeadIds.map((leadId, index) => [leadId, index]),
  );

  const items = queuedLeads
    .map((lead) => {
      const leadId = String(lead.id);
      const cycleLead = cycleLeadByLeadId.get(leadId) ?? null;
      const rawPhones = cycleLead ? (phonesByCycleLead.get(cycleLead.id) ?? []) : [];
      const autoCycle = cycleLead ? deriveLeadCycleState(cycleLead, rawPhones, now) : null;
      const phones = rawPhones.map((row) => mapAutoCyclePhoneState(row, now));
      const powerDialState = autoCycle?.readyNow ? "ready" : autoCycle ? "scheduled" : "not_enrolled";

      return {
        lead,
        auto_cycle: autoCycle,
        phones,
        power_dial_state: powerDialState,
        queue_order: queueOrderByLeadId.get(leadId) ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => {
      const bucketA = a.power_dial_state === "ready" ? 0 : a.power_dial_state === "scheduled" ? 1 : 2;
      const bucketB = b.power_dial_state === "ready" ? 0 : b.power_dial_state === "scheduled" ? 1 : 2;
      if (bucketA !== bucketB) return bucketA - bucketB;

      const dueA = a.auto_cycle?.nextDueAt ? new Date(a.auto_cycle.nextDueAt).getTime() : Number.POSITIVE_INFINITY;
      const dueB = b.auto_cycle?.nextDueAt ? new Date(b.auto_cycle.nextDueAt).getTime() : Number.POSITIVE_INFINITY;
      if (dueA !== dueB) return dueA - dueB;

      if (a.queue_order !== b.queue_order) return a.queue_order - b.queue_order;

      const priorityA = Number((a.lead as { priority?: number }).priority ?? 0);
      const priorityB = Number((b.lead as { priority?: number }).priority ?? 0);
      return priorityB - priorityA;
    })
    .slice(0, limit);

  return NextResponse.json({
    generated_at: now.toISOString(),
    items: items.map(({ queue_order: _queueOrder, ...item }) => item),
  });
}

function normalizePhoneDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "").slice(-10);
}

export async function POST(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { leadId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  const sb = createDialerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leadRow, error: leadErr } = await (sb.from("leads") as any)
    .select("id, status, assigned_to, properties(owner_phone)")
    .eq("id", body.leadId)
    .single();

  if (leadErr || !leadRow) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (leadRow.assigned_to !== user.id) {
    return NextResponse.json({ error: "Lead must be claimed by you before entering Auto Cycle" }, { status: 403 });
  }

  if (leadRow.status !== "lead" && leadRow.status !== "prospect") {
    return NextResponse.json({ error: "Only prospect or lead files can enter Auto Cycle" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leadPhoneRows, error: leadPhoneErr } = await (sb.from("lead_phones") as any)
    .select("id, phone, position, status")
    .eq("lead_id", body.leadId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (leadPhoneErr) {
    console.error("[auto-cycle] source phone query failed:", leadPhoneErr.message);
    return NextResponse.json({ error: "Failed to load lead phones" }, { status: 500 });
  }

  const ownerPhone = (leadRow.properties as { owner_phone?: string | null } | null)?.owner_phone ?? null;
  const sourcePhones = ((leadPhoneRows ?? []) as Array<{
    id: string;
    phone: string;
    position: number;
    status: string;
  }>)
    .filter((phone) => phone.status === "active")
    .filter((phone, index, phones) => {
      const digits = normalizePhoneDigits(phone.phone);
      if (!digits) return true;
      return phones.findIndex((candidate) => normalizePhoneDigits(candidate.phone) === digits) === index;
    });

  const nowIso = new Date().toISOString();
  const phoneSeeds = sourcePhones.length > 0
    ? sourcePhones.map((phone) => ({
        phone_id: phone.id,
        phone: phone.phone,
        phone_position: phone.position ?? 0,
      }))
    : ownerPhone
      ? [{
          phone_id: null,
          phone: ownerPhone,
          phone_position: 0,
        }]
      : [];

  if (phoneSeeds.length === 0) {
    return NextResponse.json({ error: "Lead needs at least one working phone to enter Auto Cycle" }, { status: 400 });
  }

  const firstPhoneId = phoneSeeds[0]?.phone_id ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cycleLead, error: cycleLeadErr } = await (sb.from("dialer_auto_cycle_leads") as any)
    .upsert({
      lead_id: body.leadId,
      user_id: user.id,
      cycle_status: "ready",
      current_round: 1,
      next_due_at: nowIso,
      next_phone_id: firstPhoneId,
      last_outcome: null,
      exit_reason: null,
    }, { onConflict: "lead_id" })
    .select("*")
    .single();

  if (cycleLeadErr || !cycleLead) {
    console.error("[auto-cycle] lead upsert failed:", cycleLeadErr?.message);
    return NextResponse.json({ error: "Failed to create Auto Cycle lead" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deleteRes = await (sb.from("dialer_auto_cycle_phones") as any)
    .delete()
    .eq("cycle_lead_id", cycleLead.id);

  if (deleteRes.error) {
    console.error("[auto-cycle] phone reset failed:", deleteRes.error.message);
    return NextResponse.json({ error: "Failed to reset Auto Cycle phones" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insertedPhones, error: insertPhoneErr } = await (sb.from("dialer_auto_cycle_phones") as any)
    .insert(phoneSeeds.map((phone) => ({
      cycle_lead_id: cycleLead.id,
      lead_id: body.leadId,
      user_id: user.id,
      phone_id: phone.phone_id,
      phone: phone.phone,
      phone_position: phone.phone_position,
      attempt_count: 0,
      next_attempt_number: 1,
      next_due_at: nowIso,
      last_attempt_at: null,
      last_outcome: null,
      voicemail_drop_next: false,
      phone_status: "active",
      exit_reason: null,
    })))
    .select("*");

  if (insertPhoneErr) {
    console.error("[auto-cycle] phone insert failed:", insertPhoneErr.message);
    return NextResponse.json({ error: "Failed to create Auto Cycle phones" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    lead_id: body.leadId,
    cycle_lead_id: cycleLead.id,
    phone_count: (insertedPhones ?? []).length,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { leadId?: string; nextPhoneId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.leadId || !body.nextPhoneId) {
    return NextResponse.json({ error: "leadId and nextPhoneId are required" }, { status: 400 });
  }

  const sb = createDialerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leadRow, error: leadErr } = await (sb.from("leads") as any)
    .select("id, status, assigned_to")
    .eq("id", body.leadId)
    .maybeSingle();

  if (leadErr) {
    console.error("[auto-cycle] pointer lead query failed:", leadErr.message);
    return NextResponse.json({ error: "Failed to load Auto Cycle lead" }, { status: 500 });
  }

  if (!leadRow) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (leadRow.assigned_to !== user.id) {
    return NextResponse.json({ error: "Lead must be claimed by you before updating Auto Cycle" }, { status: 403 });
  }

  if (leadRow.status !== "lead" && leadRow.status !== "prospect") {
    return NextResponse.json({ error: "Only prospect or lead files can update Auto Cycle" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cycleLead, error: cycleLeadErr } = await (sb.from("dialer_auto_cycle_leads") as any)
    .select("id")
    .eq("lead_id", body.leadId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (cycleLeadErr) {
    console.error("[auto-cycle] pointer load failed:", cycleLeadErr.message);
    return NextResponse.json({ error: "Failed to load Auto Cycle pointer" }, { status: 500 });
  }

  if (!cycleLead) {
    return NextResponse.json({ error: "Auto Cycle lead not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: phoneRow, error: phoneErr } = await (sb.from("dialer_auto_cycle_phones") as any)
    .select("id, phone_id, phone_status")
    .eq("cycle_lead_id", cycleLead.id)
    .eq("phone_id", body.nextPhoneId)
    .eq("phone_status", "active")
    .maybeSingle();

  if (phoneErr) {
    console.error("[auto-cycle] pointer phone query failed:", phoneErr.message);
    return NextResponse.json({ error: "Failed to validate Auto Cycle phone" }, { status: 500 });
  }

  if (!phoneRow) {
    return NextResponse.json({ error: "Selected phone is not an active Auto Cycle phone on this lead" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (sb.from("dialer_auto_cycle_leads") as any)
    .update({
      next_phone_id: body.nextPhoneId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cycleLead.id);

  if (updateErr) {
    console.error("[auto-cycle] pointer update failed:", updateErr.message);
    return NextResponse.json({ error: "Failed to update Auto Cycle pointer" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    lead_id: body.leadId,
    next_phone_id: body.nextPhoneId,
  });
}

export async function DELETE(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const leadId = searchParams.get("leadId");
  if (!leadId) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }

  const sb = createDialerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cycleLead, error: cycleLeadErr } = await (sb.from("dialer_auto_cycle_leads") as any)
    .select("id")
    .eq("lead_id", leadId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (cycleLeadErr) {
    console.error("[auto-cycle] delete load failed:", cycleLeadErr.message);
    return NextResponse.json({ error: "Failed to load Auto Cycle lead" }, { status: 500 });
  }

  if (!cycleLead) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: phoneErr } = await (sb.from("dialer_auto_cycle_phones") as any)
    .update({
      phone_status: "exited",
      exit_reason: "manual_drop",
      next_attempt_number: null,
      next_due_at: null,
      voicemail_drop_next: false,
    })
    .eq("cycle_lead_id", cycleLead.id)
    .eq("phone_status", "active");

  if (phoneErr) {
    console.error("[auto-cycle] delete phone update failed:", phoneErr.message);
    return NextResponse.json({ error: "Failed to clear Auto Cycle phones" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: leadErr } = await (sb.from("dialer_auto_cycle_leads") as any)
    .update({
      cycle_status: "exited",
      next_due_at: null,
      next_phone_id: null,
      exit_reason: "manual_drop",
      last_outcome: "manual_drop",
    })
    .eq("id", cycleLead.id);

  if (leadErr) {
    console.error("[auto-cycle] delete lead update failed:", leadErr.message);
    return NextResponse.json({ error: "Failed to remove Auto Cycle lead" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, lead_id: leadId });
}
