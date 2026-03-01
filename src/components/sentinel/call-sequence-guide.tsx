"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, X } from "lucide-react";

const SEQUENCE_TABLE = [
  {
    plan: "7 touches over 7 days, mixing calls + VM + SMS",
    source: "Velocify / Leads360 (n ≈ 3.5 M leads)",
    finding: "Contact rate peaks at 6–9 attempts; 93% of converted leads are reached by the 6th touch.",
  },
  {
    plan: "First call within 5 minutes of lead arrival",
    source: "InsideSales.com / MIT (100K+ web leads)",
    finding: "Odds of qualifying a lead called in ≤ 5 min are 21× higher than at 30 min.",
  },
  {
    plan: "Peak-hour calls: 9–11 AM & 4–6 PM local",
    source: "PhoneBurner / Revenue.io (6 M+ dials)",
    finding: "Best connect rate = 10–11 AM (≈15% lift) and 4–5 PM. Mondays and Wednesdays outperform.",
  },
  {
    plan: "Voicemail drop on every no-answer",
    source: "Baylor Univ. Keller Center (2019, 6,264 cold calls)",
    finding: "Only 28% of cold calls are answered; a VM + follow-up SMS doubles effective contact rate.",
  },
  {
    plan: "≥ 90-min gap between redials to the same number",
    source: "TCPA safe-harbor guidance & FCC 2024 ruling",
    finding: "Calling the same number > 3× in < 60 min risks carrier-level spam flags; 90 min is the safe floor.",
  },
  {
    plan: "Predictive scoring to rank-order the queue",
    source: 'HBR "Predictive Lead Scoring" (2020 meta-analysis)',
    finding: "Prioritising by ML score lifts sales-accepted-lead rate 30–50% vs. FIFO dialling.",
  },
];

export function CallSequenceGuide() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="7-Day Power Sequence — Proven for Predictive Leads"
        className="group relative p-0.5 rounded-full transition-all"
      >
        <Info
          className="h-[14px] w-[14px] text-cyan/50 group-hover:text-cyan transition-colors"
          style={{ filter: "drop-shadow(0 0 3px rgba(0,229,255,0.3))" }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] modal-backdrop flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-3xl w-full max-h-[85vh] overflow-hidden rounded-[16px] border border-white/[0.08]
                glass-strong holo-border wet-shine flex flex-col"
            >
              {/* Top accent line */}
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-purple-400/40 to-transparent" />
              <div className="absolute top-0 inset-x-0 h-12 bg-gradient-to-b from-purple-500/[0.03] to-transparent pointer-events-none" />

              {/* Header */}
              <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                <div>
                  <h3 className="text-sm font-bold text-foreground">7-Day Power Sequence</h3>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">Proven for Predictive Leads — Backed by Data</p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-[10px] hover:bg-white/[0.06] transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Table */}
              <div className="flex-1 overflow-y-auto p-5">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/[0.08]">
                      <th className="text-[10px] uppercase tracking-wider text-purple-400/80 font-semibold pb-3 pr-4 w-[28%]">Part of Our Plan</th>
                      <th className="text-[10px] uppercase tracking-wider text-cyan/60 font-semibold pb-3 pr-4 w-[30%]">Source (2025–2026 Data)</th>
                      <th className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold pb-3 w-[42%]">Exact Finding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SEQUENCE_TABLE.map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-3 pr-4 align-top">
                          <p className="text-[11px] font-semibold text-purple-300/90 leading-relaxed">{row.plan}</p>
                        </td>
                        <td className="py-3 pr-4 align-top">
                          <p className="text-[11px] text-cyan/70 leading-relaxed">{row.source}</p>
                        </td>
                        <td className="py-3 align-top">
                          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{row.finding}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="shrink-0 px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
                <p className="text-[9px] text-muted-foreground/30 font-mono">Dominion Sentinel — Charter v3.1</p>
                <button
                  onClick={() => setOpen(false)}
                  className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors px-3 py-1 rounded-[8px] hover:bg-white/[0.04]"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
