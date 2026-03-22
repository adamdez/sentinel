"use client";

import { forwardRef, useState } from "react";
import { ChevronDown, ChevronRight, Wrench } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { BrickedRepair } from "@/providers/bricked/adapter";

interface Props {
  repairs: BrickedRepair[];
  totalRepairCost: number | null | undefined;
}

export const BrickedRepairsList = forwardRef<HTMLDivElement, Props>(
  function BrickedRepairsList({ repairs, totalRepairCost }, ref) {
    const [open, setOpen] = useState(true);

    if (!repairs.length) return null;

    return (
      <div ref={ref} className="rounded-[10px] border border-white/[0.06] bg-[rgba(12,12,22,0.5)] overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <Wrench className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Repair Estimates
          </span>
          {totalRepairCost != null && (
            <span className="ml-auto text-sm font-bold font-mono text-amber-300">
              {formatCurrency(totalRepairCost)}
            </span>
          )}
        </button>
        {open && (
          <div className="divide-y divide-white/[0.04]">
            {repairs.map((r, i) => (
              <div key={i} className="flex items-start justify-between gap-4 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{r.repair ?? "Item"}</p>
                  {r.description && (
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">{r.description}</p>
                  )}
                </div>
                <span className="text-xs font-bold font-mono shrink-0">
                  {r.cost != null ? formatCurrency(r.cost) : "—"}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.02]">
              <span className="text-xs font-semibold text-muted-foreground">Total</span>
              <span className="text-sm font-bold font-mono">
                {totalRepairCost != null ? formatCurrency(totalRepairCost) : "—"}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  },
);
