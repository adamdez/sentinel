"use client";

import { motion } from "framer-motion";
import { Phone, ExternalLink } from "lucide-react";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { computeScore, type ScoringInput } from "@/lib/scoring";
import type { AIScore } from "@/lib/types";

const PROSPECT_DATA: (ScoringInput & { name: string; address: string; apn: string; distressLabel: string })[] = [
  {
    name: "Margaret Henderson",
    address: "1423 Oak Valley Dr, Phoenix AZ",
    apn: "123-45-678",
    distressLabel: "Probate",
    signals: [
      { type: "probate", severity: 9, daysSinceEvent: 12 },
      { type: "vacant", severity: 6, daysSinceEvent: 30 },
    ],
    ownerFlags: { absentee: false, inherited: true, elderly: true },
    equityPercent: 72,
    compRatio: 1.35,
    historicalConversionRate: 0.82,
  },
  {
    name: "Robert Chen",
    address: "890 Maple St, Mesa AZ",
    apn: "234-56-789",
    distressLabel: "Pre-Foreclosure",
    signals: [
      { type: "pre_foreclosure", severity: 8, daysSinceEvent: 5 },
    ],
    ownerFlags: { outOfState: true },
    equityPercent: 55,
    compRatio: 1.18,
    historicalConversionRate: 0.68,
  },
  {
    name: "Lisa Morales",
    address: "2100 Desert Ridge, Scottsdale AZ",
    apn: "345-67-890",
    distressLabel: "Tax Lien + Vacant",
    signals: [
      { type: "tax_lien", severity: 7, daysSinceEvent: 20 },
      { type: "vacant", severity: 5, daysSinceEvent: 45 },
      { type: "code_violation", severity: 4, daysSinceEvent: 60 },
    ],
    ownerFlags: { absentee: true, outOfState: true },
    equityPercent: 64,
    compRatio: 1.22,
    historicalConversionRate: 0.55,
  },
  {
    name: "James Walker",
    address: "445 Central Ave, Tempe AZ",
    apn: "456-78-901",
    distressLabel: "Divorce",
    signals: [
      { type: "divorce", severity: 6, daysSinceEvent: 35 },
    ],
    ownerFlags: {},
    equityPercent: 40,
    compRatio: 1.05,
    historicalConversionRate: 0.42,
  },
];

export function MyTopProspects() {
  const scored = PROSPECT_DATA.map((p) => {
    const result = computeScore(p);
    const aiScore: AIScore = {
      composite: result.composite,
      motivation: result.motivationScore,
      equityVelocity: Math.round(p.equityPercent * 0.9),
      urgency: Math.round(result.baseSignalScore * result.recencyDecay),
      historicalConversion: Math.round(p.historicalConversionRate * 100),
      aiBoost: result.aiBoost,
      label: result.label,
    };
    return { ...p, aiScore, result };
  }).sort((a, b) => b.result.composite - a.result.composite);

  return (
    <div className="space-y-2">
      {scored.map((prospect, i) => (
        <motion.div
          key={prospect.apn}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06 }}
          className={`flex items-center gap-3 p-2.5 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-all group relative ${
            prospect.aiScore.label === "fire" ? "neon-glow" : ""
          }`}
          style={prospect.aiScore.label === "fire" ? {
            boxShadow: "0 0 15px rgba(0,255,136,0.12), inset 0 0 20px rgba(0,255,136,0.03)",
          } : {}}
        >
          <span className="text-[10px] text-muted-foreground font-mono w-3 shrink-0">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p
              className="text-xs font-semibold truncate text-foreground"
              style={{
                textShadow: "0 0 8px rgba(0,255,136,0.15), 0 0 16px rgba(0,255,136,0.06)",
                WebkitFontSmoothing: "antialiased",
              }}
            >
              {prospect.name}
            </p>
            <p
              className="text-[10px] font-medium text-muted-foreground/90 truncate"
              style={{ WebkitFontSmoothing: "antialiased" }}
            >
              {prospect.address}
            </p>
          </div>
          <Badge variant="outline" className="text-[9px] shrink-0 hidden sm:flex">
            {prospect.distressLabel}
          </Badge>
          <AIScoreBadge score={prospect.aiScore} size="sm" />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            <Phone className="h-3 w-3" />
          </Button>
        </motion.div>
      ))}
      <p className="text-[9px] text-muted-foreground text-center pt-1">
        Scored by AI Distress Model {scored[0]?.result.modelVersion} — base signals, severity, recency decay, stacking, owner/equity factors
      </p>
      {/* TODO: Pull from Supabase properties + distress_events joined with scoring_records */}
      {/* TODO: Filter to current user's assigned territory/county */}
      {/* TODO: Real-time subscription for new high-score prospects */}
    </div>
  );
}
