"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { scrubLeadClient } from "@/lib/compliance";
import { useSentinelStore } from "@/lib/store";
import type { QualificationRoute } from "@/lib/types";

// ── Queue Lead shape ──────────────────────────────────────────────────

export interface QueueLead {
  id: string;
  property_id: string;
  status: string;
  priority: number;
  source: string;
  tags: string[];
  notes: string | null;
  assigned_to: string | null;
  lock_version: number;
  next_call_scheduled_at: string | null;
  next_follow_up_at: string | null;
  follow_up_date?: string | null;
  last_contact_at: string | null;
  promoted_at: string | null;
  call_sequence_step: number;
  total_calls: number;
  live_answers: number;
  voicemails_left: number;
  disposition_code: string | null;
  qualification_route: QualificationRoute | null;
  qualification_score_total: number | null;
  motivation_level: number | null;
  seller_timeline: string | null;
  condition_level: number | null;
  decision_maker_confirmed: boolean | null;
  price_expectation: number | null;
  occupancy_score: number | null;
  equity_flexibility_score: number | null;
  properties: {
    id: string;
    address: string;
    owner_name: string;
    owner_phone: string | null;
    estimated_value: number | null;
    equity_percent: number | null;
    city: string;
    state: string;
    county: string;
    owner_flags: Record<string, unknown> | null;
  } | null;
  predictiveScore: number | null;
  blendedPriority: number;
  compliant?: boolean;
  scrubbing?: boolean;
}

// ── Dialer Queue Hook ─────────────────────────────────────────────────

export function useDialerQueue(limit = 7) {
  const [queue, setQueue] = useState<QueueLead[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser, ghostMode } = useSentinelStore();

  const fetchQueue = useCallback(async () => {
    if (!currentUser.id) return;
    try {
      const now = new Date().toISOString();
      // Personal queue: claimed leads where next call is due (or unscheduled)
      const [scheduledRes, unscheduledRes] = await withTimeout(
        Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase.from("leads") as any)
            .select("*, properties(*)")
            .in("status", ["lead", "negotiation"])
            .eq("assigned_to", currentUser.id)
            .lte("next_call_scheduled_at", now)
            .order("next_call_scheduled_at", { ascending: true })
            .limit(limit + 10),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase.from("leads") as any)
            .select("*, properties(*)")
            .in("status", ["lead", "negotiation"])
            .eq("assigned_to", currentUser.id)
            .is("next_call_scheduled_at", null)
            .order("priority", { ascending: false })
            .limit(limit),
        ]),
        10_000,
      );

      if (scheduledRes.error || unscheduledRes.error) {
        const err = scheduledRes.error ?? unscheduledRes.error;
        console.error("[DialerQueue] query error:", err?.message ?? err);
        setLoading(false);
        return;
      }

      const seen = new Set<string>();
      const merged: QueueLead[] = [];
      for (const row of [...(scheduledRes.data ?? []), ...(unscheduledRes.data ?? [])]) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          merged.push(row);
        }
      }
      const rows = merged;

      // Batch-fetch predictive scores for these leads' properties
      const propertyIds = rows
        .map((l) => l.property_id)
        .filter(Boolean);

      let predMap: Record<string, number> = {};
      if (propertyIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: predData } = await (supabase.from("scoring_predictions") as any)
          .select("property_id, predictive_score")
          .in("property_id", propertyIds)
          .order("created_at", { ascending: false });

        if (predData) {
          const seen = new Set<string>();
          for (const p of predData as { property_id: string; predictive_score: number }[]) {
            if (!seen.has(p.property_id)) {
              predMap[p.property_id] = p.predictive_score;
              seen.add(p.property_id);
            }
          }
        }
      }

      // Blend: 60% existing priority + 40% predictive score
      const enriched = rows.map((lead) => {
        const predScore = predMap[lead.property_id] ?? null;
        const blendedPriority = predScore !== null
          ? Math.round(lead.priority * 0.6 + predScore * 0.4)
          : lead.priority;
        return { ...lead, predictiveScore: predScore, blendedPriority };
      });

      // Prioritize due work first, then scheduled work, then unscheduled.
      // Within each bucket, order by soonest due date then blended priority.
      const nowMs = Date.now();
      const toMs = (iso: string | null | undefined): number | null => {
        if (!iso) return null;
        const ms = new Date(iso).getTime();
        return Number.isNaN(ms) ? null : ms;
      };
      const effectiveDueMs = (lead: QueueLead): number | null =>
        toMs(lead.next_call_scheduled_at) ?? toMs(lead.next_follow_up_at) ?? toMs(lead.follow_up_date);
      const rank = (lead: QueueLead): { bucket: number; dueMs: number } => {
        const dueMs = effectiveDueMs(lead);
        if (dueMs != null && dueMs <= nowMs) return { bucket: 0, dueMs };
        if (dueMs != null) return { bucket: 1, dueMs };
        return { bucket: 2, dueMs: Number.POSITIVE_INFINITY };
      };

      enriched.sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra.bucket !== rb.bucket) return ra.bucket - rb.bucket;
        if (ra.dueMs !== rb.dueMs) return ra.dueMs - rb.dueMs;
        return b.blendedPriority - a.blendedPriority;
      });

      const withPhone = enriched
        .filter((l) => l.properties?.owner_phone)
        .slice(0, limit);

      // Run compliance scrub in parallel
      const scrubbed = await Promise.all(
        withPhone.map(async (lead) => {
          const phone = lead.properties?.owner_phone;
          if (!phone) return { ...lead, compliant: true, scrubbing: false };

          if (ghostMode) return { ...lead, compliant: true, scrubbing: false };

          try {
            const result = await scrubLeadClient(phone);
            return { ...lead, compliant: result.allowed, scrubbing: false };
          } catch {
            return { ...lead, compliant: true, scrubbing: false };
          }
        })
      );

      setQueue(scrubbed);
    } catch (err) {
      console.error("[DialerQueue] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id, currentUser.role, ghostMode, limit]);

  useEffect(() => {
    fetchQueue();

    const channel = supabase
      .channel("dialer-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchQueue())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchQueue]);

  return { queue, loading, refetch: fetchQueue };
}

// ── Dialer Stats Hook ─────────────────────────────────────────────────

export interface DialerStats {
  myOutbound: number;
  myInbound: number;
  myLiveAnswers: number;
  myAvgTalkTime: number;
  teamOutbound: number;
  teamInbound: number;
}

const OUTBOUND_FILTER = "no_answer,voicemail,interested,appointment,contract,dead,nurture,skip_trace,ghost,manual_hangup,in_progress,initiating";
const LIVE_ANSWER_EXCLUDE = "no_answer,voicemail,manual_hangup,dead,skip_trace,ghost,nurture,in_progress,initiating,sms_outbound";

function periodStart(period: "today" | "week" | "month" | "all"): string | null {
  if (period === "all") return null;
  const d = new Date();
  if (period === "today") d.setHours(0, 0, 0, 0);
  else if (period === "week") { d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); }
  else if (period === "month") { d.setHours(0, 0, 0, 0); d.setDate(1); }
  return d.toISOString();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Supabase query timed out")), ms),
    ),
  ]);
}

const EMPTY_STATS: DialerStats = {
  myOutbound: 0, myInbound: 0, myLiveAnswers: 0, myAvgTalkTime: 0, teamOutbound: 0, teamInbound: 0,
};

export async function fetchDialerKpis(
  userId: string,
  period: "today" | "week" | "month" | "all" = "today",
): Promise<{ my: DialerStats; team: DialerStats }> {
  const since = periodStart(period);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tbl = () => supabase.from("calls_log") as any;

  function applyPeriod(q: ReturnType<typeof tbl>) {
    return since ? q.gte("started_at", since) : q;
  }

  try {
    const [myOut, myIn, myLive, myDur, teamOut, teamIn, teamLive, teamDur] = await withTimeout(
      Promise.all([
        applyPeriod(tbl().select("id", { count: "exact", head: true }).eq("user_id", userId).neq("disposition", "sms_outbound")),
        applyPeriod(tbl().select("id", { count: "exact", head: true }).eq("user_id", userId).eq("disposition", "inbound")),
        applyPeriod(tbl().select("id", { count: "exact", head: true }).eq("user_id", userId).not("disposition", "in", `(${LIVE_ANSWER_EXCLUDE})`)),
        applyPeriod(tbl().select("duration_sec").eq("user_id", userId).gt("duration_sec", 0)),
        applyPeriod(tbl().select("id", { count: "exact", head: true }).neq("disposition", "sms_outbound")),
        applyPeriod(tbl().select("id", { count: "exact", head: true }).eq("disposition", "inbound")),
        applyPeriod(tbl().select("id", { count: "exact", head: true }).not("disposition", "in", `(${LIVE_ANSWER_EXCLUDE})`)),
        applyPeriod(tbl().select("duration_sec").gt("duration_sec", 0)),
      ]),
      8_000,
    );

    function avgSec(rows: { duration_sec: number }[] | null): number {
      if (!rows || rows.length === 0) return 0;
      return Math.round(rows.reduce((s, r) => s + (r.duration_sec ?? 0), 0) / rows.length);
    }

    const my: DialerStats = {
      myOutbound: myOut.count ?? 0,
      myInbound: myIn.count ?? 0,
      myLiveAnswers: myLive.count ?? 0,
      myAvgTalkTime: avgSec(myDur.data),
      teamOutbound: teamOut.count ?? 0,
      teamInbound: teamIn.count ?? 0,
    };

    const team: DialerStats = {
      myOutbound: teamOut.count ?? 0,
      myInbound: teamIn.count ?? 0,
      myLiveAnswers: teamLive.count ?? 0,
      myAvgTalkTime: avgSec(teamDur.data),
      teamOutbound: teamOut.count ?? 0,
      teamInbound: teamIn.count ?? 0,
    };

    return { my, team };
  } catch (err) {
    console.error("[DialerKpis] Failed to fetch stats:", err);
    return { my: { ...EMPTY_STATS }, team: { ...EMPTY_STATS } };
  }
}

export function useDialerStats() {
  const [stats, setStats] = useState<DialerStats>({
    myOutbound: 0, myInbound: 0, myLiveAnswers: 0, myAvgTalkTime: 0, teamOutbound: 0, teamInbound: 0,
  });
  const [loading, setLoading] = useState(true);
  const { currentUser } = useSentinelStore();

  const fetchStats = useCallback(async () => {
    if (!currentUser.id) return;
    try {
      const { my } = await fetchDialerKpis(currentUser.id, "today");
      setStats(my);
    } catch (err) {
      console.error("[DialerStats] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  useEffect(() => {
    const channel = supabase
      .channel("dialer-stats")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls_log" }, () => fetchStats())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls_log" }, () => fetchStats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchStats]);

  return { stats, loading, refetch: fetchStats };
}

// ── Call Timer Hook ───────────────────────────────────────────────────

export function useCallTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    setElapsed(0);
    setRunning(true);
    intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }, []);

  const stop = useCallback(() => {
    setRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setElapsed(0);
  }, [stop]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const formatted = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, "0")}`;

  return { elapsed, formatted, running, start, stop, reset };
}
