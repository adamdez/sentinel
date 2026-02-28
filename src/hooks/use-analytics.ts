"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";
import {
  type TimePeriod, type KPIData, type AgentRow, type DailyDialPoint, type FunnelStep,
  getPeriodStart, getPreviousPeriodStart,
  fetchKPIs, fetchAgentBreakdown, fetchDailyDials, fetchFunnelData,
} from "@/lib/analytics";

export interface AnalyticsState {
  period: TimePeriod;
  setPeriod: (p: TimePeriod) => void;
  kpis: KPIData | null;
  prevKpis: KPIData | null;
  agents: AgentRow[];
  dailyDials: DailyDialPoint[];
  funnel: FunnelStep[];
  loading: boolean;
  refetch: () => void;
}

export function useAnalytics(): AnalyticsState {
  const [period, setPeriod] = useState<TimePeriod>("today");
  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [prevKpis, setPrevKpis] = useState<KPIData | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [dailyDials, setDailyDials] = useState<DailyDialPoint[]>([]);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useSentinelStore();

  const load = useCallback(async () => {
    setLoading(true);
    const start = getPeriodStart(period);
    const prevStart = getPreviousPeriodStart(period);
    const isAdmin = currentUser.role === "admin";
    const userId = isAdmin ? undefined : currentUser.id || undefined;

    try {
      const [currentKpis, previousKpis, agentRows, daily, funnelData] = await Promise.all([
        fetchKPIs(start, null, userId),
        fetchKPIs(prevStart, start, userId),
        isAdmin ? fetchAgentBreakdown(start) : Promise.resolve([]),
        fetchDailyDials(userId),
        fetchFunnelData(start, userId),
      ]);

      setKpis(currentKpis);
      setPrevKpis(previousKpis);
      setAgents(agentRows);
      setDailyDials(daily);
      setFunnel(funnelData);
    } catch (err) {
      console.error("[Analytics] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [period, currentUser.id, currentUser.role]);

  useEffect(() => { load(); }, [load]);

  // Real-time refresh on new calls
  useEffect(() => {
    const channel = supabase
      .channel("analytics-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "calls_log" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads" }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return { period, setPeriod, kpis, prevKpis, agents, dailyDials, funnel, loading, refetch: load };
}
