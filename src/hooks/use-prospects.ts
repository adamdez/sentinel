"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSentinelStore } from "@/lib/store";
import { buildLeadSourceLabel } from "@/lib/lead-source";
import type { AIScore, SellerTimeline, QualificationRoute } from "@/lib/types";

// ── Joined row shape from leads + properties ──────────────────────────

export interface ProspectRow {
  id: string;
  property_id: string;
  status: string;
  updated_at: string | null;
  pinned: boolean;
  pinned_at: string | null;
  pinned_by: string | null;
  priority: number;
  source: string;
  source_vendor: string | null;
  source_list_name: string | null;
  tags: string[];
  notes: string | null;
  promoted_at: string | null;
  assigned_to: string | null;
  dial_queue_active?: boolean | null;
  next_action: string | null;
  next_action_due_at: string | null;
  next_call_scheduled_at: string | null;
  next_follow_up_at: string | null;
  last_contact_at: string | null;
  total_calls: number;
  motivation_level: number | null;
  seller_timeline: SellerTimeline | null;
  condition_level: number | null;
  decision_maker_confirmed: boolean;
  price_expectation: number | null;
  qualification_route: QualificationRoute | null;
  occupancy_score: number | null;
  equity_flexibility_score: number | null;
  qualification_score_total: number | null;
  created_at: string;
  apn: string;
  county: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  owner_name: string;
  owner_phone: string | null;
  owner_email: string | null;
  estimated_value: number | null;
  equity_percent: number | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  year_built: number | null;
  lot_size: number | null;
  owner_flags: Record<string, unknown>;
  available_equity: number | null;
  total_loan_balance: number | null;
  last_sale_price: number | null;
  last_sale_date: string | null;
  foreclosure_stage: string | null;
  default_amount: number | null;
  delinquent_amount: number | null;
  is_vacant: boolean;
  is_absentee: boolean;
  is_free_clear: boolean;
  is_high_equity: boolean;
  is_cash_buyer: boolean;
  radar_id: string | null;
  enriched: boolean;
  composite_score: number;
  motivation_score: number;
  deal_score: number;
  score_label: AIScore["label"];
  model_version: string | null;
  ai_boost: number;
  factors: unknown[];
  _prediction?: {
    predictiveScore: number;
    daysUntilDistress: number;
    confidence: number;
    label: "imminent" | "likely" | "possible" | "unlikely";
    ownerAgeInference: number | null;
    equityBurnRate: number | null;
    lifeEventProbability: number | null;
  } | null;
}

export type SortField = "composite_score" | "promoted_at" | "owner_name" | "address";
export type SortDir = "asc" | "desc";

interface UseProspectsOptions {
  search?: string;
  sortField?: SortField;
  sortDir?: SortDir;
  minScore?: number;
  sourceFilter?: string;
}

function scoreLabel(composite: number): AIScore["label"] {
  if (composite >= 85) return "platinum";
  if (composite >= 65) return "gold";
  if (composite >= 40) return "silver";
  return "bronze";
}

const CACHE_TTL_MS = 60_000; // 60s — data considered fresh for this long

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRows(leadsData: any[], propertiesMap: Record<string, any>, predictionsMap: Record<string, any>): ProspectRow[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (leadsData as any[]).map((lead) => {
    const prop = propertiesMap[lead.property_id] ?? {};
    const composite = lead.priority ?? 0;
    const flags = prop.owner_flags ?? {};
    const prRaw = (flags.pr_raw ?? {}) as Record<string, unknown>;

    const toNum = (v: unknown): number | null => {
      if (v == null || v === "") return null;
      const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,%]/g, ""));
      return isNaN(n) ? null : n;
    };
    const toBool = (v: unknown): boolean =>
      v === true || v === 1 || v === "1" || v === "Yes" || v === "True" || v === "true";

    return {
      id: lead.id,
      property_id: lead.property_id,
      status: lead.status,
      updated_at: lead.updated_at ?? null,
      pinned: lead.pinned === true,
      pinned_at: lead.pinned_at ?? null,
      pinned_by: lead.pinned_by ?? null,
      priority: lead.priority ?? 0,
      source: buildLeadSourceLabel(lead.source, lead.source_vendor, lead.source_list_name),
      source_vendor: (lead.source_vendor as string | null) ?? null,
      source_list_name: (lead.source_list_name as string | null) ?? null,
      tags: lead.tags ?? [],
      notes: lead.notes ?? null,
      promoted_at: lead.promoted_at ?? null,
      assigned_to: lead.assigned_to ?? null,
      next_action: lead.next_action ?? null,
      next_action_due_at: lead.next_action_due_at ?? null,
      next_call_scheduled_at: lead.next_call_scheduled_at ?? null,
      next_follow_up_at: lead.next_follow_up_at ?? null,
      last_contact_at: lead.last_contact_at ?? null,
      total_calls: lead.total_calls ?? 0,
      motivation_level: lead.motivation_level != null ? Number(lead.motivation_level) : null,
      seller_timeline: (lead.seller_timeline as SellerTimeline | null) ?? null,
      condition_level: lead.condition_level != null ? Number(lead.condition_level) : null,
      decision_maker_confirmed: lead.decision_maker_confirmed === true,
      price_expectation: lead.price_expectation != null ? Number(lead.price_expectation) : null,
      qualification_route: (lead.qualification_route as QualificationRoute | null) ?? null,
      occupancy_score: lead.occupancy_score != null ? Number(lead.occupancy_score) : null,
      equity_flexibility_score: lead.equity_flexibility_score != null ? Number(lead.equity_flexibility_score) : null,
      qualification_score_total: lead.qualification_score_total != null ? Number(lead.qualification_score_total) : null,
      created_at: lead.created_at,
      apn: prop.apn ?? "",
      county: prop.county ?? "",
      address: prop.address ?? "",
      city: prop.city ?? "",
      state: prop.state ?? "",
      zip: prop.zip ?? "",
      owner_name: prop.owner_name ?? "Unknown",
      owner_phone: prop.owner_phone ?? null,
      owner_email: prop.owner_email ?? null,
      estimated_value: prop.estimated_value ?? null,
      equity_percent: prop.equity_percent != null ? Number(prop.equity_percent) : null,
      property_type: prop.property_type ?? null,
      bedrooms: prop.bedrooms ?? null,
      bathrooms: prop.bathrooms != null ? Number(prop.bathrooms) : null,
      sqft: prop.sqft ?? null,
      year_built: prop.year_built ?? null,
      lot_size: prop.lot_size ?? null,
      owner_flags: flags,
      available_equity: toNum(prRaw.AvailableEquity) ?? toNum(flags.available_equity),
      total_loan_balance: toNum(prRaw.TotalLoanBalance) ?? toNum(flags.total_loan_balance),
      last_sale_price: toNum(prRaw.LastTransferValue) ?? toNum(flags.last_sale_price),
      last_sale_date: (prRaw.LastTransferRecDate as string) ?? (flags.last_sale_date as string) ?? null,
      foreclosure_stage: (prRaw.ForeclosureStage as string) ?? null,
      default_amount: toNum(prRaw.DefaultAmount),
      delinquent_amount: toNum(prRaw.DelinquentAmount),
      is_vacant: toBool(flags.vacant) || toBool(prRaw.isSiteVacant),
      is_absentee: toBool(flags.absentee) || toBool(prRaw.isNotSameMailingOrExempt),
      is_free_clear: toBool(flags.freeAndClear) || toBool(prRaw.isFreeAndClear),
      is_high_equity: toBool(flags.highEquity) || toBool(prRaw.isHighEquity),
      is_cash_buyer: toBool(flags.cashBuyer) || toBool(prRaw.isCashBuyer),
      radar_id: (flags.radar_id as string) ?? null,
      enriched: !!flags.skip_traced || (flags.all_phones as unknown[])?.length > 0,
      composite_score: composite,
      motivation_score: Math.round(composite * 0.85),
      deal_score: Math.round(composite * 0.75),
      score_label: scoreLabel(composite),
      model_version: null,
      ai_boost: 0,
      factors: [],
      _prediction: (() => {
        const pred = predictionsMap[lead.property_id];
        if (!pred) return null;
        const ps = Number(pred.predictive_score) || 0;
        return {
          predictiveScore: ps,
          daysUntilDistress: Number(pred.days_until_distress) || 365,
          confidence: Number(pred.confidence) || 0,
          label: (ps >= 80 ? "imminent" : ps >= 55 ? "likely" : ps >= 30 ? "possible" : "unlikely") as "imminent" | "likely" | "possible" | "unlikely",
          ownerAgeInference: pred.owner_age_inference != null ? Number(pred.owner_age_inference) : null,
          equityBurnRate: pred.equity_burn_rate != null ? Number(pred.equity_burn_rate) : null,
          lifeEventProbability: pred.life_event_probability != null ? Number(pred.life_event_probability) : null,
        };
      })(),
    };
  });
}

export function useProspects(opts: UseProspectsOptions = {}) {
  const { search = "", sortField = "composite_score", sortDir = "desc", minScore, sourceFilter } = opts;

  const [allRows, setAllRows] = useState<ProspectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const fetchingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cache = useSentinelStore((s) => s._prospectCache);
  const cacheTime = useSentinelStore((s) => s._prospectCacheTime);
  const setCache = useSentinelStore((s) => s.setProspectCache);
  const invalidateCache = useSentinelStore((s) => s.invalidateProspectCache);

  const fetchFromApi = useCallback(async (force = false) => {
    if (fetchingRef.current) return;

    if (!force && cache && (Date.now() - cacheTime) < CACHE_TTL_MS) {
      const rows = buildRows(cache.leads, cache.properties, cache.predictions);
      setAllRows(rows);
      setLoading(false);
      return;
    }

    fetchingRef.current = true;
    try {
      setLoading(allRows.length === 0);
      setError(null);

      const res = await fetch("/api/prospects");
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(body.error || `Server error ${res.status}`);
        return;
      }

      const data = await res.json();
      const { leads: leadsData, properties: propertiesMap, predictions: predictionsMap } = data;

      setCache({ leads: leadsData || [], properties: propertiesMap || {}, predictions: predictionsMap || {} });

      if (!leadsData || leadsData.length === 0) {
        setAllRows([]);
        return;
      }

      const rows = buildRows(leadsData, propertiesMap || {}, predictionsMap || {});
      setAllRows(rows);
    } catch (err) {
      console.error("[useProspects] UNHANDLED:", err instanceof Error ? err.stack : err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [cache, cacheTime, setCache, allRows.length]);

  const scheduleRefetch = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return;
    }
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      invalidateCache();
      void fetchFromApi(true);
    }, 400);
  }, [fetchFromApi, invalidateCache]);

  // On mount: use cache if fresh, otherwise fetch
  useEffect(() => {
    if (cache && (Date.now() - cacheTime) < CACHE_TTL_MS) {
      const rows = buildRows(cache.leads, cache.properties, cache.predictions);
      setAllRows(rows);
      setLoading(false);
    } else {
      fetchFromApi();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time: invalidate cache + refetch on DB changes
  useEffect(() => {
    const channel = supabase
      .channel("prospects_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: "status=eq.prospect" },
        scheduleRefetch,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "properties" },
        scheduleRefetch,
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [scheduleRefetch]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        invalidateCache();
        void fetchFromApi(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchFromApi, invalidateCache]);

  // Client-side filter + sort (instant, no API call)
  const { prospects, totalCount } = useMemo(() => {
    let filtered = allRows;

    if (sourceFilter) {
      filtered = filtered.filter((r) => r.source === sourceFilter);
    }

    if (search.length >= 2) {
      const q = search.toLowerCase();
      filtered = filtered.filter((r) =>
        r.owner_name.toLowerCase().includes(q) ||
        r.apn.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q)
      );
    }

    if (minScore != null) {
      filtered = filtered.filter((r) => r.composite_score >= minScore);
    }

    const dir = sortDir === "desc" ? -1 : 1;
    filtered = [...filtered].sort((a, b) => {
      switch (sortField) {
        case "composite_score":
          return (b.composite_score - a.composite_score) * dir;
        case "promoted_at":
          return ((a.promoted_at ?? "").localeCompare(b.promoted_at ?? "")) * dir;
        case "owner_name":
          return a.owner_name.localeCompare(b.owner_name) * dir;
        case "address":
          return a.address.localeCompare(b.address) * dir;
        default:
          return 0;
      }
    });

    return { prospects: filtered, totalCount: allRows.length };
  }, [allRows, search, sortField, sortDir, minScore, sourceFilter]);

  const refetch = useCallback(() => {
    invalidateCache();
    return fetchFromApi(true);
  }, [invalidateCache, fetchFromApi]);

  return { prospects, loading, error, totalCount, refetch };
}
