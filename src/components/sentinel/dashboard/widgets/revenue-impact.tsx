"use client";

import { motion } from "framer-motion";
import { DollarSign, TrendingUp, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

const metrics = [
  { label: "This Month", value: "$42,000", change: "+$12k", trend: "up" },
  { label: "Avg Deal", value: "$15,500", change: "+$2.1k", trend: "up" },
  { label: "Total YTD", value: "$186,000", change: null, trend: null },
];

export function RevenueImpact() {
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
              <span className="text-[9px] text-neon flex items-center gap-0.5">
                <ArrowUpRight className="h-2.5 w-2.5" />
                {m.change}
              </span>
            )}
          </div>
        </motion.div>
      ))}
      <div className="h-16 rounded-lg bg-secondary/20 flex items-end px-1 pb-1 gap-0.5">
        {[35, 28, 45, 42, 38, 55, 62, 48, 72, 68, 58, 80].map((h, i) => (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ delay: 0.3 + i * 0.03, duration: 0.4 }}
            className={cn(
              "flex-1 rounded-t-sm",
              i === 11 ? "bg-neon" : "bg-neon/20"
            )}
          />
        ))}
      </div>
      {/* TODO: Pull from closed deals with assignment_fee */}
      {/* TODO: Period comparison (MoM, YoY) */}
      {/* TODO: Signal ROI attribution */}
    </div>
  );
}
