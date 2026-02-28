"use client";

import { FileSignature, Plus, CheckCircle, Clock, AlertTriangle, Send } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const envelopes = [
  { title: "Purchase Agreement — Henderson", status: "Awaiting Signature", date: "Feb 25", icon: Clock, color: "text-yellow-400" },
  { title: "Assignment Contract — Chen", status: "Completed", date: "Feb 24", icon: CheckCircle, color: "text-cyan" },
  { title: "LOI — Morales Property", status: "Draft", date: "Feb 23", icon: AlertTriangle, color: "text-blue-400" },
];

export default function DocuSignPage() {
  return (
    <PageShell
      title="DocuSign"
      description="Sentinel DocuSign — Contract management and e-signatures"
      actions={
        <Button size="sm" className="gap-2 text-xs">
          <Plus className="h-3 w-3" />
          New Envelope
        </Button>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <GlassCard hover={false}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-cyan" />
                Recent Envelopes
              </h2>
              <Badge variant="outline" className="text-[10px]">DocuSign API Required</Badge>
            </div>
            <div className="space-y-2">
              {envelopes.map((env) => {
                const Icon = env.icon;
                return (
                  <div
                    key={env.title}
                    className="flex items-center gap-4 p-3 rounded-[12px] bg-secondary/20 hover:bg-secondary/30 transition-colors"
                  >
                    <Icon className={`h-4 w-4 ${env.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{env.title}</p>
                      <p className="text-xs text-muted-foreground">{env.date}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{env.status}</Badge>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                      <Send className="h-3 w-3" />
                      Open
                    </Button>
                  </div>
                );
              })}
            </div>
            {/* TODO: DocuSign eSignature API integration */}
            {/* TODO: Auto-generate contracts from lead data */}
            {/* TODO: Template library */}
          </GlassCard>
        </div>

        <div className="space-y-4">
          <GlassCard>
            <h3 className="text-sm font-semibold mb-3">Templates</h3>
            <div className="space-y-2">
              {["Purchase Agreement", "Assignment Contract", "LOI", "Addendum"].map((t) => (
                <div key={t} className="flex items-center gap-2 p-2 rounded-[12px] hover:bg-secondary/30 transition-colors cursor-pointer">
                  <FileSignature className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs">{t}</span>
                </div>
              ))}
            </div>
          </GlassCard>
          <GlassCard>
            <h3 className="text-sm font-semibold mb-3">Quick Stats</h3>
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </GlassCard>
        </div>
      </div>
    </PageShell>
  );
}
