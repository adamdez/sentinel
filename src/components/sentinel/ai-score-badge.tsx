"use client";

import { motion } from "framer-motion";
import { Sparkles, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Brain } from "lucide-react";
import type { AIScore } from "@/lib/types";
import {
  SIGNAL_WEIGHTS,
  OWNER_FACTORS,
  EQUITY_WEIGHT,
  STACKING_THRESHOLDS,
  getStackingBonus,
} from "@/lib/scoring";
import type { DistressType } from "@/lib/types";
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
  equityPercent?: number | null;
  isAbsentee?: boolean;
}

const labelConfig = {
  platinum: { variant: "platinum" as const, text: "TOP", color: "text-primary-300", glow: "drop-shadow(0 0 1px rgba(0,0,0,1)) drop-shadow(0 0 3.5px rgba(0,0,0,0.48)) drop-shadow(0 0 7px rgba(0,0,0,0.24)) drop-shadow(0 0 11px rgba(0,0,0,0.11))" },
  gold: { variant: "gold" as const, text: "HIGH", color: "text-foreground", glow: "drop-shadow(0 0 1px rgba(0,0,0,1)) drop-shadow(0 0 3.5px rgba(0,0,0,0.48)) drop-shadow(0 0 7px rgba(0,0,0,0.24))" },
  silver: { variant: "silver" as const, text: "MED", color: "text-foreground", glow: "drop-shadow(0 0 1px rgba(148,163,184,0.8)) drop-shadow(0 0 3.5px rgba(148,163,184,0.35))" },
  bronze: { variant: "bronze" as const, text: "LOW", color: "text-foreground", glow: "" },
};

const LABEL_EXPLAINER: Record<AIScore["label"], string> = {
  platinum: "Top priority — strong signals, act now.",
  gold: "High priority — worth focused outreach.",
  silver: "Medium priority — nurture and monitor.",
  bronze: "Low priority — watch list.",
};

const SIGNAL_LABELS: Record<string, string> = {
  probate: "Probate", pre_foreclosure: "Pre-Foreclosure", tax_lien: "Tax Lien",
  code_violation: "Code Violation", vacant: "Vacant", divorce: "Divorce",
  bankruptcy: "Bankruptcy", fsbo: "FSBO", absentee: "Absentee",
  inherited: "Inherited", water_shutoff: "Water Shut-off", condemned: "Condemned",
  tired_landlord: "Tired Landlord", underwater: "Underwater",
};

const SIGNAL_EXPLAIN: Record<string, string> = {
  probate: "Owner deceased — heirs often sell fast to split estate",
  pre_foreclosure: "Lender filed notice — owner must sell or lose property",
  tax_lien: "Unpaid property taxes — forced sale risk",
  code_violation: "City-flagged issues — costly to fix, motivates selling",
  vacant: "No one living here — carrying costs with no benefit",
  divorce: "Court-ordered division — both parties want out fast",
  bankruptcy: "Court filing — assets may be liquidated",
  fsbo: "Owner selling direct — motivated, no agent protection",
  absentee: "Owner lives elsewhere — less attached, higher sell rate",
  inherited: "Property inherited — heirs often prefer cash",
  water_shutoff: "Utility disconnected — strong vacancy/abandonment signal",
  condemned: "Property condemned — uninhabitable, owner under pressure to sell or demolish",
  tired_landlord: "Multi-unit landlord with long ownership — may be burned out on property management",
  underwater: "Owner owes more than the property is worth — negative equity creates urgency",
};

const SIGNAL_TAG_SET = new Set(Object.keys(SIGNAL_LABELS));

interface FactorRow {
  label: string;
  maxPoints: string;
  explain: string;
  color?: string;
}

function buildFactorRows(
  distressSignals: string[],
  equityPercent: number | null | undefined,
  isAbsentee: boolean | undefined,
  aiBoost: number,
): FactorRow[] {
  const rows: FactorRow[] = [];

  for (const sig of distressSignals) {
    const weight = SIGNAL_WEIGHTS[sig as DistressType];
    if (weight == null) continue;
    rows.push({
      label: SIGNAL_LABELS[sig] ?? sig,
      maxPoints: `wt ${weight}`,
      explain: SIGNAL_EXPLAIN[sig] ?? "Distress signal detected",
      color: weight >= 25 ? "text-foreground" : weight >= 20 ? "text-foreground" : "text-foreground",
    });
  }

  const stackBonus = getStackingBonus(distressSignals.length);
  const nextThreshold = STACKING_THRESHOLDS.find((t) => t.signals > distressSignals.length);
  rows.push({
    label: "Stacking Bonus",
    maxPoints: stackBonus > 0 ? `+${stackBonus}` : "+0",
    explain: stackBonus > 0
      ? `${distressSignals.length} overlapping signals unlock +${stackBonus} bonus`
      : distressSignals.length === 1
        ? `Only 1 signal. Add 1 more to unlock +${nextThreshold?.bonus ?? 6}`
        : "No signals detected",
    color: stackBonus > 0 ? "text-primary" : "text-muted-foreground/60",
  });

  const hasNonAbsentee = distressSignals.some((s) => s !== "absentee");
  if (isAbsentee) {
    rows.push({
      label: "Absentee Amplifier",
      maxPoints: hasNonAbsentee ? "1.3×" : "1.0×",
      explain: hasNonAbsentee
        ? "Absentee + other signal → 1.3× boost to base signal"
        : "Needs a non-absentee signal to activate (currently 1.0×)",
      color: hasNonAbsentee ? "text-primary" : "text-muted-foreground/60",
    });
  }

  const ownerFactors: string[] = [];
  let ownerTotal = 0;
  if (isAbsentee) { ownerFactors.push(`Absentee +${OWNER_FACTORS.absentee}`); ownerTotal += OWNER_FACTORS.absentee; }
  if (distressSignals.includes("inherited")) { ownerFactors.push(`Inherited +${OWNER_FACTORS.inherited}`); ownerTotal += OWNER_FACTORS.inherited; }

  rows.push({
    label: "Owner Factors",
    maxPoints: ownerTotal > 0 ? `+${ownerTotal}` : "+0",
    explain: ownerFactors.length > 0
      ? ownerFactors.join(", ")
      : "No owner flags detected (absentee, inherited, elderly, out-of-state)",
    color: ownerTotal > 0 ? "text-foreground" : "text-muted-foreground/60",
  });

  const eqPct = equityPercent ?? 0;
  const eqContrib = Math.round(eqPct * EQUITY_WEIGHT * 10) / 10;
  rows.push({
    label: `Equity (${eqPct > 0 ? Math.round(eqPct) + "%" : "??"})`,
    maxPoints: `+${eqContrib}`,
    explain: eqPct > 0
      ? `${Math.round(eqPct)}% equity × ${EQUITY_WEIGHT} weight = +${eqContrib} points`
      : "No equity data available",
    color: eqContrib >= 10 ? "text-foreground" : eqContrib > 0 ? "text-foreground/70" : "text-muted-foreground/60",
  });

  if (aiBoost > 0) {
    rows.push({
      label: "AI Boost",
      maxPoints: `+${aiBoost}`,
      explain: "Predictive model detected conversion patterns in this area",
      color: "text-primary",
    });
  }

  return rows;
}

export function AIScoreBadge({ score, prediction, size = "md", tags, equityPercent, isAbsentee }: AIScoreBadgeProps) {
  const config = labelConfig[score.label];
  const distressSignals = tags?.filter((t) => SIGNAL_TAG_SET.has(t)) ?? [];
  const factors = buildFactorRows(distressSignals, equityPercent, isAbsentee, score.aiBoost);

  const signalWeightSum = distressSignals.reduce((sum, s) => sum + (SIGNAL_WEIGHTS[s as DistressType] ?? 0), 0);
  const stackBonus = getStackingBonus(distressSignals.length);
  let ownerTotal = 0;
  if (isAbsentee) ownerTotal += OWNER_FACTORS.absentee;
  if (distressSignals.includes("inherited")) ownerTotal += OWNER_FACTORS.inherited;
  const eqContrib = Math.round((equityPercent ?? 0) * EQUITY_WEIGHT * 10) / 10;
  const theoreticalMax = signalWeightSum + stackBonus + ownerTotal + eqContrib + score.aiBoost;
  const gap = Math.max(Math.round(theoreticalMax - score.composite), 0);

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
            <span className="text-[10px] font-medium text-primary bg-primary/8 px-1.5 py-0.5 rounded border border-primary/15">
              AI +{score.aiBoost}
            </span>
          )}
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="w-72 p-0">
        <div className="p-3 space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Score Breakdown</span>
            <span className={cn("text-xs font-bold", config.color)}>
              {score.composite} — {config.text}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground/80 leading-snug">
            {LABEL_EXPLAINER[score.label]}
          </p>

          {/* Factor rows */}
          <div className="space-y-0">
            {factors.map((f, i) => (
              <div key={i} className="py-1.5 border-t border-white/[0.04] first:border-t-0">
                <div className="flex items-center justify-between">
                  <span className={cn("text-[11px] font-semibold", f.color ?? "text-foreground")}>
                    {f.label}
                  </span>
                  <span className={cn("text-[11px] font-bold tabular-nums", f.color ?? "text-foreground")}>
                    {f.maxPoints}
                  </span>
                </div>
                <p className="text-[9px] text-muted-foreground/60 leading-snug mt-0.5">
                  {f.explain}
                </p>
              </div>
            ))}
          </div>

          {/* Gap explanation */}
          {gap > 5 && (
            <div className="flex items-start gap-1.5 pt-1.5 border-t border-glass-border">
              <Info className="h-3 w-3 text-muted-foreground/50 shrink-0 mt-0.5" />
              <p className="text-[9px] text-muted-foreground/60 leading-snug">
                Base weights total ~{Math.round(theoreticalMax)} but the composite is {score.composite}.
                The {gap}-point reduction comes from <span className="text-foreground/70 font-medium">recency decay</span> (older
                events lose ~50% every 46 days) and <span className="text-foreground/70 font-medium">severity</span> adjustments.
              </p>
            </div>
          )}

          {/* Prediction */}
          {prediction && (
            <div className="pt-1 border-t border-glass-border space-y-1">
              <div className="flex items-center gap-1">
                <Brain className="h-3 w-3 text-foreground" />
                <span className="text-[11px] text-foreground font-medium">
                  Predictive: {prediction.predictiveScore}/100
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Distress in</span>
                <span className="text-foreground font-semibold">~{prediction.daysUntilDistress}d</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Confidence</span>
                <span className="text-foreground font-medium">{prediction.confidence}%</span>
              </div>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
