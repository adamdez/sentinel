"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface IntakeFiltersBarProps {
  statusFilter: string;
  onStatusChange: (status: string) => void;
  sourceFilter: string;
  onSourceChange: (source: string) => void;
  dateRange: { from: string; to: string };
  onDateRangeChange: (range: { from: string; to: string }) => void;
}

export function IntakeFiltersBar({
  statusFilter,
  onStatusChange,
  sourceFilter,
  onSourceChange,
  dateRange,
  onDateRangeChange,
}: IntakeFiltersBarProps) {
  const [providers, setProviders] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  // Fetch providers for source filter dropdown
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        setLoadingProviders(true);
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        }
        const response = await fetch("/api/intake/providers", { headers });
        if (response.ok) {
          const data = await response.json();
          setProviders(data.providers || []);
        }
      } catch (error) {
        console.error("[IntakeFiltersBar] Failed to fetch providers:", error);
      } finally {
        setLoadingProviders(false);
      }
    };

    fetchProviders();
  }, []);

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Status Filter */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
          >
            <option value="pending_review">Ready to Claim</option>
            <option value="claimed">Claimed</option>
            <option value="rejected">Rejected</option>
            <option value="duplicate">Duplicate</option>
          </select>
        </div>

        {/* Source Filter */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Provider
          </label>
          <select
            value={sourceFilter}
            onChange={(e) => onSourceChange(e.target.value)}
            disabled={loadingProviders}
            className="w-full px-3 py-2 rounded border border-border bg-background text-foreground disabled:opacity-50"
          >
            <option value="">All Providers</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.name}>
                {provider.name}
              </option>
            ))}
          </select>
        </div>

        {/* From Date */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            From Date
          </label>
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) =>
              onDateRangeChange({ ...dateRange, from: e.target.value })
            }
            className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
          />
        </div>

        {/* To Date */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            To Date
          </label>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) =>
              onDateRangeChange({ ...dateRange, to: e.target.value })
            }
            className="w-full px-3 py-2 rounded border border-border bg-background text-foreground"
          />
        </div>
      </div>

      {/* Active Filters Display */}
      {(sourceFilter || dateRange.from || dateRange.to) && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {sourceFilter && (
            <button
              onClick={() => onSourceChange("")}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted text-sm font-medium text-foreground hover:bg-muted/80"
            >
              {sourceFilter}
              <X className="w-4 h-4" />
            </button>
          )}
          {dateRange.from && (
            <button
              onClick={() =>
                onDateRangeChange({ ...dateRange, from: "" })
              }
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted text-sm font-medium text-foreground hover:bg-muted/80"
            >
              From {dateRange.from}
              <X className="w-4 h-4" />
            </button>
          )}
          {dateRange.to && (
            <button
              onClick={() => onDateRangeChange({ ...dateRange, to: "" })}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted text-sm font-medium text-foreground hover:bg-muted/80"
            >
              To {dateRange.to}
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
