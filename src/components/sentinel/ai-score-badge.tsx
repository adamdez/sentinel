"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Brain } from "lucide-react";
import type { AIScore } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AIScoreBadgeProps {
  score: AIScore;
  prediction?: {
    predictiveScore: number;
    daysUntilDistress: number;
    confidence: number;
  } | null;
  size?: "sm" | "md" | "lg";
  tags?: string[];
}

const labelConfig = {
  platinum: { variant: "platinum" as const, text: "PLATINUM", color: "text-cyan-300", glow: "drop-shadow(0 0 1px rgba(0,212,255,1)) drop-shadow(0 0 3.5px rgba(0,212,255,0.48)) drop-shadow(0 0 7px rgba(0,212,255,0.24)) drop-shadow(0 0 11px rgba(0,212,255,0.11))" },
  gold: { variant: "gold" as const, text: "GOLD", color: "text-amber-400", glow: "drop-shadow(0 0 1px rgba(245,158,11,1)) drop-shadow(0 0 3.5px rgba(245,158,11,0.48)) drop-shadow(0 0 7px rgba(245,158,11,0.24))" },
  silver: { variant: "silver" as const, text: "SILVER", color: "text-slate-300", glow: "drop-shadow(0 0 1px rgba(148,163,184,0.8)) drop-shadow(0 0 3.5px rgba(148,163,184,0.35))" },
  bronze: { variant: "bronze" as const, text: "BRONZE", color: "text-orange-500", glow: "" },
};

function ScoreBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-medium">{value}</span>
      </div>
      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className={cn(
            "h-full rounded-full",
            pct >= 80 ? "bg-cyan" : pct >= 60 ? "bg-yellow-400" : pct >= 40 ? "bg-blue-400" : "bg-muted-foreground"
          )}
        />
      </div>
    </div>
  );
}

const LABEL_EXPLAINER: Record<AIScore["label"], string> = {
  platinum: "Platinum (85+): Extreme distress stacking, high equity, absentee — close immediately.",
  gold: "Gold (65-84): Strong signal convergence. High-priority outreach target.",
  silver: "Silver (40-64): Moderate distress or limited data. Worth nurturing.",
  bronze: "Bronze (<40): Weak signal or stale data. Low priority.",
};

const SIGNAL_LABELS: Record<string, string> = {
  probate: "Probate", pre_foreclosure: "Pre-Foreclosure", tax_lien: "Tax Lien",
  code_violation: "Code Violation", vacant: "Vacant", divorce: "Divorce",
  bankruptcy: "Bankruptcy", fsbo: "FSBO", absentee: "Absentee",
  inherited: "Inherited", water_shutoff: "Water Shut-off",
};

const SIGNAL_TAG_SET = new Set(Object.keys(SIGNAL_LABELS));

export function AIScoreBadge({ score, prediction, size = "md", tags }: AIScoreBadgeProps) {
  const config = labelConfig[score.label];
  const distressSignals = tags?.filter((t) => SIGNAL_TAG_SET.has(t)) ?? [];

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
            <span className="opacity-90 text-[11px]">{config.text}</span>
          </Badge>
          {score.aiBoost > 0 && (
            <span className="text-[10px] font-medium text-cyan bg-cyan/8 px-1.5 py-0.5 rounded border border-cyan/15">
              AI +{score.aiBoost}
            </span>
          )}
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="w-64 p-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">AI Score Breakdown</span>
            <span className={cn("text-xs font-bold", config.color)}>
              {score.composite} — {config.text}
            </span>
          </div>

          <p className="text-[10px] text-muted-foreground/80 leading-snug">
            {LABEL_EXPLAINER[score.label]}
          </p>

          <div className="space-y-1.5">
            <ScoreBar label="Motivation" value={score.motivation} />
            <ScoreBar label="Equity Velocity" value={score.equityVelocity} />
            <ScoreBar label="Urgency" value={score.urgency} />
            <ScoreBar label="Historical Conv." value={score.historicalConversion} />
          </div>

          {distressSignals.length > 0 && (
            <div className="pt-1.5 border-t border-glass-border">
              <span className="text-[10px] text-muted-foreground/70 block mb-1">Distress signals driving this score:</span>
              <div className="flex flex-wrap gap-1">
                {distressSignals.map((s) => (
                  <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-foreground/80">
                    {SIGNAL_LABELS[s] ?? s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {score.aiBoost > 0 && (
            <div className="flex items-center gap-1 pt-1 border-t border-glass-border">
              <Sparkles className="h-3 w-3 text-cyan" />
              <span className="text-[11px] text-cyan font-medium">
                AI Boost: +{score.aiBoost} from predictive model
              </span>
            </div>
          )}
          {prediction && (
            <div className="pt-1 border-t border-glass-border space-y-1">
              <div className="flex items-center gap-1">
                <Brain className="h-3 w-3 text-purple-400" />
                <span className="text-[11px] text-purple-400 font-medium">
                  Predictive: {prediction.predictiveScore}/100
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Distress in</span>
                <span className="text-orange-400 font-semibold">~{prediction.daysUntilDistress}d</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Confidence</span>
                <span className="text-foreground font-medium">{prediction.confidence}%</span>
              </div>
            </div>
          )}

          <div className="pt-1.5 border-t border-glass-border">
            <p className="text-[9px] text-muted-foreground/50 leading-snug">
              Score = (Signal Weights x Severity x Recency) + Stacking Bonus + Owner Factors + Equity + AI Boost.
              Label: Platinum 85+ / Gold 65+ / Silver 40+ / Bronze &lt;40.
            </p>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
