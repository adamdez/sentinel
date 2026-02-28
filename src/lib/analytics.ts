/**
 * Analytics Query Helpers
 *
 * Charter v3.0 §Analytics Domain:
 *   - Conversion analysis, Signal ROI, Model performance
 *   - Never mutates operational data
 *   - Read-only queries against calls_log + leads
 */

import { supabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────

export type TimePeriod = "today" | "week" | "month" | "all";

export interface KPIData {
  totalDials: number;
  connects: number;
  connectRate: number;
  voicemails: number;
  appointments: number;
  contracts: number;
  deadLeads: number;
  nurtures: number;
  avgCallDuration: number;
  revenue: number;
}

export interface AgentRow {
  userId: string;
  name: string;
  color: string;
  kpis: KPIData;
}

export interface DailyDialPoint {
  date: string;
  dials: number;
  connects: number;
  connectRate: number;
}

export interface FunnelStep {
  label: string;
  value: number;
  color: string;
}

// ── Team roster (matches login page) ───────────────────────────────────

export const TEAM_ROSTER = [
  { name: "Adam D.", email: "adam@dominionhomedeals.com", color: "#00ff88" },
  { name: "Nathan J.", email: "nathan@dominionhomedeals.com", color: "#0099ff" },
  { name: "Logan D.", email: "logan@dominionhomedeals.com", color: "#a855f7" },
];

// ── Date range helpers ─────────────────────────────────────────────────

export function getPeriodStart(period: TimePeriod): string | null {
  const now = new Date();
  switch (period) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case "month": {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case "all":
      return null;
  }
}

export function getPreviousPeriodStart(period: TimePeriod): string | null {
  const now = new Date();
  switch (period) {
    case "today": {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 14);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case "month": {
      const d = new Date(now);
      d.setDate(d.getDate() - 60);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case "all":
      return null;
  }
}

// ── Core KPI query ─────────────────────────────────────────────────────

const CONNECT_DISPOS = ["interested", "appointment", "contract", "nurture", "dead", "skip_trace", "ghost"];

export async function fetchKPIs(
  periodStart: string | null,
  periodEnd: string | null,
  userId?: string
): Promise<KPIData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let callsQuery = (supabase.from("calls_log") as any).select("disposition, duration_sec");
  if (periodStart) callsQuery = callsQuery.gte("started_at", periodStart);
  if (periodEnd) callsQuery = callsQuery.lt("started_at", periodEnd);
  if (userId) callsQuery = callsQuery.eq("user_id", userId);

  const { data: calls } = await callsQuery;
  const callRows: { disposition: string; duration_sec: number }[] = calls ?? [];

  const totalDials = callRows.length;
  const connects = callRows.filter((c) => CONNECT_DISPOS.includes(c.disposition)).length;
  const voicemails = callRows.filter((c) => c.disposition === "voicemail").length;
  const appointments = callRows.filter((c) => c.disposition === "appointment").length;
  const contracts = callRows.filter((c) => c.disposition === "contract").length;
  const deadLeads = callRows.filter((c) => c.disposition === "dead").length;
  const nurtures = callRows.filter((c) => c.disposition === "nurture").length;
  const totalDuration = callRows.reduce((s, c) => s + (c.duration_sec ?? 0), 0);
  const avgCallDuration = totalDials > 0 ? Math.round(totalDuration / totalDials) : 0;
  const connectRate = totalDials > 0 ? Math.round((connects / totalDials) * 100) : 0;

  // Revenue from closed leads assigned to this user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let leadsQuery = (supabase.from("leads") as any)
    .select("id", { count: "exact", head: true })
    .eq("status", "closed");
  if (userId) leadsQuery = leadsQuery.eq("assigned_to", userId);

  const { count: closedCount } = await leadsQuery;
  const revenue = (closedCount ?? 0) * 15000;

  return {
    totalDials, connects, connectRate, voicemails,
    appointments, contracts, deadLeads, nurtures,
    avgCallDuration, revenue,
  };
}

// ── Per-agent breakdown ────────────────────────────────────────────────

export async function fetchAgentBreakdown(periodStart: string | null): Promise<AgentRow[]> {
  // Get user_profiles to resolve user IDs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profiles } = await (supabase.from("user_profiles") as any)
    .select("id, full_name, email");

  const profileList: { id: string; full_name: string; email: string }[] = profiles ?? [];

  const agents: AgentRow[] = [];

  for (const roster of TEAM_ROSTER) {
    const profile = profileList.find((p) => p.email === roster.email);
    const userId = profile?.id;

    if (!userId) {
      agents.push({
        userId: "",
        name: roster.name,
        color: roster.color,
        kpis: emptyKPIs(),
      });
      continue;
    }

    const kpis = await fetchKPIs(periodStart, null, userId);
    agents.push({ userId, name: roster.name, color: roster.color, kpis });
  }

  return agents;
}

// ── Daily dials chart data (last 30 days) ──────────────────────────────

export async function fetchDailyDials(userId?: string): Promise<DailyDialPoint[]> {
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  thirtyAgo.setHours(0, 0, 0, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from("calls_log") as any)
    .select("started_at, disposition")
    .gte("started_at", thirtyAgo.toISOString())
    .order("started_at", { ascending: true });

  if (userId) query = query.eq("user_id", userId);

  const { data } = await query;
  const rows: { started_at: string; disposition: string }[] = data ?? [];

  const byDay = new Map<string, { dials: number; connects: number }>();

  // Pre-fill 30 days
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { dials: 0, connects: 0 });
  }

  for (const row of rows) {
    const key = row.started_at.slice(0, 10);
    const entry = byDay.get(key) ?? { dials: 0, connects: 0 };
    entry.dials++;
    if (CONNECT_DISPOS.includes(row.disposition)) entry.connects++;
    byDay.set(key, entry);
  }

  return Array.from(byDay.entries()).map(([date, v]) => ({
    date,
    dials: v.dials,
    connects: v.connects,
    connectRate: v.dials > 0 ? Math.round((v.connects / v.dials) * 100) : 0,
  }));
}

// ── Funnel data ────────────────────────────────────────────────────────

export async function fetchFunnelData(periodStart: string | null, userId?: string): Promise<FunnelStep[]> {
  const kpis = await fetchKPIs(periodStart, null, userId);

  return [
    { label: "Connects", value: kpis.connects, color: "#0099ff" },
    { label: "Appointments", value: kpis.appointments, color: "#00ff88" },
    { label: "Contracts", value: kpis.contracts, color: "#ff6b35" },
  ];
}

// ── Helpers ─────────────────────────────────────────────────────────────

function emptyKPIs(): KPIData {
  return {
    totalDials: 0, connects: 0, connectRate: 0, voicemails: 0,
    appointments: 0, contracts: 0, deadLeads: 0, nurtures: 0,
    avgCallDuration: 0, revenue: 0,
  };
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return 100;
  return Math.round(((current - previous) / previous) * 100);
}
