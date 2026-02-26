"use client";

import { motion } from "framer-motion";
import {
  TrendingUp,
  Users,
  Phone,
  DollarSign,
  Zap,
  ArrowUpRight,
  Activity,
} from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { PipelineBoard } from "@/components/sentinel/pipeline-board";
import { DialerWidget } from "@/components/sentinel/dialer-widget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AIScore } from "@/lib/types";

const stats = [
  { label: "Active Prospects", value: "147", change: "+12", icon: Users, color: "text-blue-400" },
  { label: "Calls Today", value: "34", change: "+8", icon: Phone, color: "text-neon" },
  { label: "Pipeline Value", value: "$2.4M", change: "+$180k", icon: DollarSign, color: "text-purple-400" },
  { label: "Conversion Rate", value: "18.3%", change: "+2.1%", icon: TrendingUp, color: "text-orange-400" },
];

const hotLeads: { name: string; address: string; type: string; score: AIScore }[] = [
  {
    name: "Margaret Henderson",
    address: "1423 Oak Valley Dr",
    type: "Probate",
    score: { composite: 94, motivation: 88, equityVelocity: 92, urgency: 96, historicalConversion: 85, aiBoost: 12, label: "fire" },
  },
  {
    name: "Robert Chen",
    address: "890 Maple St",
    type: "Pre-Foreclosure",
    score: { composite: 87, motivation: 82, equityVelocity: 85, urgency: 80, historicalConversion: 78, aiBoost: 8, label: "hot" },
  },
  {
    name: "Lisa Morales",
    address: "2100 Desert Ridge",
    type: "Tax Lien",
    score: { composite: 79, motivation: 75, equityVelocity: 80, urgency: 72, historicalConversion: 70, aiBoost: 6, label: "hot" },
  },
];

export default function DashboardPage() {
  return (
    <PageShell
      title="Dashboard"
      description="Sentinel command center — real-time acquisition intelligence"
      actions={
        <Button variant="neon" className="gap-2">
          <Zap className="h-4 w-4" />
          Run AI Scoring
        </Button>
      }
    >
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <GlassCard key={stat.label} delay={i * 0.05} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-lg bg-secondary/50 ${stat.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-1 text-xs text-neon">
                  <ArrowUpRight className="h-3 w-3" />
                  {stat.change}
                </div>
              </div>
              <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </GlassCard>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Hot Leads */}
        <div className="lg:col-span-2">
          <GlassCard hover={false} delay={0.2}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-neon" />
                Top AI-Scored Leads
              </h2>
              <Badge variant="neon" className="text-[10px]">Live</Badge>
            </div>
            <div className="space-y-3">
              {hotLeads.map((lead, i) => (
                <motion.div
                  key={lead.name}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="flex items-center gap-4 p-3 rounded-lg bg-secondary/20 hover:bg-secondary/30 transition-colors group"
                >
                  <span className="text-xs text-muted-foreground font-mono w-4">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{lead.name}</p>
                    <p className="text-xs text-muted-foreground">{lead.address}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {lead.type}
                  </Badge>
                  <AIScoreBadge score={lead.score} size="sm" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2 text-xs gap-1"
                  >
                    <Phone className="h-3 w-3" />
                    Call
                  </Button>
                </motion.div>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* Quick Dialer */}
        <div>
          <DialerWidget />
        </div>
      </div>

      {/* Pipeline Board */}
      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-neon" />
          Pipeline — Drag &amp; Drop
        </h2>
        <PipelineBoard />
      </div>

      {/* Skeleton placeholder for future widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassCard hover={false} delay={0.4}>
          <p className="text-sm font-semibold mb-3">Signal Activity Feed</p>
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2 w-1/2" />
                </div>
              </div>
            ))}
          </div>
          {/* TODO: Real-time signal activity feed from distress_events */}
        </GlassCard>
        <GlassCard hover={false} delay={0.45}>
          <p className="text-sm font-semibold mb-3">Conversion Analytics</p>
          <div className="space-y-2">
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          {/* TODO: Chart.js / Recharts conversion analytics */}
        </GlassCard>
      </div>
    </PageShell>
  );
}
