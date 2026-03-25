"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { BuyerRow, DealBuyerRow, DispoPrep } from "@/lib/buyer-types";

// ── Auth helper ──

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Session expired. Please sign in again.");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

// ── Buyer filters ──

export interface BuyerFilters {
  status?: string;
  market?: string;
  asset_type?: string;
  strategy?: string;
  tag?: string;
  pof?: string;
  search?: string;
}

// ── useBuyers ──

export function useBuyers(filters?: BuyerFilters) {
  const [buyers, setBuyers] = useState<BuyerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetch = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      if (filters?.status) params.set("status", filters.status);
      if (filters?.market) params.set("market", filters.market);
      if (filters?.asset_type) params.set("asset_type", filters.asset_type);
      if (filters?.strategy) params.set("strategy", filters.strategy);
      if (filters?.tag) params.set("tag", filters.tag);
      if (filters?.pof) params.set("pof", filters.pof);
      if (filters?.search) params.set("search", filters.search);

      const qs = params.toString();
      const res = await window.fetch(`/api/buyers${qs ? `?${qs}` : ""}`, {
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to fetch buyers (${res.status})`);
      }

      const { buyers: data } = await res.json();
      if (!controller.signal.aborted) {
        setBuyers(data ?? []);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [filters?.status, filters?.market, filters?.asset_type, filters?.strategy, filters?.tag, filters?.pof, filters?.search]);

  useEffect(() => { fetch(); }, [fetch]);

  return { buyers, loading, error, refetch: fetch };
}

// ── useDealBuyers ──

export function useDealBuyers(dealId: string | null) {
  const [dealBuyers, setDealBuyers] = useState<DealBuyerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!dealId) { setDealBuyers([]); return; }
    setLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await window.fetch(`/api/deal-buyers?deal_id=${dealId}`, { headers });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to fetch deal buyers (${res.status})`);
      }

      const { deal_buyers: data } = await res.json();
      setDealBuyers(data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { dealBuyers, loading, error, refetch: fetch };
}

// ── useBuyerDeals ──

export function useBuyerDeals(buyerId: string | null) {
  const [buyerDeals, setBuyerDeals] = useState<DealBuyerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!buyerId) { setBuyerDeals([]); return; }
    setLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await window.fetch(`/api/deal-buyers?buyer_id=${buyerId}`, { headers });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to fetch buyer deals (${res.status})`);
      }

      const { deal_buyers: data } = await res.json();
      setBuyerDeals(data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [buyerId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { buyerDeals, loading, error, refetch: fetch };
}

// ── Mutation helpers ──

export async function createBuyer(data: Partial<BuyerRow>): Promise<BuyerRow> {
  const headers = await getAuthHeaders();
  const res = await window.fetch("/api/buyers", {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to create buyer");
  }
  const { buyer } = await res.json();
  return buyer;
}

export async function updateBuyer(id: string, data: Partial<BuyerRow>): Promise<BuyerRow> {
  const headers = await getAuthHeaders();
  const res = await window.fetch(`/api/buyers/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to update buyer");
  }
  const { buyer } = await res.json();
  return buyer;
}

export async function deleteBuyer(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await window.fetch(`/api/buyers/${id}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to delete buyer");
  }
}

export async function linkBuyerToDeal(dealId: string, buyerId: string, extra?: Partial<DealBuyerRow>): Promise<DealBuyerRow> {
  const headers = await getAuthHeaders();
  const res = await window.fetch("/api/deal-buyers", {
    method: "POST",
    headers,
    body: JSON.stringify({ deal_id: dealId, buyer_id: buyerId, ...extra }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to link buyer");
  }
  const { deal_buyer } = await res.json();
  return deal_buyer;
}

export async function updateDealBuyer(id: string, data: Partial<DealBuyerRow>): Promise<DealBuyerRow> {
  const headers = await getAuthHeaders();
  const res = await window.fetch(`/api/deal-buyers/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to update deal-buyer");
  }
  const { deal_buyer } = await res.json();
  return deal_buyer;
}

export async function unlinkBuyerFromDeal(id: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await window.fetch(`/api/deal-buyers/${id}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to unlink buyer");
  }
}

// ── Dispo deals hook ──

export interface DispoDeal {
  id: string;
  lead_id: string;
  property_id: string;
  status: string;
  ask_price: number | null;
  offer_price: number | null;
  contract_price: number | null;
  assignment_fee: number | null;
  arv: number | null;
  repair_estimate: number | null;
  buyer_id: string | null;
  entered_dispo_at: string | null;
  dispo_prep: DispoPrep | null;
  closing_status: string | null;
  closing_target_date: string | null;
  lead_name: string | null;
  property_address: string | null;
  property_county: string | null;
  property_type: string | null;
  estimated_value: number | null;
  deal_buyers: (DealBuyerRow & { buyer?: { contact_name: string; company_name?: string | null; phone?: string | null } })[];
}

export function useDispoDeals() {
  const [deals, setDeals] = useState<DispoDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await window.fetch("/api/dispo", { headers });
      if (!res.ok) throw new Error("Failed to fetch dispo deals");
      const { deals: data } = await res.json();
      setDeals(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { deals, loading, error, refetch: fetch };
}

// ── Dispo prep mutation ──

export async function updateDealDispoPrep(dealId: string, prep: Partial<DispoPrep>): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await window.fetch(`/api/dispo/${dealId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(prep),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to update dispo prep");
  }
}

// ── Buyer stats ──

export interface BuyerStats {
  total_linked: number;
  contacted: number;
  responded: number;
  interested: number;
  offered: number;
  selected: number;
  response_rate: number | null;
  avg_response_days: number | null;
  recent_deals: {
    deal_buyer_status: string;
    offer_amount: number | null;
    date_contacted: string | null;
    linked_at: string;
    property_address: string | null;
    contract_price: number | null;
  }[];
}

export function useBuyerStats(buyerId: string | null) {
  const [stats, setStats] = useState<BuyerStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!buyerId) { setStats(null); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await window.fetch(`/api/buyers/${buyerId}/stats`, { headers });
      if (!res.ok) throw new Error("Failed to fetch buyer stats");
      const { stats: data } = await res.json();
      setStats(data);
    } catch (err: unknown) {
      setStats(null);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [buyerId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { stats, loading, error, refetch: fetch };
}
