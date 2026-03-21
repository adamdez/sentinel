"use client";

import { useState, useCallback, useEffect, useMemo, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Plus, Check, Building2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useBuyers, linkBuyerToDeal } from "@/hooks/use-buyers";
import type { BuyerRow } from "@/lib/buyer-types";
import {
  marketLabel, strategyLabel, formatPriceRange, pofLabel,
} from "@/lib/buyer-types";

export interface DealContext {
  county: string | null;
  propertyType: string | null;
  contractPrice: number | null;
  estimatedValue: number | null;
}

interface BuyerSearchModalProps {
  dealId: string;
  open: boolean;
  onClose: () => void;
  onLinked: () => void;
  /** IDs of buyers already linked to this deal — shown as disabled */
  existingBuyerIds?: string[];
  dealContext?: DealContext;
}

const COUNTY_TO_MARKET: Record<string, string> = {
  "spokane": "spokane_county",
  "spokane county": "spokane_county",
  "kootenai": "kootenai_county",
  "kootenai county": "kootenai_county",
};

interface MatchResult {
  score: number;
  reasons: string[];
}

function computeMatchScore(buyer: BuyerRow, ctx: DealContext | undefined): MatchResult {
  if (!ctx) return { score: 0, reasons: [] };

  const reasons: string[] = [];
  let score = 0;

  // Market overlap: county → market key match (+3)
  if (ctx.county && buyer.markets?.length > 0) {
    const marketKey = COUNTY_TO_MARKET[ctx.county.toLowerCase()] ?? null;
    if (marketKey && buyer.markets.includes(marketKey)) {
      score += 3;
      reasons.push("Market match");
    }
  }

  // Price range fit: deal price within buyer's range (+2)
  const dealPrice = ctx.contractPrice || ctx.estimatedValue;
  if (dealPrice && (buyer.price_range_low || buyer.price_range_high)) {
    const low = buyer.price_range_low ?? 0;
    const high = buyer.price_range_high ?? Infinity;
    if (dealPrice >= low && dealPrice <= high) {
      score += 2;
      reasons.push("Price fit");
    }
  }

  // Asset type overlap (+1)
  if (ctx.propertyType && buyer.asset_types?.length > 0) {
    const typeMap: Record<string, string> = {
      "single_family": "sfr",
      "sfr": "sfr",
      "multi_family": "multi",
      "multi": "multi",
      "land": "land",
      "mobile": "mobile",
      "commercial": "commercial",
    };
    const mapped = typeMap[ctx.propertyType.toLowerCase()] ?? ctx.propertyType.toLowerCase();
    if (buyer.asset_types.includes(mapped)) {
      score += 1;
      reasons.push("Asset match");
    }
  }

  return { score, reasons };
}

export function BuyerSearchModal({ dealId, open, onClose, onLinked, existingBuyerIds = [], dealContext }: BuyerSearchModalProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [linking, setLinking] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { buyers, loading } = useBuyers({
    status: "active",
    search: debouncedSearch || undefined,
  });

  // Sort by match score (descending), then alphabetically
  const sortedBuyers = useMemo(() => {
    if (!dealContext) return buyers;
    return [...buyers].sort((a, b) => {
      const scoreA = computeMatchScore(a, dealContext).score;
      const scoreB = computeMatchScore(b, dealContext).score;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.contact_name.localeCompare(b.contact_name);
    });
  }, [buyers, dealContext]);

  const handleLink = useCallback(async (buyer: BuyerRow) => {
    if (existingBuyerIds.includes(buyer.id)) return;
    setLinking(buyer.id);
    try {
      await linkBuyerToDeal(dealId, buyer.id);
      toast.success(`${buyer.contact_name} linked to deal`);
      onLinked();
    } catch (err) {
      if (err instanceof Error && err.message.includes("409")) {
        toast.error("Buyer already linked to this deal");
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to link buyer");
      }
    } finally {
      setLinking(null);
    }
  }, [dealId, existingBuyerIds, onLinked]);

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="relative z-50 w-full max-w-lg max-h-[70vh] flex flex-col rounded-[16px] modal-glass overflow-hidden"
            style={{ boxShadow: "inset 0 0 4px rgba(255,255,255,0.18), inset 0 0 14px rgba(0,0,0,0.12), 0 8px 26px rgba(0,0,0,0.16), 0 32px 80px rgba(0,0,0,0.08)" }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-white/[0.04]">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground">Link Buyer to Deal</h3>
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">Search and select an active buyer to link</p>
              </div>
              <button
                onClick={onClose}
                className="rounded-[8px] opacity-60 hover:opacity-100 hover:bg-primary/5 p-1 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, company, phone..."
                  autoFocus
                  className="w-full bg-white/[0.03] border border-white/[0.06] rounded-[8px] pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/30 focus:ring-1 focus:ring-ring/20 transition-all"
                />
              </div>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-4 w-4 border-2 border-primary/30 border-t-cyan rounded-full animate-spin" />
                </div>
              ) : sortedBuyers.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-xs text-muted-foreground/50">
                    {debouncedSearch ? "No buyers match your search" : "No active buyers found"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 mt-1">
                  {sortedBuyers.map((buyer, idx) => {
                    const alreadyLinked = existingBuyerIds.includes(buyer.id);
                    const isLinking = linking === buyer.id;
                    const match = computeMatchScore(buyer, dealContext);
                    const prevMatch = idx > 0 ? computeMatchScore(sortedBuyers[idx - 1], dealContext) : null;
                    const showSeparator = prevMatch && prevMatch.score > 0 && match.score === 0;
                    return (
                      <Fragment key={buyer.id}>
                        {showSeparator && (
                          <div className="flex items-center gap-2 py-1.5">
                            <div className="flex-1 h-px bg-white/[0.06]" />
                            <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">Other buyers</span>
                            <div className="flex-1 h-px bg-white/[0.06]" />
                          </div>
                        )}
                        <button
                          onClick={() => !alreadyLinked && handleLink(buyer)}
                          disabled={alreadyLinked || isLinking}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-left transition-all",
                            alreadyLinked
                              ? "bg-white/[0.01] opacity-50 cursor-not-allowed"
                              : "bg-white/[0.015] border border-white/[0.04] hover:border-primary/20 hover:bg-primary/[0.03] cursor-pointer"
                          )}
                        >
                          <div className="h-8 w-8 rounded-[8px] bg-primary/6 border border-primary/12 flex items-center justify-center shrink-0">
                            <Building2 className="h-3.5 w-3.5 text-primary/50" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">
                              {buyer.contact_name}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground/50">
                              {buyer.company_name && <span>{buyer.company_name}</span>}
                              {buyer.markets?.length > 0 && (
                                <span>{buyer.markets.map(marketLabel).join(", ")}</span>
                              )}
                              {buyer.buyer_strategy && <span>{strategyLabel(buyer.buyer_strategy)}</span>}
                              <span>{formatPriceRange(buyer.price_range_low, buyer.price_range_high)}</span>
                            </div>
                          </div>

                          {/* POF badge */}
                          <Badge
                            variant={buyer.proof_of_funds === "verified" ? "neon" : buyer.proof_of_funds === "submitted" ? "gold" : "secondary"}
                            className="text-[9px] shrink-0"
                          >
                            {pofLabel(buyer.proof_of_funds)}
                          </Badge>

                          {/* Match badges */}
                          {(() => {
                            if (match.reasons.length === 0) return null;
                            return (
                              <div className="flex gap-1 shrink-0">
                                {match.reasons.map((r) => (
                                  <Badge key={r} variant="cyan" className="text-[8px] px-1.5 py-0">
                                    {r}
                                  </Badge>
                                ))}
                              </div>
                            );
                          })()}

                          {/* Link/linked indicator */}
                          <div className="shrink-0">
                            {alreadyLinked ? (
                              <Check className="h-4 w-4 text-primary/60" />
                            ) : isLinking ? (
                              <div className="h-4 w-4 border-2 border-primary/30 border-t-cyan rounded-full animate-spin" />
                            ) : (
                              <Plus className="h-4 w-4 text-muted-foreground/30" />
                            )}
                          </div>
                        </button>
                      </Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
