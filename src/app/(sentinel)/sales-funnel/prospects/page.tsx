"use client";

import { UserPlus, Search, Filter, ArrowUpDown, Phone, MoreHorizontal } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { AIScore } from "@/lib/types";

const prospects = [
  {
    name: "Margaret Henderson",
    address: "1423 Oak Valley Dr, Phoenix AZ 85004",
    apn: "123-45-678",
    county: "Maricopa",
    type: "Probate",
    phone: "(602) 555-0142",
    score: { composite: 94, motivation: 88, equityVelocity: 92, urgency: 96, historicalConversion: 85, aiBoost: 12, label: "fire" } as AIScore,
  },
  {
    name: "Robert Chen",
    address: "890 Maple St, Mesa AZ 85201",
    apn: "234-56-789",
    county: "Maricopa",
    type: "Pre-Foreclosure",
    phone: "(480) 555-0198",
    score: { composite: 82, motivation: 78, equityVelocity: 85, urgency: 80, historicalConversion: 72, aiBoost: 8, label: "hot" } as AIScore,
  },
  {
    name: "Lisa Morales",
    address: "2100 Desert Ridge, Scottsdale AZ 85255",
    apn: "345-67-890",
    county: "Maricopa",
    type: "Tax Lien",
    phone: "(602) 555-0267",
    score: { composite: 67, motivation: 62, equityVelocity: 70, urgency: 55, historicalConversion: 68, aiBoost: 5, label: "warm" } as AIScore,
  },
  {
    name: "James Walker",
    address: "445 Central Ave, Tempe AZ 85281",
    apn: "456-78-901",
    county: "Maricopa",
    type: "Vacant",
    phone: "(480) 555-0334",
    score: { composite: 43, motivation: 40, equityVelocity: 50, urgency: 35, historicalConversion: 45, aiBoost: 0, label: "cold" } as AIScore,
  },
];

export default function ProspectsPage() {
  return (
    <PageShell
      title="Prospects"
      description="Sentinel Prospects — Incoming property prospects scored by AI"
      actions={
        <Button size="sm" className="gap-2 text-xs">
          <UserPlus className="h-3 w-3" />
          Add Prospect
        </Button>
      }
    >
      <GlassCard hover={false}>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search prospects by name, APN, address..." className="pl-9" />
          </div>
          <Button variant="outline" size="sm" className="gap-2 text-xs">
            <Filter className="h-3 w-3" />
            Filter
          </Button>
          <Button variant="outline" size="sm" className="gap-2 text-xs">
            <ArrowUpDown className="h-3 w-3" />
            Sort by Score
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-glass-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-glass-border bg-secondary/20">
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Owner / Property</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">APN</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Type</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">AI Score</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((p) => (
                <tr key={p.apn} className="border-b border-glass-border hover:bg-secondary/10 transition-colors">
                  <td className="p-3">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.address}</p>
                  </td>
                  <td className="p-3 text-sm font-mono text-muted-foreground">{p.apn}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-[10px]">{p.type}</Badge>
                  </td>
                  <td className="p-3">
                    <AIScoreBadge score={p.score} size="sm" />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Phone className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* TODO: Paginated with cursor-based pagination */}
        {/* TODO: Optimistic updates on status change */}
        {/* TODO: Bulk actions (promote, suppress, assign) */}
      </GlassCard>
    </PageShell>
  );
}
