"use client";

import { useMemo, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  LeadFilters as FilterState,
  FollowUpFilter,
  OutboundCallStatusFilter,
  LeadOption,
  LeadBatchOrRunOption,
} from "@/hooks/use-leads";
import type { LeadStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { filterChip } from "@/lib/sentinel-ui";

interface LeadFiltersProps {
  filters: FilterState;
  onUpdate: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onReset: () => void;
  totalFiltered: number;
  totalAll: number;
  sourceOptions: LeadOption[];
  nicheOptions: LeadOption[];
  batchOrRunOptions: LeadBatchOrRunOption[];
  callStatusOptions: Array<{ value: OutboundCallStatusFilter; label: string; count: number }>;
}

const STATUS_OPTIONS: { value: LeadStatus; label: string; color: string }[] = [
  { value: "lead", label: "Lead", color: "bg-muted/20 text-foreground border-border/30" },
  { value: "negotiation", label: "Negotiation", color: "bg-muted/20 text-foreground border-border/30" },
  { value: "disposition", label: "Disposition", color: "bg-muted/20 text-foreground border-border/30" },
  { value: "nurture", label: "Nurture", color: "bg-muted/20 text-foreground border-border/30" },
  { value: "dead", label: "Dead", color: "bg-muted/20 text-foreground border-border/30" },
  { value: "closed", label: "Closed", color: "bg-muted/20 text-foreground border-border/30" },
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
  batchOrRunOptions,
  callStatusOptions,
}: LeadFiltersProps) {
  const [expanded, setExpanded] = useState(false);
  const [sourceQuery, setSourceQuery] = useState("");
  const [batchOrRunQuery, setBatchOrRunQuery] = useState("");

  const activeFilterCount = [
    filters.search.trim().length > 0,
    filters.statuses.length > 0,
    filters.markets.length > 0,
    filters.sources.length > 0,
    filters.nicheTags.length > 0,
    filters.batchOrRuns.length > 0,
    filters.callStatuses.length > 0,
    filters.followUp !== "all",
    filters.unassignedOnly,
    filters.includeClosed,
    filters.excludeSuppressed,
    filters.hasPhone !== "any",
    filters.neverCalled,
    filters.notCalledToday,
    filters.distressTags.length > 0,
    filters.inDialQueue !== "any",
  ].filter(Boolean).length;
  const hasFilters = activeFilterCount > 0;

  const filteredSourceOptions = useMemo(
    () => filterOptions(sourceOptions, sourceQuery),
    [sourceOptions, sourceQuery],
  );
  const filteredBatchOrRunOptions = useMemo(
    () => filterOptions(batchOrRunOptions, batchOrRunQuery),
    [batchOrRunOptions, batchOrRunQuery],
  );

  const toggleStatus = (status: LeadStatus) => {
    const next = filters.statuses.includes(status)
      ? filters.statuses.filter((value) => value !== status)
      : [...filters.statuses, status];
    onUpdate("statuses", next);
  };

  const toggleSource = (source: string) => {
    const next = filters.sources.includes(source)
      ? filters.sources.filter((value) => value !== source)
      : [...filters.sources, source];
    onUpdate("sources", next);
  };

  const toggleNiche = (tag: string) => {
    const next = filters.nicheTags.includes(tag)
      ? filters.nicheTags.filter((value) => value !== tag)
      : [...filters.nicheTags, tag];
    onUpdate("nicheTags", next);
  };

  const toggleBatchOrRun = (value: string) => {
    const next = filters.batchOrRuns.includes(value)
      ? filters.batchOrRuns.filter((current) => current !== value)
      : [...filters.batchOrRuns, value];
    onUpdate("batchOrRuns", next);
  };

  const toggleCallStatus = (status: OutboundCallStatusFilter) => {
    const next = filters.callStatuses.includes(status)
      ? filters.callStatuses.filter((value) => value !== status)
      : [...filters.callStatuses, status];
    onUpdate("callStatuses", next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, address, phone, email, zip..."
            className="pl-9 h-9"
            value={filters.search}
            onChange={(event) => onUpdate("search", event.target.value)}
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
          className={cn("gap-1.5 text-xs", expanded && "border-primary/20 text-primary")}
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal className="h-3 w-3" />
          Filters
          {hasFilters && (
            <span className="bg-primary/15 text-primary text-sm px-1.5 rounded-full">
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

        <Badge variant="outline" className="text-sm ml-auto">
          {totalFiltered === totalAll ? `${totalAll} leads` : `${totalFiltered} of ${totalAll}`}
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
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Stage
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => toggleStatus(option.value)}
                      className={cn(
                        "text-sm px-2.5 py-1 rounded-md border transition-all",
                        filters.statuses.includes(option.value) ? option.color : cn(filterChip.idle),
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <SearchableMultiSelectSection
                  title="Source Channel"
                  placeholder="Search sources..."
                  query={sourceQuery}
                  onQueryChange={setSourceQuery}
                  options={filteredSourceOptions}
                  selectedValues={filters.sources}
                  onToggle={toggleSource}
                  emptyText={sourceOptions.length === 0 ? "No source data" : "No source matches"}
                />

                <SearchableMultiSelectSection
                  title="Run / Batch"
                  placeholder="Search Scout runs or import batches..."
                  query={batchOrRunQuery}
                  onQueryChange={setBatchOrRunQuery}
                  options={filteredBatchOrRunOptions}
                  selectedValues={filters.batchOrRuns}
                  onToggle={toggleBatchOrRun}
                  emptyText={batchOrRunOptions.length === 0 ? "No run or batch data" : "No run or batch matches"}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Niche
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {nicheOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => toggleNiche(option.value)}
                        className={cn(
                          "text-sm px-2.5 py-1 rounded-md border transition-all",
                          filters.nicheTags.includes(option.value) ? cn(filterChip.active) : cn(filterChip.idle),
                        )}
                      >
                        {option.label} <span className="opacity-60">({option.count})</span>
                      </button>
                    ))}
                    {nicheOptions.length === 0 && (
                      <span className="text-sm text-muted-foreground/50">No niche data</span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Next Action
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {FOLLOW_UP_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => onUpdate("followUp", option.value)}
                      className={cn(
                        "text-sm px-2.5 py-1 rounded-md border transition-all",
                        filters.followUp === option.value ? cn(filterChip.active) : cn(filterChip.idle),
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Call Status
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {callStatusOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => toggleCallStatus(option.value)}
                      className={cn(
                        "text-sm px-2.5 py-1 rounded-md border transition-all",
                        filters.callStatuses.includes(option.value) ? cn(filterChip.active) : cn(filterChip.idle),
                      )}
                    >
                      {CALL_STATUS_LABELS[option.value]} <span className="opacity-60">({option.count})</span>
                    </button>
                  ))}
                  {callStatusOptions.length === 0 && (
                    <span className="text-sm text-muted-foreground/50">No call-state data</span>
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Assignment
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => onUpdate("unassignedOnly", !filters.unassignedOnly)}
                    className={cn(
                      "flex items-center gap-1.5 text-sm px-3 py-1 rounded-md border transition-all",
                      filters.unassignedOnly
                        ? "bg-muted/15 text-foreground border-border/30"
                        : cn(filterChip.idle),
                    )}
                  >
                    Unassigned only
                  </button>
                  <button
                    onClick={() => onUpdate("includeClosed", !filters.includeClosed)}
                    className={cn(
                      "flex items-center gap-1.5 text-sm px-3 py-1 rounded-md border transition-all",
                      filters.includeClosed
                        ? "bg-muted/15 text-foreground border-border/30"
                        : cn(filterChip.idle),
                    )}
                  >
                    Include closed
                  </button>
                  <button
                    onClick={() => onUpdate("excludeSuppressed", !filters.excludeSuppressed)}
                    className={cn(
                      "flex items-center gap-1.5 text-sm px-3 py-1 rounded-md border transition-all",
                      filters.excludeSuppressed
                        ? "bg-muted/15 text-foreground border-border/30"
                        : cn(filterChip.idle),
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

interface SearchableMultiSelectSectionProps {
  title: string;
  placeholder: string;
  query: string;
  onQueryChange: (value: string) => void;
  options: LeadOption[];
  selectedValues: string[];
  onToggle: (value: string) => void;
  emptyText: string;
}

function SearchableMultiSelectSection({
  title,
  placeholder,
  query,
  onQueryChange,
  options,
  selectedValues,
  onToggle,
  emptyText,
}: SearchableMultiSelectSectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </p>
        {selectedValues.length > 0 && (
          <span className="text-[11px] text-primary/80 font-medium">
            {selectedValues.length} selected
          </span>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          className="h-8 pl-8 pr-8 text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="max-h-48 overflow-auto rounded-lg border border-border/15 bg-overlay-3 p-2">
        {options.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground/50">{emptyText}</p>
        ) : (
          <div className="space-y-1">
            {options.map((option) => {
              const active = selectedValues.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onToggle(option.value)}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm transition-all text-left",
                    active ? cn(filterChip.active) : "border-border/10 bg-overlay-4 hover:border-border/30",
                  )}
                >
                  <span className="min-w-0 truncate">{option.label}</span>
                  <span className="shrink-0 text-xs opacity-70">{option.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function filterOptions<T extends LeadOption>(options: T[], query: string): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;

  return options.filter((option) =>
    `${option.label} ${option.value}`.toLowerCase().includes(normalized),
  );
}
