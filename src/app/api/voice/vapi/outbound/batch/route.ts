/**
 * POST /api/voice/vapi/outbound/batch
 *
 * Initiate outbound calls via Jeff (Vapi) for a batch of leads.
 * Calls Vapi directly (no Inngest middleman) with 3s delay between calls.
 *
 * Request: { leadIds: string[] }
 * Response: { batchId, results, skipped }
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { getDialerUser, createDialerClient } from "@/lib/dialer/db";
import { isDnc } from "@/lib/dnc-check";
import { initiateOutboundCall } from "@/providers/voice/vapi-adapter";
import { normalizePhoneForCompare } from "@/lib/dialer/auto-cycle";

const MAX_BATCH_SIZE = 10;

function buildSiteUrl(req: NextRequest): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (env) return env;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function POST(req: NextRequest) {
  const user = await getDialerUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { leadIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { leadIds } = body;
  if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
    return NextResponse.json({ error: "leadIds array is required" }, { status: 400 });
  }

  if (leadIds.length > MAX_BATCH_SIZE) {
    return NextResponse.json(
      { error: `Maximum ${MAX_BATCH_SIZE} leads per batch` },
      { status: 400 },
    );
  }

  const sb = createDialerClient();

  // ── Fetch leads + phones ────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leads } = await (sb.from("leads") as any)
    .select(`
      id,
      properties ( owner_name, address ),
      lead_phones ( phone, is_primary, position )
    `)
    .in("id", leadIds);

  if (!leads || leads.length === 0) {
    return NextResponse.json({ error: "No matching leads found" }, { status: 404 });
  }

  const validLeads: Array<{ id: string; phone: string; name: string }> = [];
  const skipped: Array<{ leadId: string; reason: string }> = [];

  for (const lead of leads) {
    const phones = (lead.lead_phones as Array<{ phone: string; is_primary: boolean; position: number }>) ?? [];
    const sorted = [...phones].sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return (a.position ?? 999) - (b.position ?? 999);
    });
    let bestPhone = sorted[0]?.phone;
    const ownerName = (lead.properties as Record<string, unknown>)?.owner_name as string || "Unknown";

    // Fallback: check auto-cycle phones if lead_phones empty
    if (!bestPhone) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: acLead } = await (sb.from("dialer_auto_cycle_leads") as any)
        .select("id")
        .eq("lead_id", lead.id)
        .in("cycle_status", ["ready", "waiting", "paused"])
        .maybeSingle();

      if (acLead) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: acPhones } = await (sb.from("dialer_auto_cycle_phones") as any)
          .select("phone")
          .eq("cycle_lead_id", acLead.id)
          .eq("phone_status", "active")
          .order("phone_position", { ascending: true })
          .limit(1);
        bestPhone = acPhones?.[0]?.phone;
      }
    }

    if (!bestPhone) {
      skipped.push({ leadId: lead.id, reason: "No phone number" });
      continue;
    }

    try {
      const dncResult = await isDnc(bestPhone);
      if (dncResult.isDnc) {
        skipped.push({ leadId: lead.id, reason: `DNC: ${dncResult.reason}` });
        continue;
      }
    } catch {
      // DNC check failed — proceed with caution
    }

    validLeads.push({ id: lead.id, phone: bestPhone, name: ownerName });
  }

  // Track leads not found in DB
  const foundIds = new Set(leads.map((l: Record<string, unknown>) => l.id));
  for (const id of leadIds) {
    if (!foundIds.has(id)) {
      skipped.push({ leadId: id, reason: "Lead not found" });
    }
  }

  if (validLeads.length === 0) {
    return NextResponse.json({
      batchId: null,
      queued: 0,
      skipped,
      error: "No valid leads to call after DNC filtering",
    });
  }

  // ── Call Vapi directly for each lead ────────────────────────────────
  const siteUrl = buildSiteUrl(req);
  const serverUrl = `${siteUrl}/api/voice/vapi/webhook`;
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const results: Array<{ leadId: string; status: string; voiceSessionId?: string; vapiCallId?: string; error?: string }> = [];

  for (let i = 0; i < validLeads.length; i++) {
    const lead = validLeads[i];

    // Look up auto-cycle context
    let autoCycleLeadId: string | null = null;
    let autoCyclePhoneId: string | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cycleRow } = await (sb.from("dialer_auto_cycle_leads") as any)
      .select("id")
      .eq("lead_id", lead.id)
      .in("cycle_status", ["ready", "waiting", "paused"])
      .maybeSingle();

    if (cycleRow) {
      autoCycleLeadId = cycleRow.id;
      const normalizedPhone = normalizePhoneForCompare(lead.phone);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cyclePhones } = await (sb.from("dialer_auto_cycle_phones") as any)
        .select("id, phone")
        .eq("cycle_lead_id", cycleRow.id)
        .eq("phone_status", "active");
      if (cyclePhones) {
        const match = cyclePhones.find(
          (p: { phone: string }) => normalizePhoneForCompare(p.phone) === normalizedPhone,
        );
        if (match) autoCyclePhoneId = match.id;
      }
    }

    // Create voice_session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: session, error: sessErr } = await (sb.from("voice_sessions") as any)
      .insert({
        direction: "outbound",
        lead_id: lead.id,
        to_number: lead.phone,
        status: "ringing",
        caller_type: "seller",
        metadata: { batch_id: batchId, initiated_by: user.id },
        auto_cycle_lead_id: autoCycleLeadId,
        auto_cycle_phone_id: autoCyclePhoneId,
      })
      .select("id")
      .single();

    if (sessErr || !session) {
      const errMsg = `Session creation failed: ${sessErr?.message}`;
      console.error("[outbound/batch]", errMsg, { leadId: lead.id });
      skipped.push({ leadId: lead.id, reason: errMsg });
      continue;
    }

    // Call Vapi directly
    try {
      const { vapiCallId } = await initiateOutboundCall(lead.phone, serverUrl);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("voice_sessions") as any)
        .update({ vapi_call_id: vapiCallId, status: "ai_handling" })
        .eq("id", session.id);

      console.log("[outbound/batch] Call placed:", {
        leadId: lead.id.slice(0, 8),
        phone: `***${lead.phone.slice(-4)}`,
        vapiCallId: vapiCallId.slice(0, 8),
        sessionId: session.id.slice(0, 8),
      });

      results.push({ leadId: lead.id, status: "initiated", voiceSessionId: session.id, vapiCallId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[outbound/batch] Vapi call FAILED:", msg);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb.from("voice_sessions") as any)
        .update({ status: "failed" })
        .eq("id", session.id);

      // Put in skipped so the UI toast shows the actual error
      skipped.push({ leadId: lead.id, reason: `Vapi: ${msg}` });
    }

    // 3s delay between calls
    if (i < validLeads.length - 1) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  const succeeded = results.filter((r) => r.status === "initiated").length;
  const failed = results.filter((r) => r.status === "failed").length;

  console.log("[outbound/batch] Complete:", { batchId, total: validLeads.length, succeeded, failed, skipped: skipped.length });

  return NextResponse.json({ batchId, results, skipped, queued: succeeded });
}
