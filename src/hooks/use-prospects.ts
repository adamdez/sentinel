"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AIScore } from "@/lib/types";

// ── Joined row shape from leads + properties ──────────────────────────

export interface ProspectRow {
  id: string;
  property_id: string;
  status: string;
  priority: number;
  source: string;
  tags: string[];
  notes: string | null;
  promoted_at: string | null;
  assigned_to: string | null;
  created_at: string;
  // property fields
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
  // financial (from PropertyRadar enrichment)
  available_equity: number | null;
  total_loan_balance: number | null;
  last_sale_price: number | null;
  last_sale_date: string | null;
  // distress detail
  foreclosure_stage: string | null;
  default_amount: number | null;
  delinquent_amount: number | null;
  // ownership flags
  is_vacant: boolean;
  is_absentee: boolean;
  is_free_clear: boolean;
  is_high_equity: boolean;
  is_cash_buyer: boolean;
  // enrichment
  radar_id: string | null;
  enriched: boolean;
  // scoring (derived from priority)
  composite_score: number;
  motivation_score: number;
  deal_score: number;
  score_label: AIScore["label"];
  model_version: string | null;
  ai_boost: number;
  factors: unknown[];
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
  if (composite >= 85) return "fire";
  if (composite >= 65) return "hot";
  if (composite >= 40) return "warm";
  return "cold";
}

export function useProspects(opts: UseProspectsOptions = {}) {
  const { search = "", sortField = "composite_score", sortDir = "desc", minScore, sourceFilter } = opts;

  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchProspects = useCallback(async () => {
    console.log("=== [useProspects] FETCH START ===");
    const t0 = Date.now();

    try {
      setLoading(true);
      setError(null);

      // ── Step 1: Fetch leads where status = prospect ────────────────

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let leadsQuery = (supabase.from("leads") as any)
        .select("*", { count: "exact" })
        .eq("status", "prospect")
        .order("priority", { ascending: false });

      if (sourceFilter) {
        leadsQuery = leadsQuery.eq("source", sourceFilter);
      }

      const { data: leadsData, error: leadsError, count } = await leadsQuery;

      if (leadsError) {
        console.error("[useProspects] Leads query FAILED:", JSON.stringify(leadsError, null, 2));
        setError(leadsError.message);
        return;
      }

      if (!leadsData || leadsData.length === 0) {
        console.log("[useProspects] No prospect leads found");
        setProspects([]);
        setTotalCount(0);
        return;
      }

      console.log("[useProspects] Step 1 — Fetched", leadsData.length, "leads");
      console.log("[useProspects] Sample lead:", JSON.stringify(leadsData[0], null, 2).slice(0, 500));

      // ── Step 2: Fetch properties for those leads ───────────────────
      // Separate query avoids PostgREST FK/join issues entirely.

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propertyIds: string[] = [...new Set((leadsData as any[]).map((l) => l.property_id).filter(Boolean))];

      console.log("[useProspects] Step 2 — Fetching", propertyIds.length, "properties by ID");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let propertiesMap: Record<string, any> = {};

      if (propertyIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: propsData, error: propsError } = await (supabase.from("properties") as any)
          .select("*")
          .in("id", propertyIds);

        if (propsError) {
          console.error("[useProspects] Properties query FAILED:", JSON.stringify(propsError, null, 2));
          console.error("[useProspects] Continuing without property data...");
        } else if (propsData) {
          console.log("[useProspects] Step 2 — Fetched", propsData.length, "properties");
          if (propsData.length > 0) {
            console.log("[useProspects] Sample property:", JSON.stringify(propsData[0], null, 2).slice(0, 800));
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const p of propsData as any[]) {
            propertiesMap[p.id] = p;
          }
        }
      }

      // ── Step 3: Merge leads + properties ───────────────────────────

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: ProspectRow[] = (leadsData as any[]).map((lead) => {
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
          priority: lead.priority ?? 0,
          source: lead.source ?? "unknown",
          tags: lead.tags ?? [],
          notes: lead.notes ?? null,
          promoted_at: lead.promoted_at ?? null,
          assigned_to: lead.assigned_to ?? null,
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
          // Financial (from PR enrichment stored in owner_flags.pr_raw)
          available_equity: toNum(prRaw.AvailableEquity) ?? toNum(flags.available_equity),
          total_loan_balance: toNum(prRaw.TotalLoanBalance) ?? toNum(flags.total_loan_balance),
          last_sale_price: toNum(prRaw.LastTransferValue) ?? toNum(flags.last_sale_price),
          last_sale_date: (prRaw.LastTransferRecDate as string) ?? (flags.last_sale_date as string) ?? null,
          // Distress detail
          foreclosure_stage: (prRaw.ForeclosureStage as string) ?? null,
          default_amount: toNum(prRaw.DefaultAmount),
          delinquent_amount: toNum(prRaw.DelinquentAmount),
          // Ownership flags
          is_vacant: toBool(flags.vacant) || toBool(prRaw.isSiteVacant),
          is_absentee: toBool(flags.absentee) || toBool(prRaw.isNotSameMailingOrExempt),
          is_free_clear: toBool(flags.freeAndClear) || toBool(prRaw.isFreeAndClear),
          is_high_equity: toBool(flags.highEquity) || toBool(prRaw.isHighEquity),
          is_cash_buyer: toBool(flags.cashBuyer) || toBool(prRaw.isCashBuyer),
          // Enrichment
          radar_id: (flags.radar_id as string) ?? null,
          enriched: flags.source === "propertyradar" || !!flags.radar_id,
          // Scoring
          composite_score: composite,
          motivation_score: Math.round(composite * 0.85),
          deal_score: Math.round(composite * 0.75),
          score_label: scoreLabel(composite),
          model_version: null,
          ai_boost: 0,
          factors: [],
        };
      });

      console.log("[useProspects] Step 3 — Merged. Sample row:", {
        owner: rows[0]?.owner_name,
        address: rows[0]?.address,
        apn: rows[0]?.apn,
        arv: rows[0]?.estimated_value,
        equity: rows[0]?.equity_percent,
        score: rows[0]?.composite_score,
        hasPropertyData: !!propertiesMap[rows[0]?.property_id],
      });

      // ── Step 4: Client-side search ─────────────────────────────────

      let filtered = rows;

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

      // ── Step 5: Client-side sort ───────────────────────────────────

      const dir = sortDir === "desc" ? -1 : 1;
      filtered.sort((a, b) => {
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

      setProspects(filtered);
      setTotalCount(count ?? filtered.length);

      console.log("[useProspects] DONE:", {
        leads: leadsData.length,
        properties: Object.keys(propertiesMap).length,
        displayed: filtered.length,
        elapsed: Date.now() - t0,
      });
    } catch (err) {
      console.error("[useProspects] UNHANDLED:", err instanceof Error ? err.stack : err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [search, sortField, sortDir, minScore, sourceFilter]);

  useEffect(() => {
    fetchProspects();
  }, [fetchProspects]);

  useEffect(() => {
    const channel = supabase
      .channel("prospects_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: "status=eq.prospect" },
        () => fetchProspects()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "properties" },
        () => fetchProspects()
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchProspects]);

  return { prospects, loading, error, totalCount, refetch: fetchProspects };
}
