"use client";

import { Map as MapIcon, RefreshCw, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface CompsTabProps {
  arv: number;
  latitude?: number;
  longitude?: number;
}

export function CompsTab({ arv }: CompsTabProps) {
  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div>
          <h3 className="text-lg font-bold">Comparable Sales & ARV</h3>
          <p className="text-sm text-muted-foreground">Radius: 0.5 miles • Last 6 months</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Calculated ARV</p>
          <p className="text-2xl font-mono font-bold text-emerald-400">{formatCurrency(arv)}</p>
        </div>
      </div>

      <div className="flex-1 bg-black/40 border border-white/5 rounded-xl flex flex-col items-center justify-center p-12 text-center relative overflow-hidden">
        {/* Placeholder for the real Map component from the original UI */}
        <MapIcon className="w-16 h-16 text-white/10 mb-4" />
        <h4 className="font-medium text-foreground/80 mb-2">Interactive Map System Required</h4>
        <p className="text-sm text-muted-foreground max-w-md">
          The map component will be mounted here. It displays the subject property in orange and up to 10 comparable recently sold homes in cyan.
        </p>
        <button className="mt-6 flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh Comps
        </button>
        
        <div className="absolute top-4 right-4 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] px-2 py-1 flex items-center gap-1.5 rounded uppercase tracking-wider font-semibold">
          <AlertTriangle className="w-3 h-3" /> Map Placeholder
        </div>
      </div>
    </div>
  );
}
