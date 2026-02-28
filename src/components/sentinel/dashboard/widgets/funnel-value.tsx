"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface FunnelStage {
  name: string;
  status: string;
  count: number;
  value: number;
  pct: number;
  color: string;
  glow: string;
}

const STAGE_META: Record<string, { label: string; color: string; glow: string; order: number }> = {
  prospect:    { label: "Prospects",   color: "from-blue-500 to-blue-400",   glow: "rgba(59,130,246,0.3)",  order: 0 },
  lead:        { label: "Leads",       color: "from-cyan-500 to-cyan-400",   glow: "rgba(6,182,212,0.3)",   order: 1 },
  negotiation: { label: "Negotiation", color: "from-neon to-neon-dim",       glow: "rgba(0,255,136,0.3)",   order: 2 },
  disposition: { label: "Disposition", color: "from-yellow-500 to-yellow-400", glow: "rgba(234,179,8,0.3)", order: 3 },
  nurture:     { label: "Nurture",     color: "from-orange-500 to-orange-400", glow: "rgba(249,115,22,0.3)", order: 4 },
  closed:      { label: "Closed",      color: "from-purple-500 to-purple-400", glow: "rgba(168,85,247,0.3)", order: 5 },
};

function formatValue(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  if (v === 0) return "$0";
  return `$${v.toLocaleString()}`;
}

export function FunnelValue() {
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalValue, setTotalValue] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchFunnel = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leadsRaw, error: leadsErr } = await (supabase.from("leads") as any)
        .select("id, status, property_id");

      if (leadsErr) {
        console.error("[FunnelValue] Leads fetch failed:", leadsErr);
        return;
      }

      if (!leadsRaw || leadsRaw.length === 0) {
        setStages([]);
        setTotalValue(0);
        setLoading(false);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propIds = [...new Set((leadsRaw as any[]).map((l: any) => l.property_id).filter(Boolean))] as string[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const propsMap: Record<string, any> = {};

      if (propIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: propsData } = await (supabase.from("properties") as any)
          .select("id, estimated_value")
          .in("id", propIds);

        if (propsData) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const p of propsData as any[]) propsMap[p.id] = p;
        }
      }

      const agg: Record<string, { count: number; value: number }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const lead of leadsRaw as any[]) {
        const status = lead.status as string;
        if (!agg[status]) agg[status] = { count: 0, value: 0 };
        agg[status].count++;
        const prop = propsMap[lead.property_id];
        if (prop?.estimated_value) agg[status].value += Number(prop.estimated_value);
      }

      const maxCount = Math.max(...Object.values(agg).map((a) => a.count), 1);
      let total = 0;

      const result: FunnelStage[] = Object.entries(agg)
        .filter(([status]) => STAGE_META[status])
        .map(([status, data]) => {
          total += data.value;
          const meta = STAGE_META[status];
          return {
            name: meta.label,
            status,
            count: data.count,
            value: data.value,
            pct: Math.round((data.count / maxCount) * 100),
            color: meta.color,
            glow: meta.glow,
          };
        })
        .sort((a, b) => (STAGE_META[a.status]?.order ?? 99) - (STAGE_META[b.status]?.order ?? 99));

      setStages(result);
      setTotalValue(total);
    } catch (err) {
      console.error("[FunnelValue] Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFunnel();

    const channel = supabase
      .channel("funnel_value_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchFunnel())
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [fetchFunnel]);

  if (loading) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        No pipeline data yet — ingest leads to populate funnel.
      </div>
    );
  }

  return (
    <div className="space-y-2.5 particle-container">
      {stages.map((stage, i) => (
        <motion.div
          key={stage.status}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06 }}
          className="space-y-1"
        >
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium">{stage.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{stage.count}</span>
              <span className="font-semibold text-foreground">{formatValue(stage.value)}</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-white/[0.03] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${stage.pct}%` }}
              transition={{ duration: 0.6, delay: 0.2 + i * 0.08 }}
              className={cn("h-full rounded-full bg-gradient-to-r", stage.color)}
              style={{ boxShadow: `0 0 8px ${stage.glow}, 0 0 2px ${stage.glow}` }}
            />
          </div>
        </motion.div>
      ))}
      <div className="flex items-center justify-between pt-1 border-t border-white/[0.06] text-xs">
        <span className="text-muted-foreground">Total Pipeline</span>
        <motion.span
          className="font-bold text-neon"
          style={{ textShadow: "0 0 10px rgba(0,255,136,0.4)" }}
          animate={{ textShadow: ["0 0 10px rgba(0,255,136,0.3)", "0 0 20px rgba(0,255,136,0.5)", "0 0 10px rgba(0,255,136,0.3)"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          {formatValue(totalValue)}
        </motion.span>
      </div>
    </div>
  );
}
