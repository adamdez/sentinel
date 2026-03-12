/**
 * GET /api/admin/integrity-report
 *
 * Returns a data integrity report comparing cached lead counter fields
 * against canonical truth from calls_log.
 *
 * Auth: Bearer CRON_SECRET (same as other admin endpoints)
 *
 * Query params:
 *   ?limit=100     Max leads to check (default 500, max 2000)
 *   ?repair=true   If set, also repairs drifted counters (POST recommended, but GET with this flag works)
 *
 * Response: IntegrityReport JSON with drift details
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  buildIntegrityReport,
  buildRepairPayload,
  type CallLogRecord,
  type LeadCounters,
} from "@/lib/integrity-checks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Auth check — same pattern as other admin endpoints
  const cronSecret = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || cronSecret !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createServerClient();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 500), 2000);
  const shouldRepair = url.searchParams.get("repair") === "true";

  // 1. Fetch leads with call counter fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: leadsRaw, error: leadsErr } = await (sb.from("leads") as any)
    .select("id, total_calls, live_answers, voicemails_left, last_contact_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (leadsErr) {
    return NextResponse.json({ error: "Failed to fetch leads", details: leadsErr.message }, { status: 500 });
  }

  const leads: LeadCounters[] = (leadsRaw ?? []).map((l: Record<string, unknown>) => ({
    id: l.id as string,
    total_calls: l.total_calls as number | null,
    live_answers: l.live_answers as number | null,
    voicemails_left: l.voicemails_left as number | null,
    last_contact_at: l.last_contact_at as string | null,
  }));

  if (leads.length === 0) {
    return NextResponse.json({
      leadsChecked: 0,
      leadsWithDrift: 0,
      counterDrifts: [],
      lastContactDrifts: [],
      orphanedCounterLeads: [],
      missedCounterLeads: [],
      repaired: 0,
    });
  }

  // 2. Fetch all calls_log records for these leads
  const leadIds = leads.map((l) => l.id);
  const allCallLogs: CallLogRecord[] = [];

  // Batch in chunks of 500 to avoid Supabase query limits
  for (let i = 0; i < leadIds.length; i += 500) {
    const chunk = leadIds.slice(i, i + 500);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: callsRaw } = await (sb.from("calls_log") as any)
      .select("lead_id, disposition, ended_at, started_at")
      .in("lead_id", chunk);

    for (const row of (callsRaw ?? []) as Record<string, unknown>[]) {
      allCallLogs.push({
        lead_id: row.lead_id as string,
        disposition: row.disposition as string | null,
        ended_at: row.ended_at as string | null,
        started_at: row.started_at as string | null,
      });
    }
  }

  // 3. Build integrity report
  const report = buildIntegrityReport(leads, allCallLogs);

  // 4. Optional repair
  let repaired = 0;
  if (shouldRepair && report.leadsWithDrift > 0) {
    // Group calls by lead for repair payload generation
    const callsByLead = new Map<string, CallLogRecord[]>();
    for (const log of allCallLogs) {
      if (!log.lead_id) continue;
      const existing = callsByLead.get(log.lead_id) ?? [];
      existing.push(log);
      callsByLead.set(log.lead_id, existing);
    }

    // Only repair leads that have actual drift
    const driftedLeadIds = new Set([
      ...report.counterDrifts.map((d) => d.leadId),
      ...report.lastContactDrifts.map((d) => d.leadId),
      ...report.missedCounterLeads,
    ]);

    for (const leadId of driftedLeadIds) {
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) continue;

      const leadCalls = callsByLead.get(leadId) ?? [];
      const payload = buildRepairPayload(lead, leadCalls);
      if (!payload) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (sb.from("leads") as any)
        .update(payload)
        .eq("id", leadId);

      if (!updateErr) repaired++;
      else console.error(`[IntegrityReport] Failed to repair lead ${leadId}:`, updateErr.message);
    }
  }

  return NextResponse.json({
    ...report,
    repaired,
    repairable: shouldRepair,
  });
}
