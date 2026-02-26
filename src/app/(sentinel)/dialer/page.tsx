"use client";

import { Phone, PhoneForwarded, Clock, Users, BarChart3 } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { DialerWidget } from "@/components/sentinel/dialer-widget";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AIScore } from "@/lib/types";

const dialQueue = [
  {
    name: "Margaret Henderson",
    phone: "(602) 555-0142",
    type: "Probate",
    score: { composite: 94, motivation: 88, equityVelocity: 92, urgency: 96, historicalConversion: 85, aiBoost: 12, label: "fire" } as AIScore,
  },
  {
    name: "Robert Chen",
    phone: "(480) 555-0198",
    type: "Pre-Foreclosure",
    score: { composite: 82, motivation: 78, equityVelocity: 85, urgency: 80, historicalConversion: 72, aiBoost: 8, label: "hot" } as AIScore,
  },
  {
    name: "Lisa Morales",
    phone: "(602) 555-0267",
    type: "Tax Lien",
    score: { composite: 67, motivation: 62, equityVelocity: 70, urgency: 55, historicalConversion: 68, aiBoost: 5, label: "warm" } as AIScore,
  },
];

export default function DialerPage() {
  return (
    <PageShell
      title="Dialer"
      description="Sentinel Dialer — Twilio-powered calling with AI-prioritized queue"
      actions={
        <Badge variant="neon" className="gap-1">
          <Phone className="h-3 w-3" />
          Twilio Connected
        </Badge>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Call Stats */}
          <div className="grid grid-cols-3 gap-4">
            <GlassCard className="p-4 text-center">
              <PhoneForwarded className="h-5 w-5 text-neon mx-auto mb-2" />
              <p className="text-xl font-bold">34</p>
              <p className="text-[10px] text-muted-foreground">Calls Today</p>
            </GlassCard>
            <GlassCard className="p-4 text-center">
              <Clock className="h-5 w-5 text-blue-400 mx-auto mb-2" />
              <p className="text-xl font-bold">2:34</p>
              <p className="text-[10px] text-muted-foreground">Avg Duration</p>
            </GlassCard>
            <GlassCard className="p-4 text-center">
              <BarChart3 className="h-5 w-5 text-purple-400 mx-auto mb-2" />
              <p className="text-xl font-bold">12%</p>
              <p className="text-[10px] text-muted-foreground">Connect Rate</p>
            </GlassCard>
          </div>

          {/* Dial Queue */}
          <GlassCard hover={false}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-neon" />
                AI-Prioritized Dial Queue
              </h2>
              <Button variant="outline" size="sm" className="text-xs">
                Refresh Queue
              </Button>
            </div>
            <div className="space-y-2">
              {dialQueue.map((item, i) => (
                <div
                  key={item.name}
                  className="flex items-center gap-4 p-3 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors"
                >
                  <span className="text-xs text-muted-foreground font-mono w-4">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.phone}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {item.type}
                  </Badge>
                  <AIScoreBadge score={item.score} size="sm" />
                  <Button size="sm" className="h-7 text-xs gap-1">
                    <Phone className="h-3 w-3" />
                    Dial
                  </Button>
                </div>
              ))}
            </div>
            {/* TODO: Compliance gating — DNC check before dial eligibility */}
            {/* TODO: Optimistic locking — prevent double-dial */}
          </GlassCard>

          {/* Call History Skeleton */}
          <GlassCard hover={false}>
            <p className="text-sm font-semibold mb-3">Recent Calls</p>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-2 w-1/3" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
            {/* TODO: Call history with disposition logging */}
          </GlassCard>
        </div>

        <div>
          <DialerWidget />
        </div>
      </div>
    </PageShell>
  );
}
