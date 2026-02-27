"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AIScore } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AIScoreBadgeProps {
  score: AIScore;
  showBreakdown?: boolean;
  size?: "sm" | "md" | "lg";
}

const labelConfig = {
  fire: { variant: "fire" as const, text: "FIRE", color: "text-orange-400", glow: "drop-shadow(0 0 4px rgba(255,107,53,0.5))" },
  hot: { variant: "hot" as const, text: "HOT", color: "text-red-400", glow: "drop-shadow(0 0 3px rgba(255,68,68,0.4))" },
  warm: { variant: "warm" as const, text: "WARM", color: "text-yellow-400", glow: "" },
  cold: { variant: "cold" as const, text: "COLD", color: "text-blue-400", glow: "" },
};

function ScoreBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-medium">{value}</span>
      </div>
      <div className="h-1 rounded-full bg-secondary overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className={cn(
            "h-full rounded-full",
            pct >= 80 ? "bg-neon" : pct >= 60 ? "bg-yellow-400" : pct >= 40 ? "bg-blue-400" : "bg-muted-foreground"
          )}
        />
      </div>
    </div>
  );
}

export function AIScoreBadge({ score, size = "md" }: AIScoreBadgeProps) {
  const config = labelConfig[score.label];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          whileHover={{ scale: 1.05 }}
          className="inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Badge
            variant={config.variant}
            className={cn(
              "gap-1",
              size === "sm" && "text-[10px] px-1.5 py-0",
              size === "lg" && "text-sm px-3 py-1"
            )}
            style={config.glow ? { filter: config.glow } : {}}
          >
            <Sparkles
              className={cn(
                "shrink-0",
                size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"
              )}
            />
            <span className="font-bold">{score.composite}</span>
            <span className="opacity-75 text-[10px]">{config.text}</span>
          </Badge>
          {score.aiBoost > 0 && (
            <span className="text-[9px] font-medium text-neon bg-neon/10 px-1 py-0.5 rounded border border-neon/20">
              AI +{score.aiBoost}
            </span>
          )}
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="w-56 p-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">AI Score Breakdown</span>
            <span className={cn("text-xs font-bold", config.color)}>
              {score.composite} — {config.text}
            </span>
          </div>
          <div className="space-y-1.5">
            <ScoreBar label="Motivation" value={score.motivation} />
            <ScoreBar label="Equity Velocity" value={score.equityVelocity} />
            <ScoreBar label="Urgency" value={score.urgency} />
            <ScoreBar label="Historical Conv." value={score.historicalConversion} />
          </div>
          {score.aiBoost > 0 && (
            <div className="flex items-center gap-1 pt-1 border-t border-glass-border">
              <Sparkles className="h-3 w-3 text-neon" />
              <span className="text-[10px] text-neon font-medium">
                AI Boost: +{score.aiBoost} from predictive model
              </span>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
