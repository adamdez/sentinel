"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  RefreshCw,
  UserCheck,
  UserX,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StaleBuyerRow {
  id: string;
  contact_name: string;
  company_name: string | null;
  phone: string | null;
  markets: string[];
  status: string;
  last_contacted_at: string | null;
  do_not_contact: boolean;
  tags: string[];
  reliability_score: number | null;
  updated_at: string;
}

interface StaleResponse {
  buyers: StaleBuyerRow[];
  count: number;
  stale_threshold_days: number;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useStaleBuyers() {
  const [data, setData] = useState<StaleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session expired");
      const res = await window.fetch("/api/buyers/stale", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Failed (${res.status})`);
      }
      setData(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, refetch: fetch };
}

// ── Stale age helper ──────────────────────────────────────────────────────────

function staleSince(lastContactedAt: string | null): string {
  if (!lastContactedAt) return "Never contacted";
  const days = Math.floor((Date.now() - new Date(lastContactedAt).getTime()) / 86_400_000);
  if (days < 90) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ── BuyerStalePanel ───────────────────────────────────────────────────────────
// Compact collapsible panel. Loads on mount. Two actions per buyer:
//   "Still active" — bumps last_contacted_at to today
//   "Mark inactive" — sets status = 'inactive'

interface BuyerStalePanelProps {
  /** Called after any mutation so the parent list can refetch if needed */
  onBuyerUpdated?: () => void;
}

export function BuyerStalePanel({ onBuyerUpdated }: BuyerStalePanelProps) {
  const { data, loading, error, refetch } = useStaleBuyers();
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => { refetch(); }, [refetch]);

  async function patchBuyer(id: string, payload: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Session expired");
    const res = await window.fetch(`/api/buyers/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error || "Update failed");
    }
  }

  async function handleStillActive(buyer: StaleBuyerRow) {
    setBusyId(buyer.id);
    setActionError(null);
    try {
      await patchBuyer(buyer.id, { last_contacted_at: new Date().toISOString() });
      setDismissed(prev => new Set([...prev, buyer.id]));
      onBuyerUpdated?.();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkInactive(buyer: StaleBuyerRow) {
    setBusyId(buyer.id);
    setActionError(null);
    try {
      await patchBuyer(buyer.id, { status: "inactive" });
      setDismissed(prev => new Set([...prev, buyer.id]));
      onBuyerUpdated?.();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  const visibleBuyers = (data?.buyers ?? []).filter(b => !dismissed.has(b.id));
  const staleCount = visibleBuyers.length;

  // Don't render at all if no stale buyers and not loading
  if (!loading && !error && staleCount === 0 && data !== null) return null;

  return (
    <div className="rounded-lg border border-border/50 dark:border-border/40 bg-muted/50 dark:bg-muted/20 overflow-hidden">
      {/* ── Header (always visible) ── */}
      <button
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 dark:hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-foreground dark:text-foreground shrink-0" />
          <span className="text-sm font-medium text-foreground dark:text-foreground">
            Stale buyer profiles
          </span>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-foreground" />}
          {!loading && staleCount > 0 && (
            <Badge className="bg-muted text-white text-xs h-4 px-1.5">
              {staleCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground/60 dark:text-foreground/60">
            {data ? `90+ days since contact` : ""}
          </span>
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-foreground/60" />
            : <ChevronDown className="h-3.5 w-3.5 text-foreground/60" />
          }
        </div>
      </button>

      {/* ── Expanded list ── */}
      {expanded && (
        <div className="border-t border-border/50 dark:border-border/30">
          {error && (
            <p className="px-4 py-3 text-xs text-destructive">{error}</p>
          )}

          {!loading && !error && visibleBuyers.length === 0 && (
            <p className="px-4 py-3 text-xs text-foreground/60 dark:text-foreground/60">
              No stale buyers right now.
            </p>
          )}

          {visibleBuyers.map(buyer => (
            <div
              key={buyer.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/60 dark:border-border/30 last:border-0"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{buyer.contact_name}</span>
                  {buyer.company_name && (
                    <span className="text-xs text-muted-foreground truncate">{buyer.company_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <Clock className="h-3 w-3 text-foreground/70 shrink-0" />
                  <span className="text-xs text-foreground/70 dark:text-foreground/70">
                    {staleSince(buyer.last_contacted_at)}
                  </span>
                  {buyer.markets?.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      · {buyer.markets.slice(0, 2).join(", ")}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs px-2 border-border/60 text-foreground hover:bg-muted dark:border-border/60 dark:text-foreground dark:hover:bg-muted/30"
                  disabled={busyId === buyer.id}
                  onClick={() => handleStillActive(buyer)}
                  title="Confirm still active — updates last contacted date to today"
                >
                  {busyId === buyer.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <UserCheck className="h-3 w-3 mr-1" />
                  }
                  Still active
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs px-2 border-border/60 text-foreground hover:bg-muted dark:border-border/60 dark:text-foreground dark:hover:bg-muted/30"
                  disabled={busyId === buyer.id}
                  onClick={() => handleMarkInactive(buyer)}
                  title="Mark as inactive — removes from radar"
                >
                  {busyId === buyer.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <UserX className="h-3 w-3 mr-1" />
                  }
                  Inactive
                </Button>
              </div>
            </div>
          ))}

          {actionError && (
            <p className="px-4 py-2 text-xs text-destructive">{actionError}</p>
          )}

          {/* Refresh + context footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border/60 dark:border-border/30 bg-muted/30 dark:bg-muted/10">
            <p className="text-xs text-foreground/50 dark:text-foreground/50">
              &ldquo;Still active&rdquo; bumps last contact date to today.
              &ldquo;Inactive&rdquo; removes from radar.
            </p>
            <button
              className="flex items-center gap-1 text-xs text-foreground/50 hover:text-foreground dark:text-foreground/50 dark:hover:text-foreground transition-colors"
              onClick={() => { setDismissed(new Set()); refetch(); }}
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Exported count-only hook for badges elsewhere ─────────────────────────────

export function useStaleBuyerCount() {
  const { data, loading, refetch } = useStaleBuyers();
  useEffect(() => { refetch(); }, [refetch]);
  return { count: data?.count ?? 0, loading };
}
