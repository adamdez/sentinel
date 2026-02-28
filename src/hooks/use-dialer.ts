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
  compliant?: boolean;
  scrubbing?: boolean;
}

// ── Dialer Queue Hook ─────────────────────────────────────────────────

export function useDialerQueue(limit = 8) {
  const [queue, setQueue] = useState<QueueLead[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser, ghostMode } = useSentinelStore();

  const fetchQueue = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from("leads") as any)
      .select("*, properties(*)")
      .in("status", ["prospect", "lead"])
      .order("priority", { ascending: false })
      .limit(limit + 10); // over-fetch to filter out phoneless

    if (currentUser.role !== "admin") {
      query = query.or(`assigned_to.is.null,assigned_to.eq.${currentUser.id}`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[DialerQueue]", error);
      setLoading(false);
      return;
    }

    const withPhone = (data ?? [])
      .filter((l: QueueLead) => l.properties?.owner_phone)
      .slice(0, limit);

    // Run compliance scrub in parallel
    const scrubbed = await Promise.all(
      withPhone.map(async (lead: QueueLead) => {
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
  myCalls: number;
  teamCalls: number;
  connectRate: number;
  appointments: number;
  contracts: number;
  feesEarned: number;
}

export function useDialerStats() {
  const [stats, setStats] = useState<DialerStats>({
    myCalls: 0, teamCalls: 0, connectRate: 0, appointments: 0, contracts: 0, feesEarned: 0,
  });
  const [loading, setLoading] = useState(true);
  const { currentUser } = useSentinelStore();

  const fetchStats = useCallback(async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    // My calls today
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: myCalls } = await (supabase.from("calls_log") as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", currentUser.id)
      .gte("started_at", todayISO);

    // Team calls today
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: teamCalls } = await (supabase.from("calls_log") as any)
      .select("id", { count: "exact", head: true })
      .gte("started_at", todayISO);

    // Connected calls today (for connect rate)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: connected } = await (supabase.from("calls_log") as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", currentUser.id)
      .gte("started_at", todayISO)
      .not("disposition", "in", '("no_answer","voicemail","in_progress")');

    // Appointments today
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: appointments } = await (supabase.from("calls_log") as any)
      .select("id", { count: "exact", head: true })
      .eq("user_id", currentUser.id)
      .eq("disposition", "appointment")
      .gte("started_at", todayISO);

    // Contracts (all time from leads)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: contracts } = await (supabase.from("leads") as any)
      .select("id", { count: "exact", head: true })
      .eq("status", "closed")
      .eq("assigned_to", currentUser.id);

    // Fees earned (from closed leads — would need a deal value column; approximate with count * avg)
    const feesEarned = (contracts ?? 0) * 15000;

    const myCallsN = myCalls ?? 0;
    const connectedN = connected ?? 0;
    const rate = myCallsN > 0 ? Math.round((connectedN / myCallsN) * 100) : 0;

    setStats({
      myCalls: myCallsN,
      teamCalls: teamCalls ?? 0,
      connectRate: rate,
      appointments: appointments ?? 0,
      contracts: contracts ?? 0,
      feesEarned,
    });
    setLoading(false);
  }, [currentUser.id]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Realtime refresh on new calls
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
