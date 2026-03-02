"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface SourceCPL {
  source: string;
  leads: number;
  cost: number;
  cpl: number;
}

const CPL_TARGET = 40;

function labelFor(source: string): string {
  const labels: Record<string, string> = {
    propertyradar: "PropertyRadar",
    ranger_push: "Ranger Push",
    manual: "Manual",
    skip_trace: "Skip Trace",
    referral: "Referral",
    ads: "Paid Ads",
    cold_call: "Cold Call",
  };
  return labels[source] ?? source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CostPerLead() {
  const [sources, setSources] = useState<SourceCPL[]>([]);
  const [blendedCPL, setBlendedCPL] = useState<number>(0);
  const [totalLeads, setTotalLeads] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (supabase.from("leads") as any)
      .select("source, acquisition_cost")
      .not("source", "is", null);

    const rows = (leads ?? []) as { source: string; acquisition_cost: number | null }[];
    const agg: Record<string, { leads: number; cost: number }> = {};

    let totalCost = 0;
    for (const r of rows) {
      const src = r.source ?? "unknown";
      if (!agg[src]) agg[src] = { leads: 0, cost: 0 };
      agg[src].leads++;
      const cost = r.acquisition_cost ?? 0;
      agg[src].cost += cost;
      totalCost += cost;
    }

    const result = Object.entries(agg)
      .map(([source, d]) => ({
        source,
        leads: d.leads,
        cost: d.cost,
        cpl: d.leads > 0 ? Math.round(d.cost / d.leads) : 0,
      }))
      .sort((a, b) => b.leads - a.leads)
      .slice(0, 6);

    setSources(result);
    setTotalLeads(rows.length);
    setBlendedCPL(rows.length > 0 ? Math.round(totalCost / rows.length) : 0);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full rounded-[10px]" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    );
  }

  if (totalLeads === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        No lead cost data yet — populate acquisition_cost on leads to track CPL.
      </div>
    );
  }

  const onTarget = blendedCPL <= CPL_TARGET;

  return (
    <div className="space-y-2.5">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center justify-between py-2 px-3 rounded-[12px] bg-secondary/20"
      >
        <div>
          <p className={cn("text-xl font-black", onTarget ? "text-emerald-400" : "text-red-400")}
            style={onTarget ? { textShadow: "0 0 10px rgba(52,211,153,0.4)" } : {}}>
            ${blendedCPL}
          </p>
          <p className="text-[10px] text-muted-foreground">Blended CPL</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">${CPL_TARGET}</p>
          <p className="text-[10px] text-muted-foreground">Target</p>
        </div>
      </motion.div>

      {sources.map((s, i) => (
        <motion.div
          key={s.source}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04 }}
          className="flex items-center justify-between text-[11px]"
        >
          <span className="font-medium truncate flex-1 mr-2">{labelFor(s.source)}</span>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">{s.leads} leads</span>
            <span className={cn("font-bold w-10 text-right",
              s.cpl > 0 && s.cpl <= CPL_TARGET ? "text-emerald-400" : s.cpl > CPL_TARGET ? "text-red-400" : "text-muted-foreground"
            )}>
              {s.cpl > 0 ? `$${s.cpl}` : "—"}
            </span>
          </div>
        </motion.div>
      ))}

      <p className="text-[10px] text-muted-foreground text-center pt-1">
        {totalLeads} leads tracked — target ≤ ${CPL_TARGET}/lead
      </p>
    </div>
  );
}
