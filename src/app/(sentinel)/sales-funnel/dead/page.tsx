"use client";

import { Skull, RotateCcw, Trash2, Archive } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const deadLeads = [
  { name: "Thomas Baker", address: "901 Industrial Way", reason: "Listed with agent", deadSince: "Jan 2026" },
  { name: "Nancy Lee", address: "234 River Rd", reason: "DNC — Do not contact", deadSince: "Dec 2025" },
  { name: "Frank Martinez", address: "789 Cactus Ln", reason: "No equity", deadSince: "Feb 2026" },
];

export default function DeadPage() {
  return (
    <PageShell
      title="Dead"
      description="Sentinel Dead — Leads removed from active pipeline"
      actions={
        <Button variant="outline" size="sm" className="gap-2 text-xs text-destructive">
          <Trash2 className="h-3 w-3" />
          Purge Old
        </Button>
      }
    >
      <GlassCard hover={false} className="mb-4">
        <div className="flex items-center gap-4 text-sm">
          <Skull className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {deadLeads.length} dead leads — Review periodically for resurrection
          </span>
        </div>
      </GlassCard>

      <div className="space-y-2">
        {deadLeads.map((lead) => (
          <GlassCard key={lead.name} hover={false} className="opacity-60 hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{lead.name}</p>
                <p className="text-xs text-muted-foreground">{lead.address}</p>
              </div>
              <Badge variant="secondary" className="text-[10px]">{lead.reason}</Badge>
              <span className="text-xs text-muted-foreground">{lead.deadSince}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Resurrect">
                  <RotateCcw className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Archive">
                  <Archive className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
      {/* TODO: Resurrection workflow — re-enter pipeline with new scoring */}
      {/* TODO: Suppression enforcement — negative stack prevents re-promotion */}
      {/* TODO: Audit trail for dead dispositions */}
    </PageShell>
  );
}
