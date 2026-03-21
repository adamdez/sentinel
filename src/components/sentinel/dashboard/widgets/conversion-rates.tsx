"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface Conversion {
  from: string;
  to: string;
  fromCount: number;
  toCount: number;
  rate: number;
  color: string;
}

const STAGES_ORDER = ["prospect", "lead", "negotiation", "disposition", "closed"];
const STAGE_LABELS: Record<string, string> = {
  prospect: "Prospect",
  lead: "Lead",
  negotiation: "Negotiation",
  disposition: "Disposition",
  closed: "Closed",
};
const STAGE_COLORS: Record<string, string> = {
  prospect: "text-foreground",
  lead: "text-primary",
  negotiation: "text-foreground",
  disposition: "text-foreground",
  closed: "text-foreground",
};

export function ConversionRates() {
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchData = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (supabase.from("leads") as any)
      .select("status");

    const rows = (leads ?? []) as { status: string }[];
    const counts: Record<string, number> = {};

    for (const r of rows) {
      const st = r.status ?? "prospect";
      counts[st] = (counts[st] ?? 0) + 1;
    }

    // Cumulative: each stage count includes everything that passed through it
    // prospect → lead means every lead+ was once a prospect
    const cumulative: Record<string, number> = {};
    let running = 0;
    for (const stage of [...STAGES_ORDER].reverse()) {
      running += counts[stage] ?? 0;
      cumulative[stage] = running;
    }

    const result: Conversion[] = [];
    for (let i = 0; i < STAGES_ORDER.length - 1; i++) {
      const from = STAGES_ORDER[i];
      const to = STAGES_ORDER[i + 1];
      const fromCount = cumulative[from] ?? 0;
      const toCount = cumulative[to] ?? 0;
      result.push({
        from,
        to,
        fromCount,
        toCount,
        rate: fromCount > 0 ? Math.round((toCount / fromCount) * 100) : 0,
        color: STAGE_COLORS[to] ?? "text-foreground",
      });
    }

    setConversions(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("conversion_rates_rt")
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

  if (conversions.every((c) => c.fromCount === 0)) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        No pipeline data yet — conversion rates appear as leads progress.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conversions.map((c, i) => (
        <motion.div
          key={`${c.from}-${c.to}`}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06 }}
          className="space-y-1"
        >
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">{STAGE_LABELS[c.from]}</span>
              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
              <span className={cn("font-medium", c.color)}>{STAGE_LABELS[c.to]}</span>
            </div>
            <span className="font-bold">{c.rate}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.03] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(c.rate, 1)}%` }}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.08 }}
              className={cn("h-full rounded-full bg-gradient-to-r from-primary/60 to-primary")}
              style={{ boxShadow: "0 0 6px rgba(0,0,0,0.3)" }}
            />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
