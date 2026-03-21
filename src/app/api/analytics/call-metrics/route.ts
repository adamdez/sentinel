/**
 * GET /api/analytics/call-metrics
 *
 * Comprehensive call analytics from calls_log.
 * Returns summary metrics, time-of-day breakdown, day-of-week breakdown,
 * disposition breakdown, daily trend, and per-operator stats.
 *
 * Query params (all optional):
 *   ?from=2026-03-01    Start date (ISO date, inclusive). Default: 30 days ago.
 *   ?to=2026-03-20      End date (ISO date, inclusive through end of day). Default: today.
 *   ?market=spokane     Filter by lead market (spokane | kootenai). Requires join to leads.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tbl = (sb: ReturnType<typeof createServerClient>, name: string) => sb.from(name) as any;

// Dispositions that mean the customer did NOT answer
const NO_ANSWER_DISPOSITIONS = ["no_answer", "voicemail", "missed", "busy", "failed"];

// Dispositions that count as "missed inbound"
const MISSED_INBOUND_DISPOSITIONS = ["no_answer", "missed", "busy"];

interface CallRow {
  id: string;
  lead_id: string | null;
  user_id: string;
  direction: string | null;
  disposition: string | null;
  duration_sec: number;
  started_at: string;
  created_at: string;
  source: string | null;
}

interface UserProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

function parseDateParam(val: string | null, fallback: Date): Date {
  if (!val) return fallback;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

/** Convert a UTC Date to Pacific time hour (0-23) and day name */
function toPacific(d: Date): { hour: number; day: string } {
  const pt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(d);

  let hour = 0;
  let day = "Mon";
  for (const part of pt) {
    if (part.type === "hour") hour = parseInt(part.value, 10);
    if (part.type === "weekday") day = part.value;
  }
  return { hour, day };
}

function toPacificDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(d);
}

export async function GET(req: NextRequest) {
  const sb = createServerClient();
  const user = await requireAuth(req, sb);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;

  // Date range
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const fromDate = startOfDay(parseDateParam(params.get("from"), thirtyDaysAgo));
  const toDate = endOfDay(parseDateParam(params.get("to"), now));
  const market = params.get("market")?.toLowerCase() || null;

  try {
    // ── Fetch calls_log rows in date range ──────────────────────────
    let query = tbl(sb, "calls_log")
      .select("id, lead_id, user_id, direction, disposition, duration_sec, started_at, created_at, source")
      .gte("started_at", fromDate.toISOString())
      .lte("started_at", toDate.toISOString())
      .order("started_at", { ascending: true });

    const { data: callsRaw, error: callsErr } = await query;
    if (callsErr) throw callsErr;
    let calls: CallRow[] = (callsRaw ?? []) as CallRow[];

    // ── Market filter (join to leads.market) ────────────────────────
    if (market && calls.length > 0) {
      const leadIds = [...new Set(calls.map((c) => c.lead_id).filter(Boolean))] as string[];
      if (leadIds.length > 0) {
        // Fetch lead markets in batches
        const marketLeadIds = new Set<string>();
        const batchSize = 500;
        for (let i = 0; i < leadIds.length; i += batchSize) {
          const batch = leadIds.slice(i, i + batchSize);
          const { data: leadsData } = await tbl(sb, "leads")
            .select("id, market")
            .in("id", batch);
          for (const lead of (leadsData ?? []) as { id: string; market: string | null }[]) {
            if (lead.market?.toLowerCase() === market) {
              marketLeadIds.add(lead.id);
            }
          }
        }
        calls = calls.filter((c) => c.lead_id && marketLeadIds.has(c.lead_id));
      } else {
        calls = [];
      }
    }

    // ── Fetch operator names ────────────────────────────────────────
    const userIds = [...new Set(calls.map((c) => c.user_id).filter(Boolean))];
    const userMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles } = await tbl(sb, "user_profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      for (const p of (profiles ?? []) as UserProfileRow[]) {
        userMap.set(p.id, p.full_name || p.email || p.id);
      }
    }

    // ── Summary Metrics ─────────────────────────────────────────────
    const total_calls = calls.length;

    const inbound = calls.filter((c) => c.direction === "inbound");
    const outbound = calls.filter((c) => c.direction === "outbound");

    const total_inbound = inbound.length;
    const total_outbound = outbound.length;

    const total_missed_inbound = inbound.filter(
      (c) => MISSED_INBOUND_DISPOSITIONS.includes(c.disposition ?? "")
    ).length;

    const total_customer_answered = calls.filter(
      (c) => !NO_ANSWER_DISPOSITIONS.includes(c.disposition ?? "")
    ).length;

    const total_voicemails_left = calls.filter(
      (c) => c.disposition === "voicemail"
    ).length;

    const totalDurationSec = calls.reduce((sum, c) => sum + (c.duration_sec ?? 0), 0);
    const total_talk_time_minutes = Math.round((totalDurationSec / 60) * 10) / 10;

    const avg_call_duration_seconds =
      total_calls > 0 ? Math.round(totalDurationSec / total_calls) : 0;

    const outbound_answered = outbound.filter(
      (c) => !NO_ANSWER_DISPOSITIONS.includes(c.disposition ?? "")
    ).length;
    const answer_rate =
      total_outbound > 0
        ? Math.round((outbound_answered / total_outbound) * 1000) / 10
        : null;

    const inbound_answered = inbound.filter(
      (c) => !MISSED_INBOUND_DISPOSITIONS.includes(c.disposition ?? "")
    ).length;
    const inbound_answer_rate =
      total_inbound > 0
        ? Math.round((inbound_answered / total_inbound) * 1000) / 10
        : null;

    // ── Time-of-Day Breakdown (Pacific) ─────────────────────────────
    const hourBuckets: Record<number, { total: number; answered: number }> = {};
    for (let h = 0; h < 24; h++) {
      hourBuckets[h] = { total: 0, answered: 0 };
    }
    for (const c of calls) {
      const { hour } = toPacific(new Date(c.started_at));
      hourBuckets[hour].total++;
      if (!NO_ANSWER_DISPOSITIONS.includes(c.disposition ?? "")) {
        hourBuckets[hour].answered++;
      }
    }
    const time_of_day = Object.entries(hourBuckets).map(([h, v]) => ({
      hour: parseInt(h, 10),
      total_calls: v.total,
      answered: v.answered,
      answer_rate_pct: v.total > 0 ? Math.round((v.answered / v.total) * 1000) / 10 : null,
    }));

    // ── Day-of-Week Breakdown (Pacific) ─────────────────────────────
    const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dayBuckets: Record<string, { total: number; answered: number }> = {};
    for (const d of dayOrder) {
      dayBuckets[d] = { total: 0, answered: 0 };
    }
    for (const c of calls) {
      const { day } = toPacific(new Date(c.started_at));
      if (!dayBuckets[day]) dayBuckets[day] = { total: 0, answered: 0 };
      dayBuckets[day].total++;
      if (!NO_ANSWER_DISPOSITIONS.includes(c.disposition ?? "")) {
        dayBuckets[day].answered++;
      }
    }
    const day_of_week = dayOrder.map((d) => ({
      day: d,
      total_calls: dayBuckets[d].total,
      answered: dayBuckets[d].answered,
      answer_rate_pct:
        dayBuckets[d].total > 0
          ? Math.round((dayBuckets[d].answered / dayBuckets[d].total) * 1000) / 10
          : null,
    }));

    // ── Disposition Breakdown ───────────────────────────────────────
    const dispoMap = new Map<string, number>();
    for (const c of calls) {
      const d = c.disposition ?? "unknown";
      dispoMap.set(d, (dispoMap.get(d) ?? 0) + 1);
    }
    const disposition_breakdown = Array.from(dispoMap.entries())
      .map(([disposition, count]) => ({ disposition, count }))
      .sort((a, b) => b.count - a.count);

    // ── Daily Trend ─────────────────────────────────────────────────
    const dailyMap = new Map<
      string,
      { total: number; answered: number; talk_time_sec: number; inbound: number; outbound: number }
    >();
    for (const c of calls) {
      const dateStr = toPacificDateStr(new Date(c.started_at));
      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, { total: 0, answered: 0, talk_time_sec: 0, inbound: 0, outbound: 0 });
      }
      const bucket = dailyMap.get(dateStr)!;
      bucket.total++;
      if (!NO_ANSWER_DISPOSITIONS.includes(c.disposition ?? "")) bucket.answered++;
      bucket.talk_time_sec += c.duration_sec ?? 0;
      if (c.direction === "inbound") bucket.inbound++;
      if (c.direction === "outbound") bucket.outbound++;
    }
    const daily_trend = Array.from(dailyMap.entries())
      .map(([date, v]) => ({
        date,
        total_calls: v.total,
        answered: v.answered,
        talk_time_minutes: Math.round((v.talk_time_sec / 60) * 10) / 10,
        inbound: v.inbound,
        outbound: v.outbound,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── Per-Operator Breakdown ──────────────────────────────────────
    const opMap = new Map<
      string,
      { total: number; answered: number; talk_time_sec: number }
    >();
    for (const c of calls) {
      const uid = c.user_id;
      if (!uid) continue;
      if (!opMap.has(uid)) opMap.set(uid, { total: 0, answered: 0, talk_time_sec: 0 });
      const bucket = opMap.get(uid)!;
      bucket.total++;
      if (!NO_ANSWER_DISPOSITIONS.includes(c.disposition ?? "")) bucket.answered++;
      bucket.talk_time_sec += c.duration_sec ?? 0;
    }
    const per_operator = Array.from(opMap.entries())
      .map(([user_id, v]) => ({
        user_id,
        name: userMap.get(user_id) ?? user_id,
        total_calls: v.total,
        answered: v.answered,
        talk_time_minutes: Math.round((v.talk_time_sec / 60) * 10) / 10,
        answer_rate_pct:
          v.total > 0 ? Math.round((v.answered / v.total) * 1000) / 10 : null,
      }))
      .sort((a, b) => b.total_calls - a.total_calls);

    // ── Response ────────────────────────────────────────────────────
    return NextResponse.json({
      generated_at: new Date().toISOString(),
      date_range: {
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10),
      },
      market_filter: market,

      summary: {
        total_calls,
        total_inbound,
        total_outbound,
        total_missed_inbound,
        total_customer_answered,
        total_voicemails_left,
        total_talk_time_minutes,
        avg_call_duration_seconds,
        answer_rate_pct: answer_rate,
        inbound_answer_rate_pct: inbound_answer_rate,
      },

      time_of_day,
      day_of_week,
      disposition_breakdown,
      daily_trend,
      per_operator,
    });
  } catch (err) {
    console.error("[Analytics/CallMetrics] Error:", err);
    return NextResponse.json(
      { error: "Failed to compute call metrics" },
      { status: 500 }
    );
  }
}
