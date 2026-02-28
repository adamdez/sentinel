"use client";

import { FileCheck, Users, DollarSign, ArrowRight, Plus } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const dispositions = [
  {
    property: "1423 Oak Valley Dr, Phoenix AZ",
    seller: "Henderson Estate",
    contractPrice: "$142,000",
    targetAssignment: "$185,000",
    spread: "$43,000",
    buyerInterest: 4,
    status: "Marketing",
  },
];

export default function DispositionPage() {
  return (
    <PageShell
      title="Disposition"
      description="Sentinel Disposition — Assign contracts to end buyers"
      actions={
        <Button size="sm" className="gap-2 text-xs">
          <Plus className="h-3 w-3" />
          Add Buyer
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-4 mb-4">
        <GlassCard className="p-4 text-center">
          <FileCheck className="h-5 w-5 text-cyan mx-auto mb-2" />
          <p className="text-xl font-bold">{dispositions.length}</p>
          <p className="text-[10px] text-muted-foreground">Active Dispositions</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <DollarSign className="h-5 w-5 text-blue-400 mx-auto mb-2" />
          <p className="text-xl font-bold">$43k</p>
          <p className="text-[10px] text-muted-foreground">Est. Assignment Fee</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <Users className="h-5 w-5 text-purple-400 mx-auto mb-2" />
          <p className="text-xl font-bold">4</p>
          <p className="text-[10px] text-muted-foreground">Interested Buyers</p>
        </GlassCard>
      </div>

      {dispositions.map((d) => (
        <GlassCard key={d.property} glow hover={false}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="font-semibold">{d.property}</p>
              <p className="text-xs text-muted-foreground">{d.seller}</p>
            </div>
            <Badge variant="neon" className="text-[10px]">{d.status}</Badge>
          </div>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-[10px] text-muted-foreground">Contract</p>
              <p className="text-sm font-medium">{d.contractPrice}</p>
            </div>
            <div className="flex items-center">
              <ArrowRight className="h-4 w-4 text-cyan mx-auto" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Target</p>
              <p className="text-sm font-medium">{d.targetAssignment}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Spread</p>
              <p className="text-sm font-bold text-neon">{d.spread}</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Buyer Interest ({d.buyerInterest})</p>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-3 flex-1 max-w-[200px]" />
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
          {/* TODO: Buyer list management */}
          {/* TODO: Blast marketing to buyer list */}
          {/* TODO: Assignment contract generation */}
        </GlassCard>
      ))}
    </PageShell>
  );
}
