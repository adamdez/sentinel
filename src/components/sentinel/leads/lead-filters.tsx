"use client";

import { useState } from "react";
import {
  Search,
  SlidersHorizontal,
  X,
  ShieldCheck,
  Flame,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LeadFilters as FilterState } from "@/hooks/use-leads";
import type { DistressType, LeadStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface LeadFiltersProps {
  filters: FilterState;
  onUpdate: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onReset: () => void;
  totalFiltered: number;
  totalAll: number;
}

const STATUS_OPTIONS: { value: LeadStatus; label: string; color: string }[] = [
  { value: "prospect", label: "Prospect", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { value: "lead", label: "Lead", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  { value: "negotiation", label: "Negotiation", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  { value: "nurture", label: "Nurture", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { value: "dead", label: "Dead", color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" },
];

const DISTRESS_OPTIONS: { value: DistressType; label: string }[] = [
  { value: "probate", label: "Probate" },
  { value: "pre_foreclosure", label: "Pre-Foreclosure" },
  { value: "tax_lien", label: "Tax Lien" },
  { value: "code_violation", label: "Code Violation" },
  { value: "vacant", label: "Vacant" },
  { value: "divorce", label: "Divorce" },
  { value: "bankruptcy", label: "Bankruptcy" },
  { value: "fsbo", label: "FSBO" },
  { value: "absentee", label: "Absentee" },
  { value: "inherited", label: "Inherited" },
];

const SCORE_PRESETS = [
  { label: "All", value: 0 },
  { label: "40+", value: 40 },
  { label: "65+", value: 65 },
  { label: "85+", value: 85 },
];

export function LeadFilters({
  filters,
  onUpdate,
  onReset,
  totalFiltered,
  totalAll,
}: LeadFiltersProps) {
  const [expanded, setExpanded] = useState(false);
  const hasFilters =
    filters.statuses.length > 0 ||
    filters.distressTypes.length > 0 ||
    filters.minScore > 0 ||
    filters.complianceOnly;

  const toggleStatus = (s: LeadStatus) => {
    const next = filters.statuses.includes(s)
      ? filters.statuses.filter((v) => v !== s)
      : [...filters.statuses, s];
    onUpdate("statuses", next);
  };

  const toggleDistress = (d: DistressType) => {
    const next = filters.distressTypes.includes(d)
      ? filters.distressTypes.filter((v) => v !== d)
      : [...filters.distressTypes, d];
    onUpdate("distressTypes", next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search APN, address, owner..."
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
              active
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
              {/* Status */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Status
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
                          : "border-glass-border text-muted-foreground hover:text-foreground hover:border-white/15"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Distress Signals */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Distress Signals
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {DISTRESS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => toggleDistress(opt.value)}
                      className={cn(
                        "text-[11px] px-2.5 py-1 rounded-md border transition-all",
                        filters.distressTypes.includes(opt.value)
                          ? "bg-cyan/12 text-cyan border-cyan/20"
                          : "border-glass-border text-muted-foreground hover:text-foreground hover:border-white/15"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Min Score + Compliance */}
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    <Flame className="inline h-3 w-3 mr-1" />
                    Min Heat Score
                  </p>
                  <div className="flex gap-1.5">
                    {SCORE_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => onUpdate("minScore", p.value)}
                        className={cn(
                          "text-[11px] px-2.5 py-1 rounded-md border transition-all",
                          filters.minScore === p.value
                            ? "bg-cyan/12 text-cyan border-cyan/20"
                            : "border-glass-border text-muted-foreground hover:text-foreground hover:border-white/15"
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => onUpdate("complianceOnly", !filters.complianceOnly)}
                  className={cn(
                    "flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-md border transition-all",
                    filters.complianceOnly
                      ? "bg-green-500/15 text-green-400 border-green-500/30"
                      : "border-glass-border text-muted-foreground hover:text-foreground hover:border-white/15"
                  )}
                >
                  <ShieldCheck className="h-3 w-3" />
                  Compliance clean only
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
