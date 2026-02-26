"use client";

import { DollarSign, TrendingUp, Users, ArrowUpRight, Download } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const pplSources = [
  { name: "PropStream", leads: 45, cost: "$225", cpl: "$5.00", status: "Active" },
  { name: "BatchLeads", leads: 32, cost: "$160", cpl: "$5.00", status: "Active" },
  { name: "REISkip", leads: 18, cost: "$72", cpl: "$4.00", status: "Paused" },
];

export default function PPLPage() {
  return (
    <PageShell
      title="PPL"
      description="Sentinel PPL — Pay-per-lead source management and ROI tracking"
      actions={
        <Button variant="outline" size="sm" className="gap-2 text-xs">
          <Download className="h-3 w-3" />
          Export Data
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-4 mb-4">
        <GlassCard className="p-4 text-center">
          <DollarSign className="h-5 w-5 text-neon mx-auto mb-2" />
          <p className="text-xl font-bold">$457</p>
          <p className="text-[10px] text-muted-foreground">Total Spend</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <Users className="h-5 w-5 text-blue-400 mx-auto mb-2" />
          <p className="text-xl font-bold">95</p>
          <p className="text-[10px] text-muted-foreground">Leads Purchased</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <TrendingUp className="h-5 w-5 text-purple-400 mx-auto mb-2" />
          <p className="text-xl font-bold flex items-center justify-center gap-1">
            $4.81 <ArrowUpRight className="h-3 w-3 text-neon" />
          </p>
          <p className="text-[10px] text-muted-foreground">Avg Cost Per Lead</p>
        </GlassCard>
      </div>

      <GlassCard hover={false}>
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-neon" />
          Lead Sources
        </h2>
        <div className="overflow-hidden rounded-lg border border-glass-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-glass-border bg-secondary/20">
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Source</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">Leads</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">Cost</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">CPL</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {pplSources.map((s) => (
                <tr key={s.name} className="border-b border-glass-border hover:bg-secondary/10 transition-colors">
                  <td className="p-3 text-sm font-medium">{s.name}</td>
                  <td className="p-3 text-sm text-right">{s.leads}</td>
                  <td className="p-3 text-sm text-right">{s.cost}</td>
                  <td className="p-3 text-sm text-right">{s.cpl}</td>
                  <td className="p-3">
                    <Badge variant={s.status === "Active" ? "neon" : "secondary"} className="text-[10px]">
                      {s.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* TODO: PPL source API integrations */}
        {/* TODO: Auto-ingest purchased leads */}
        {/* TODO: ROI calculation with closed-deal attribution */}
      </GlassCard>
    </PageShell>
  );
}
