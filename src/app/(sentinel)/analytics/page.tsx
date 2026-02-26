"use client";

import { BarChart3, TrendingUp, Target, Zap, DollarSign, Activity } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function AnalyticsPage() {
  return (
    <PageShell
      title="Analytics"
      description="Sentinel Analytics — Signal ROI, model performance, and conversion intelligence"
      actions={
        <Button variant="outline" size="sm" className="gap-2 text-xs">
          <Activity className="h-3 w-3" />
          Export Report
        </Button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: "$186k", icon: DollarSign, color: "text-neon" },
          { label: "Deals Closed", value: "12", icon: Target, color: "text-blue-400" },
          { label: "Avg Deal Size", value: "$15.5k", icon: TrendingUp, color: "text-purple-400" },
          { label: "AI Accuracy", value: "87.3%", icon: Zap, color: "text-orange-400" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <GlassCard key={stat.label} className="p-4">
              <div className={`p-2 rounded-lg bg-secondary/50 w-fit mb-2 ${stat.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </GlassCard>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard hover={false}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-neon" />
              Conversion Funnel
            </h2>
            <Badge variant="outline" className="text-[10px]">Last 30 days</Badge>
          </div>
          <div className="space-y-3">
            {[
              { stage: "Prospects", count: 147, pct: 100 },
              { stage: "Leads", count: 68, pct: 46 },
              { stage: "Negotiation", count: 24, pct: 16 },
              { stage: "Disposition", count: 15, pct: 10 },
              { stage: "Closed", count: 12, pct: 8 },
            ].map((s) => (
              <div key={s.stage} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{s.stage}</span>
                  <span className="text-muted-foreground">{s.count} ({s.pct}%)</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-neon to-neon-dim"
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard hover={false}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-neon" />
              Signal ROI
            </h2>
            <Badge variant="outline" className="text-[10px]">By Source</Badge>
          </div>
          <div className="space-y-3">
            {[
              { source: "Probate", deals: 5, revenue: "$78k", roi: "340%" },
              { source: "Pre-Foreclosure", deals: 3, revenue: "$52k", roi: "280%" },
              { source: "Tax Lien", deals: 2, revenue: "$31k", roi: "220%" },
              { source: "FSBO", deals: 1, revenue: "$15k", roi: "180%" },
              { source: "Vacant", deals: 1, revenue: "$10k", roi: "120%" },
            ].map((s) => (
              <div key={s.source} className="flex items-center gap-4 p-2 rounded-lg bg-secondary/20">
                <span className="text-sm flex-1">{s.source}</span>
                <span className="text-xs text-muted-foreground">{s.deals} deals</span>
                <span className="text-xs font-medium">{s.revenue}</span>
                <Badge variant="neon" className="text-[10px]">{s.roi}</Badge>
              </div>
            ))}
          </div>
          {/* TODO: Recharts / Chart.js signal ROI visualizations */}
          {/* TODO: Closed-deal feedback loop */}
          {/* TODO: Model calibration tools */}
        </GlassCard>
      </div>

      <GlassCard hover={false}>
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-neon" />
          AI Model Performance
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
        {/* TODO: Precision/recall charts for scoring model */}
        {/* TODO: Score distribution histogram */}
        {/* TODO: Weight effectiveness analysis */}
      </GlassCard>
    </PageShell>
  );
}
