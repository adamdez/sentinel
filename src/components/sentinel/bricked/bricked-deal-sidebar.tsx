"use client";

import { ExternalLink, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

interface Props {
  arv: number | null | undefined;
  cmv: number | null | undefined;
  totalRepairCost: number | null | undefined;
  offerPrice: number | null | undefined;
  selectedCompCount: number;
  dashboardLink?: string | null;
  shareLink?: string | null;
  onScrollToRepairs?: () => void;
  onConfigureClick?: () => void;
}

export function BrickedDealSidebar({
  arv,
  cmv,
  totalRepairCost,
  offerPrice,
  selectedCompCount,
  dashboardLink,
  shareLink,
  onScrollToRepairs,
  onConfigureClick,
}: Props) {
  const link = dashboardLink ?? shareLink;

  return (
    <div className="rounded-[10px] border border-overlay-6 bg-panel backdrop-blur-xl p-4 space-y-4 sticky top-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Deal Analysis
      </h3>

      <div>
        <p className="text-[10px] uppercase text-muted-foreground/70">After Repair Value</p>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-2xl font-bold font-mono text-emerald-400">
            {arv != null ? formatCurrency(arv) : "—"}
          </span>
          <Badge variant="outline" className="text-[8px]">Bricked</Badge>
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase text-muted-foreground/70">Current Market Value</p>
        <span className="text-lg font-semibold font-mono">
          {cmv != null ? formatCurrency(cmv) : "—"}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase text-muted-foreground/70">Offer Price</p>
          {onConfigureClick && (
            <button
              type="button"
              onClick={onConfigureClick}
              className="flex items-center gap-1 text-[9px] text-cyan hover:text-cyan/80 transition-colors"
            >
              <Settings2 className="h-3 w-3" />
              Configure
            </button>
          )}
        </div>
        <span className="text-lg font-bold font-mono text-emerald-400">
          {offerPrice != null ? formatCurrency(offerPrice) : "—"}
        </span>
      </div>

      <div>
        <p className="text-[10px] uppercase text-muted-foreground/70">Est. Repairs</p>
        <button
          type="button"
          onClick={onScrollToRepairs}
          className="text-lg font-semibold font-mono text-amber-300 hover:underline"
        >
          {totalRepairCost != null ? formatCurrency(totalRepairCost) : "—"}
        </button>
      </div>

      <div>
        <p className="text-[10px] uppercase text-muted-foreground/70">Comps</p>
        <span className="text-sm font-medium">{selectedCompCount} selected</span>
      </div>

      {link && (
        <Button
          asChild
          size="sm"
          className="w-full gap-1.5 bg-cyan/15 hover:bg-cyan/25 text-cyan border border-cyan/25"
        >
          <a href={link} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Bricked
          </a>
        </Button>
      )}
    </div>
  );
}
