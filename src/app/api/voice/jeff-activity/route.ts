/**
 * GET /api/voice/jeff-activity
 *
 * Jeff outbound call monitoring dashboard endpoint.
 * Returns call counts, status breakdown, per-lead stats,
 * and auto-cycle health for the requested time window.
 *
 * Query params:
 *   hours  — lookback window (default 24, max 168)
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";
import { buildJeffRecentSessions, type JeffRecentLeadLite, type JeffRecentSessionLite } from "@/lib/jeff-control";

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const parsedFrom = fromParam ? new Date(fromParam) : null;
  const parsedTo = toParam ? new Date(toParam) : null;
  const hasExplicitRange = Boolean(
    parsedFrom && !Number.isNaN(parsedFrom.getTime()) && parsedTo && !Number.isNaN(parsedTo.getTime()),
  );

  const hours = Math.min(
    Number(req.nextUrl.searchParams.get("hours") ?? "24"),
    24 * 365,
  );

  const since = hasExplicitRange
    ? parsedFrom!.toISOString()
    : new Date(Date.now() - hours * 60 * 60_000).toISOString();
  const until = hasExplicitRange
    ? parsedTo!.toISOString()
    : new Date().toISOString();

  // ── Outbound call stats ──────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessions } = await (sb.from("voice_sessions") as any)
    .select("id, status, lead_id, created_at, ended_at, vapi_call_id, duration_seconds, cost_cents, transferred_to, transfer_reason, callback_requested")
    .eq("direction", "outbound")
    .gte("created_at", since)
    .lte("created_at", until)
    .order("created_at", { ascending: false });

  const allSessions = sessions ?? [];

  const recentLeadIds = Array.from(
    new Set(
      allSessions
        .map((session: { lead_id?: string | null }) => session.lead_id)
        .filter((leadId: string | null | undefined): leadId is string => typeof leadId === "string" && leadId.length > 0),
    ),
  ).slice(0, 25);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recentLeads } = recentLeadIds.length
    ? await (sb.from("leads") as any)
      .select("id, properties")
      .in("id", recentLeadIds)
    : { data: [] };

  const leadMap = new Map(
    ((recentLeads ?? []) as Array<{ id: string; properties?: { owner_name?: string | null; address?: string | null } | null }>)
      .map((lead) => [lead.id, lead]),
  );

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  for (const s of allSessions) {
    statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1;
  }

  // Per-lead breakdown (top 10 by call count)
  const leadCounts: Record<string, number> = {};
  for (const s of allSessions) {
    leadCounts[s.lead_id] = (leadCounts[s.lead_id] ?? 0) + 1;
  }
  const topLeads = Object.entries(leadCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([leadId, count]) => ({ leadId, count }));

  // ── Auto-cycle health ────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cycleLeads } = await (sb.from("dialer_auto_cycle_leads") as any)
    .select("id, lead_id, cycle_status")
    .in("cycle_status", ["ready", "waiting"]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: activePhones } = await (sb.from("dialer_auto_cycle_phones") as any)
    .select("id, lead_id, phone_status, consecutive_failures, next_due_at, attempt_count")
    .eq("phone_status", "active");

  // Phones exited due to Vapi failures (tagged with vapi_failures_ prefix)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pausedPhones } = await (sb.from("dialer_auto_cycle_phones") as any)
    .select("id, lead_id, phone_status, consecutive_failures, exit_reason")
    .eq("phone_status", "exited")
    .like("exit_reason", "vapi_failures_%");

  const overduePhones = (activePhones ?? []).filter(
    (p: { next_due_at: string | null }) =>
      p.next_due_at && new Date(p.next_due_at).getTime() < Date.now(),
  );

  // ── Feature flag status ──────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: flag } = await (sb.from("feature_flags") as any)
    .select("flag_key, enabled, mode")
    .eq("flag_key", "cron.jeff_auto_redial.enabled")
    .maybeSingle();

  return NextResponse.json({
    window: hasExplicitRange ? "custom" : `${hours}h`,
    since,
    until,
    autoRedialEnabled: flag?.enabled ?? false,
    autoRedialMode: flag?.mode ?? "unknown",
    totalOutboundCalls: allSessions.length,
    statusBreakdown: statusCounts,
    topLeadsByCallCount: topLeads,
    recentSessions: buildJeffRecentSessions(
      allSessions as JeffRecentSessionLite[],
      Array.from(leadMap.values()) as JeffRecentLeadLite[],
      8,
    ),
    autoCycle: {
      activeLeads: (cycleLeads ?? []).length,
      activePhones: (activePhones ?? []).length,
      overduePhones: overduePhones.length,
      pausedPhones: (pausedPhones ?? []).length,
      pausedDetails: (pausedPhones ?? []).map((p: { id: string; lead_id: string; consecutive_failures: number; exit_reason: string | null }) => ({
        id: p.id,
        leadId: p.lead_id,
        consecutiveFailures: p.consecutive_failures,
        exitReason: p.exit_reason,
      })),
    },
    // Alert thresholds
    alerts: {
      excessiveCalls: allSessions.length > 100,
      anyLeadOver50Calls: topLeads.some((l) => l.count > 50),
      pausedPhonesExist: (pausedPhones ?? []).length > 0,
      overduePhonesPiling: overduePhones.length > 20,
    },
  });
}
