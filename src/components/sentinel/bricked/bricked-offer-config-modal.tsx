"use client";

import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export interface DealConfig {
  holdingCostPct: number;
  closingCostPct: number;
  wholesaleFeePct: number;
  profitPct: number;
  offerPriceOverride?: number;
  /** @deprecated Use wholesaleFeePct instead */
  wholesaleFee?: number;
}

export const DEFAULT_DEAL_CONFIG: DealConfig = {
  holdingCostPct: 0,
  closingCostPct: 0,
  wholesaleFeePct: 7,
  profitPct: 20,
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (config: DealConfig) => void;
  arv: number;
  repairCost: number;
  initialConfig?: DealConfig;
}

export function computeOfferPrice(arv: number, repairCost: number, config: DealConfig): number {
  if (config.offerPriceOverride != null) return config.offerPriceOverride;
  const holding = arv * (config.holdingCostPct / 100);
  const closing = arv * (config.closingCostPct / 100);
  const wholesale = arv * ((config.wholesaleFeePct ?? 7) / 100);
  const profit = arv * (config.profitPct / 100);
  return arv - repairCost - holding - closing - wholesale - profit;
}

export function BrickedOfferConfigModal({ open, onClose, onSave, arv, repairCost, initialConfig }: Props) {
  const [cfg, setCfg] = useState<DealConfig>(initialConfig ?? DEFAULT_DEAL_CONFIG);
  const [overrideActive, setOverrideActive] = useState(cfg.offerPriceOverride != null);

  const computed = useMemo(() => {
    const holding = arv * (cfg.holdingCostPct / 100);
    const closing = arv * (cfg.closingCostPct / 100);
    const wholesale = arv * ((cfg.wholesaleFeePct ?? 7) / 100);
    const profit = arv * (cfg.profitPct / 100);
    const auto = arv - repairCost - holding - closing - wholesale - profit;
    return { holding, closing, wholesale, profit, auto, final: overrideActive && cfg.offerPriceOverride != null ? cfg.offerPriceOverride : auto };
  }, [arv, repairCost, cfg, overrideActive]);

  const update = <K extends keyof DealConfig>(key: K, value: DealConfig[K]) =>
    setCfg((prev) => ({ ...prev, [key]: value }));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-2xl rounded-[14px] border border-overlay-8 bg-panel-solid backdrop-blur-2xl shadow-[0_20px_60px_var(--shadow-heavy)]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-overlay-6">
          <h2 className="text-sm font-semibold">Offer Price Configuration</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-6 px-6 py-5">
          {/* Left: input parameters */}
          <div className="flex-1 space-y-4">
            <PctField label="Holding Costs" value={cfg.holdingCostPct} arv={arv} onChange={(v) => update("holdingCostPct", v)} />
            <PctField label="Closing Costs" value={cfg.closingCostPct} arv={arv} onChange={(v) => update("closingCostPct", v)} />
            <PctField label="Wholesale Fee" value={cfg.wholesaleFeePct ?? 7} arv={arv} onChange={(v) => update("wholesaleFeePct", v)} />
            <PctField label="Profit Percentage" value={cfg.profitPct} arv={arv} onChange={(v) => update("profitPct", v)} />
            <div className="pt-2 border-t border-overlay-6">
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">Offer Price</label>
                <button
                  type="button"
                  onClick={() => {
                    setOverrideActive(!overrideActive);
                    if (!overrideActive) update("offerPriceOverride", Math.round(computed.auto));
                    else update("offerPriceOverride", undefined);
                  }}
                  className="text-[9px] text-cyan hover:underline"
                >
                  {overrideActive ? "Use auto" : "Override"}
                </button>
              </div>
              {overrideActive ? (
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                  <input
                    type="number"
                    value={cfg.offerPriceOverride ?? ""}
                    onChange={(e) => update("offerPriceOverride", Number(e.target.value) || 0)}
                    className="w-full pl-7 pr-3 py-2 rounded-md border border-overlay-8 bg-overlay-3 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
              ) : (
                <span className="text-lg font-bold font-mono text-emerald-400">{formatCurrency(computed.auto)}</span>
              )}
            </div>
          </div>

          {/* Right: deal summary */}
          <div className="w-[220px] shrink-0 rounded-[10px] border border-overlay-6 bg-overlay-2 p-4 space-y-2.5 self-start">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-3">Deal Summary</p>
            <SummaryLine label="ARV" value={formatCurrency(arv)} />
            <SummaryLine label="Repair Cost" value={`-${formatCurrency(repairCost)}`} negative />
            <SummaryLine label={`Holding (${cfg.holdingCostPct}%)`} value={`-${formatCurrency(computed.holding)}`} negative />
            <SummaryLine label={`Closing (${cfg.closingCostPct}%)`} value={`-${formatCurrency(computed.closing)}`} negative />
            <SummaryLine label={`Wholesale (${cfg.wholesaleFeePct ?? 7}%)`} value={`-${formatCurrency(computed.wholesale)}`} negative />
            <SummaryLine label={`Profit (${cfg.profitPct}%)`} value={`-${formatCurrency(computed.profit)}`} negative />
            <div className="pt-2 border-t border-overlay-6">
              <SummaryLine label="Offer Price" value={formatCurrency(computed.final)} highlight />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-overlay-6">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => {
              const saved = { ...cfg };
              if (!overrideActive) delete saved.offerPriceOverride;
              onSave(saved);
              onClose();
            }}
          >
            Save Configuration
          </Button>
        </div>
      </div>
    </div>
  );
}

function PctField({ label, value, arv, onChange }: { label: string; value: number; arv: number; onChange: (v: number) => void }) {
  const dollar = arv * (value / 100);
  return (
    <div>
      <label className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">{label}</label>
      <div className="flex items-center gap-2 mt-1">
        <div className="relative flex-1">
          <input
            type="number"
            step="0.5"
            value={value}
            onChange={(e) => onChange(Number(e.target.value) || 0)}
            className="w-full pr-7 pl-3 py-2 rounded-md border border-overlay-8 bg-overlay-3 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
        </div>
        <span className="text-xs font-mono text-muted-foreground w-24 text-right">{formatCurrency(dollar)}</span>
      </div>
    </div>
  );
}

function SummaryLine({ label, value, negative, highlight }: { label: string; value: string; negative?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span
        className={`text-xs font-mono font-semibold ${
          highlight ? "text-emerald-400 text-sm" : negative ? "text-red-400" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
