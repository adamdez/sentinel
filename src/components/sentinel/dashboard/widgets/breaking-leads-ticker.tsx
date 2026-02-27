"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TickerItem {
  id: string;
  name: string;
  type: string;
  score: number;
  label: "fire" | "hot";
  time: string;
}

const TICKER_DATA: TickerItem[] = [
  { id: "1", name: "Henderson Estate", type: "Probate", score: 94, label: "fire", time: "2m ago" },
  { id: "2", name: "Chen Property", type: "Pre-Foreclosure", score: 87, label: "hot", time: "8m ago" },
  { id: "3", name: "Morales Lot", type: "Tax Lien + Vacant", score: 79, label: "hot", time: "14m ago" },
  { id: "4", name: "Park Residence", type: "FSBO", score: 71, label: "hot", time: "22m ago" },
  { id: "5", name: "Wright Duplex", type: "Bankruptcy", score: 68, label: "hot", time: "31m ago" },
];

export function BreakingLeadsTicker() {
  const [visibleIndex, setVisibleIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisibleIndex((i) => (i + 1) % TICKER_DATA.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const visible = TICKER_DATA.slice(0, 4);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-neon" />
        </span>
        <span className="text-[10px] text-neon font-medium">LIVE</span>
      </div>

      <div className="space-y-1.5">
        {visible.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              "flex items-center gap-2.5 p-2 rounded-md text-xs transition-all relative",
              item.label === "fire"
                ? "bg-orange-500/5 border border-orange-500/10"
                : "bg-secondary/20"
            )}
            style={item.label === "fire" ? {
              boxShadow: "inset 0 0 20px rgba(255,107,53,0.04), 0 0 8px rgba(255,107,53,0.08)",
            } : {}}
          >
            {item.label === "fire" && (
              <motion.div
                className="absolute inset-0 rounded-md pointer-events-none"
                style={{
                  background: "linear-gradient(90deg, transparent 0%, rgba(255,107,53,0.03) 50%, transparent 100%)",
                  backgroundSize: "200% 100%",
                }}
                animate={{ backgroundPosition: ["0% 0%", "200% 0%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              />
            )}
            <Zap className={cn(
              "h-3 w-3 shrink-0",
              item.label === "fire" ? "text-orange-400" : "text-neon"
            )} style={item.label === "fire" ? { filter: "drop-shadow(0 0 3px rgba(255,107,53,0.5))" } : {}} />
            <span className="font-medium truncate flex-1">{item.name}</span>
            <Badge variant={item.label === "fire" ? "fire" : "hot"} className="text-[8px] gap-0.5">
              <ArrowUp className="h-2 w-2" />{item.score}
            </Badge>
            <span className="text-[9px] text-muted-foreground shrink-0">{item.time}</span>
          </motion.div>
        ))}
      </div>
      {/* TODO: Real-time subscription — new promotions stream into ticker */}
      {/* TODO: Click to expand lead detail */}
      {/* TODO: Configurable score threshold for "breaking" */}
    </div>
  );
}
