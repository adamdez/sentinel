"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface SignalRow {
  type: string;
  count: number;
  recent: number;
}

const SIGNAL_COLORS: Record<string, string> = {
  probate: "text-foreground",
  pre_foreclosure: "text-foreground",
  tax_lien: "text-foreground",
  code_violation: "text-foreground",
  water_shutoff: "text-foreground",
  condemned: "text-foreground",
  vacant: "text-foreground",
  divorce: "text-foreground",
  bankruptcy: "text-foreground",
  inherited: "text-foreground",
  absentee: "text-primary-400",
  fsbo: "text-foreground",
  tired_landlord: "text-foreground",
  underwater: "text-foreground",
};

function labelFor(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DistressSignals() {
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchData = useCallback(async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: events } = await (supabase.from("distress_events") as any)
      .select("event_type, created_at")
      .order("created_at", { ascending: false })
      .limit(2000);

    const rows = (events ?? []) as { event_type: string; created_at: string }[];
    const agg: Record<string, { count: number; recent: number }> = {};

    for (const e of rows) {
      const t = e.event_type ?? "unknown";
      if (!agg[t]) agg[t] = { count: 0, recent: 0 };
      agg[t].count++;
      if (e.created_at >= thirtyDaysAgo) agg[t].recent++;
    }

    const sorted = Object.entries(agg)
      .map(([type, d]) => ({ type, ...d }))
      .sort((a, b) => b.recent - a.recent);

    setSignals(sorted);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("distress_signals_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "distress_events" }, () => fetchData())
      .subscribe();
    channelRef.current = channel;
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        No distress events ingested yet.
      </div>
    );
  }

  const totalRecent = signals.reduce((s, r) => s + r.recent, 0);

  return (
    <div className="space-y-1.5">
      {signals.slice(0, 8).map((s, i) => (
        <motion.div
          key={s.type}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04 }}
          className="flex items-center justify-between py-1"
        >
          <span className={cn("text-sm font-medium", SIGNAL_COLORS[s.type] ?? "text-foreground")}>
            {labelFor(s.type)}
          </span>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{s.count} total</span>
            {s.recent > 0 && (
              <span className="text-primary font-semibold"
                style={{ textShadow: "0 0 6px rgba(0,0,0,0.3)" }}>
                +{s.recent}
              </span>
            )}
          </div>
        </motion.div>
      ))}
      <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.06] text-sm">
        <span className="text-muted-foreground">Last 30 days</span>
        <span className="font-bold text-primary"
          style={{ textShadow: "0 0 8px rgba(0,0,0,0.4)" }}>
          {totalRecent} signals
        </span>
      </div>
    </div>
  );
}
