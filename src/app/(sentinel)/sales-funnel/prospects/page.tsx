"use client";

import { motion } from "framer-motion";
import { UserPlus, Search, Filter, ArrowUpDown, Phone, MoreHorizontal, Radar, Zap } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AIScore } from "@/lib/types";

interface Prospect {
  name: string;
  address: string;
  apn: string;
  county: string;
  type: string;
  phone: string;
  score: AIScore;
  source: "ranger_push" | "scraper" | "manual";
  pushedAt?: string;
}

const prospects: Prospect[] = [
  {
    name: "Eleanor Voss",
    address: "4201 E Camelback Rd, Phoenix AZ 85018",
    apn: "SPK-2025-001",
    county: "Maricopa",
    type: "Probate + Vacant + Inherited",
    phone: "(602) 555-9001",
    score: { composite: 100, motivation: 96, equityVelocity: 88, urgency: 98, historicalConversion: 90, aiBoost: 15, label: "fire" },
    source: "ranger_push",
    pushedAt: "12m ago",
  },
  {
    name: "Raymond Alcazar",
    address: "1910 N Scottsdale Rd, Tempe AZ 85281",
    apn: "SPK-2025-002",
    county: "Maricopa",
    type: "Pre-Foreclosure + Absentee",
    phone: "(480) 555-9002",
    score: { composite: 86, motivation: 82, equityVelocity: 74, urgency: 85, historicalConversion: 70, aiBoost: 8, label: "fire" },
    source: "ranger_push",
    pushedAt: "25m ago",
  },
  {
    name: "Theresa Whitfield",
    address: "7340 W Indian School Rd, Mesa AZ 85210",
    apn: "SPK-2025-003",
    county: "Maricopa",
    type: "Tax Lien + Code Violation",
    phone: "(480) 555-9003",
    score: { composite: 79, motivation: 70, equityVelocity: 65, urgency: 76, historicalConversion: 62, aiBoost: 4, label: "hot" },
    source: "ranger_push",
    pushedAt: "38m ago",
  },
  {
    name: "Margaret Henderson",
    address: "1423 Oak Valley Dr, Phoenix AZ 85004",
    apn: "123-45-678",
    county: "Maricopa",
    type: "Probate",
    phone: "(602) 555-0142",
    score: { composite: 94, motivation: 88, equityVelocity: 92, urgency: 96, historicalConversion: 85, aiBoost: 12, label: "fire" },
    source: "scraper",
  },
  {
    name: "Robert Chen",
    address: "890 Maple St, Mesa AZ 85201",
    apn: "234-56-789",
    county: "Maricopa",
    type: "Pre-Foreclosure",
    phone: "(480) 555-0198",
    score: { composite: 82, motivation: 78, equityVelocity: 85, urgency: 80, historicalConversion: 72, aiBoost: 8, label: "hot" },
    source: "scraper",
  },
  {
    name: "Lisa Morales",
    address: "2100 Desert Ridge, Scottsdale AZ 85255",
    apn: "345-67-890",
    county: "Maricopa",
    type: "Tax Lien",
    phone: "(602) 555-0267",
    score: { composite: 67, motivation: 62, equityVelocity: 70, urgency: 55, historicalConversion: 68, aiBoost: 5, label: "warm" },
    source: "scraper",
  },
  {
    name: "James Walker",
    address: "445 Central Ave, Tempe AZ 85281",
    apn: "456-78-901",
    county: "Maricopa",
    type: "Vacant",
    phone: "(480) 555-0334",
    score: { composite: 43, motivation: 40, equityVelocity: 50, urgency: 35, historicalConversion: 45, aiBoost: 0, label: "cold" },
    source: "manual",
  },
];

const rangerCount = prospects.filter((p) => p.source === "ranger_push").length;

function SourceBadge({ source, pushedAt }: { source: string; pushedAt?: string }) {
  if (source === "ranger_push") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border font-semibold text-purple-400 bg-purple-500/10 border-purple-500/20">
        <Radar className="h-2.5 w-2.5" />
        RANGER
        {pushedAt && <span className="text-purple-400/60 font-normal ml-0.5">{pushedAt}</span>}
      </span>
    );
  }
  if (source === "scraper") {
    return (
      <span className="text-[9px] px-1.5 py-0.5 rounded border text-cyan-400 bg-cyan-500/10 border-cyan-500/20">
        SCRAPER
      </span>
    );
  }
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded border text-muted-foreground border-glass-border">
      MANUAL
    </span>
  );
}

export default function ProspectsPage() {
  return (
    <PageShell
      title="Prospects"
      description="Incoming property prospects scored by AI — Ranger pushes land here first"
      actions={
        <div className="flex items-center gap-2">
          {rangerCount > 0 && (
            <Badge variant="neon" className="text-[10px] gap-1">
              <Radar className="h-2.5 w-2.5" />
              {rangerCount} Ranger {rangerCount === 1 ? "Push" : "Pushes"}
            </Badge>
          )}
          <Button size="sm" className="gap-2 text-xs">
            <UserPlus className="h-3 w-3" />
            Add Prospect
          </Button>
        </div>
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
          <Badge variant="outline" className="text-[10px] ml-auto">
            {prospects.length} prospects
          </Badge>
        </div>

        <div className="overflow-hidden rounded-lg border border-glass-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-glass-border bg-secondary/20">
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Owner / Property</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">APN</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Source</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Type</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">AI Score</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((p, i) => (
                <motion.tr
                  key={p.apn}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={cn(
                    "border-b border-glass-border hover:bg-secondary/10 transition-colors",
                    p.source === "ranger_push" && "bg-purple-500/[0.02] hover:bg-purple-500/[0.05]"
                  )}
                >
                  <td className="p-3">
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.address}</p>
                  </td>
                  <td className="p-3 text-sm font-mono text-muted-foreground">{p.apn}</td>
                  <td className="p-3">
                    <SourceBadge source={p.source} pushedAt={p.pushedAt} />
                  </td>
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
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* TODO: Paginated with cursor-based pagination */}
        {/* TODO: Optimistic updates on status change */}
        {/* TODO: Bulk actions (promote, suppress, assign) */}
        {/* TODO: Real-time subscription — new Ranger pushes appear instantly */}
      </GlassCard>
    </PageShell>
  );
}
