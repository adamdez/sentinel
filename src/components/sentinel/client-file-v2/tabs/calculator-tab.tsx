"use client";

import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  calculateWholesaleUnderwrite,
  DEFAULTS as VALUATION_DEFAULTS,
} from "@/lib/valuation";

interface DealCalculatorProps {
  /** Explicit ARV passed by parent (e.g. from comps tab computation) */
  arv: number;
  /** Comp-derived ARV stored in ownerFlags.comp_arv */
  compArv?: number;
  /** AVM / assessed value from properties.estimated_value */
  estimatedValue?: number;
  /** Seller asking price or price expectation, if known */
  askingPrice?: number;
  initialRepairs?: number;
}

export function DealCalculatorTab({
  arv: arvProp,
  compArv,
  estimatedValue,
  askingPrice,
  initialRepairs = VALUATION_DEFAULTS.rehabEstimate,
}: DealCalculatorProps) {
  // Auto-populate ARV: prefer explicit prop > comp ARV > estimated value
  const bestArv = arvProp > 0 ? arvProp : (compArv && compArv > 0) ? compArv : (estimatedValue ?? 0);
  const [arvInput, setArvInput] = useState(bestArv > 0 ? bestArv.toString() : "");
  const [repairs, setRepairs] = useState(initialRepairs);
  const [maoPercentage, setMaoPercentage] = useState(Math.round(VALUATION_DEFAULTS.offerPercentage * 100));

  // Re-sync ARV when parent passes updated comp data
  useEffect(() => {
    const incoming = arvProp > 0 ? arvProp : (compArv && compArv > 0) ? compArv : 0;
    if (incoming > 0) setArvInput(incoming.toString());
  }, [arvProp, compArv]);

  const arv = parseFloat(arvInput) || 0;
  const arvSource: "comps" | "avm" | "manual" =
    arvProp > 0 || (compArv && compArv > 0) ? "comps" : (estimatedValue && estimatedValue > 0) ? "avm" : "manual";

  // Canonical MAO via valuation kernel — what-if scenario mode
  const underwrite = calculateWholesaleUnderwrite({
    arv,
    arvSource,
    offerPercentage: maoPercentage / 100,
    rehabEstimate: repairs,
    assignmentFeeTarget: 0, // What-if mode: show raw MAO without fee
    holdingCosts: 0,
    closingCosts: 0,
  });
  const mao = underwrite.mao;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Inputs */}
      <div className="space-y-6">
        <h3 className="text-lg font-bold border-b border-white/10 pb-2">Deal Parameters</h3>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">After Repair Value (ARV)</label>
            <input
              type="number"
              value={arvInput}
              onChange={(e) => setArvInput(e.target.value)}
              placeholder="Enter ARV"
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 font-mono text-lg text-foreground font-bold focus:outline-none focus:border-primary-500/50"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              {arvSource === "comps" ? "Auto-filled from comps" : arvSource === "avm" ? "Auto-filled from estimated value" : "Enter manually or run comps"}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Target Purchase % (Standard {Math.round(VALUATION_DEFAULTS.offerPercentage * 100)}%)</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="50" max="90"
                value={maoPercentage}
                onChange={(e) => setMaoPercentage(Number(e.target.value))}
                className="flex-1 accent-cyan-500"
              />
              <span className="font-mono text-sm px-2 py-1 bg-white/5 rounded border border-white/10">{maoPercentage}%</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">Estimated Repairs</label>
            <input
              type="number"
              value={repairs}
              onChange={(e) => setRepairs(Number(e.target.value))}
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:border-primary-500/50"
            />
          </div>
        </div>
      </div>

      {/* Output / Result Container */}
      <div className="bg-muted/5 border border-border/20 rounded-xl p-6 flex flex-col justify-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-muted/10 blur-3xl rounded-full" />

        <h3 className="text-xs font-bold text-foreground uppercase tracking-widest mb-1">Max Allowable Offer (MAO)</h3>
        <p className="text-[10px] text-muted-foreground mb-1 font-mono">(ARV × {maoPercentage}%) − Repairs</p>
        <p className="text-[10px] text-foreground/70 mb-6">What-if scenario — not your final offer</p>

        <div className="text-6xl font-black tracking-tighter text-primary drop-shadow-[0_0_12px_rgba(0,0,0,0.12)]">
          {mao > 0 ? formatCurrency(mao) : "$0"}
        </div>

        <div className="mt-8 pt-4 border-t border-border/20">
          <p className="text-sm text-foreground/80 leading-relaxed">
            If you can secure the contract below <span className="font-mono font-bold text-foreground">{formatCurrency(mao)}</span>,
            the difference is your potential assignment fee.
          </p>
        </div>
      </div>
    </div>
  );
}
