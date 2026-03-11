"use client";

import { useState } from "react";
import {
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LeadFilters as FilterState, FollowUpFilter, MarketFilter, OutboundCallStatusFilter } from "@/hooks/use-leads";
import type { LeadStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface LeadFiltersProps {
  filters: FilterState;
  onUpdate: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onReset: () => void;
  totalFiltered: number;
  totalAll: number;
  sourceOptions: Array<{ value: string; label: string; count: number }>;
  nicheOptions: Array<{ value: string; label: string; count: number }>;
  importBatchOptions: Array<{ value: string; label: string; count: number }>;
  callStatusOptions: Array<{ value: OutboundCallStatusFilter; label: string; count: number }>;
}

const STATUS_OPTIONS: { value: LeadStatus; label: string; color: string }[] = [
  { value: "lead", label: "Lead", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  { value: "negotiation", label: "Negotiation", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  { value: "disposition", label: "Disposition", color: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
  { value: "nurture", label: "Nurture", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { value: "dead", label: "Dead", color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" },
  { value: "closed", label: "Closed", color: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
];

const MARKET_OPTIONS: { value: MarketFilter; label: string }[] = [
  { value: "spokane", label: "Spokane" },
  { value: "kootenai", label: "Kootenai" },
  { value: "other", label: "Other" },
];

const FOLLOW_UP_OPTIONS: { value: FollowUpFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due Today" },
  { value: "urgent_uncontacted", label: "Slow/Missing Response" },
  { value: "uncontacted", label: "No Contact Yet" },
];

const CALL_STATUS_LABELS: Record<OutboundCallStatusFilter, string> = {
  not_called: "Not Called",
  contacted: "Contacted",
  wrong_number: "Wrong Number",
  do_not_call: "Do Not Call",
  bad_record: "Bad Record",
};

export function LeadFilters({
  filters,
  onUpdate,
  onReset,
  totalFiltered,
  totalAll,
  sourceOptions,
  nicheOptions,
  importBatchOptions,
  callStatusOptions,
}: LeadFiltersProps) {
  const [expanded, setExpanded] = useState(false);
  const activeFilterCount = [
    filters.search.trim().length > 0,
    filters.statuses.length > 0,
    filters.markets.length > 0,
    filters.sources.length > 0,
    filters.nicheTags.length > 0,
    filters.importBatches.length > 0,
    filters.callStatuses.length > 0,
    filters.followUp !== "all",
    filters.unassignedOnly,
    filters.includeClosed,
    filters.excludeSuppressed,
  ].filter(Boolean).length;
  const hasFilters = activeFilterCount > 0;

  const toggleStatus = (s: LeadStatus) => {
    const next = filters.statuses.includes(s)
      ? filters.statuses.filter((v) => v !== s)
      : [...filters.statuses, s];
    onUpdate("statuses", next);
  };

  const toggleMarket = (m: MarketFilter) => {
    const next = filters.markets.includes(m)
      ? filters.markets.filter((v) => v !== m)
      : [...filters.markets, m];
    onUpdate("markets", next);
  };

  const toggleSource = (s: string) => {
    const next = filters.sources.includes(s)
      ? filters.sources.filter((v) => v !== s)
      : [...filters.sources, s];
    onUpdate("sources", next);
  };

  const toggleNiche = (tag: string) => {
    const next = filters.nicheTags.includes(tag)
      ? filters.nicheTags.filter((v) => v !== tag)
      : [...filters.nicheTags, tag];
    onUpdate("nicheTags", next);
  };

  const toggleImportBatch = (batch: string) => {
    const next = filters.importBatches.includes(batch)
      ? filters.importBatches.filter((v) => v !== batch)
      : [...filters.importBatches, batch];
    onUpdate("importBatches", next);
  };

  const toggleCallStatus = (status: OutboundCallStatusFilter) => {
    const next = filters.callStatuses.includes(status)
      ? filters.callStatuses.filter((v) => v !== status)
      : [...filters.callStatuses, status];
    onUpdate("callStatuses", next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search APN, address, owner, batch..."
            className="pl-9 h-9"
            value={filters.search}
            onChange={(e) => onUpdate("search", e.target.value)}
          />
          {filters.search && (
            <button
              onClick={() => onUpdate("search", "")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className={cn("gap-1.5 text-xs", expanded && "border-cyan/20 text-cyan")}
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal className="h-3 w-3" />
          Filters
          {hasFilters && (
            <span className="bg-cyan/15 text-cyan text-[10px] px-1.5 rounded-full">
              {activeFilterCount} active
            </span>
          )}
        </Button>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={onReset}>
            <X className="h-3 w-3" />
            Clear
          </Button>
        )}

        <Badge variant="outline" className="text-[10px] ml-auto">
          {totalFiltered === totalAll
            ? `${totalAll} leads`
            : `${totalFiltered} of ${totalAll}`}
        </Badge>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="rounded-[12px] border border-glass-border bg-glass/50 p-4 space-y-4">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Stage
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => toggleStatus(opt.value)}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-md border transition-all",
                        filters.statuses.includes(opt.value)
                          ? opt.color
                          : "border-white/[0.06] text-muted-foreground hover:text-foreground hover:border-white/15"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Market
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {MARKET_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => toggleMarket(opt.value)}
                        className={cn(
                          "text-[11px] px-2.5 py-1 rounded-md border transition-all",
                          filters.markets.includes(opt.value)
                            ? "bg-cyan/12 text-cyan border-cyan/20"
                            : "border-glass-border text-muted-foreground hover:text-foreground hover:border-white/15"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Source Channel
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {sourceOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => toggleSource(opt.value)}
                        className={cn(
                          "text-[11px] px-2.5 py-1 rounded-md border transition-all",
                          filters.sources.includes(opt.value)
                            ? "bg-cyan/12 text-cyan border-cyan/20"
                            : "border-glass-border text-muted-foreground hover:text-foreground hover:border-white/15"
                        )}
                      >
                        {opt.label} <span className="opacity-60">({opt.count})</span>
                      </button>
                    ))}
                    {sourceOptions.length === 0 && (
                      <span className="text-[11px] text-muted-foreground/50">No source data</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Niche
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {nicheOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => toggleNiche(opt.value)}
                        className={cn(
                          "text-[11px] px-2.5 py-1 rounded-md border transition-all",
                          filters.nicheTags.includes(opt.value)
                            ? "bg-cyan/12 text-cyan border-cyan/20"
                            : "border-glass-border text-muted-foreground hover:text-foreground hover:border-white/15"
                        )}
                      >
                        {opt.label} <span className="opacity-60">({opt.count})</span>
                      </button>
                    ))}
                    {nicheOptions.length === 0 && (
                      <span className="text-[11px] text-muted-foreground/50">No niche data</span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Import Batch
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {importBatchOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => toggleImportBatch(opt.value)}
                        className={cn(
                          "text-[11px] px-2.5 py-1 rounded-md border transition-all",
                          filters.importBatches.includes(opt.value)
                            ? "bg-cyan/12 text-cyan border-cyan/20"
                            : "border-glass-border text-muted-foreground hover:text-foreground hover:border-white/15"
                        )}
                      >
                        {opt.label} <span className="opacity-60">({opt.count})</span>
                      </button>
                    ))}
                    {importBatchOptions.length === 0 && (
                      <span className="text-[11px] text-muted-foreground/50">No batch data</span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Next Action
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {FOLLOW_UP_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onUpdate("followUp", opt.value)}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-md border transition-all",
                        filters.followUp === opt.value
                          ? "bg-cyan/12 text-cyan border-cyan/20"
                          : "border-glass-border text-muted-foreground hover:text-foreground hover:border-white/15"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Call Status
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {callStatusOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => toggleCallStatus(opt.value)}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-md border transition-all",
                        filters.callStatuses.includes(opt.value)
                          ? "bg-cyan/12 text-cyan border-cyan/20"
                          : "border-glass-border text-muted-foreground hover:text-foreground hover:border-white/15"
                      )}
                    >
                      {CALL_STATUS_LABELS[opt.value]} <span className="opacity-60">({opt.count})</span>
                    </button>
                  ))}
                  {callStatusOptions.length === 0 && (
                    <span className="text-[11px] text-muted-foreground/50">No call-state data</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Assignment
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => onUpdate("unassignedOnly", !filters.unassignedOnly)}
                    className={cn(
                      "flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-md border transition-all",
                      filters.unassignedOnly
                        ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
                        : "border-white/[0.06] text-muted-foreground hover:text-foreground hover:border-white/15"
                    )}
                  >
                    Unassigned only
                  </button>
                  <button
                    onClick={() => onUpdate("includeClosed", !filters.includeClosed)}
                    className={cn(
                      "flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-md border transition-all",
                      filters.includeClosed
                        ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
                        : "border-white/[0.06] text-muted-foreground hover:text-foreground hover:border-white/15"
                    )}
                  >
                    Include closed
                  </button>
                  <button
                    onClick={() => onUpdate("excludeSuppressed", !filters.excludeSuppressed)}
                    className={cn(
                      "flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-md border transition-all",
                      filters.excludeSuppressed
                        ? "bg-red-500/15 text-red-300 border-red-500/30"
                        : "border-white/[0.06] text-muted-foreground hover:text-foreground hover:border-white/15"
                    )}
                  >
                    Exclude DNC / bad data
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
