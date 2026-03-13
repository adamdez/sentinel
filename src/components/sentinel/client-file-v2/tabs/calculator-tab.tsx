"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  calculateWholesaleUnderwrite,
  DEFAULTS as VALUATION_DEFAULTS,
} from "@/lib/valuation";

interface DealCalculatorProps {
  arv: number;
  initialRepairs?: number;
}

export function DealCalculatorTab({ arv, initialRepairs = VALUATION_DEFAULTS.rehabEstimate }: DealCalculatorProps) {
  const [repairs, setRepairs] = useState(initialRepairs);
  const [maoPercentage, setMaoPercentage] = useState(Math.round(VALUATION_DEFAULTS.offerPercentage * 100));

  // Canonical MAO via valuation kernel — what-if scenario mode
  const underwrite = calculateWholesaleUnderwrite({
    arv,
    arvSource: "manual",
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
            <div className="px-3 py-2 bg-white/5 rounded border border-white/10 font-mono text-lg text-emerald-400 font-bold">
              {formatCurrency(arv)}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Based on neighborhood comps</p>
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
              className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>
      </div>

      {/* Output / Result Container */}
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-6 flex flex-col justify-center relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl rounded-full" />

        <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">Max Allowable Offer (MAO)</h3>
        <p className="text-[10px] text-muted-foreground mb-1 font-mono">(ARV × {maoPercentage}%) − Repairs</p>
        <p className="text-[10px] text-amber-400/70 mb-6">What-if scenario — not your final offer</p>

        <div className="text-6xl font-black tracking-tighter text-neon drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">
          {mao > 0 ? formatCurrency(mao) : "$0"}
        </div>

        <div className="mt-8 pt-4 border-t border-emerald-500/20">
          <p className="text-sm text-foreground/80 leading-relaxed">
            If you can secure the contract below <span className="font-mono font-bold text-emerald-400">{formatCurrency(mao)}</span>,
            the difference is your potential assignment fee.
          </p>
        </div>
      </div>
    </div>
  );
}
