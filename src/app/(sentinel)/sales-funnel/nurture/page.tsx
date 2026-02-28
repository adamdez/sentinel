"use client";

import { Heart, Clock, Mail, Phone, RefreshCw } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AIScore } from "@/lib/types";

const nurtureLeads = [
  {
    name: "David Park",
    address: "567 Sunset Blvd, Glendale AZ",
    reason: "Not ready to sell yet — revisit in 60 days",
    lastContact: "3 weeks ago",
    nextFollow: "Mar 15, 2026",
    score: { composite: 52, motivation: 35, equityVelocity: 60, urgency: 25, historicalConversion: 55, aiBoost: 3, label: "warm" } as AIScore,
  },
  {
    name: "Karen Wright",
    address: "2345 Palm Dr, Chandler AZ",
    reason: "Interested but exploring options",
    lastContact: "1 week ago",
    nextFollow: "Mar 5, 2026",
    score: { composite: 61, motivation: 55, equityVelocity: 65, urgency: 50, historicalConversion: 60, aiBoost: 4, label: "warm" } as AIScore,
  },
];

export default function NurturePage() {
  return (
    <PageShell
      title="Nurture"
      description="Sentinel Nurture — Long-term follow-up pipeline for future opportunities"
      actions={
        <Button variant="outline" size="sm" className="gap-2 text-xs">
          <RefreshCw className="h-3 w-3" />
          Re-score All
        </Button>
      }
    >
      <GlassCard hover={false} className="mb-4">
        <div className="flex items-center gap-4 text-sm">
          <Heart className="h-4 w-4 text-cyan" />
          <span>{nurtureLeads.length} leads in nurture pipeline</span>
          <Badge variant="outline" className="text-[10px] ml-auto">Auto-drip active</Badge>
        </div>
      </GlassCard>

      <div className="space-y-3">
        {nurtureLeads.map((lead) => (
          <GlassCard key={lead.name}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-medium">{lead.name}</p>
                <p className="text-xs text-muted-foreground">{lead.address}</p>
              </div>
              <AIScoreBadge score={lead.score} size="sm" />
            </div>
            <p className="text-xs text-muted-foreground mb-3">{lead.reason}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Last: {lead.lastContact}
                </span>
                <span className="flex items-center gap-1 text-cyan">
                  Next: {lead.nextFollow}
                </span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Mail className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Phone className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
      {/* TODO: Automated drip campaign integration */}
      {/* TODO: Re-scoring on nurture leads with score decay */}
      {/* TODO: Auto-promote if score rises above threshold */}
    </PageShell>
  );
}
