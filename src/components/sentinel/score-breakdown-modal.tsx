"use client";

/**
 * score-breakdown-modal.tsx
 * Full score intelligence overlay modal extracted from
 * master-client-file-modal.tsx.
 */

import { motion, AnimatePresence } from "framer-motion";
import {
  X, DollarSign, TrendingUp, Tag, AlertTriangle, Zap,
  Home, Banknote, Scale, Shield, Building, UserX, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import type { DistressType } from "@/lib/types";
import { SIGNAL_WEIGHTS } from "@/lib/scoring";
import {
  calculateWholesaleUnderwrite,
  DEFAULTS as VALUATION_DEFAULTS,
} from "@/lib/valuation";
import type { ClientFile, ScoreType } from "./master-client-file-helpers";
import { BreakdownRow } from "./master-client-file-parts";

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const SIGNAL_WEIGHT_LABELS: Record<string, string> = {
  probate: "Probate Filing", pre_foreclosure: "Pre-Foreclosure", tax_lien: "Tax Lien",
  code_violation: "Code Violation", vacant: "Vacant Property", divorce: "Divorce",
  bankruptcy: "Bankruptcy", fsbo: "FSBO", absentee: "Absentee Owner",
  inherited: "Inherited Property", water_shutoff: "Water Shut-Off", condemned: "Condemned Property",
  tired_landlord: "Tired Landlord", underwater: "Underwater",
  stacking_bonus: "Signal Stacking Bonus", owner_factors: "Owner Profile Factors",
  equity: "Equity Factor", comp_ratio: "Comp Ratio Factor", ai_boost: "AI Historical Boost",
};

const DISTRESS_CFG: Record<string, { label: string; icon: typeof AlertTriangle; color: string }> = {
  probate:          { label: "Probate",          icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20" },
  pre_foreclosure:  { label: "Pre-Foreclosure",  icon: AlertTriangle, color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  tax_lien:         { label: "Tax Lien",          icon: Banknote,      color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  code_violation:   { label: "Code Violation",    icon: Shield,        color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  vacant:           { label: "Vacant",            icon: Home,          color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  divorce:          { label: "Divorce",           icon: Scale,         color: "text-pink-400 bg-pink-500/10 border-pink-500/20" },
  bankruptcy:       { label: "Bankruptcy",        icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20" },
  fsbo:             { label: "FSBO",              icon: Building,      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  absentee:         { label: "Absentee",          icon: UserX,         color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  inherited:        { label: "Inherited",         icon: User,          color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  water_shutoff:    { label: "Water Shut-Off",   icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20" },
  condemned:        { label: "Condemned",        icon: AlertTriangle, color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
  tired_landlord:   { label: "Tired Landlord",  icon: AlertTriangle, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  underwater:       { label: "Underwater",       icon: AlertTriangle, color: "text-red-400 bg-red-500/10 border-red-500/20" },
};

// Re-export for consumers that may need them
export { DISTRESS_CFG, SIGNAL_WEIGHT_LABELS };

// ═══════════════════════════════════════════════════════════════════════
// ScoreBreakdownModal
// ═══════════════════════════════════════════════════════════════════════

export function ScoreBreakdownModal({ cf, scoreType, onClose }: { cf: ClientFile; scoreType: ScoreType; onClose: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const factors = (cf.factors ?? []) as { name: string; value: number; contribution: number }[];
  const pred = cf.prediction;

  const signalFactors = factors.filter((f) => f.name in SIGNAL_WEIGHTS);
  const bonusFactors = factors.filter((f) => !(f.name in SIGNAL_WEIGHTS));

  const totalSignalPts = signalFactors.reduce((s, f) => s + f.contribution, 0);
  const totalBonusPts = bonusFactors.reduce((s, f) => s + f.contribution, 0);

  const arv = cf.estimatedValue ?? 0;
  const rawEqPct = cf.equityPercent;
  const eqPct = typeof rawEqPct === "number" && isFinite(rawEqPct) ? rawEqPct : 0;
  const eqPctValid = typeof rawEqPct === "number" && isFinite(rawEqPct);
  const rawAvailableEquity = cf.availableEquity ?? (arv > 0 && eqPctValid ? Math.round(arv * eqPct / 100) : 0);
  const availableEquity = typeof rawAvailableEquity === "number" && isFinite(rawAvailableEquity) ? rawAvailableEquity : 0;
  const equityDataCorrupt = (rawEqPct != null && (typeof rawEqPct !== "number" || !isFinite(rawEqPct))) ||
    (cf.availableEquity != null && (typeof cf.availableEquity !== "number" || !isFinite(cf.availableEquity)));
  // Quick profit projection via canonical kernel (screening-grade, 65% offer assumption)
  const quickUnderwrite = calculateWholesaleUnderwrite({
    arv,
    arvSource: "avm",
    offerPercentage: 0.65,
    rehabEstimate: VALUATION_DEFAULTS.rehabEstimate,
    assignmentFeeTarget: 0, // gross-only for quick screen
    holdingCosts: 0,
    closingCosts: 0,
  });
  const offer = quickUnderwrite.maxAllowable;
  const totalCost = offer + quickUnderwrite.rehabEstimate;
  const profit = quickUnderwrite.grossProfit;
  const roi = totalCost > 0 ? Math.round((profit / totalCost) * 100) : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] modal-backdrop flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          onClick={(e) => e.stopPropagation()}
          className="relative max-w-lg w-full mx-4 max-h-[85vh] overflow-hidden rounded-[16px] border border-white/[0.08]
            modal-glass flex flex-col"
        >
          {/* Holographic top accent */}
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan/40 to-transparent" />
          <div className="absolute top-0 inset-x-0 h-12 bg-gradient-to-b from-cyan/[0.03] to-transparent pointer-events-none" />

          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className={cn(
                "h-8 w-8 rounded-[10px] flex items-center justify-center",
                scoreType === "composite" ? "bg-cyan/10 text-cyan" :
                scoreType === "motivation" ? "bg-orange-500/10 text-orange-400" :
                "bg-emerald-500/10 text-emerald-400"
              )}>
                {scoreType === "composite" ? <Zap className="h-4 w-4" /> :
                 scoreType === "motivation" ? <AlertTriangle className="h-4 w-4" /> :
                 <DollarSign className="h-4 w-4" />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {scoreType === "composite" ? "Match Score" : scoreType === "motivation" ? "Motivation Score" : "Deal Score"} Breakdown
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  {cf.ownerName} — {cf.fullAddress}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-[10px] hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {scoreType === "composite" && (
              <>
                {/* Big score hero */}
                <div className="text-center py-3">
                  <p className="text-5xl font-black tabular-nums" style={{ textShadow: "0 0 24px rgba(0,212,255,0.3), 0 0 60px rgba(0,212,255,0.1)" }}>{cf.compositeScore}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                    {cf.scoreLabel.toUpperCase()} — Model {cf.modelVersion ?? "v2.0"}
                  </p>
                  <p className="text-[11px] text-muted-foreground/80 mt-2 italic">
                    {cf.compositeScore >= 85
                      ? "This lead has multiple strong indicators. Prioritize contact."
                      : cf.compositeScore >= 65
                      ? "Good potential. Verify motivation before offering."
                      : cf.compositeScore >= 40
                      ? "Some signals present. Qualify further before investing time."
                      : "Limited data or weak signals. Consider deprioritizing."}
                  </p>
                </div>

                {/* Blend weights */}
                {pred && (
                  <div className="rounded-[10px] border border-purple-500/15 bg-purple-500/[0.04] p-3">
                    <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-2">Predictive Blend (v2.1)</p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Deterministic Weight</span>
                        <span className="font-mono font-semibold text-foreground">70%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Predictive Weight</span>
                        <span className="font-mono font-semibold text-purple-400">30%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Predictive Score</span>
                        <span className="font-mono font-semibold">{pred.predictiveScore}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Confidence</span>
                        <span className="font-mono font-semibold text-cyan">{pred.confidence}%</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Signal contributions */}
                {signalFactors.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="h-3 w-3" />Distress Signals — {Math.round(totalSignalPts)} pts
                    </p>
                    {signalFactors.map((f, i) => {
                      const maxPts = (SIGNAL_WEIGHTS[f.name as DistressType] ?? 10) * 1.8;
                      const fillPct = Math.min((f.contribution / maxPts) * 100, 100);
                      const cfg = DISTRESS_CFG[f.name];
                      return (
                        <div key={i} className="rounded-[8px] border border-white/[0.04] bg-white/[0.02] px-3 py-2">
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className={cn("font-medium", cfg?.color?.split(" ")[0] ?? "text-foreground")}>
                              {SIGNAL_WEIGHT_LABELS[f.name] ?? f.name}
                            </span>
                            <span className="font-mono font-bold text-foreground">+{f.contribution}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>Base: {f.value}</span>
                            <span className="text-muted-foreground/40">|</span>
                            <span>w/ severity + recency</span>
                          </div>
                          <div className="h-1 rounded-full bg-secondary/50 mt-1.5 overflow-hidden">
                            <div className={cn("h-full rounded-full", cfg?.color?.split(" ")[0]?.replace("text-", "bg-") ?? "bg-cyan")} style={{ width: `${fillPct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Bonus factors */}
                {bonusFactors.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="h-3 w-3" />Adjustments — {Math.round(totalBonusPts)} pts
                    </p>
                    {bonusFactors.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                        <span className="text-muted-foreground">{SIGNAL_WEIGHT_LABELS[f.name] ?? f.name}</span>
                        <span className={cn("font-mono font-bold", f.contribution >= 0 ? "text-cyan" : "text-red-400")}>
                          {f.contribution >= 0 ? "+" : ""}{f.contribution}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {signalFactors.length === 0 && factors.length > 0 && (
                  <div className="text-center py-4 space-y-1">
                    <p className="text-xs text-muted-foreground/70">Property appears clean — no distress indicators detected</p>
                    {cf.lastContactAt && (
                      <p className="text-[10px] text-muted-foreground/40">Last data check: {new Date(cf.lastContactAt).toLocaleDateString()}</p>
                    )}
                  </div>
                )}

                {factors.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground/60">
                    No detailed factor breakdown available — run enrichment to populate
                  </div>
                )}
              </>
            )}

            {scoreType === "motivation" && (
              <>
                <div className="text-center py-3">
                  <p className="text-5xl font-black tabular-nums text-orange-400" style={{ textShadow: "0 0 24px rgba(249,115,22,0.3)" }}>{cf.motivationScore}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Motivation Score — Owner Distress Intensity</p>
                </div>

                <div className="rounded-[10px] border border-orange-500/15 bg-orange-500/[0.03] p-3">
                  <p className="text-[10px] font-semibold text-orange-400 uppercase tracking-wider mb-2">Formula</p>
                  <p className="text-xs text-muted-foreground font-mono leading-relaxed">
                    BaseSignalScore × RecencyDecay × 1.2 (capped at 100)
                  </p>
                </div>

                {/* Per-signal detailed breakdown */}
                {cf.tags.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active Distress Signals</p>
                    {cf.tags.map((tag) => {
                      const cfg = DISTRESS_CFG[tag];
                      const TagIcon = cfg?.icon ?? Tag;
                      const baseWeight = SIGNAL_WEIGHTS[tag as DistressType] ?? 10;
                      const factor = factors.find((f) => f.name === tag);
                      return (
                        <div key={tag} className="rounded-[8px] border border-white/[0.04] bg-white/[0.02] px-3 py-2.5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <TagIcon className={cn("h-3.5 w-3.5", cfg?.color?.split(" ")[0] ?? "text-muted-foreground")} />
                            <span className={cn("text-xs font-semibold", cfg?.color?.split(" ")[0] ?? "text-foreground")}>{cfg?.label ?? tag}</span>
                            {factor && <span className="ml-auto font-mono text-xs font-bold text-foreground">+{factor.contribution}</span>}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[10px]">
                            <div>
                              <span className="text-muted-foreground/60">Base Weight</span>
                              <p className="font-mono font-semibold">{baseWeight}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground/60">Source</span>
                              <p className="font-medium">{cf.source}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground/60">Severity</span>
                              <p className="font-mono font-semibold">{factor ? Math.round(factor.contribution / baseWeight * 10) / 10 : "—"}×</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 space-y-1">
                    <p className="text-xs text-muted-foreground/70">Property appears clean — no distress indicators detected</p>
                    {cf.lastContactAt && (
                      <p className="text-[10px] text-muted-foreground/40">Last data check: {new Date(cf.lastContactAt).toLocaleDateString()}</p>
                    )}
                    {cf.promotedAt && !cf.lastContactAt && (
                      <p className="text-[10px] text-muted-foreground/40">Data as of: {new Date(cf.promotedAt).toLocaleDateString()}</p>
                    )}
                  </div>
                )}

                {/* Predictive life-event overlay */}
                {pred && pred.lifeEventProbability != null && pred.lifeEventProbability > 0.05 && (
                  <div className="rounded-[10px] border border-purple-500/15 bg-purple-500/[0.03] p-3">
                    <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-2">Predictive Life-Event Intelligence</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Life-Event Probability</span>
                        <span className="font-mono font-bold text-purple-400">{Math.round(pred.lifeEventProbability * 100)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Est. Distress In</span>
                        <span className="font-mono font-bold text-orange-400">~{pred.daysUntilDistress}d</span>
                      </div>
                      {pred.ownerAgeInference && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Owner Age (inferred)</span>
                          <span className="font-mono font-semibold">{pred.ownerAgeInference}</span>
                        </div>
                      )}
                      {pred.equityBurnRate != null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Equity Burn Rate</span>
                          <span className="font-mono font-semibold text-red-400">{Math.round(pred.equityBurnRate * 100)}%/yr</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Owner flags impact */}
                {(cf.isAbsentee || cf.isVacant || cf.isFreeClear || cf.isHighEquity) && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Owner Profile Impact</p>
                    {cf.isAbsentee && <BreakdownRow label="Absentee Owner" value="+5 pts" color="text-amber-400" />}
                    {cf.isVacant && <BreakdownRow label="Vacant Property" value="+4 pts" color="text-purple-400" />}
                    {cf.isFreeClear && <BreakdownRow label="Free & Clear (no mortgage pressure)" value="+0 pts" color="text-emerald-400" />}
                    {cf.isHighEquity && <BreakdownRow label="High Equity" value="Equity factor boost" color="text-cyan" />}
                  </div>
                )}
              </>
            )}

            {scoreType === "deal" && (
              <>
                <div className="text-center py-3">
                  <p className="text-5xl font-black tabular-nums text-emerald-400" style={{ textShadow: "0 0 24px rgba(16,185,129,0.3)" }}>{cf.dealScore}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Deal Score — Investment Viability Index</p>
                </div>

                <div className="rounded-[10px] border border-emerald-500/15 bg-emerald-500/[0.03] p-3">
                  <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-2">Formula</p>
                  <p className="text-xs text-muted-foreground font-mono leading-relaxed">
                    EquityFactor × 2 + AIBoost + StackingBonus × 0.5 (capped at 100)
                  </p>
                </div>

                {/* Deal assumptions */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Property Financials</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">ARV / AVM</span>
                      <span className="font-mono font-bold text-neon">{arv > 0 ? formatCurrency(arv) : "—"}</span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">Equity %</span>
                      <span className={cn("font-mono font-bold", equityDataCorrupt && "text-amber-400 text-[10px] font-normal")}>
                        {equityDataCorrupt ? "Data unavailable" : eqPct > 0 ? `${eqPct}%` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">Available Equity</span>
                      <span className={cn("font-mono font-semibold", equityDataCorrupt && "text-amber-400 text-[10px] font-normal")}>
                        {equityDataCorrupt ? "Run property analysis" : availableEquity > 0 ? formatCurrency(availableEquity) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">Total Loans</span>
                      <span className="font-mono font-semibold">{cf.totalLoanBalance ? formatCurrency(cf.totalLoanBalance) : "—"}</span>
                    </div>
                  </div>
                </div>

                {/* Profit projection */}
                {arv > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Profit Projection</p>
                    <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ARV</span>
                        <span className="font-mono font-medium">{formatCurrency(arv)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Offer @ 65%</span>
                        <span className="font-mono text-red-400">-{formatCurrency(offer)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rehab Est.</span>
                        <span className="font-mono text-red-400">-{formatCurrency(quickUnderwrite.rehabEstimate)}</span>
                      </div>
                      <div className="border-t border-white/[0.06] pt-1.5 mt-1.5 flex justify-between">
                        <span className="font-semibold">Net Profit</span>
                        <span className={cn("font-mono font-bold text-lg", profit >= 0 ? "text-neon" : "text-red-400")} style={profit >= 0 ? { textShadow: "0 0 10px rgba(0,212,255,0.25)" } : {}}>
                          {formatCurrency(profit)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">ROI</span>
                        <span className={cn("font-mono font-semibold", roi >= 0 ? "text-neon" : "text-red-400")}>{roi}%</span>
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground/40 italic">
                      Assumptions: 65% MAO, ${(VALUATION_DEFAULTS.rehabEstimate / 1000).toFixed(0)}k rehab. Adjust in Offer Calculator tab.
                    </p>
                  </div>
                )}

                {/* Deal score components */}
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Score Components</p>
                  {bonusFactors.filter((f) => f.name === "equity" || f.name === "comp_ratio" || f.name === "ai_boost" || f.name === "stacking_bonus").map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">{SIGNAL_WEIGHT_LABELS[f.name] ?? f.name}</span>
                      <span className="font-mono font-bold text-cyan">+{f.contribution}</span>
                    </div>
                  ))}
                  {cf.aiBoost > 0 && !bonusFactors.some((f) => f.name === "ai_boost") && (
                    <div className="flex items-center justify-between text-xs px-3 py-1.5 rounded-[8px] bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-muted-foreground">AI Historical Boost</span>
                      <span className="font-mono font-bold text-cyan">+{cf.aiBoost}</span>
                    </div>
                  )}
                </div>

                {arv === 0 && (
                  <div className="text-center py-4 text-xs text-muted-foreground/60">
                    No property value data — run enrichment to populate ARV and financial details
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
            <p className="text-[9px] text-muted-foreground/40 font-mono">
              Scoring Engine {cf.modelVersion ?? "v2.0"} • {cf.tags.length} signal(s) • {cf.source}
            </p>
            <Button size="sm" variant="outline" onClick={onClose} className="text-[10px] h-7 px-3">
              Close
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
