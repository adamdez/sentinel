"use client";

import { UserCheck, Phone, Clock, MapPin } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AIScore } from "@/lib/types";

const myLeads = [
  {
    name: "Margaret Henderson",
    address: "1423 Oak Valley Dr, Phoenix AZ",
    status: "Follow-up needed",
    lastContact: "2 hours ago",
    nextAction: "Call back at 3 PM",
    score: { composite: 94, motivation: 88, equityVelocity: 92, urgency: 96, historicalConversion: 85, aiBoost: 12, label: "fire" } as AIScore,
  },
  {
    name: "Robert Chen",
    address: "890 Maple St, Mesa AZ",
    status: "Appointment set",
    lastContact: "Yesterday",
    nextAction: "Property walkthrough tomorrow",
    score: { composite: 82, motivation: 78, equityVelocity: 85, urgency: 80, historicalConversion: 72, aiBoost: 8, label: "hot" } as AIScore,
  },
];

export default function MyLeadsPage() {
  return (
    <PageShell
      title="My Leads"
      description="Sentinel My Leads — Your assigned leads and next actions"
    >
      <div className="grid grid-cols-3 gap-4 mb-4">
        <GlassCard className="p-4 text-center">
          <UserCheck className="h-5 w-5 text-neon mx-auto mb-2" />
          <p className="text-xl font-bold">{myLeads.length}</p>
          <p className="text-[10px] text-muted-foreground">Assigned to You</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <Phone className="h-5 w-5 text-blue-400 mx-auto mb-2" />
          <p className="text-xl font-bold">1</p>
          <p className="text-[10px] text-muted-foreground">Needs Follow-up</p>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <MapPin className="h-5 w-5 text-purple-400 mx-auto mb-2" />
          <p className="text-xl font-bold">1</p>
          <p className="text-[10px] text-muted-foreground">Appointments</p>
        </GlassCard>
      </div>

      <div className="space-y-3">
        {myLeads.map((lead) => (
          <GlassCard key={lead.name} glow={lead.score.label === "fire"}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-medium">{lead.name}</p>
                <p className="text-xs text-muted-foreground">{lead.address}</p>
              </div>
              <AIScoreBadge score={lead.score} />
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" /> Last: {lead.lastContact}
              </span>
              <Badge variant="outline" className="text-[10px]">{lead.status}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-neon">{lead.nextAction}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  Log Note
                </Button>
                <Button size="sm" className="h-7 text-xs gap-1">
                  <Phone className="h-3 w-3" />
                  Call
                </Button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
      {/* TODO: Concurrency-safe claiming (optimistic locking) */}
      {/* TODO: Activity timeline per lead */}
      {/* TODO: Compliance gating before dial eligibility */}
    </PageShell>
  );
}
