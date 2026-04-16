"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";
import {
  type ConversionSnapshotSummary,
  type DominionAnalyticsData,
  type TimePeriod,
  fetchDominionAnalytics,
  getPeriodStart,
} from "@/lib/analytics";

export interface AnalyticsState {
  period: TimePeriod;
  setPeriod: (period: TimePeriod) => void;
  data: DominionAnalyticsData | null;
  conversionSnapshot: ConversionSnapshotSummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

async function fetchConversionSnapshot(): Promise<ConversionSnapshotSummary | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      return null;
    }

    const res = await fetch("/api/analytics/conversion", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    const payload = await res.json();

    return {
      snapshotCount: Number(payload.snapshotCount ?? 0),
      funnelCounts: (payload.funnelCounts ?? {}) as Record<string, number>,
      avgDaysByStage: (payload.avgDaysByStage ?? {}) as Record<string, number>,
    };
  } catch (error) {
    console.error("[Analytics] conversion snapshot fetch failed:", error);
    return null;
  }
}

export function useAnalytics(): AnalyticsState {
  const [period, setPeriod] = useState<TimePeriod>("week");
  const [data, setData] = useState<DominionAnalyticsData | null>(null);
  const [conversionSnapshot, setConversionSnapshot] = useState<ConversionSnapshotSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentUser } = useSentinelStore();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestVersionRef = useRef(0);

  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    const requestVersion = ++requestVersionRef.current;
    if (!silent) setLoading(true);
    setError(null);
    const periodStart = getPeriodStart(period);
    try {
      const [analytics, conversion] = await Promise.all([
        fetchDominionAnalytics(periodStart),
        fetchConversionSnapshot(),
      ]);

      if (requestVersion !== requestVersionRef.current) return;
      setData(analytics);
      setConversionSnapshot(conversion);
    } catch (err) {
      console.error("[Analytics] load failed:", err);
      if (requestVersion === requestVersionRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
      }
    } finally {
      if (!silent && requestVersion === requestVersionRef.current) {
        setLoading(false);
      }
    }
  }, [period]);

  const scheduleLoad = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      void load({ silent: true });
    }, 500);
  }, [load]);

  useEffect(() => {
    void load();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("analytics-v1-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls_log" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_stage_snapshots" }, scheduleLoad)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [scheduleLoad]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void load({ silent: true });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [load]);

  return {
    period,
    setPeriod,
    data,
    conversionSnapshot,
    loading,
    error,
    refetch: load,
  };
}
