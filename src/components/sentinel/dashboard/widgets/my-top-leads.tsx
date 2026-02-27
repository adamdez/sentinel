"use client";

import { motion } from "framer-motion";
import { Phone, Clock, AlertTriangle, ArrowRight } from "lucide-react";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { computeFollowUpPriority } from "@/lib/scoring";
import type { AIScore } from "@/lib/types";
import { cn } from "@/lib/utils";

interface LeadToCall {
  name: string;
  phone: string;
  reason: string;
  daysSinceContact: number;
  daysUntilFollowUp: number;
  isOverdue: boolean;
  aiScore: AIScore;
}

const LEADS: LeadToCall[] = [
  {
    name: "Margaret Henderson",
    phone: "(602) 555-0142",
    reason: "Callback requested — probate motivated",
    daysSinceContact: 0,
    daysUntilFollowUp: 0,
    isOverdue: true,
    aiScore: { composite: 94, motivation: 88, equityVelocity: 92, urgency: 96, historicalConversion: 85, aiBoost: 12, label: "fire" },
  },
  {
    name: "Robert Chen",
    phone: "(480) 555-0198",
    reason: "Follow-up on offer — counter expected",
    daysSinceContact: 2,
    daysUntilFollowUp: -1,
    isOverdue: true,
    aiScore: { composite: 82, motivation: 78, equityVelocity: 85, urgency: 80, historicalConversion: 72, aiBoost: 8, label: "hot" },
  },
  {
    name: "Lisa Morales",
    phone: "(602) 555-0267",
    reason: "Initial contact — high stacking score",
    daysSinceContact: 5,
    daysUntilFollowUp: 1,
    isOverdue: false,
    aiScore: { composite: 67, motivation: 62, equityVelocity: 70, urgency: 55, historicalConversion: 68, aiBoost: 5, label: "warm" },
  },
];

export function MyTopLeads() {
  const prioritized = LEADS.map((lead) => ({
    ...lead,
    priority: computeFollowUpPriority(
      lead.aiScore.composite,
      lead.daysSinceContact,
      Math.max(lead.daysUntilFollowUp, 0),
      lead.isOverdue
    ),
  })).sort((a, b) => b.priority - a.priority);

  return (
    <div className="space-y-2">
      {prioritized.map((lead, i) => (
        <motion.div
          key={lead.name}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08 }}
          className={cn(
            "flex items-center gap-3 p-2.5 rounded-lg transition-all group",
            lead.isOverdue
              ? "bg-destructive/5 border border-destructive/15 hover:bg-destructive/10"
              : "bg-secondary/20 hover:bg-secondary/30"
          )}
          style={lead.isOverdue ? {
            boxShadow: "inset 0 0 15px rgba(255,68,68,0.04), 0 0 6px rgba(255,68,68,0.06)",
          } : {}}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p
                className="text-xs font-semibold truncate text-foreground"
                style={{
                  textShadow: lead.isOverdue
                    ? "0 0 8px rgba(255,68,68,0.2), 0 0 16px rgba(255,68,68,0.08)"
                    : "0 0 8px rgba(0,255,136,0.15), 0 0 16px rgba(0,255,136,0.06)",
                  WebkitFontSmoothing: "antialiased",
                }}
              >
                {lead.name}
              </p>
              {lead.isOverdue && (
                <Badge variant="destructive" className="text-[8px] px-1 py-0 gap-0.5">
                  <AlertTriangle className="h-2 w-2" /> OVERDUE
                </Badge>
              )}
            </div>
            <p
              className="text-[10px] font-medium text-muted-foreground/90 truncate"
              style={{ WebkitFontSmoothing: "antialiased" }}
            >
              {lead.reason}
            </p>
            <div
              className="flex items-center gap-2 mt-1 text-[10px] font-medium"
              style={{ WebkitFontSmoothing: "antialiased" }}
            >
              <Clock className="h-2.5 w-2.5" />
              <span
                className={cn(
                  lead.isOverdue ? "text-red-400" : "text-muted-foreground"
                )}
                style={lead.isOverdue ? {
                  textShadow: "0 0 8px rgba(255,68,68,0.3), 0 0 16px rgba(255,68,68,0.1)",
                } : {}}
              >
                {lead.isOverdue
                  ? `${Math.abs(lead.daysUntilFollowUp)}d overdue`
                  : lead.daysUntilFollowUp === 0
                    ? "Due today"
                    : `Due in ${lead.daysUntilFollowUp}d`}
              </span>
            </div>
          </div>
          <AIScoreBadge score={lead.aiScore} size="sm" />
          <Button
            size="sm"
            className={cn(
              "h-7 text-[10px] gap-1 shrink-0",
              lead.isOverdue && "bg-destructive hover:bg-destructive/90 shadow-[0_0_15px_rgba(255,68,68,0.2)]"
            )}
          >
            <Phone className="h-3 w-3" />
            Call
          </Button>
        </motion.div>
      ))}
      <p className="text-[9px] text-muted-foreground text-center pt-1">
        Priority = score × urgency × contact recency — overdue leads surface first
      </p>
      {/* TODO: Filter to current user's assigned leads only (owner_id = auth.uid) */}
      {/* TODO: Compliance gating — DNC/litigant check before dial */}
      {/* TODO: Optimistic locking — prevent double-dial */}
      {/* TODO: One-click call via Twilio Client JS */}
    </div>
  );
}
