"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface VelocityStage {
  stage: string;
  label: string;
  avgDays: number;
  count: number;
  color: string;
}

const STAGE_META: Record<string, { label: string; color: string }> = {
  prospect:    { label: "Prospect",    color: "bg-muted" },
  lead:        { label: "Lead",        color: "bg-primary" },
  negotiation: { label: "Negotiation", color: "bg-muted" },
  disposition: { label: "Disposition", color: "bg-muted" },
  closed:      { label: "Closed",      color: "bg-muted" },
};

export function LeadVelocity() {
  const [stages, setStages] = useState<VelocityStage[]>([]);
  const [avgTotal, setAvgTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: leads } = await (supabase.from("leads") as any)
      .select("status, created_at, updated_at, promoted_at, last_contact_at");

    const rows = (leads ?? []) as {
      status: string;
      created_at: string;
      updated_at: string;
      promoted_at: string | null;
      last_contact_at: string | null;
    }[];

    const stageDays: Record<string, number[]> = {};

    for (const r of rows) {
      const status = r.status ?? "prospect";
      if (!stageDays[status]) stageDays[status] = [];

      const start = r.promoted_at ?? r.created_at;
      const end = r.last_contact_at ?? r.updated_at;
      const diffMs = new Date(end).getTime() - new Date(start).getTime();
      const days = Math.max(0, Math.round(diffMs / 86400000));
      stageDays[status].push(days);
    }

    const result: VelocityStage[] = [];
    let totalDays = 0;
    let totalCount = 0;

    for (const [stage, meta] of Object.entries(STAGE_META)) {
      const arr = stageDays[stage] ?? [];
      const avg = arr.length > 0 ? Math.round(arr.reduce((s, d) => s + d, 0) / arr.length) : 0;
      totalDays += avg;
      totalCount += arr.length;
      result.push({ stage, label: meta.label, avgDays: avg, count: arr.length, color: meta.color });
    }

    setStages(result);
    setAvgTotal(totalDays);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    );
  }

  if (stages.every((s) => s.count === 0)) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        No velocity data yet — tracks as leads move through stages.
      </div>
    );
  }

  const maxDays = Math.max(...stages.map((s) => s.avgDays), 1);

  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <motion.div
          key={s.stage}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05 }}
          className="space-y-0.5"
        >
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium">{s.label}</span>
            <span className="text-muted-foreground">
              {s.avgDays}d <span className="text-[10px]">avg</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.03] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.max((s.avgDays / maxDays) * 100, 2)}%` }}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.06 }}
              className={cn("h-full rounded-full", s.color)}
              style={{ boxShadow: "0 0 6px rgba(0,0,0,0.2)" }}
            />
          </div>
        </motion.div>
      ))}

      <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.06] text-[11px]">
        <span className="text-muted-foreground">Avg Full Cycle</span>
        <motion.span
          className="font-bold text-primary"
          style={{ textShadow: "0 0 8px rgba(0,0,0,0.4)" }}
        >
          {avgTotal} days
        </motion.span>
      </div>
    </div>
  );
}
