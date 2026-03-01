"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { scrubLeadClient } from "@/lib/compliance";
import { useSentinelStore } from "@/lib/store";

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
    // Personal queue: only claimed leads assigned to this agent
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("leads") as any)
      .select("*, properties(*)")
      .eq("status", "lead")
      .eq("assigned_to", currentUser.id)
      .order("priority", { ascending: false })
      .limit(limit + 10);
    if (error) {
      console.error("[DialerQueue]", error);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as QueueLead[];

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

    // Sort by blended priority (higher = first)
    enriched.sort((a, b) => b.blendedPriority - a.blendedPriority);

    const withPhone = enriched
      .filter((l) => l.properties?.owner_phone)
      .slice(0, limit);

    // Run compliance scrub in parallel
    const scrubbed = await Promise.all(
      withPhone.map(async (lead) => {
        const phone = lead.properties?.owner_phone;
        if (!phone) return { ...lead, compliant: true, scrubbing: false };

        if (ghostMode) return { ...lead, compliant: true, scrubbing: false };

        const result = await scrubLeadClient(phone);
        return { ...lead, compliant: result.allowed, scrubbing: false };
      })
    );

    setQueue(scrubbed);
    setLoading(false);
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
const LIVE_ANSWER_EXCLUDE = "no_answer,voicemail,in_progress,initiating,sms_outbound";

function periodStart(period: "today" | "week" | "month" | "all"): string | null {
  if (period === "all") return null;
  const d = new Date();
  if (period === "today") d.setHours(0, 0, 0, 0);
  else if (period === "week") { d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); }
  else if (period === "month") { d.setHours(0, 0, 0, 0); d.setDate(1); }
  return d.toISOString();
}

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

  const [myOut, myIn, myLive, myDur, teamOut, teamIn, teamLive, teamDur] = await Promise.all([
    applyPeriod(tbl().select("id", { count: "exact", head: true }).eq("user_id", userId).neq("disposition", "sms_outbound")),
    applyPeriod(tbl().select("id", { count: "exact", head: true }).eq("user_id", userId).eq("disposition", "inbound")),
    applyPeriod(tbl().select("id", { count: "exact", head: true }).eq("user_id", userId).not("disposition", "in", `(${LIVE_ANSWER_EXCLUDE})`)),
    applyPeriod(tbl().select("duration_sec").eq("user_id", userId).gt("duration_sec", 0)),
    applyPeriod(tbl().select("id", { count: "exact", head: true }).neq("disposition", "sms_outbound")),
    applyPeriod(tbl().select("id", { count: "exact", head: true }).eq("disposition", "inbound")),
    applyPeriod(tbl().select("id", { count: "exact", head: true }).not("disposition", "in", `(${LIVE_ANSWER_EXCLUDE})`)),
    applyPeriod(tbl().select("duration_sec").gt("duration_sec", 0)),
  ]);

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
}

export function useDialerStats() {
  const [stats, setStats] = useState<DialerStats>({
    myOutbound: 0, myInbound: 0, myLiveAnswers: 0, myAvgTalkTime: 0, teamOutbound: 0, teamInbound: 0,
  });
  const [loading, setLoading] = useState(true);
  const { currentUser } = useSentinelStore();

  const fetchStats = useCallback(async () => {
    const { my } = await fetchDialerKpis(currentUser.id, "today");
    setStats(my);
    setLoading(false);
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
