"use client";

import { Users, Search, Filter, ArrowUpDown } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { PipelineBoard } from "@/components/sentinel/pipeline-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function LeadsPage() {
  return (
    <PageShell
      title="Leads"
      description="Sentinel Leads — Promoted prospects ready for acquisition workflow"
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-2 text-xs">
            <Filter className="h-3 w-3" />
            Filter
          </Button>
          <Button variant="outline" size="sm" className="gap-2 text-xs">
            <ArrowUpDown className="h-3 w-3" />
            Sort
          </Button>
        </>
      }
    >
      <GlassCard hover={false} className="mb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search leads..." className="pl-9" />
          </div>
          <Badge variant="neon" className="text-[10px]">4 Active Leads</Badge>
        </div>
      </GlassCard>

      <PipelineBoard />

      {/* TODO: Promotion engine integration — only promoted leads appear here */}
      {/* TODO: Assignment logic with optimistic locking */}
      {/* TODO: Status transition guardrails */}
      {/* TODO: Real-time subscription for new promotions */}
    </PageShell>
  );
}
