"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

export interface CallHistoryEntry {
  id: string;
  phone_dialed: string;
  disposition: string;
  duration_sec: number;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  ai_summary: string | null;
  lead_id: string | null;
  owner_name: string | null;
  address: string | null;
  direction: "outbound" | "inbound";
}

export type UseCallHistoryOptions = {
  days?: number;
};

export function useCallHistory(userId: string, options: UseCallHistoryOptions = {}) {
  const [history, setHistory] = useState<CallHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestVersionRef = useRef(0);
  const days = options.days ?? 7;

  const fetchHistory = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!userId) return;
    const requestVersion = ++requestVersionRef.current;
    if (!silent) setLoading(true);
    const cutoffIso = new Date(Date.now() - days * 86_400_000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("calls_log") as any)
      .select(`
        id,
        phone_dialed,
        disposition,
        duration_sec,
        started_at,
        ended_at,
        notes,
        ai_summary,
        lead_id,
        direction,
        leads!calls_log_lead_id_fkey (
          properties!leads_property_id_fkey (
            owner_name,
            address
          )
        )
      `)
      .eq("user_id", userId)
      .gte("started_at", cutoffIso)
      .order("started_at", { ascending: false })

    if (!mountedRef.current || requestVersion !== requestVersionRef.current) return;

    if (error) {
      console.error("[useCallHistory]", error.message);
      // Fallback: fetch without join
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: fallback } = await (supabase.from("calls_log") as any)
        .select("id, phone_dialed, disposition, duration_sec, started_at, ended_at, notes, ai_summary, lead_id, direction")
        .eq("user_id", userId)
        .gte("started_at", cutoffIso)
        .order("started_at", { ascending: false })

      if (!mountedRef.current || requestVersion !== requestVersionRef.current) return;

      setHistory(
        (fallback ?? []).map((r: Record<string, unknown>) => ({
          ...r,
          owner_name: null,
          address: null,
          direction: r.direction === "inbound" ? "inbound" as const : "outbound" as const,
        })) as CallHistoryEntry[],
      );
      if (!silent) setLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: CallHistoryEntry[] = (data ?? []).map((r: any) => {
      const prop = r.leads?.properties;
      return {
        id: r.id,
        phone_dialed: r.phone_dialed,
        disposition: r.disposition ?? "unknown",
        duration_sec: r.duration_sec ?? 0,
        started_at: r.started_at,
        ended_at: r.ended_at,
        notes: r.notes,
        ai_summary: r.ai_summary,
        lead_id: r.lead_id,
        owner_name: prop?.owner_name ?? null,
        address: prop?.address ?? null,
        direction: r.direction === "inbound" ? "inbound" as const : "outbound" as const,
      };
    });

    setHistory(mapped);
    if (!silent) setLoading(false);
  }, [days, userId]);

  const scheduleRefresh = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      void fetchHistory({ silent: true });
    }, 400);
  }, [fetchHistory]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchHistory();
    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [fetchHistory]);

  // Real-time subscription for new calls
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("call-history-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls_log", filter: `user_id=eq.${userId}` },
        scheduleRefresh,
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, scheduleRefresh]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchHistory({ silent: true });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchHistory]);

  return { history, loading, refetch: fetchHistory };
}
