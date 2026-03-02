"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface Bucket {
  label: string;
  min: number;
  max: number;
  count: number;
  color: string;
  glow: string;
}

const BUCKETS_META: { label: string; min: number; max: number; color: string; glow: string }[] = [
  { label: "FIRE",  min: 85, max: 999, color: "bg-red-500",    glow: "rgba(239,68,68,0.5)" },
  { label: "HOT",   min: 65, max: 84,  color: "bg-orange-500", glow: "rgba(249,115,22,0.4)" },
  { label: "WARM",  min: 40, max: 64,  color: "bg-yellow-500", glow: "rgba(234,179,8,0.35)" },
  { label: "COLD",  min: 0,  max: 39,  color: "bg-blue-500",   glow: "rgba(59,130,246,0.35)" },
];

export function HeatScoreDistribution() {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchData = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (supabase.from("leads") as any)
      .select("heat_score")
      .not("heat_score", "is", null);

    const rows = (leads ?? []) as { heat_score: number }[];
    const counts = [0, 0, 0, 0];

    for (const r of rows) {
      const s = r.heat_score ?? 0;
      if (s >= 85) counts[0]++;
      else if (s >= 65) counts[1]++;
      else if (s >= 40) counts[2]++;
      else counts[3]++;
    }

    setBuckets(BUCKETS_META.map((m, i) => ({ ...m, count: counts[i] })));
    setTotal(rows.length);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("heat_dist_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchData())
      .subscribe();
    channelRef.current = channel;
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full rounded" />
        ))}
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        No scored leads yet — scores populate after ingestion.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {buckets.map((b, i) => {
        const pct = total > 0 ? Math.round((b.count / total) * 100) : 0;
        return (
          <motion.div
            key={b.label}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07 }}
            className="space-y-1"
          >
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold tracking-wide">{b.label}</span>
              <span className="text-muted-foreground">
                {b.count} <span className="text-[10px]">({pct}%)</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.03] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(pct, 1)}%` }}
                transition={{ duration: 0.5, delay: 0.15 + i * 0.08 }}
                className={cn("h-full rounded-full", b.color)}
                style={{ boxShadow: `0 0 8px ${b.glow}` }}
              />
            </div>
          </motion.div>
        );
      })}
      <p className="text-[10px] text-muted-foreground text-center pt-1">
        {total} scored lead{total !== 1 ? "s" : ""} total
      </p>
    </div>
  );
}
