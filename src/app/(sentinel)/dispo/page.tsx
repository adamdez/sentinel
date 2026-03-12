"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, Plus, MapPin, DollarSign, Users,
  CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { updateDealBuyer } from "@/hooks/use-buyers";
import {
  DEAL_BUYER_STATUS_OPTIONS, dealBuyerStatusLabel,
} from "@/lib/buyer-types";
import type { DealBuyerRow } from "@/lib/buyer-types";
import { BuyerSearchModal } from "@/components/sentinel/buyer-search-modal";
import { useHydrated } from "@/providers/hydration-provider";

// ── Types ──

interface DispoDeal {
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
  lead_name: string | null;
  property_address: string | null;
  deal_buyers: (DealBuyerRow & { buyer?: { contact_name: string; company_name?: string | null; phone?: string | null } })[];
}

// ── Hook ──

function useDispoDeals() {
  const [deals, setDeals] = useState<DispoDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");
      const res = await window.fetch("/api/dispo", {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });
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

// ── Helpers ──

function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${(v / 1000).toFixed(0)}k`;
}

function spreadColor(spread: number): string {
  if (spread > 0) return "text-emerald-400";
  if (spread < 0) return "text-red-400";
  return "text-muted-foreground";
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "selected": return "neon" as const;
    case "interested": case "offered": return "cyan" as const;
    case "sent": case "follow_up": return "gold" as const;
    case "passed": return "secondary" as const;
    default: return "outline" as const;
  }
}

function buyerStatusSummary(buyers: DealBuyerRow[]): string {
  if (buyers.length === 0) return "No buyers linked";
  const counts: Record<string, number> = {};
  for (const b of buyers) {
    counts[b.status] = (counts[b.status] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([s, n]) => `${n} ${dealBuyerStatusLabel(s).toLowerCase()}`)
    .join(", ");
}

// ── Deal Card ──

function DealCard({ deal, onStatusChange, onLinkBuyer }: {
  deal: DispoDeal;
  onStatusChange: (dbId: string, newStatus: string) => void;
  onLinkBuyer: (dealId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <GlassCard hover delay={0} className="p-0 overflow-hidden">
      {/* Card header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/[0.01] transition-colors"
      >
        <div className="h-9 w-9 rounded-[10px] bg-cyan/6 border border-cyan/12 flex items-center justify-center shrink-0 mt-0.5">
          <MapPin className="h-4 w-4 text-cyan/60" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-foreground truncate">
            {deal.property_address || "No address"}
          </div>
          {deal.lead_name && (
            <div className="text-xs text-muted-foreground/50 mt-0.5">{deal.lead_name}</div>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground/60">
            <span>Contract: <span className="text-foreground/80 font-medium">{fmtPrice(deal.contract_price)}</span></span>
            <span>ARV: <span className="text-foreground/80 font-medium">{fmtPrice(deal.arv)}</span></span>
            {deal.offer_price && (
              <span>Offer: <span className="text-foreground/80 font-medium">{fmtPrice(deal.offer_price)}</span></span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <Users className="h-3 w-3 text-muted-foreground/40" />
            <span className="text-xs text-muted-foreground/60">{deal.deal_buyers.length}</span>
          </div>
          <span className="text-[10px] text-muted-foreground/40">{buyerStatusSummary(deal.deal_buyers)}</span>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/30" />
          </motion.div>
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.04] px-4 pb-4 pt-3">
              {/* Link buyer button */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold">Linked Buyers</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onLinkBuyer(deal.id); }}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-cyan bg-cyan/8 hover:bg-cyan/12 rounded-[6px] border border-cyan/20 hover:border-cyan/30 transition-all"
                >
                  <Plus className="h-3 w-3" />
                  Link Buyer
                </button>
              </div>

              {deal.deal_buyers.length === 0 ? (
                <div className="text-xs text-muted-foreground/40 py-4 text-center">
                  No buyers linked yet. Add a buyer to start outreach.
                </div>
              ) : (
                <div className="space-y-2">
                  {deal.deal_buyers.map((db) => {
                    const spread = (db.offer_amount != null && deal.contract_price != null)
                      ? db.offer_amount - deal.contract_price
                      : null;
                    return (
                      <div key={db.id} className="flex items-center gap-3 px-3 py-2.5 rounded-[8px] bg-white/[0.015] border border-white/[0.04]">
                        {/* Buyer info */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {db.buyer?.contact_name ?? "Unknown"}
                          </div>
                          {db.buyer?.company_name && (
                            <div className="text-[11px] text-muted-foreground/40">{db.buyer.company_name}</div>
                          )}
                        </div>

                        {/* Status dropdown */}
                        <select
                          value={db.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            onStatusChange(db.id, e.target.value);
                          }}
                          className="bg-white/[0.03] border border-white/[0.08] rounded-[6px] px-2 py-1 text-[11px] text-foreground focus:outline-none focus:border-cyan/30 transition-all appearance-none cursor-pointer min-w-[100px]"
                        >
                          {DEAL_BUYER_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>

                        {/* Offer amount */}
                        {db.offer_amount != null && (
                          <span className="text-xs font-medium text-foreground/80 shrink-0">
                            {fmtPrice(db.offer_amount)}
                          </span>
                        )}

                        {/* Spread */}
                        {spread != null && (
                          <span className={cn("text-xs font-medium shrink-0", spreadColor(spread))}>
                            {spread >= 0 ? "+" : ""}{fmtPrice(spread)}
                          </span>
                        )}

                        {/* Follow-up indicator */}
                        {db.follow_up_needed && (
                          <CalendarClock className="h-3.5 w-3.5 text-amber-400/70 shrink-0" />
                        )}

                        {/* Contact date */}
                        {db.date_contacted && (
                          <span className="text-[10px] text-muted-foreground/40 shrink-0">
                            {new Date(db.date_contacted).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

// ── Page ──

export default function DispoPage() {
  const hydrated = useHydrated();
  const { deals, loading, refetch } = useDispoDeals();
  const [searchModal, setSearchModal] = useState<string | null>(null); // deal ID for buyer search

  const handleStatusChange = useCallback(async (dbId: string, newStatus: string) => {
    try {
      await updateDealBuyer(dbId, { status: newStatus as DealBuyerRow["status"] });
      toast.success(`Status updated to ${dealBuyerStatusLabel(newStatus)}`);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  }, [refetch]);

  const handleLinkBuyer = useCallback((dealId: string) => {
    // This will open the BuyerSearchModal (Task 10)
    setSearchModal(dealId);
  }, []);

  return (
    <PageShell
      title="Dispo Board"
      description="Match buyers to deals in disposition"
    >
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-5 w-5 border-2 border-cyan/30 border-t-cyan rounded-full animate-spin" />
        </div>
      ) : deals.length === 0 ? (
        <GlassCard hover={false} delay={0.02} className="py-16">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="h-14 w-14 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
              <DollarSign className="h-6 w-6 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground/60 font-medium">No deals in disposition</p>
            <p className="text-xs text-muted-foreground/40 mt-1 max-w-sm">
              Deals enter disposition from the pipeline when a seller accepts an offer.
            </p>
          </div>
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {/* Summary bar */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground/60">
            <span>{deals.length} {deals.length === 1 ? "deal" : "deals"} in disposition</span>
            <span>·</span>
            <span>
              {deals.reduce((acc, d) => acc + d.deal_buyers.length, 0)} total buyer links
            </span>
          </div>

          {/* Deal cards */}
          {deals.map((deal, i) => (
            <motion.div
              key={deal.id}
              initial={hydrated ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.15 }}
            >
              <DealCard
                deal={deal}
                onStatusChange={handleStatusChange}
                onLinkBuyer={handleLinkBuyer}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Buyer Search Modal */}
      {searchModal && (
        <BuyerSearchModal
          dealId={searchModal}
          open
          onClose={() => setSearchModal(null)}
          onLinked={() => { setSearchModal(null); refetch(); }}
          existingBuyerIds={
            deals.find((d) => d.id === searchModal)?.deal_buyers.map((db) => db.buyer_id) ?? []
          }
        />
      )}
    </PageShell>
  );
}
