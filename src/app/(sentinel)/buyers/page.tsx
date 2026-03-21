"use client";

import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Plus, Search, Filter, Phone, Mail, MessageSquare,
  Shield, ChevronDown, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { BuyerDetailModal } from "@/components/sentinel/buyer-detail-modal";
import { useBuyers, type BuyerFilters } from "@/hooks/use-buyers";
import type { BuyerRow } from "@/lib/buyer-types";
import {
  MARKET_OPTIONS, ASSET_TYPE_OPTIONS, STRATEGY_OPTIONS,
  POF_STATUS_OPTIONS, BUYER_TAG_OPTIONS,
  marketLabel, assetTypeLabel, strategyLabel,
  fundingLabel, pofLabel, tagLabel, formatPriceRange,
} from "@/lib/buyer-types";
import { useHydrated } from "@/providers/hydration-provider";
import { useCoachSurface } from "@/providers/coach-provider";
import { CoachPanel, CoachToggle } from "@/components/sentinel/coach-panel";
import { BuyerStalePanel, useStaleBuyerCount } from "@/components/sentinel/buyer-stale-panel";

// ── Filter bar ──

function FilterSelect({ value, onChange, options, placeholder, className }: {
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  placeholder: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "bg-white/[0.03] border border-white/[0.06] rounded-[8px] px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/30 transition-all appearance-none cursor-pointer",
        className
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── POF badge ──

function PofBadge({ status }: { status: string }) {
  const variant = status === "verified" ? "neon" : status === "submitted" ? "gold" : "secondary";
  return <Badge variant={variant} className="text-[10px]">{pofLabel(status)}</Badge>;
}

// ── Main page ──

export default function BuyersPage() {
  const hydrated = useHydrated();
  const [filters, setFilters] = useState<BuyerFilters>({});
  const [search, setSearch] = useState("");
  const [selectedBuyer, setSelectedBuyer] = useState<BuyerRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isCreate, setIsCreate] = useState(false);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimeout = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    if (searchTimeout[0]) clearTimeout(searchTimeout[0]);
    searchTimeout[0] = setTimeout(() => {
      setDebouncedSearch(v);
    }, 300);
  }, [searchTimeout]);

  const activeFilters = useMemo(() => ({
    ...filters,
    search: debouncedSearch || undefined,
  }), [filters, debouncedSearch]);

  const { buyers, loading, refetch } = useBuyers(activeFilters);
  const { count: staleCount } = useStaleBuyerCount();

  // Coach context — surface-level stats about buyer list health
  const unverifiedPof = buyers.filter((b) => b.proof_of_funds !== "verified").length;
  const noMarket = buyers.filter((b) => !b.markets || b.markets.length === 0).length;
  useCoachSurface("buyers", {
    buyersCtx: {
      total_buyers: buyers.length,
      unverified_pof_count: unverifiedPof,
      no_market_count: noMarket,
    },
  });

  const handleFilterChange = useCallback((key: keyof BuyerFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }, []);

  const openCreate = useCallback(() => {
    setSelectedBuyer(null);
    setIsCreate(true);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((buyer: BuyerRow) => {
    setSelectedBuyer(buyer);
    setIsCreate(false);
    setModalOpen(true);
  }, []);

  const handleSaved = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleClose = useCallback(() => {
    setModalOpen(false);
    setSelectedBuyer(null);
    setIsCreate(false);
  }, []);

  return (
    <PageShell
      title="Buyers"
      description="Manage buyer relationships and buy-box criteria"
      actions={
        <div className="flex items-center gap-2">
          {staleCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] border border-border/40 bg-muted/10 text-xs text-foreground dark:text-foreground">
              <AlertTriangle className="h-3 w-3" />
              {staleCount} stale
            </div>
          )}
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/15 rounded-[10px] border border-primary/25 hover:border-primary/40 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Buyer
          </button>
          <CoachToggle />
        </div>
      }
    >
      {/* Filters */}
      <GlassCard hover={false} delay={0.02} className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search buyers..."
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-[8px] pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 transition-all"
            />
          </div>
          <FilterSelect value={filters.status ?? ""} onChange={(v) => handleFilterChange("status", v)} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} placeholder="All Status" />
          <FilterSelect value={filters.market ?? ""} onChange={(v) => handleFilterChange("market", v)} options={MARKET_OPTIONS as unknown as { value: string; label: string }[]} placeholder="All Markets" />
          <FilterSelect value={filters.asset_type ?? ""} onChange={(v) => handleFilterChange("asset_type", v)} options={ASSET_TYPE_OPTIONS as unknown as { value: string; label: string }[]} placeholder="All Assets" />
          <FilterSelect value={filters.strategy ?? ""} onChange={(v) => handleFilterChange("strategy", v)} options={STRATEGY_OPTIONS as unknown as { value: string; label: string }[]} placeholder="All Strategy" />
          <FilterSelect value={filters.pof ?? ""} onChange={(v) => handleFilterChange("pof", v)} options={POF_STATUS_OPTIONS as unknown as { value: string; label: string }[]} placeholder="All POF" />
        </div>
      </GlassCard>

      {/* Stale buyer maintenance panel — collapses when all buyers are current */}
      <BuyerStalePanel onBuyerUpdated={refetch} />

      {/* Table */}
      <GlassCard hover={false} delay={0.04} className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 border-2 border-primary/30 border-t-cyan rounded-full animate-spin" />
          </div>
        ) : buyers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-3">
              <Filter className="h-5 w-5 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground/60">No buyers yet</p>
            <p className="text-xs text-muted-foreground/40 mt-1">Add your first buyer to start tracking relationships.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Contact</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Markets</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Strategy</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Price Range</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">POF</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Tags</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">Status</th>
                </tr>
              </thead>
              <tbody>
                {buyers.map((buyer, i) => (
                  <motion.tr
                    key={buyer.id}
                    initial={hydrated ? { opacity: 0, y: 4 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02, duration: 0.1 }}
                    onClick={() => openEdit(buyer)}
                    className="border-b border-white/[0.02] hover:bg-white/[0.02] cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-foreground">{buyer.contact_name}</div>
                      {buyer.company_name && (
                        <div className="text-[11px] text-muted-foreground/50">{buyer.company_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {buyer.markets?.map((m) => (
                          <span key={m} className="text-[10px] text-muted-foreground/60">{marketLabel(m)}</span>
                        ))}
                        {(!buyer.markets || buyer.markets.length === 0) && <span className="text-[10px] text-muted-foreground/30">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground/70">
                      {buyer.buyer_strategy ? strategyLabel(buyer.buyer_strategy) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground/70">
                      {formatPriceRange(buyer.price_range_low, buyer.price_range_high)}
                    </td>
                    <td className="px-4 py-2.5">
                      <PofBadge status={buyer.proof_of_funds} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {buyer.tags?.slice(0, 3).map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0">
                            {tagLabel(t)}
                          </Badge>
                        ))}
                        {(buyer.tags?.length ?? 0) > 3 && (
                          <span className="text-[10px] text-muted-foreground/40">+{buyer.tags.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={buyer.status === "active" ? "neon" : "secondary"} className="text-[10px]">
                        {buyer.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Modal */}
      <BuyerDetailModal
        buyer={selectedBuyer}
        open={modalOpen}
        onClose={handleClose}
        onSaved={handleSaved}
        isCreate={isCreate}
      />

      <CoachPanel />
    </PageShell>
  );
}
