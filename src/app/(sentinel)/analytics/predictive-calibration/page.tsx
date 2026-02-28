"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Brain, Sliders, RefreshCw, Save, Lock, AlertTriangle, CheckCircle,
  Gauge, Target, Users, Phone, LineChart,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSentinelStore } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// ── Feature Weight Schema ────────────────────────────────────────────

interface WeightConfig {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
  min: number;
  max: number;
  step: number;
}

const WEIGHT_SCHEMA: WeightConfig[] = [
  { key: "ownerAge", label: "Owner Age Inference", icon: Users, description: "Inferred age from SSA name tables + ownership duration", min: 0, max: 0.30, step: 0.01 },
  { key: "equityBurnRate", label: "Equity Burn Rate", icon: LineChart, description: "Annual equity loss rate from loan-to-value trajectory", min: 0, max: 0.30, step: 0.01 },
  { key: "absenteeDuration", label: "Absentee Duration", icon: Target, description: "Days since owner became absentee (vacancy compound)", min: 0, max: 0.25, step: 0.01 },
  { key: "taxDelinquencyTrend", label: "Tax Delinquency Trend", icon: AlertTriangle, description: "Growth slope of delinquent amounts over time", min: 0, max: 0.30, step: 0.01 },
  { key: "lifeEventProbability", label: "Life-Event Probability", icon: Brain, description: "Foreclosure, probate, divorce, bankruptcy filing probability", min: 0, max: 0.35, step: 0.01 },
  { key: "signalVelocity", label: "Signal Velocity", icon: Gauge, description: "Rate of new distress signals in recent 90d window", min: 0, max: 0.25, step: 0.01 },
  { key: "ownershipStress", label: "Ownership Stress", icon: AlertTriangle, description: "Compound stress from LTV, vacancy, deferred maintenance", min: 0, max: 0.20, step: 0.01 },
  { key: "marketExposure", label: "Market Exposure", icon: LineChart, description: "Under-market value + stale ownership = opportunity window", min: 0, max: 0.20, step: 0.01 },
  { key: "skipTrace", label: "Skip-Trace Intelligence", icon: Phone, description: "Heir probability, contact probability, age confidence (v2.1)", min: 0, max: 0.30, step: 0.01 },
];

const DEFAULT_WEIGHTS: Record<string, number> = {
  ownerAge: 0.10,
  equityBurnRate: 0.15,
  absenteeDuration: 0.08,
  taxDelinquencyTrend: 0.14,
  lifeEventProbability: 0.17,
  signalVelocity: 0.09,
  ownershipStress: 0.07,
  marketExposure: 0.05,
  skipTrace: 0.15,
};

export default function PredictiveCalibrationPage() {
  const { currentUser } = useSentinelStore();
  const isAdmin = currentUser.role === "admin";

  const [weights, setWeights] = useState<Record<string, number>>({ ...DEFAULT_WEIGHTS });
  const [saving, setSaving] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [lastCalibration, setLastCalibration] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [retrainResult, setRetrainResult] = useState<{ processed: number; errors: number } | null>(null);

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const isBalanced = Math.abs(totalWeight - 1.0) < 0.005;

  useEffect(() => {
    loadCalibration();
  }, []);

  async function loadCalibration() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from("scoring_predictions") as any)
        .select("model_version, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (data?.created_at) {
        setLastCalibration(data.created_at);
      }
    } catch {
      // No predictions yet
    }
  }

  const updateWeight = useCallback((key: string, value: number) => {
    setWeights((prev) => ({ ...prev, [key]: Math.round(value * 100) / 100 }));
    setSaveStatus("idle");
  }, []);

  const resetDefaults = useCallback(() => {
    setWeights({ ...DEFAULT_WEIGHTS });
    setSaveStatus("idle");
  }, []);

  const handleSave = useCallback(async () => {
    if (!isAdmin || !isBalanced) return;

    setSaving(true);
    setSaveStatus("idle");

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("event_log") as any).insert({
        user_id: currentUser.id,
        action: "predictive_calibration_save",
        entity_type: "scoring_model",
        entity_id: "pred-v2.1",
        details: {
          weights,
          total_weight: Math.round(totalWeight * 100) / 100,
          timestamp: new Date().toISOString(),
        },
      });

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }, [isAdmin, isBalanced, weights, totalWeight, currentUser.id]);

  const handleRetrain = useCallback(async () => {
    if (!isAdmin) return;

    setRetraining(true);
    setRetrainResult(null);

    try {
      const response = await fetch("/api/scoring/retrain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights, model_version: "pred-v2.1" }),
      });

      if (response.ok) {
        const result = await response.json();
        setRetrainResult({ processed: result.processed ?? 0, errors: result.errors ?? 0 });
      } else {
        setRetrainResult({ processed: 0, errors: 1 });
      }
    } catch {
      setRetrainResult({ processed: 0, errors: 1 });
    } finally {
      setRetraining(false);
    }
  }, [isAdmin, weights]);

  if (!isAdmin) {
    return (
      <PageShell title="Predictive Calibration" description="Admin access required">
        <GlassCard className="p-8 text-center">
          <Lock className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">
            Only administrators can access the predictive calibration panel.
          </p>
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Predictive Calibration"
      description="Adjust feature weights for the Sentinel Predictive Scoring Engine v2.1"
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            Model: pred-v2.1
          </Badge>
          {lastCalibration && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Last prediction: {new Date(lastCalibration).toLocaleDateString()}
            </Badge>
          )}
        </div>
      }
    >
      {/* Weight Balance Indicator */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center",
              isBalanced
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-orange-500/15 text-orange-400"
            )}>
              {isBalanced ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            </div>
            <div>
              <p className="text-sm font-medium">
                Weight Sum: <span className={cn(
                  "font-mono",
                  isBalanced ? "text-emerald-400" : "text-orange-400"
                )}>{totalWeight.toFixed(2)}</span>
              </p>
              <p className="text-[10px] text-muted-foreground">
                {isBalanced ? "Balanced — weights sum to 1.00" : "Unbalanced — adjust weights to sum to 1.00"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              onClick={resetDefaults}
            >
              Reset Defaults
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] gap-1"
              onClick={handleSave}
              disabled={saving || !isBalanced}
            >
              {saving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {saveStatus === "saved" ? "Saved!" : "Save Config"}
            </Button>
            <Button
              size="sm"
              className="h-7 text-[10px] gap-1"
              onClick={handleRetrain}
              disabled={retraining || !isBalanced}
            >
              {retraining ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
              {retraining ? "Retraining..." : "Retrain All"}
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Retrain Result */}
      {retrainResult && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard className={cn(
            "p-3",
            retrainResult.errors > 0 ? "border-orange-500/30" : "border-emerald-500/30"
          )}>
            <p className="text-xs">
              {retrainResult.errors === 0
                ? <span className="text-emerald-400">Retrain complete — {retrainResult.processed} properties rescored with updated weights.</span>
                : <span className="text-orange-400">Retrain finished with {retrainResult.errors} errors. {retrainResult.processed} properties rescored.</span>
              }
            </p>
          </GlassCard>
        </motion.div>
      )}

      {/* Feature Weight Sliders */}
      <div className="grid grid-cols-1 gap-3">
        {WEIGHT_SCHEMA.map((config, idx) => {
          const Icon = config.icon;
          const value = weights[config.key] ?? 0;
          const pct = Math.round(value * 100);
          const isDefault = Math.abs(value - (DEFAULT_WEIGHTS[config.key] ?? 0)) < 0.005;

          return (
            <motion.div
              key={config.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
            >
              <GlassCard className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-cyan/10 flex items-center justify-center">
                      <Icon className="h-3.5 w-3.5 text-cyan" />
                    </div>
                    <div>
                      <p className="text-xs font-medium flex items-center gap-2">
                        {config.label}
                        {!isDefault && (
                          <span className="text-[9px] text-orange-400 font-normal">modified</span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60">{config.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-semibold text-cyan">{pct}%</p>
                    <p className="text-[9px] text-muted-foreground/40">
                      default: {Math.round((DEFAULT_WEIGHTS[config.key] ?? 0) * 100)}%
                    </p>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="range"
                    min={config.min}
                    max={config.max}
                    step={config.step}
                    value={value}
                    onChange={(e) => updateWeight(config.key, parseFloat(e.target.value))}
                    className="w-full h-1.5 appearance-none bg-white/5 rounded-full cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
                      [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-cyan [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(0,212,255,0.5)]
                      [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                  <div
                    className="absolute top-0 left-0 h-1.5 rounded-full bg-gradient-to-r from-cyan/60 to-cyan pointer-events-none"
                    style={{ width: `${((value - config.min) / (config.max - config.min)) * 100}%` }}
                  />
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      {/* Model Info */}
      <GlassCard className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sliders className="h-4 w-4 text-purple-400" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Model Architecture</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px]">
          <div>
            <p className="text-muted-foreground/60">Version</p>
            <p className="font-mono text-cyan">pred-v2.1</p>
          </div>
          <div>
            <p className="text-muted-foreground/60">Features</p>
            <p className="font-mono">9 deterministic</p>
          </div>
          <div>
            <p className="text-muted-foreground/60">Blend Ratio</p>
            <p className="font-mono">70% det / 30% pred</p>
          </div>
          <div>
            <p className="text-muted-foreground/60">Promotion Gate</p>
            <p className="font-mono text-emerald-400">&ge;60 composite</p>
          </div>
        </div>
      </GlassCard>
    </PageShell>
  );
}
