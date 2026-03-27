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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hours = Math.min(
    Number(req.nextUrl.searchParams.get("hours") ?? "24"),
    168,
  );

  const sb = createServerClient();
  const since = new Date(Date.now() - hours * 60 * 60_000).toISOString();

  // ── Outbound call stats ──────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: sessions } = await (sb.from("voice_sessions") as any)
    .select("id, status, lead_id, created_at, ended_at, vapi_call_id")
    .eq("direction", "outbound")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const allSessions = sessions ?? [];

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
    window: `${hours}h`,
    since,
    autoRedialEnabled: flag?.enabled ?? false,
    autoRedialMode: flag?.mode ?? "unknown",
    totalOutboundCalls: allSessions.length,
    statusBreakdown: statusCounts,
    topLeadsByCallCount: topLeads,
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
