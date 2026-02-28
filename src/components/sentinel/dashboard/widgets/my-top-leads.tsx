"use client";

import { motion } from "framer-motion";
import { Phone, Clock, AlertTriangle } from "lucide-react";
import { AIScoreBadge } from "@/components/sentinel/ai-score-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeads } from "@/hooks/use-leads";
import { computeFollowUpPriority } from "@/lib/scoring";
import { cn } from "@/lib/utils";

export function MyTopLeads() {
  const { leads, loading } = useLeads();

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5">
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-2.5 w-44" />
              <Skeleton className="h-2.5 w-20" />
            </div>
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        No active leads — promote prospects to start building your pipeline.
      </div>
    );
  }

  const now = new Date();
  const prioritized = leads.slice(0, 10).map((lead) => {
    const daysSinceContact = lead.lastContactAt
      ? Math.floor((now.getTime() - new Date(lead.lastContactAt).getTime()) / 86400000)
      : 999;
    const daysUntilFollowUp = lead.followUpDate
      ? Math.floor((new Date(lead.followUpDate).getTime() - now.getTime()) / 86400000)
      : 0;
    const isOverdue = lead.followUpDate ? new Date(lead.followUpDate) < now : false;

    return {
      ...lead,
      daysSinceContact,
      daysUntilFollowUp,
      isOverdue,
      followUpPriority: computeFollowUpPriority(
        lead.score.composite,
        daysSinceContact,
        Math.max(daysUntilFollowUp, 0),
        isOverdue
      ),
    };
  }).sort((a, b) => b.followUpPriority - a.followUpPriority).slice(0, 5);

  return (
    <div className="space-y-2">
      {prioritized.map((lead, i) => (
        <motion.div
          key={lead.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08 }}
          className={cn(
            "flex items-center gap-3 p-2.5 rounded-[10px] transition-all group",
            lead.isOverdue
              ? "bg-destructive/5 border border-destructive/15 hover:bg-destructive/10"
              : "bg-white/[0.02] hover:bg-white/[0.03]"
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
                    : "0 0 8px rgba(0,212,255,0.15), 0 0 16px rgba(0,212,255,0.06)",
                  WebkitFontSmoothing: "antialiased",
                }}
              >
                {lead.ownerName}
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
              {lead.address}
              {lead.city ? `, ${lead.city}` : ""} — {lead.status}
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
          <AIScoreBadge score={lead.score} size="sm" />
          <Button
            size="sm"
            className={cn(
              "h-7 text-[10px] gap-1 shrink-0",
              lead.isOverdue && "bg-destructive hover:bg-destructive/90 shadow-[0_0_15px_rgba(255,68,68,0.2)]"
            )}
            onClick={() => { const phone = lead.ownerPhone; if (phone) window.open(`tel:${phone.replace(/\D/g, "")}`); }}
          >
            <Phone className="h-3 w-3" />
            Call
          </Button>
        </motion.div>
      ))}
      <p className="text-[9px] text-muted-foreground text-center pt-1">
        Priority = score × urgency × contact recency — overdue leads surface first
      </p>
    </div>
  );
}
