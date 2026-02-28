"use client";

import { Handshake, DollarSign, FileText, Clock } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AIScore } from "@/lib/types";

const negotiations = [
  {
    name: "Henderson Estate",
    address: "1423 Oak Valley Dr, Phoenix AZ",
    askPrice: "$185,000",
    offerPrice: "$142,000",
    arv: "$245,000",
    stage: "Counter Offer",
    daysInStage: 3,
    score: { composite: 94, motivation: 88, equityVelocity: 92, urgency: 96, historicalConversion: 85, aiBoost: 12, label: "fire" } as AIScore,
  },
];

export default function NegotiationPage() {
  return (
    <PageShell
      title="Negotiation"
      description="Sentinel Negotiation — Active deal negotiations and offer tracking"
    >
      <div className="grid grid-cols-4 gap-4 mb-4">
        <GlassCard className="p-4 text-center">
          <Handshake className="h-5 w-5 text-cyan mx-auto mb-2" />
          <p className="text-xl font-bold">{negotiations.length}</p>
          <p className="text-[10px] text-muted-foreground">Active</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <DollarSign className="h-5 w-5 text-blue-400 mx-auto mb-2" />
          <p className="text-xl font-bold">$142k</p>
          <p className="text-[10px] text-muted-foreground">Total Offered</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <FileText className="h-5 w-5 text-purple-400 mx-auto mb-2" />
          <p className="text-xl font-bold">$103k</p>
          <p className="text-[10px] text-muted-foreground">Est. Spread</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <Clock className="h-5 w-5 text-orange-400 mx-auto mb-2" />
          <p className="text-xl font-bold">3d</p>
          <p className="text-[10px] text-muted-foreground">Avg Stage Time</p>
        </GlassCard>
      </div>

      {negotiations.map((deal) => (
        <GlassCard key={deal.name} glow>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="font-semibold text-lg">{deal.name}</p>
              <p className="text-xs text-muted-foreground">{deal.address}</p>
            </div>
            <AIScoreBadge score={deal.score} />
          </div>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-[10px] text-muted-foreground">Ask Price</p>
              <p className="text-sm font-medium">{deal.askPrice}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Our Offer</p>
              <p className="text-sm font-medium text-neon">{deal.offerPrice}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">ARV</p>
              <p className="text-sm font-medium">{deal.arv}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Stage</p>
              <Badge variant="neon" className="text-[10px]">{deal.stage}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-xs">Counter</Button>
            <Button variant="outline" size="sm" className="text-xs">Send Contract</Button>
            <Button size="sm" className="text-xs gap-1">
              <Handshake className="h-3 w-3" />
              Accept
            </Button>
          </div>
        </GlassCard>
      ))}
      {/* TODO: Offer history timeline */}
      {/* TODO: Contract generation integration */}
      {/* TODO: Deal calculator with MAO, ARV, repair estimates */}
    </PageShell>
  );
}
