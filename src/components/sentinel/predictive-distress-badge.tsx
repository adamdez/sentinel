"use client";

import { motion } from "framer-motion";
import { Brain, Clock, TrendingUp, AlertTriangle, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface PredictiveDistressData {
  predictiveScore: number;
  daysUntilDistress: number;
  confidence: number;
  label: "imminent" | "likely" | "possible" | "unlikely";
  ownerAgeInference?: number | null;
  equityBurnRate?: number | null;
  lifeEventProbability?: number | null;
}

interface PredictiveDistressBadgeProps {
  data: PredictiveDistressData;
  size?: "sm" | "md" | "lg";
  showDays?: boolean;
}

const LABEL_CONFIG = {
  imminent: {
    text: "IMMINENT",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/25",
    glow: "shadow-[0_0_8px_rgba(255,68,68,0.2)]",
    icon: AlertTriangle,
  },
  likely: {
    text: "LIKELY",
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/25",
    glow: "shadow-[0_0_8px_rgba(255,107,53,0.15)]",
    icon: TrendingUp,
  },
  possible: {
    text: "POSSIBLE",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/25",
    glow: "",
    icon: Clock,
  },
  unlikely: {
    text: "UNLIKELY",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/25",
    glow: "",
    icon: Shield,
  },
};

function FeatureBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-medium">{Math.round(value)}</span>
      </div>
      <div className="h-1 rounded-full bg-secondary overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className={cn(
            "h-full rounded-full",
            pct >= 80 ? "bg-red-400" : pct >= 55 ? "bg-orange-400" : pct >= 30 ? "bg-yellow-400" : "bg-blue-400"
          )}
        />
      </div>
    </div>
  );
}

export function PredictiveDistressBadge({
  data,
  size = "md",
  showDays = true,
}: PredictiveDistressBadgeProps) {
  const config = LABEL_CONFIG[data.label];
  const LabelIcon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          whileHover={{ scale: 1.05 }}
          className="inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Badge
            variant="outline"
            className={cn(
              "gap-1 border",
              config.bg,
              config.color,
              config.glow,
              size === "sm" && "text-[10px] px-1.5 py-0",
              size === "lg" && "text-sm px-3 py-1"
            )}
          >
            <Brain className={cn("shrink-0", size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3")} />
            <span className="font-bold">{data.predictiveScore}</span>
            {showDays && (
              <span className="opacity-75 text-[10px]">{data.daysUntilDistress}d</span>
            )}
          </Badge>
          {data.confidence >= 70 && (
            <span className="text-[9px] font-medium text-cyan bg-cyan/8 px-1 py-0.5 rounded border border-cyan/15">
              {data.confidence}%
            </span>
          )}
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="w-64 p-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1">
              <Brain className="h-3 w-3 text-cyan" />
              Predictive Distress v2.0
            </span>
            <span className={cn("text-xs font-bold", config.color)}>
              {data.predictiveScore} — {config.text}
            </span>
          </div>

          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary/30 border border-glass-border">
            <LabelIcon className={cn("h-3.5 w-3.5 shrink-0", config.color)} />
            <div>
              <p className={cn("text-xs font-bold", config.color)}>
                Predicted distress in ~{data.daysUntilDistress} days
              </p>
              <p className="text-[10px] text-muted-foreground">
                {data.confidence}% confidence
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <FeatureBar label="Predictive Score" value={data.predictiveScore} />
            {data.lifeEventProbability != null && (
              <FeatureBar label="Life Event Prob." value={data.lifeEventProbability * 100} />
            )}
            {data.equityBurnRate != null && (
              <FeatureBar label="Equity Burn Rate" value={Math.min(data.equityBurnRate * 500, 100)} />
            )}
          </div>

          {data.ownerAgeInference != null && (
            <div className="flex items-center gap-1 pt-1 border-t border-glass-border">
              <span className="text-[10px] text-muted-foreground">
                Est. owner age: <span className="text-foreground font-medium">{data.ownerAgeInference}</span>
              </span>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Compact inline badge for tables — "Distress in X days"
 */
export function PredictiveDistressInline({ data }: { data: PredictiveDistressData }) {
  const config = LABEL_CONFIG[data.label];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border cursor-default",
            config.bg,
            config.color
          )}
        >
          <Brain className="h-2.5 w-2.5" />
          {data.daysUntilDistress}d
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-[11px]">
        <Brain className="inline h-3 w-3 mr-1 text-cyan" />
        Predicted distress in ~{data.daysUntilDistress} days ({data.confidence}% conf)
      </TooltipContent>
    </Tooltip>
  );
}
