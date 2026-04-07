"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ProspectRow } from "@/hooks/use-prospects";
import type { AIScore } from "@/lib/types";

// ── Row builder (mirrors use-prospects.ts buildRows) ────────────────────

function scoreLabel(composite: number): AIScore["label"] {
  if (composite >= 85) return "platinum";
  if (composite >= 65) return "gold";
  if (composite >= 40) return "silver";
  return "bronze";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRows(leadsData: any[], propertiesMap: Record<string, any>, predictionsMap: Record<string, any>): ProspectRow[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (leadsData as any[]).map((lead) => {
    const prop = propertiesMap[lead.property_id] ?? {};
    const composite = lead.priority ?? 0;
    const flags = prop.owner_flags ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prRaw = (flags.pr_raw ?? {}) as Record<string, any>;

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
      pinned: lead.pinned ?? false,
      pinned_at: lead.pinned_at ?? null,
      pinned_by: lead.pinned_by ?? null,
      priority: lead.priority ?? 0,
      source: lead.source ?? "unknown",
      source_vendor: (lead.source_vendor as string | null) ?? null,
      source_list_name: (lead.source_list_name as string | null) ?? null,
      tags: lead.tags ?? [],
      notes: lead.notes ?? null,
      promoted_at: lead.promoted_at ?? null,
      assigned_to: lead.assigned_to ?? null,
      motivation_level: lead.motivation_level != null ? Number(lead.motivation_level) : null,
      seller_timeline: lead.seller_timeline ?? null,
      condition_level: lead.condition_level != null ? Number(lead.condition_level) : null,
      decision_maker_confirmed: lead.decision_maker_confirmed === true,
      price_expectation: lead.price_expectation != null ? Number(lead.price_expectation) : null,
      qualification_route: lead.qualification_route ?? null,
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

// ── Hook ────────────────────────────────────────────────────────────────

export type SortField = "composite_score" | "updated_at" | "owner_name" | "address";

interface UseLeadsByStatusOptions {
  search?: string;
  sortField?: SortField;
  sortDir?: "asc" | "desc";
}

export function useLeadsByStatus(status: string, opts: UseLeadsByStatusOptions = {}) {
  const { search = "", sortField = "composite_score", sortDir = "desc" } = opts;

  const [allRows, setAllRows] = useState<ProspectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const fetchingRef = useRef(false);

  const fetchFromApi = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      setLoading(allRows.length === 0);
      setError(null);

      const res = await fetch(`/api/leads/by-status?status=${encodeURIComponent(status)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setError(body.error || `Server error ${res.status}`);
        return;
      }

      const data = await res.json();
      const { leads: leadsData, properties: propertiesMap, predictions: predictionsMap } = data;

      if (!leadsData || leadsData.length === 0) {
        setAllRows([]);
        return;
      }

      const rows = buildRows(leadsData, propertiesMap || {}, predictionsMap || {});
      setAllRows(rows);
    } catch (err) {
      console.error(`[useLeadsByStatus(${status})] Error:`, err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [status, allRows.length]);

  // On mount: fetch
  useEffect(() => {
    fetchFromApi();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Real-time: refetch on DB changes for this status
  useEffect(() => {
    const channel = supabase
      .channel(`leads_${status}_realtime`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `status=eq.${status}` },
        () => { fetchFromApi(); }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "properties" },
        () => { fetchFromApi(); }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Client-side filter + sort
  const { rows, totalCount } = useMemo(() => {
    let filtered = allRows;

    if (search.length >= 2) {
      const q = search.toLowerCase();
      filtered = filtered.filter((r) =>
        r.owner_name.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q)
      );
    }

    const dir = sortDir === "desc" ? -1 : 1;
    filtered = [...filtered].sort((a, b) => {
      switch (sortField) {
        case "composite_score":
          return (b.composite_score - a.composite_score) * dir;
        case "updated_at":
          return ((a.created_at ?? "").localeCompare(b.created_at ?? "")) * dir;
        case "owner_name":
          return a.owner_name.localeCompare(b.owner_name) * dir;
        case "address":
          return a.address.localeCompare(b.address) * dir;
        default:
          return 0;
      }
    });

    return { rows: filtered, totalCount: allRows.length };
  }, [allRows, search, sortField, sortDir]);

  const refetch = useCallback(() => {
    return fetchFromApi();
  }, [fetchFromApi]);

  return { rows, loading, error, totalCount, refetch };
}
