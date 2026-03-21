"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, Plus, MapPin, DollarSign, Users,
  CalendarClock, ChevronRight, FileText, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatSellerName, fmtPrice, spreadColor } from "@/lib/display-helpers";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { updateDealBuyer, useDispoDeals, updateDealDispoPrep } from "@/hooks/use-buyers";
import type { DispoDeal } from "@/hooks/use-buyers";
import {
  DEAL_BUYER_STATUS_OPTIONS, dealBuyerStatusLabel,
  OCCUPANCY_STATUS_OPTIONS,
} from "@/lib/buyer-types";
import type { DealBuyerRow, DispoPrep } from "@/lib/buyer-types";
import { Badge } from "@/components/ui/badge";
import { deriveDispoActionSummary, type DispoActionSummary } from "@/lib/dispo-action-derivation";
import type { UrgencyLevel } from "@/lib/action-derivation";
import { BuyerSearchModal } from "@/components/sentinel/buyer-search-modal";
import { DealClosingCard } from "@/components/sentinel/deal-closing-card";
import { useHydrated } from "@/providers/hydration-provider";
import { useCoachSurface } from "@/providers/coach-provider";
import { CoachPanel, CoachToggle } from "@/components/sentinel/coach-panel";

// ── Helpers ──
// formatSellerName, fmtPrice, spreadColor imported from @/lib/display-helpers

// Statuses that indicate buyer has responded
const RESPONDED_STATUSES = new Set(["interested", "offered", "follow_up", "selected"]);
// Statuses that haven't responded yet
const PRE_RESPONSE_STATUSES = new Set(["not_contacted", "queued", "sent"]);

// ── Shared action derivation ──

function deriveDealAction(deal: DispoDeal): DispoActionSummary {
  return deriveDispoActionSummary({
    enteredDispoAt: deal.entered_dispo_at,
    closingStatus: deal.closing_status,
    buyerStatuses: deal.deal_buyers.map((db) => ({
      status: db.status,
      dateContacted: db.date_contacted,
      respondedAt: db.responded_at,
    })),
  });
}

/** Numeric rank for urgency-based deal sorting — lower = more urgent */
const DISPO_URGENCY_RANK: Record<UrgencyLevel, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  none: 4,
};

function daysAgo(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

/** Urgency → style class for action label in deal cards */
function dispoUrgencyClass(urgency: string): string {
  switch (urgency) {
    case "critical": return "text-foreground";
    case "high": return "text-foreground";
    case "normal": return "text-muted-foreground/70";
    default: return "text-muted-foreground/50";
  }
}

// ── Outreach Funnel Bar ──

function OutreachFunnel({ deals }: { deals: DispoDeal[] }) {
  const stats = useMemo(() => {
    const allBuyers = deals.flatMap((d) => d.deal_buyers);
    const linked = allBuyers.length;
    const contacted = allBuyers.filter((b) => b.status !== "not_contacted" && b.status !== "queued").length;
    const responded = allBuyers.filter((b) => RESPONDED_STATUSES.has(b.status) || (b.status === "passed" && b.responded_at)).length;
    const interested = allBuyers.filter((b) => b.status === "interested" || b.status === "offered" || b.status === "selected").length;
    const selected = allBuyers.filter((b) => b.status === "selected").length;

    // Avg days in dispo
    const dispoAges = deals
      .map((d) => daysAgo(d.entered_dispo_at))
      .filter((d): d is number => d != null);
    const avgDaysInDispo = dispoAges.length > 0
      ? Math.round(dispoAges.reduce((a, b) => a + b, 0) / dispoAges.length)
      : null;

    return { deals: deals.length, linked, contacted, responded, interested, selected, avgDaysInDispo };
  }, [deals]);

  const steps = [
    { label: "deals", count: stats.deals },
    { label: "linked", count: stats.linked },
    { label: "contacted", count: stats.contacted },
    { label: "responded", count: stats.responded },
    { label: "interested", count: stats.interested },
    { label: "selected", count: stats.selected },
  ];

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground/60 flex-wrap">
      {steps.map((step, i) => (
        <span key={step.label} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/20" />}
          <span className="text-foreground/70 font-medium">{step.count}</span>
          <span>{step.label}</span>
        </span>
      ))}
      {stats.avgDaysInDispo != null && (
        <>
          <span className="text-muted-foreground/20 mx-1">|</span>
          <span>avg <span className="text-foreground/70 font-medium">{stats.avgDaysInDispo === 0 ? "< 1" : stats.avgDaysInDispo} {stats.avgDaysInDispo === 1 ? "day" : "days"}</span> in dispo</span>
        </>
      )}
    </div>
  );
}

// ── Stalled Deals Panel ──

function StalledDealsPanel({ deals }: { deals: DispoDeal[] }) {
  const stalledDeals = useMemo(() => {
    const results: { deal: DispoDeal; summary: DispoActionSummary }[] = [];
    for (const deal of deals) {
      const summary = deriveDealAction(deal);
      if (summary.isStalled) results.push({ deal, summary });
    }
    return results;
  }, [deals]);
  const [open, setOpen] = useState(true);

  if (stalledDeals.length === 0) return null;

  return (
    <GlassCard hover={false} delay={0} className="p-0 overflow-hidden border-border/15">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-white/[0.01] transition-colors"
      >
        <AlertTriangle className="h-3.5 w-3.5 text-foreground/70" />
        <span className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
          Needs Attention
        </span>
        <Badge variant="gold" className="text-[9px]">{stalledDeals.length}</Badge>
        <div className="flex-1" />
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="h-3 w-3 text-muted-foreground/30" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-1.5">
              {stalledDeals.map((s) => (
                <div key={s.deal.id} className="flex items-center gap-2 px-3 py-2 rounded-[6px] bg-muted/[0.03] border border-border/10">
                  <MapPin className="h-3 w-3 text-foreground/50 shrink-0" />
                  <span className="text-xs text-foreground/70 truncate flex-1">
                    {s.deal.property_address || "No address"}
                  </span>
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded shrink-0", dispoUrgencyClass(s.summary.urgency))} title={s.summary.reason}>
                    {s.summary.action}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}

// ── Dispo Prep Form ──

function DispoPrepForm({ deal, onSaved }: { deal: DispoDeal; onSaved: () => void }) {
  const prep = deal.dispo_prep || {} as Partial<DispoPrep>;
  const [saving, setSaving] = useState(false);

  const handleBlur = useCallback(async (field: keyof DispoPrep, value: string | number | null) => {
    setSaving(true);
    try {
      await updateDealDispoPrep(deal.id, { [field]: value });
      toast.success("Saved", { duration: 1500 });
      onSaved();
    } catch {
      toast.error("Failed to save dispo prep");
    } finally {
      setSaving(false);
    }
  }, [deal.id, onSaved]);

  const inputClass = "w-full bg-white/[0.03] border border-white/[0.06] rounded-[6px] px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20 transition-all";
  const labelClass = "text-[10px] text-muted-foreground/50 font-medium mb-1";

  return (
    <div className="space-y-3">
      {/* Price row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className={labelClass}>Asking Assignment Price</div>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/40">$</span>
            <input
              type="number"
              defaultValue={prep.asking_assignment_price ?? ""}
              placeholder="0"
              className={cn(inputClass, "pl-6")}
              onBlur={(e) => handleBlur("asking_assignment_price", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        </div>
        <div>
          <div className={labelClass}>Estimated Rehab</div>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground/40">$</span>
            <input
              type="number"
              defaultValue={prep.estimated_rehab ?? ""}
              placeholder="0"
              className={cn(inputClass, "pl-6")}
              onBlur={(e) => handleBlur("estimated_rehab", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
        </div>
      </div>

      {/* Occupancy */}
      <div>
        <div className={labelClass}>Occupancy Status</div>
        <select
          defaultValue={prep.occupancy_status ?? ""}
          className={cn(inputClass, "appearance-none cursor-pointer")}
          onChange={(e) => handleBlur("occupancy_status", e.target.value || null)}
        >
          <option value="">Select...</option>
          {OCCUPANCY_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Text fields */}
      <div>
        <div className={labelClass}>Property Highlights</div>
        <textarea
          defaultValue={prep.property_highlights ?? ""}
          placeholder="Key selling points..."
          rows={2}
          className={cn(inputClass, "resize-none")}
          onBlur={(e) => handleBlur("property_highlights", e.target.value || null)}
        />
      </div>

      <div>
        <div className={labelClass}>Known Issues</div>
        <textarea
          defaultValue={prep.known_issues ?? ""}
          placeholder="Foundation, roof, etc..."
          rows={2}
          className={cn(inputClass, "resize-none")}
          onBlur={(e) => handleBlur("known_issues", e.target.value || null)}
        />
      </div>

      <div>
        <div className={labelClass}>Access Notes</div>
        <textarea
          defaultValue={prep.access_notes ?? ""}
          placeholder="Lockbox, appointment only, etc..."
          rows={1}
          className={cn(inputClass, "resize-none")}
          onBlur={(e) => handleBlur("access_notes", e.target.value || null)}
        />
      </div>

      <div>
        <div className={labelClass}>Dispo Summary</div>
        <textarea
          defaultValue={prep.dispo_summary ?? ""}
          placeholder="Quick pitch for buyers..."
          rows={2}
          className={cn(inputClass, "resize-none")}
          onBlur={(e) => handleBlur("dispo_summary", e.target.value || null)}
        />
      </div>

      {saving && (
        <div className="text-[10px] text-primary/60">Saving...</div>
      )}
    </div>
  );
}

// ── Selection Reason Input ──

function SelectionReasonInput({ dbId, currentReason, onSaved }: {
  dbId: string;
  currentReason: string | null;
  onSaved: () => void;
}) {
  const handleBlur = useCallback(async (value: string) => {
    try {
      await updateDealBuyer(dbId, { selection_reason: value || null } as Partial<DealBuyerRow>);
      onSaved();
    } catch {
      toast.error("Failed to save selection reason");
    }
  }, [dbId, onSaved]);

  return (
    <div className="mt-1.5">
      <input
        defaultValue={currentReason ?? ""}
        placeholder="Why this buyer? (saves on blur)"
        className="w-full bg-white/[0.02] border border-primary/10 rounded-[4px] px-2 py-1 text-[10px] text-foreground/70 placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30 transition-all"
        onBlur={(e) => handleBlur(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ── Deal Card ──

function DealCard({ deal, expanded, onToggleExpand, onStatusChange, onLinkBuyer, onRefetch }: {
  deal: DispoDeal;
  expanded: boolean;
  onToggleExpand: () => void;
  onStatusChange: (dbId: string, newStatus: string, prevStatus: string) => void;
  onLinkBuyer: (dealId: string) => void;
  onRefetch: () => void;
}) {
  const [prepOpen, setPrepOpen] = useState(false);
  const actionSummary = useMemo(() => deriveDealAction(deal), [deal]);

  return (
    <GlassCard hover delay={0} className="p-0 overflow-hidden">
      {/* Card header — always visible */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-white/[0.01] transition-colors"
      >
        <div className="h-9 w-9 rounded-[10px] bg-primary/6 border border-primary/12 flex items-center justify-center shrink-0 mt-0.5">
          <MapPin className="h-4 w-4 text-primary/60" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-foreground truncate">
            {deal.property_address || "No address"}
          </div>
          {deal.lead_name && (
            <div className="text-xs text-muted-foreground/50 mt-0.5">{formatSellerName(deal.lead_name)}</div>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground/60">
            <span>Contract: <span className="text-foreground/80 font-medium">{fmtPrice(deal.contract_price)}</span></span>
            <span>ARV: <span className="text-foreground/80 font-medium">{fmtPrice(deal.arv)}</span></span>
            {deal.offer_price && (
              <span>Offer: <span className="text-foreground/80 font-medium">{fmtPrice(deal.offer_price)}</span></span>
            )}
          </div>
          {/* Dispo action summary — compact reason line */}
          {actionSummary.urgency !== "none" && (
            <div className={cn("text-[10px] mt-1.5 truncate", dispoUrgencyClass(actionSummary.urgency))} title={actionSummary.reason}>
              {actionSummary.action}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5">
            <Users className="h-3 w-3 text-muted-foreground/40" />
            <span className="text-xs text-muted-foreground/60">{deal.deal_buyers.length}</span>
          </div>
          {actionSummary.daysInDispo != null && (
            <span className={cn(
              "text-[10px]",
              actionSummary.daysInDispo > 14 ? "text-foreground/60" : "text-muted-foreground/40"
            )}>
              {actionSummary.daysInDispo}d in dispo
            </span>
          )}
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
              {/* Dispo Prep toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); setPrepOpen(!prepOpen); }}
                className="flex items-center gap-2 mb-3 text-[11px] text-muted-foreground/60 hover:text-muted-foreground/80 transition-colors"
              >
                <FileText className="h-3 w-3" />
                <span className="font-semibold tracking-wide">Dispo Prep</span>
                <motion.div animate={{ rotate: prepOpen ? 90 : 0 }} transition={{ duration: 0.1 }}>
                  <ChevronRight className="h-3 w-3" />
                </motion.div>
                {deal.dispo_prep?.dispo_summary && (
                  <span className="text-[9px] text-primary/40 normal-case tracking-normal font-normal ml-1">has summary</span>
                )}
              </button>

              <AnimatePresence initial={false}>
                {prepOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden mb-4"
                  >
                    <div className="p-3 rounded-[8px] bg-white/[0.01] border border-white/[0.04]">
                      <DispoPrepForm deal={deal} onSaved={onRefetch} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Closing coordination — shown when deal has contract price or closing status */}
              {(deal.contract_price || deal.closing_status || deal.status === "closed") && (
                <DealClosingCard dealId={deal.id} onUpdate={onRefetch} />
              )}

              {/* Link buyer button */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] text-muted-foreground/60 font-semibold tracking-wide">Linked Buyers</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onLinkBuyer(deal.id); }}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-primary bg-primary/8 hover:bg-primary/12 rounded-[6px] border border-primary/20 hover:border-primary/30 transition-all"
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
                      <div key={db.id}>
                        <div className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-[8px] bg-white/[0.015] border",
                          db.status === "selected" ? "border-primary/20" : "border-white/[0.04]"
                        )}>
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
                              onStatusChange(db.id, e.target.value, db.status);
                            }}
                            className="bg-white/[0.03] border border-white/[0.08] rounded-[6px] px-2 py-1 text-[11px] text-foreground focus:outline-none focus:border-primary/30 transition-all appearance-none cursor-pointer min-w-[100px]"
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
                            <CalendarClock className="h-3.5 w-3.5 text-foreground/70 shrink-0" />
                          )}

                          {/* Contact date */}
                          {db.date_contacted && (
                            <span className="text-[10px] text-muted-foreground/40 shrink-0">
                              {new Date(db.date_contacted).toLocaleDateString()}
                            </span>
                          )}
                        </div>

                        {/* Selection reason — shown when status = selected */}
                        {db.status === "selected" && (
                          <SelectionReasonInput
                            dbId={db.id}
                            currentReason={db.selection_reason ?? null}
                            onSaved={onRefetch}
                          />
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
  const { deals: rawDeals, loading, refetch } = useDispoDeals();
  const [searchModal, setSearchModal] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Sort deals by urgency: critical stalls first, closed deals last
  const deals = useMemo(() => {
    return [...rawDeals].sort((a, b) => {
      const aUrgency = DISPO_URGENCY_RANK[deriveDealAction(a).urgency];
      const bUrgency = DISPO_URGENCY_RANK[deriveDealAction(b).urgency];
      if (aUrgency !== bUrgency) return aUrgency - bUrgency;
      // Tie-break: oldest in dispo first (waiting longest)
      const aEntered = a.entered_dispo_at ? new Date(a.entered_dispo_at).getTime() : Infinity;
      const bEntered = b.entered_dispo_at ? new Date(b.entered_dispo_at).getTime() : Infinity;
      return aEntered - bEntered;
    });
  }, [rawDeals]);

  // Coach context — surface-level stats about dispo health
  const stalledCount = useMemo(() => deals.filter((d) => deriveDealAction(d).isStalled).length, [deals]);
  const noBuyersCount = deals.filter((d) => d.deal_buyers.length === 0).length;
  const selectedCount = deals.reduce(
    (acc, d) => acc + d.deal_buyers.filter((db) => db.status === "selected").length, 0
  );
  useCoachSurface("dispo", {
    dispoCtx: {
      total_deals: deals.length,
      stalled_count: stalledCount,
      no_buyers_linked_count: noBuyersCount,
      selected_buyer_count: selectedCount,
    },
  });

  const toggleExpanded = useCallback((dealId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId);
      else next.add(dealId);
      return next;
    });
  }, []);

  const handleStatusChange = useCallback(async (dbId: string, newStatus: string, prevStatus: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, any> = { status: newStatus };

      // Auto-set responded_at when transitioning from pre-response to response status
      if (PRE_RESPONSE_STATUSES.has(prevStatus) && RESPONDED_STATUSES.has(newStatus)) {
        patch.responded_at = new Date().toISOString();
      }

      await updateDealBuyer(dbId, patch as Partial<DealBuyerRow>);
      if (newStatus === "selected") {
        toast.success("Buyer selected!", {
          description: "Other linked buyers auto-passed",
          duration: 4000,
        });
      } else {
        toast.success(`Status → ${dealBuyerStatusLabel(newStatus)}`);
      }
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  }, [refetch]);

  const handleLinkBuyer = useCallback((dealId: string) => {
    setSearchModal(dealId);
  }, []);

  // Build dealContext for the active search modal
  const searchDeal = searchModal ? deals.find((d) => d.id === searchModal) : null;
  const dealContext = searchDeal ? {
    county: searchDeal.property_county ?? null,
    propertyType: searchDeal.property_type ?? null,
    contractPrice: searchDeal.contract_price ?? null,
    estimatedValue: searchDeal.estimated_value ?? null,
  } : undefined;

  return (
    <PageShell
      title="Dispo Board"
      description="Match buyers to deals in disposition"
      actions={<CoachToggle />}
    >
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-5 w-5 border-2 border-primary/30 border-t-cyan rounded-full animate-spin" />
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
          {/* Stalled deals panel */}
          <StalledDealsPanel deals={deals} />

          {/* Outreach funnel bar */}
          <OutreachFunnel deals={deals} />

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
                expanded={expandedIds.has(deal.id)}
                onToggleExpand={() => toggleExpanded(deal.id)}
                onStatusChange={handleStatusChange}
                onLinkBuyer={handleLinkBuyer}
                onRefetch={refetch}
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
          dealContext={dealContext}
        />
      )}

      <CoachPanel />
    </PageShell>
  );
}
