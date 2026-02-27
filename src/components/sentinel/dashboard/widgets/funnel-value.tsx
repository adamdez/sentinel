"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const stages = [
  { name: "Prospects", count: 147, value: "$0", pct: 100, color: "from-blue-500 to-blue-400", glow: "rgba(59,130,246,0.3)" },
  { name: "Leads", count: 68, value: "$1.2M", pct: 46, color: "from-cyan-500 to-cyan-400", glow: "rgba(6,182,212,0.3)" },
  { name: "Negotiation", count: 12, value: "$890k", pct: 18, color: "from-neon to-neon-dim", glow: "rgba(0,255,136,0.3)" },
  { name: "Disposition", count: 5, value: "$425k", pct: 8, color: "from-yellow-500 to-yellow-400", glow: "rgba(234,179,8,0.3)" },
  { name: "Closed", count: 3, value: "$186k", pct: 4, color: "from-purple-500 to-purple-400", glow: "rgba(168,85,247,0.3)" },
];

export function FunnelValue() {
  return (
    <div className="space-y-2.5 particle-container">
      {stages.map((stage, i) => (
        <motion.div
          key={stage.name}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06 }}
          className="space-y-1"
        >
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium">{stage.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{stage.count}</span>
              <span className="font-semibold text-foreground">{stage.value}</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-secondary/30 overflow-hidden">
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
      <div className="flex items-center justify-between pt-1 border-t border-glass-border text-xs">
        <span className="text-muted-foreground">Total Pipeline</span>
        <motion.span
          className="font-bold text-neon"
          style={{ textShadow: "0 0 10px rgba(0,255,136,0.4)" }}
          animate={{ textShadow: ["0 0 10px rgba(0,255,136,0.3)", "0 0 20px rgba(0,255,136,0.5)", "0 0 10px rgba(0,255,136,0.3)"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          $2.7M
        </motion.span>
      </div>
      {/* TODO: Pull from lead_instances aggregated by status with estimated values */}
      {/* TODO: Click stage → navigate to funnel page */}
      {/* TODO: Trend arrows comparing to last period */}
    </div>
  );
}
