"use client";

/**
 * BuyerRadarPanel
 *
 * Shows a ranked buyer list for a given lead. Opens on demand — no auto-fetch.
 *
 * Operator rules:
 * - Logan sees: buyer name, key attributes, staleness flag, Contact / Not-right actions.
 * - Logan does NOT see the composite monetizability score — that is Adam-only.
 * - Eliminated (hard-disqualified) buyers shown at bottom in muted style.
 * - Three interactions: Show Buyers, Contact (queued), Not right for this deal (passed).
 */

import { useState, useCallback } from "react";
import { Radar, Loader2, AlertTriangle, XCircle, Phone, Clock, ChevronDown, ChevronUp, Users, RefreshCw, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useBuyerRadar,
  queueBuyerForOutreach,
  dismissBuyerForDeal,
  updateExistingDealBuyerStatus,
  type ExistingDealBuyer,
  type RadarResultWithExisting,
} from "@/hooks/use-buyer-radar";
import type { RadarEntry, EliminatedEntry } from "@/lib/buyer-fit";
import { strategyLabel, rehabLabel, marketLabel, fundingLabel } from "@/lib/buyer-types";

interface BuyerRadarPanelProps {
  leadId: string;
  isAdminView?: boolean;
}

export function BuyerRadarPanel({ leadId, isAdminView = false }: BuyerRadarPanelProps) {
  const [open, setOpen] = useState(false);
  const { data, loading, error, refetch } = useBuyerRadar(open ? leadId : null);
  const [actionBuyers, setActionBuyers] = useState<Record<string, "loading" | "queued" | "passed">>({});

  const handleOpen = useCallback(() => {
    setOpen(true);
    refetch();
  }, [refetch]);

  const handleContact = useCallback(async (
    buyerId: string,
    existing: ExistingDealBuyer | null,
    dealId: string | null
  ) => {
    if (!dealId) {
      toast.error("No deal found for this lead. Create a deal first.");
      return;
    }
    setActionBuyers((p) => ({ ...p, [buyerId]: "loading" }));
    try {
      if (existing) {
        await updateExistingDealBuyerStatus(existing.id, "queued");
      } else {
        await queueBuyerForOutreach(dealId, buyerId);
      }
      setActionBuyers((p) => ({ ...p, [buyerId]: "queued" }));
      toast.success("Buyer queued for outreach");
      refetch();
    } catch (err) {
      setActionBuyers((p) => { const n = { ...p }; delete n[buyerId]; return n; });
      toast.error(err instanceof Error ? err.message : "Failed to queue buyer");
    }
  }, [refetch]);

  const handleDismiss = useCallback(async (
    buyerId: string,
    existing: ExistingDealBuyer | null,
    dealId: string | null
  ) => {
    if (!dealId) {
      toast.error("No deal found for this lead. Create a deal first.");
      return;
    }
    setActionBuyers((p) => ({ ...p, [buyerId]: "loading" }));
    try {
      if (existing) {
        await updateExistingDealBuyerStatus(existing.id, "passed");
      } else {
        await dismissBuyerForDeal(dealId, buyerId);
      }
      setActionBuyers((p) => ({ ...p, [buyerId]: "passed" }));
      toast.success("Buyer dismissed for this deal");
      refetch();
    } catch (err) {
      setActionBuyers((p) => { const n = { ...p }; delete n[buyerId]; return n; });
      toast.error(err instanceof Error ? err.message : "Failed to dismiss buyer");
    }
  }, [refetch]);

  return (
    <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={open ? () => setOpen(false) : handleOpen}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-white/[0.03] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Radar className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">
            Buyer Radar
          </span>
          {data && !loading && (
            <span className="text-sm text-muted-foreground/60">
              {data.activeBuyerCount} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/50" />}
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/50" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />}
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-white/[0.06] px-3 pb-3 pt-2 space-y-2">

          {error && (
            <div className="flex items-center gap-2 text-sm text-foreground/80 bg-muted/5 rounded-[8px] px-2.5 py-2">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {loading && !data && (
            <div className="space-y-2 py-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-11 rounded-[8px] bg-white/[0.03] animate-pulse" />
              ))}
            </div>
          )}

          {!loading && data && data.results.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground/60 py-2">
              <Users className="h-3.5 w-3.5" />
              No buyers in database yet. Add buyers in the Buyers section.
            </div>
          )}

          {/* Adam-only: monetizability score */}
          {isAdminView && data?.monetizabilityVisible && data.monetizabilityScore !== null && (
            <div className="flex items-center justify-between rounded-[8px] bg-primary/5 border border-primary/10 px-2.5 py-2">
              <span className="text-sm text-primary/70 uppercase tracking-wider font-semibold">Computed Monetizability</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-mono font-semibold text-primary">{data.monetizabilityScore.toFixed(1)}</span>
                <span className="text-sm text-muted-foreground/50">/10</span>
              </div>
            </div>
          )}
          {isAdminView && data && !data.monetizabilityVisible && (
            <div className="text-sm text-muted-foreground/40 italic px-0.5">
              Score available after {10 - data.activeBuyerCount} more active buyer{(10 - data.activeBuyerCount) !== 1 ? "s" : ""}
            </div>
          )}

          {/* Buyer rows */}
          {data && data.results.map((result) => (
            <BuyerRow
              key={result.buyer.id}
              result={result}
              dealId={data.dealId}
              actionState={actionBuyers[result.buyer.id]}
              onContact={handleContact}
              onDismiss={handleDismiss}
            />
          ))}

          {data && (
            <button
              onClick={refetch}
              className="flex items-center gap-1 text-sm text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors mt-1"
            >
              <RefreshCw className="h-2.5 w-2.5" />
              Refresh
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Individual buyer row ──────────────────────────────────────────────────────

function BuyerRow({
  result,
  dealId,
  actionState,
  onContact,
  onDismiss,
}: {
  result: RadarResultWithExisting;
  dealId: string | null;
  actionState: "loading" | "queued" | "passed" | undefined;
  onContact: (buyerId: string, existing: ExistingDealBuyer | null, dealId: string | null) => void;
  onDismiss: (buyerId: string, existing: ExistingDealBuyer | null, dealId: string | null) => void;
}) {
  const isEliminated = result.eliminated;
  const buyer = result.buyer;
  const existing = result.existingDealBuyer;

  const existingStatus = actionState === "queued"
    ? "queued"
    : actionState === "passed"
    ? "passed"
    : existing?.status ?? null;

  const staleFlag = !isEliminated && (result as RadarEntry).stale;
  const flags = !isEliminated ? (result as RadarEntry).flags : [];
  const eliminateReason = isEliminated ? (result as EliminatedEntry).reason : null;

  return (
    <div className={cn(
      "rounded-[8px] border px-2.5 py-2 transition-colors",
      isEliminated
        ? "border-white/[0.04] bg-white/[0.01] opacity-40"
        : "border-white/[0.06] bg-white/[0.03]"
    )}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn(
              "text-xs font-medium leading-tight",
              isEliminated ? "text-muted-foreground/40" : "text-foreground"
            )}>
              {buyer.contact_name}
            </span>
            {buyer.company_name && (
              <span className="text-sm text-muted-foreground/50">· {buyer.company_name}</span>
            )}
            {existingStatus && (
              <StatusBadge status={existingStatus} />
            )}
            {buyer.reliability_score !== null && buyer.reliability_score >= 4 && (
              <span title={`Reliability ${buyer.reliability_score}/5`}>
                <Star className="h-2.5 w-2.5 text-foreground/60 fill-yellow-400/40" />
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {buyer.markets.length > 0 && (
              <span className="text-sm text-muted-foreground/60">{buyer.markets.map(marketLabel).join(", ")}</span>
            )}
            {buyer.buyer_strategy && (
              <span className="text-sm text-muted-foreground/50">{strategyLabel(buyer.buyer_strategy)}</span>
            )}
            {buyer.funding_type && (
              <span className="text-sm text-muted-foreground/40">{fundingLabel(buyer.funding_type)}</span>
            )}
            {buyer.close_speed_days !== null && (
              <span className="text-sm text-muted-foreground/40">{buyer.close_speed_days}d close</span>
            )}
            {buyer.rehab_tolerance && (
              <span className="text-sm text-muted-foreground/40">{rehabLabel(buyer.rehab_tolerance)} ok</span>
            )}
            {buyer.deals_closed > 0 && (
              <span className="text-sm text-muted-foreground/40">{buyer.deals_closed} closed</span>
            )}
          </div>

          {/* Stale / flags / elimination */}
          {(staleFlag || flags.length > 0 || eliminateReason) && (
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {staleFlag && (
                <span className="flex items-center gap-1 text-[9.5px] text-foreground/70 bg-muted/[0.08] rounded px-1.5 py-0.5">
                  <Clock className="h-2.5 w-2.5" />
                  Verify still buying
                </span>
              )}
              {flags.map((f, i) => (
                <span key={i} className="text-[9.5px] text-muted-foreground/50 bg-white/[0.04] rounded px-1.5 py-0.5">
                  {f}
                </span>
              ))}
              {eliminateReason && (
                <span className="text-[9.5px] text-foreground/50">{eliminateReason}</span>
              )}
            </div>
          )}
        </div>

        {/* Actions — only for non-eliminated */}
        {!isEliminated && (
          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
            {actionState === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/40" />
            ) : existingStatus === "passed" ? (
              <span className="text-[9.5px] text-muted-foreground/40 italic">Dismissed</span>
            ) : existingStatus && ["queued", "sent", "interested", "offered", "selected"].includes(existingStatus) ? (
              <span className="text-[9.5px] text-primary/60 italic">In pipeline</span>
            ) : (
              <>
                <button
                  onClick={() => onContact(buyer.id, existing, dealId)}
                  disabled={!dealId}
                  title={!dealId ? "Create a deal for this lead first" : "Queue buyer for outreach"}
                  className={cn(
                    "flex items-center gap-1 text-sm px-2 py-1 rounded-[6px] font-medium transition-colors",
                    dealId
                      ? "bg-primary/10 text-primary/80 hover:bg-primary/20 border border-primary/15"
                      : "bg-white/[0.04] text-muted-foreground/30 border border-white/[0.04] cursor-not-allowed"
                  )}
                >
                  <Phone className="h-2.5 w-2.5" />
                  Contact
                </button>
                <button
                  onClick={() => onDismiss(buyer.id, existing, dealId)}
                  disabled={!dealId}
                  title={!dealId ? "Create a deal for this lead first" : "Not right for this deal"}
                  className={cn(
                    "flex items-center gap-1 text-sm px-2 py-1 rounded-[6px] font-medium transition-colors",
                    dealId
                      ? "text-muted-foreground/50 hover:text-muted-foreground/80 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06]"
                      : "text-muted-foreground/20 cursor-not-allowed"
                  )}
                >
                  <XCircle className="h-2.5 w-2.5" />
                  Not right
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    queued:     { label: "Queued",     className: "bg-primary/10 text-primary/70 border-primary/15" },
    sent:       { label: "Sent",       className: "bg-muted/10 text-foreground/70 border-border/15" },
    interested: { label: "Interested", className: "bg-muted/10 text-foreground/70 border-border/15" },
    offered:    { label: "Offered",    className: "bg-muted/10 text-foreground/70 border-border/15" },
    selected:   { label: "Selected",   className: "bg-muted/10 text-foreground/80 border-border/15" },
    passed:     { label: "Passed",     className: "bg-white/[0.04] text-muted-foreground/40 border-white/[0.06]" },
    follow_up:  { label: "Follow Up",  className: "bg-muted/10 text-foreground/70 border-border/15" },
  };
  const c = cfg[status];
  if (!c) return null;
  return (
    <span className={cn("text-xs px-1.5 py-0.5 rounded border font-medium", c.className)}>
      {c.label}
    </span>
  );
}
