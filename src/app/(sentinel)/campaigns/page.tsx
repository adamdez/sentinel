"use client";

import { Megaphone, Plus, Mail, MessageSquare, Send, BarChart3 } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const campaigns = [
  { name: "Probate Outreach — Maricopa", type: "Direct Mail", status: "Active", sent: 450, responses: 23, rate: "5.1%" },
  { name: "Pre-Foreclosure SMS", type: "SMS", status: "Active", sent: 280, responses: 34, rate: "12.1%" },
  { name: "Tax Lien Follow-up", type: "Email", status: "Paused", sent: 120, responses: 8, rate: "6.7%" },
];

export default function CampaignsPage() {
  return (
    <PageShell
      title="Campaigns"
      description="Sentinel Campaigns — Multi-channel outreach automation"
      actions={
        <Button size="sm" className="gap-2 text-xs">
          <Plus className="h-3 w-3" />
          New Campaign
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-4 mb-4">
        <GlassCard className="p-4 text-center">
          <Mail className="h-5 w-5 text-cyan mx-auto mb-2" />
          <p className="text-xl font-bold">850</p>
          <p className="text-[10px] text-muted-foreground">Total Sent</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <MessageSquare className="h-5 w-5 text-blue-400 mx-auto mb-2" />
          <p className="text-xl font-bold">65</p>
          <p className="text-[10px] text-muted-foreground">Responses</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <BarChart3 className="h-5 w-5 text-purple-400 mx-auto mb-2" />
          <p className="text-xl font-bold">7.6%</p>
          <p className="text-[10px] text-muted-foreground">Avg Response Rate</p>
        </GlassCard>
      </div>

      <GlassCard hover={false}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-cyan" />
            Active Campaigns
          </h2>
        </div>
        <div className="overflow-hidden rounded-[12px] border border-glass-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-glass-border bg-secondary/20">
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Campaign</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Type</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">Sent</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">Responses</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">Rate</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.name} className="border-b border-glass-border hover:bg-secondary/10 transition-colors">
                  <td className="p-3 text-sm font-medium">{c.name}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-[10px]">{c.type}</Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant={c.status === "Active" ? "neon" : "secondary"} className="text-[10px]">
                      {c.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-sm text-right">{c.sent}</td>
                  <td className="p-3 text-sm text-right">{c.responses}</td>
                  <td className="p-3 text-sm text-right font-medium text-neon">{c.rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* TODO: Campaign builder with audience segmentation */}
        {/* TODO: A/B testing for messaging */}
        {/* TODO: Auto-enroll new prospects based on distress type */}
      </GlassCard>
    </PageShell>
  );
}
