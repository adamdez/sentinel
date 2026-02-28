"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { DollarSign, ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface RevenueData {
  thisMonth: number;
  lastMonth: number;
  ytd: number;
  closedCount: number;
  monthlyTotals: number[];
}

function fmt(n: number): string {
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${n.toLocaleString()}`;
}

export function RevenueImpact() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: deals } = await (supabase.from("deals") as any)
      .select("assignment_fee, contract_price, closed_at, created_at")
      .eq("status", "closed")
      .gte("created_at", startOfYear)
      .order("closed_at", { ascending: true });

    const rows = (deals ?? []) as { assignment_fee: number | null; contract_price: number | null; closed_at: string | null; created_at: string }[];

    let thisMonth = 0;
    let lastMonth = 0;
    let ytd = 0;
    const monthlyTotals = Array.from({ length: 12 }, () => 0);

    for (const d of rows) {
      const fee = d.assignment_fee ?? 0;
      ytd += fee;
      const closedDate = d.closed_at ? new Date(d.closed_at) : new Date(d.created_at);
      monthlyTotals[closedDate.getMonth()] += fee;
      if (closedDate.toISOString() >= startOfMonth) thisMonth += fee;
      else if (closedDate.toISOString() >= startOfLastMonth) lastMonth += fee;
    }

    setData({
      thisMonth,
      lastMonth,
      ytd,
      closedCount: rows.length,
      monthlyTotals,
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading) {
    return (
      <div className="space-y-2.5">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-16 w-full rounded-[10px]" />
      </div>
    );
  }

  const d = data!;
  const change = d.thisMonth - d.lastMonth;
  const avgDeal = d.closedCount > 0 ? Math.round(d.ytd / d.closedCount) : 0;
  const maxBar = Math.max(...d.monthlyTotals, 1);

  const metrics = [
    { label: "This Month", value: fmt(d.thisMonth), change: change > 0 ? `+${fmt(change)}` : change < 0 ? `-${fmt(Math.abs(change))}` : null },
    { label: "Avg Deal", value: d.closedCount > 0 ? fmt(avgDeal) : "—" },
    { label: "Total YTD", value: fmt(d.ytd) },
  ];

  return (
    <div className="space-y-2.5">
      {metrics.map((m, i) => (
        <motion.div
          key={m.label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06 }}
          className="flex items-center justify-between"
        >
          <span className="text-[11px] text-muted-foreground">{m.label}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold">{m.value}</span>
            {m.change && (
              <motion.span
                className="text-[9px] text-neon flex items-center gap-0.5"
                style={{ textShadow: "0 0 6px rgba(0,255,136,0.4)" }}
              >
                <ArrowUpRight className="h-2.5 w-2.5" />
                {m.change}
              </motion.span>
            )}
          </div>
        </motion.div>
      ))}

      <div className="h-16 rounded-[10px] bg-white/[0.02] border border-white/[0.04] flex items-end px-1 pb-1 gap-0.5 relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(to top, rgba(0,229,255,0.03) 0%, transparent 60%)",
          }}
        />
        {d.monthlyTotals.map((val, i) => {
          const pct = maxBar > 0 ? (val / maxBar) * 100 : 0;
          const isCurrentMonth = i === new Date().getMonth();
          return (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(pct, 2)}%` }}
              transition={{ delay: 0.3 + i * 0.03, duration: 0.4 }}
              className={cn(
                "flex-1 rounded-t-sm relative",
                isCurrentMonth ? "bg-cyan" : val > 0 ? "bg-cyan/25" : "bg-cyan/8"
              )}
              style={isCurrentMonth ? {
                boxShadow: "0 0 12px rgba(0,229,255,0.4), 0 -4px 15px rgba(0,229,255,0.15)",
              } : {}}
            />
          );
        })}
      </div>

      <p className="text-[9px] text-muted-foreground text-center">
        {d.closedCount > 0
          ? `${d.closedCount} closed deal${d.closedCount > 1 ? "s" : ""} YTD — assignment fees`
          : "No closed deals yet — revenue will appear as deals close"}
      </p>
    </div>
  );
}
