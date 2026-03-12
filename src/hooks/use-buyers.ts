"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { BuyerRow, DealBuyerRow } from "@/lib/buyer-types";

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
